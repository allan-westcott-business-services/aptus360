/* A cross-section marker on a trench.

   The mark that says "the section is taken here": a bar across the dig
   with an arrowhead at each end, of the kind every set of drawings
   carries. Right-clicking it shows the section.

   ── Two metres, across the line ──

   The bar is 2 m of real ground, so it scales with the drawing like
   everything else and means the same thing on a sheet at 1:200 as at
   1:500. It lies SQUARE to the line it is placed on, because a section
   is a cut through the trench and a cut at any other angle is through
   a longer trench than the one that was dug.

   ── Anywhere along, not just at a vertex ──

   Unlike a fitting, which belongs at a point of the pipe, a section can
   be taken wherever somebody wants to look. So the snap is to the
   nearest point ON the line — a foot of the perpendicular — rather than
   to the line's own vertices. The distance along the trench travels
   with it, because that is what names the section on the drawing and
   what tells `contentsOf` which stretch to report.

   Pure: features in, a position and a bearing out, and the drawn shape
   from those. Both renderers use it, so the screen and the sheet draw
   one mark rather than two. */

import { SNAP_TOL } from "./feeder.js";

/* The bar's length, in metres of ground. Exported because the canvas,
   the print and the checks all need the same number, and a second copy
   of it is how a mark comes to be 2 m on screen and 1.6 mm on paper. */
export const SECTION_LEN_M = 2;

/* The arrowheads, as a fraction of the bar. Big enough to read at site
   zoom, small enough not to swamp a 2 m mark on an A3 sheet. */
export const SECTION_HEAD = 0.22;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* The nearest point on a segment, and how far along the whole line it
   falls. */
function footOn(g, point) {
  let best = null;
  let run = 0;
  for (let i = 1; i < g.length; i++) {
    const a = g[i - 1];
    const b = g[i];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    const segLen = Math.sqrt(len2);
    if (len2) {
      const t = Math.max(0, Math.min(1,
        ((point[0] - a[0]) * vx + (point[1] - a[1]) * vy) / len2));
      const q = [a[0] + vx * t, a[1] + vy * t];
      const d = dist(q, point);
      if (!best || d < best.d) {
        best = { d, at: q, dir: [vx / segLen, vy / segLen], alongM: run + segLen * t };
      }
    }
    run += segLen;
  }
  return best;
}

/* Where a section mark placed near this point belongs.

   `accepts` decides what may carry one. A trench by default: a section
   is a cut through a dig, and one taken across a single pipe with no
   trench around it is a drawing of nothing much. Passed in rather than
   assumed, so a caller that wants sections on something else can say
   so instead of this module guessing. */
export function snapForSection(point, features = [], opts = {}) {
  const {
    lineTypes = [],
    reach = SNAP_TOL * 3,
    accepts = null,
  } = opts;
  if (!Array.isArray(point) || point.length !== 2) return null;

  const isTrench = (f) => {
    const key = f?.Attributes?.Line_Type;
    const t = lineTypes.find((x) => x.Type_Key === key);
    return t ? t.Layer_Key === "trench"
      : String(key ?? "").includes("trench") || f.Layer_Key === "trench";
  };
  const ok = accepts || isTrench;

  let best = null;
  for (const f of features) {
    if (f.Feature_Type !== "line") continue;
    if (!ok(f)) continue;
    const g = (f.Geometry || []).filter(Array.isArray);
    if (g.length < 2) continue;
    const foot = footOn(g, point);
    if (!foot || foot.d > reach) continue;
    if (!best || foot.d < best.foot.d) best = { foot, line: f };
  }

  if (!best) return null;
  const { dir } = best.foot;
  return {
    at: best.foot.at,
    lineId: best.line.Feature_ID,
    /* The bearing OF THE LINE. The mark is drawn square to it, and
       storing the line's own bearing rather than the bar's keeps the
       stored number meaning the same thing as every other Angle_Deg on
       the drawing — the direction of the thing it belongs to. */
    angleDeg: (Math.atan2(dir[1], dir[0]) * 180) / Math.PI,
    alongM: Math.round(best.foot.alongM * 10) / 10,
  };
}

/* The mark itself, in metres about its own centre.

   A bar square to the line, and an arrowhead at each end pointing back
   along the bar — the way a section mark is drawn on every set of
   drawings, so a reader knows which way the section is viewed.

   Returned as plain points so the canvas can stroke them and the print
   can record them without either knowing how the other draws. */
export function sectionMarkShape(angleDeg = 0, lenM = SECTION_LEN_M) {
  const rad = (Number(angleDeg) || 0) * (Math.PI / 180);
  /* Square to the line: the line's direction turned a quarter turn. */
  const nx = -Math.sin(rad);
  const ny = Math.cos(rad);
  const half = lenM / 2;

  const a = [-nx * half, -ny * half];
  const b = [nx * half, ny * half];

  /* Each head is a triangle on the bar, its point at the end and its
     base a short way in, spread either side by half its length. */
  const hl = lenM * SECTION_HEAD;
  const hw = hl * 0.55;
  const head = (tip, towards) => {
    const bx = tip[0] + (towards[0] - tip[0]) * (hl / lenM) * 2;
    const by = tip[1] + (towards[1] - tip[1]) * (hl / lenM) * 2;
    /* Spread along the LINE, which is square to the bar. */
    const sx = Math.cos(rad) * hw;
    const sy = Math.sin(rad) * hw;
    return [tip, [bx + sx, by + sy], [bx - sx, by - sy]];
  };

  return {
    bar: [a, b],
    heads: [head(a, b), head(b, a)],
  };
}
