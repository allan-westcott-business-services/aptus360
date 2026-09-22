/* The paper scale a calibration implies.

   Metres on the ground per metre of paper, from the calibration's
   metres per unit of the plan.

   A PDF's unit is a POINT: 1/72 of an inch, 0.3528 mm of paper. This
   was worked out as metres per unit × 1000 — one unit taken as one
   MILLIMETRE — so every PDF read at 0.35 of its true scale, and a
   correct 1:250 calibration was reported as "roughly 1:88" and flagged
   as not matching the drawing's own stated 1:250.

   An IMAGE gives no answer: a pixel has no size on paper until you know
   the resolution it was scanned at, which the file does not reliably
   say. Null, so nothing is claimed and nothing is compared. */

export const PDF_POINT_M = 0.0254 / 72;

export function impliedScaleOf(metresPerUnit, sourceKind) {
  const m = Number(metresPerUnit);
  if (!(m > 0) || sourceKind !== "pdf") return null;
  return Math.round(m / PDF_POINT_M);
}

/* The number out of whatever was typed in the stated-scale box:
   "1:250", "1: 250", "1/250", "250". */
export function statedScaleOf(text) {
  const d = String(text || "").match(/(\d[\d,]*)\s*$/);
  return d ? Number(d[1].replace(/,/g, "")) : null;
}

/* Worth a warning when the two disagree by more than 5%: tighter and
   ordinary plotting slop sets it off, looser and a wrong sheet size
   gets through. */
export function scaleDisagrees(implied, stated) {
  return implied != null && stated != null && stated > 0
    && Math.abs(implied - stated) > stated * 0.05;
}
