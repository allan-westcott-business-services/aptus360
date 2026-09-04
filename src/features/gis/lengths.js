/* What a line's length is.

   Two different facts, and they had been sharing a column.

   **Drawn** is the geometry: the sum of the segments, computed every
   time it is asked for. It follows the drawing, so a line rubber-banded
   by a joint being dragged is a different length the instant it moves.

   **Measured** is what somebody typed because the plan is flat and the
   run is not — a duct that rises and falls, a trench round an
   obstruction, slack the drawing cannot show. It is a statement about
   the world that the drawing cannot make.

   ── Why `Measured_Length_m` and not `Length_m` ──

   `Length_m` is maintained by `gis_length_trg`, a database trigger that
   recomputes it from the geometry on every change. The Feature Editor
   offered the same attribute as a "Measured length" override, so:

     - every line arrived with a measured length equal to its drawn
       length, and the panel announced "Calculations read 299.8 m for
       this line instead of the drawn 299.8 m", which is nonsense;
     - every label read "299.8 m entered" about a figure nobody entered;
     - a real measurement would be silently overwritten the next time
       anything touched the geometry.

   Two writers of one column with opposite meanings — fault 13, and the
   only fix is two columns. `Length_m` goes back to being the trigger's
   own mirror of the drawing (the bill of materials reads it in SQL and
   is unaffected). `Measured_Length_m` is written by a person and by
   nothing else, so its presence means what it says.

   ── Existing drawings ──

   Nothing is migrated. Every `Length_m` on the drawing today was
   written by the trigger and equals the drawn length, so ignoring it
   changes no figure. If somebody had genuinely measured a line, that
   entry reverts to the drawn length and has to be typed again — there
   is no way to tell one from the other, which is the fault. */

export function drawnLength(feature) {
  const g = feature?.Geometry || [];
  if (g.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < g.length; i++) {
    total += Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]);
  }
  return total;
}

/* What "how far does the electricity travel" means: the measurement
   where there is one, the drawing otherwise.

   Everything meaning "how NEAR is this thing" keeps reading the
   geometry directly — a measured length does not move the trench. */
export function runLength(feature) {
  const m = Number(feature?.Attributes?.Measured_Length_m ?? 0) || 0;
  return m > 0 ? m : drawnLength(feature);
}

/* Whether a person has stated one, for a label that wants to say so. */
export function hasMeasured(feature) {
  return (Number(feature?.Attributes?.Measured_Length_m ?? 0) || 0) > 0;
}
