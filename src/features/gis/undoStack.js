/* Undo and redo for the GIS canvas.

   The feature row is the unit. An action records the rows it changed —
   as they were, and as they became — and nothing else, so an entry
   costs what the action touched rather than what the drawing contains.
   Auto Service over sixty plots is one entry, because it was one thing
   the designer asked for.

   Inverses are recorded, not derived. Working out how to reverse each
   action separately means twenty-five reversals to get right and to keep
   right as the actions change; a before-and-after of the rows is the
   same shape whatever did the changing, and a new drawing tool gets undo
   without knowing this file exists.

   Everything here is pure. Talking to the server is the canvas's job. */

/* Fields the server will accept back. Feature_ID is included because
   restoring a deleted row has to put it back under the id it had —
   Connects is an array of feature ids, so a row that returns under a new
   id is referenced by nothing and references nothing. */
export const RESTORE_FIELDS = [
  "Feature_ID", "Layer_Key", "Feature_Type", "Geometry",
  "Label", "Attributes", "Plot_ID", "Feature_Role",
];

/* Key order out of Postgres and key order built in the browser are not
   the same, so a plain JSON.stringify reports every optimistically drawn
   feature as changed the moment it is reconciled. Sorting keys at every
   level is what makes "did this actually change" answerable. */
export function stable(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
}

const idOf = (f) => Number(f.Feature_ID);

/* Only the fields that can be written. Comparing whole rows would count
   a server-side derived column as a change and make an entry that undo
   cannot honour. */
export function writable(f) {
  const out = {};
  for (const k of RESTORE_FIELDS) if (f[k] !== undefined) out[k] = f[k];
  return out;
}

export const sameFeature = (a, b) => stable(writable(a)) === stable(writable(b));

/* What an action did, by comparing the drawing either side of it.

   Temporary ids from optimistic drawing are skipped on the "before"
   side: a feature that existed only as `tmp-...` was never on the
   server, so there is nothing to put back and nothing to delete. */
export function diffFeatures(before = [], after = []) {
  const b = new Map(before.filter((f) => Number.isFinite(idOf(f))).map((f) => [idOf(f), f]));
  const a = new Map(after.filter((f) => Number.isFinite(idOf(f))).map((f) => [idOf(f), f]));

  const created = [];
  const deleted = [];
  const updated = [];

  for (const [id, f] of a) if (!b.has(id)) created.push(writable(f));
  for (const [id, f] of b) if (!a.has(id)) deleted.push(writable(f));
  for (const [id, f] of a) {
    const was = b.get(id);
    if (was && !sameFeature(was, f)) updated.push({ before: writable(was), after: writable(f) });
  }
  return { created, deleted, updated };
}

export const isEmptyDelta = (d) =>
  !d || (!d.created.length && !d.deleted.length && !d.updated.length);

export const deltaSize = (d) =>
  (d ? d.created.length + d.deleted.length + d.updated.length : 0);

/* What to send to move the drawing one step in a direction.

     restore — rows to insert under the id they already had
     remove  — feature ids to delete
     update  — rows to write over whatever is there now

   Undo and redo are the same operation with the two sides swapped,
   which is the point of recording both. */
export function planFor(delta, dir) {
  if (dir === "undo") {
    return {
      restore: delta.deleted,
      remove: delta.created.map(idOf),
      update: delta.updated.map((u) => u.before),
    };
  }
  return {
    restore: delta.created,
    remove: delta.deleted.map(idOf),
    update: delta.updated.map((u) => u.after),
  };
}

/* ── The stack ──

   Past is what can be undone, most recent last. Future is what has been
   undone and can be redone, next-to-redo last.

   A new action clears the future. Anything else means offering to redo
   a step that no longer follows from what is on the screen, and a redo
   that quietly does something other than what it says is worse than no
   redo at all. */

export const emptyStack = () => ({ past: [], future: [] });

export const LIMIT = 25;

export function record(stack, label, delta, limit = LIMIT) {
  if (isEmptyDelta(delta)) return stack;
  const entry = { label, delta, at: Date.now() };
  const past = [...stack.past, entry];
  return { past: past.slice(-limit), future: [] };
}

export const canUndo = (stack) => stack.past.length > 0;
export const canRedo = (stack) => stack.future.length > 0;

export const nextUndo = (stack) => stack.past[stack.past.length - 1] ?? null;
export const nextRedo = (stack) => stack.future[stack.future.length - 1] ?? null;

/* Taking a step off one side and putting it on the other. The entry
   comes back so the canvas can send it; the stack is only moved once
   the send has worked, which is why these do not do both. */
export function popUndo(stack) {
  if (!canUndo(stack)) return { stack, entry: null };
  const entry = stack.past[stack.past.length - 1];
  return { stack: { past: stack.past.slice(0, -1), future: [...stack.future, entry] }, entry };
}

export function popRedo(stack) {
  if (!canRedo(stack)) return { stack, entry: null };
  const entry = stack.future[stack.future.length - 1];
  return { stack: { past: [...stack.past, entry], future: stack.future.slice(0, -1) }, entry };
}

/* Several steps at once, for "undo the last four things".

   The deltas are applied newest first and merged, so a feature touched
   by three of the four is written once with the value it had before any
   of them. Sending them one at a time would work but would write the
   same row repeatedly and leave the drawing briefly in states that never
   existed — visible as flicker, and wrong if a send fails part way. */
export function planMany(entries, dir) {
  const ordered = dir === "undo" ? [...entries].reverse() : entries;
  const restore = new Map();
  const update = new Map();
  const remove = new Set();

  for (const e of ordered) {
    const p = planFor(e.delta, dir);
    for (const f of p.restore) { remove.delete(idOf(f)); restore.set(idOf(f), f); }
    for (const f of p.update) {
      if (restore.has(idOf(f))) restore.set(idOf(f), f);
      else update.set(idOf(f), f);
    }
    for (const id of p.remove) {
      /* Created then deleted across the range: it should not exist at
         the end, and it did not exist at the start, so neither putting
         it back nor writing to it is right — only removing it.

         That leaves a delete for a row that is already gone, which is a
         no-op rather than an error, and cheaper than tracking existence
         through the range to work out that it can be dropped. */
      restore.delete(id);
      update.delete(id);
      remove.add(id);
    }
  }
  return { restore: [...restore.values()], update: [...update.values()], remove: [...remove] };
}

/* The label a button should carry. Naming the step is most of what makes
   a stack usable — "Undo" alone leaves you pressing it and watching. */
export const undoLabel = (stack) =>
  (canUndo(stack) ? `Undo ${nextUndo(stack).label}` : "Nothing to undo");
export const redoLabel = (stack) =>
  (canRedo(stack) ? `Redo ${nextRedo(stack).label}` : "Nothing to redo");
