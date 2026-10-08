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
   own mirror of the drawing. `Measured_Length_m` is written by a person
   and by nothing else, so its presence means what it says.

   ── The bill of materials was NOT unaffected ──

   This note used to end that paragraph by saying the bill of materials
   read this column in SQL and was therefore untouched by the split.
   True as a sentence about SQL, and wrong about the bill. It went
   on summing `Length_m`, so a trench drawn at 300 m and measured at
   330 m was ordered as 300 m — on cable, gas, water and trench alike,
   because `gis_bom` sums every line in one expression. Every consumer
   in here was moved to `runLength()`; the one that turns into a
   purchase order was in SQL, out of sight, and was left behind.

   0257 moves it. `checkbommeasured` holds the two to the same rule, so
   the next rewrite of `gis_bom` — it is replaced whole every time any
   part of it changes — cannot quietly drop the measurement again.

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

/* How much longer the real run is than the drawing, as a multiplier.

   1 where nobody has measured, so a caller can multiply unconditionally
   and a drawing made before the box existed behaves exactly as it did.

   ── What it is for ──

   Some figures are not a length but are made OUT of one, spread along
   it: the volume of spoil out of a trench, the hours to lay what is in
   it, where a tee falls along a run. Those scale with the measurement
   rather than reading it directly — a trench drawn at 300 m and
   measured at 330 m is ten per cent more digging and ten per cent more
   cable to pull, and a tee half way along is still half way along.

   ── What it is NOT for ──

   Anything asking how NEAR two things are. A measured length does not
   move the trench: snapping, joining, which cables lie inside a length
   and where a line is on the screen all stay geometric. The drawing
   still shows what was drawn.

   One copy, here, because feeder.js, bomLabour.js and spanContents.js
   all need it and three private copies is three chances for the volt
   drop, the bill and the call-off to read one trench three ways. */
export function measuredScale(feature) {
  const stated = Number(feature?.Attributes?.Measured_Length_m ?? 0) || 0;
  if (!(stated > 0)) return 1;
  const drawn = drawnLength(feature);
  return drawn > 0 ? stated / drawn : 1;
}
