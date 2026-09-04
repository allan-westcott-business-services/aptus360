/* Which point stands at each stop on a circuit, and what it is called.

   Build LV Network walks a circuit from its origin outward and breaks
   the run at every stop: the origin, junctions, leaf ends, and where
   the cable count changes. Each stop wants exactly one feeder end
   point, numbered in walk order — A0 at the origin, A1 the first stop
   after it — carrying the circuit's id and the cable arriving there.

   Some of those points already exist. The ones the last build laid are
   the build's own and are replaced. The ones somebody placed by hand
   are not: a hand-placed feeder point is a break a designer chose, and
   a link box is a physical thing in the ground with fuses set in it.
   Those are ADOPTED — they keep their id, their name and their own
   cable, and take the number of the stop they stand on.

   ── Why this is a module ──

   It was ninety lines inside buildLvNetwork, which is a function that
   deletes rows, calls the database and reports progress, so nothing
   could drive it and every fault in it was found on a live drawing.
   The decisions are here; the writing stays there. checklinkboxseq
   drives this. */

/* How near a point has to stand to a stop to BE that stop.

   Two metres for a link box, one for anything else. A box is placed by
   eye on the run and lands a foot or so from the node the walk stops
   at — far enough to miss a one-metre reach, so the build made a point
   of its own beside it: a meaningless two-metre leg into a generated
   A10, with the box standing next to it holding nothing. The joint rule
   already reaches two metres for exactly this reason, and where a link
   box stands it IS the feeder end point, so the two reaches agree. */
export const ADOPT_REACH_M = 1;
export const ADOPT_REACH_BOX_M = 2;

export const spanLabelFor = (letter, seq) => `${letter}${seq}`;

const at = (f) => {
  const a = f.Attributes?.Span_Anchor;
  if (Array.isArray(a) && a.length === 2) return a;
  return (f.Geometry || [])[0] ?? null;
};

/* ── Who this circuit may consider ──

   Its own feeder points, its own boxes, and a box that has no circuit
   at all.

   That last one is the fix for the stray duplicate. A box placed in
   open ground gets no circuit and no sequence — there was no cable
   under the click, and the cables are drawn to it afterwards. The
   build only looked at points that already had both, so the box was
   invisible to it and the walk made a generated point standing on top
   of it: two points at one place, one holding the figures and one
   holding the fuses.

   A feeder point with no circuit is NOT considered. It cannot be
   placed without one — placement refuses a click in open ground,
   because a point belonging to no circuit stops no trace and shows no
   level. A box can, because a box is a thing in the ground whether or
   not a cable has reached it yet. */
const mineFor = (existing, circuitId, claimed) => (existing || []).filter((f) => {
  if (claimed?.has(f.Feature_ID)) return false;
  const cid = f.Attributes?.Circuit_ID;
  if (f.Feature_Role === "feederpoint") return Number(cid) === Number(circuitId);
  if (f.Feature_Role !== "linkbox") return false;
  return cid == null || Number(cid) === Number(circuitId);
});

