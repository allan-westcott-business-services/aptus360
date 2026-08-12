/* Stopping things being moved by accident.

   A drawing is mostly finished long before it stops being opened. Once
   the trenches are right, every further visit is a chance to nudge one
   with a stray drag — and a trench that has moved four metres looks
   exactly like a trench that has not.

   ── Two kinds of lock ──

   One feature at a time, for the substation that must sit exactly there,
   or the one run that has been surveyed. That lives on the feature, so
   it survives a reload and follows the drawing to whoever opens it next.

   A whole class at once — all mains trenches, all service cables — for
   the ordinary case of finishing one layer and moving on to the next.
   That is a working preference rather than a fact about the drawing, so
   it lives with the person rather than in the data, alongside which
   layers they have hidden.

   ── What a lock does and does not do ──

   It stops movement: dragging the whole feature, and dragging a vertex.
   Nothing else. A locked feature can still be selected, still be read,
   still be edited, still appear in every report — locking a trench must
   not quietly remove it from the bill of materials.

   Deleting is deliberately still allowed. A lock is a guard against the
   slip of a hand, and deleting is not something anyone does by
   accident — it takes a menu or a keystroke and says what it is about
   to do. Extending the lock there would mean unlocking to tidy up,
   which is how people end up leaving everything unlocked. */

export const LOCK_ATTR = "Locked";

/* Locked in its own right. */
export function isFeatureLocked(f) {
  return f?.Attributes?.[LOCK_ATTR] === true;
}

/* Locked because its class is.

   `keys` is whatever the canvas uses to group features — layer, line
   type, role — so a lock on "service cable" and a lock on "the electric
   layer" both work without this needing to know the difference. */
export function isClassLocked(keys = [], locked = []) {
  if (!locked.length) return false;
  const set = new Set(locked);
  return keys.some((k) => k != null && set.has(k));
}

export function isLocked(f, keys = [], lockedClasses = []) {
  return isFeatureLocked(f) || isClassLocked(keys, lockedClasses);
}

/* Why it will not move, in words.

   A feature that refuses to drag with no explanation reads as a broken
   canvas. Naming which of the two locks is holding it also says how to
   release it, which is not the same answer in each case. */
export function lockReason(f, keys = [], lockedClasses = [], labelFor = (k) => k) {
  if (isFeatureLocked(f)) return "This feature is locked.";
  const set = new Set(lockedClasses);
  const hit = keys.find((k) => k != null && set.has(k));
  if (!hit) return "";

  /* Never the raw key.

     A line type's key is stored as "lt:trench_main", and the message
     read that back when the label could not be resolved \u2014 which names
     nothing on screen and, until the locked line types were listed in
     the menu, could not be undone from anywhere. If the label is not
     known, the key is at least made legible.

     The label lookup can miss legitimately: a class locked in a
     previous session is read from storage before the line types have
     loaded. */
  const label = labelFor(hit);
  if (label && label !== hit) return `${label} are locked.`;
  const pretty = String(hit).replace(/^lt:/, "").replace(/_/g, " ");
  return `${pretty} are locked.`;
}

/* Turning a class lock on or off. */
export function toggleClassLock(locked = [], key) {
  return locked.includes(key)
    ? locked.filter((k) => k !== key)
    : [...locked, key];
}

/* The rows to write when locking or unlocking a set of features.

   Returned rather than applied, and features already in the state asked
   for are left out — locking a hundred trenches of which ninety are
   already locked should write ten rows, not a hundred. */
export function planLock(features = [], lock = true) {
  return features
    .filter((f) => isFeatureLocked(f) !== lock)
    .map((f) => ({
      Feature_ID: f.Feature_ID,
      Attributes: lock
        ? { ...f.Attributes, [LOCK_ATTR]: true }
        /* Removed rather than set false: an attribute that is absent
           means the same thing and leaves nothing behind on a drawing
           nobody locks. */
        : Object.fromEntries(
          Object.entries(f.Attributes || {}).filter(([k]) => k !== LOCK_ATTR)),
    }));
}