export function planFeederPoints({
  nodes = [],
  existing = [],
  circuit,
  claimed = new Set(),
  startCableId = null,
  overrideFor = () => null,
}) {
  const letter = circuit?.letter ?? "A";
  const mine = mineFor(existing, circuit?.id, claimed);

  /* The build's own, replaced every run. A link box is never Generated,
     so it can never fall in here. */
  const remove = mine.filter((f) => f.Attributes?.Generated).map((f) => f.Feature_ID);
  const manual = mine.filter((f) => !f.Attributes?.Generated);

  const adopt = [];
  const create = [];
  const took = new Set();

  let seq = 0;
  for (const nd of nodes) {
    const num = nd.kind === "origin" ? 0 : (seq += 1);
    const label = spanLabelFor(letter, num);

    /* Nearest within reach, ties on the lower id — "first found" is
       scan order deciding a schedule. */
    let match = null, best = Infinity;
    for (const f of manual) {
      if (took.has(f.Feature_ID)) continue;
      const pAt = at(f);
      if (!pAt) continue;
      const reach = f.Feature_Role === "linkbox" ? ADOPT_REACH_BOX_M : ADOPT_REACH_M;
      const d = Math.hypot(pAt[0] - nd.point[0], pAt[1] - nd.point[1]);
      if (d > reach) continue;
      if (match && d > best) continue;
      if (match && d === best && Number(f.Feature_ID) >= Number(match.Feature_ID)) continue;
      match = f; best = d;
    }

    if (match) {
      took.add(match.Feature_ID);
      claimed.add(match.Feature_ID);
      const w = writeFor(match, {
        num, label, kind: nd.kind, circuit,
      });
      if (w) adopt.push(w);
      continue;
    }

    create.push({
      Layer_Key: "electric",
      Feature_Type: "point",
      Feature_Role: "feederpoint",
      Geometry: [nd.point],
      Label: `Point ${label}`,
      Attributes: {
        Circuit_ID: circuit?.id, Circuit_Name: circuit?.name, Circuit_Letter: letter,
        Span_Seq: num, Span_Label: label, Span_Kind: nd.kind,
        Span_Anchor: nd.point,
        ...(nd.kind !== "origin" && startCableId != null
          ? { VD_Cable_Size_ID: startCableId } : {}),
        ...((() => {
          const m = overrideFor(nd.point);
          return m != null ? { Manual_VD_Cable_Size_ID: m } : {};
        })()),
        Generated: true,
      },
    });
  }

  /* Hand-placed points the walk did not land on — mid-run breaks
     somebody chose. Sequenced after the planned positions, left
     otherwise alone.

     A box with no circuit is skipped: it was considered above only in
     case the walk stopped on it, and one standing in a field is not
     this circuit's to number. Numbering it would give every unplaced
     box on the site a place in the first circuit's schedule. */
  for (const f of manual) {
    if (took.has(f.Feature_ID)) continue;
    if (Number(f.Attributes?.Span_Seq) === 0) continue;
    if (f.Attributes?.Circuit_ID == null) continue;
    seq += 1;
    const w = writeFor(f, { num: seq, label: spanLabelFor(letter, seq), circuit });
    if (w) { adopt.push(w); claimed.add(f.Feature_ID); }
  }

  return { adopt, create, remove };
}

/* What an adopted point takes, and whether it is worth a write.

   Only where something actually changes — rewriting every point on
   every build would churn the drawing for nothing.

   ── The name goes with the number ──

   This wrote Span_Seq and Span_Kind and not Span_Label, so a box that
   took A10 at placement — max sequence plus one, which is all
   placement can know — was resequenced to 1 on every build since and
   went on being called A10 everywhere a stop is named: the circuit
   report, the call-off spans, the levels table. A feeder point had it
   worse, carrying the stale code in its own Label as well.

   A link box keeps its own Label. "Link Box 3" is its name and the
   span code is what it is called on the run; a feeder point has no
   name but its code, so its Label follows. */
function writeFor(f, { num, label, kind, circuit }) {
  const a = f.Attributes || {};
  const wantKind = kind === undefined ? a.Span_Kind : kind;
  const isBox = f.Feature_Role === "linkbox";
  const wantLabel = isBox ? f.Label : `Point ${label}`;

  const same = String(a.Span_Seq) === String(num)
    && a.Span_Label === label
    && a.Span_Kind === wantKind
    && Number(a.Circuit_ID) === Number(circuit?.id)
    && (isBox || f.Label === wantLabel);
  if (same) return null;

  return {
    Feature_ID: f.Feature_ID,
    Label: wantLabel,
    Attributes: {
      ...a,
      Circuit_ID: circuit?.id,
      Circuit_Name: circuit?.name,
      Circuit_Letter: circuit?.letter,
      Span_Seq: num,
      Span_Label: label,
      ...(kind === undefined ? {} : { Span_Kind: kind }),
    },
  };
}
