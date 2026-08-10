/* Easement: the strip of land a trench has the right to cross.

   A section of trench is marked as being in an easement, and the
   drawing shows a hatched band about a metre wide following the line.
   It is a fact about the land, not about the pipe, so it is drawn under
   whatever is in the trench and stays visible on the electric, gas and
   water drawings alike — the same easement is what all three are laid
   in.

   ── Why the band is built here and not drawn as a fat line ──

   A thick stroke with a hatch pattern would follow the line, but the
   hatching would rotate with each segment and break at every corner.
   The band is built as a closed polygon — one side offset left, the
   other offset right, joined at the ends — so the hatch is a single
   fill at one angle across the whole run, which is what a drawing
   convention expects and what the example shows.

   ── The corners ──

   Offsetting each segment independently leaves gaps on the outside of a
   bend and crossings on the inside. Each offset vertex is placed on the
   bisector of the two segments meeting there, lengthened by 1/sin(θ/2)
   so the band keeps its width through the turn. Very sharp turns would
   send that to infinity, so it is capped — a spike is worse than a
   slightly narrow corner. */

export const EASEMENT_WIDTH_M = 1;

/* Where the easement flag lives on a feature. One name, because a
   second spelling is a section that looks unmarked on one screen and
   marked on another. */
export const EASEMENT_KEY = "Easement";

/* The yellow every land drawing uses for a strip of ground. Not taken
   from the layer palette: an easement is the same thing whether the
   drawing is electric, gas or water, and colouring it per layer would
   say it was three different easements. */
export const EASEMENT_COLOUR = "#facc15";

export const isEasement = (f) => !!f?.Attributes?.[EASEMENT_KEY];

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v) => Math.hypot(v.x, v.y) || 1;
const unit = (v) => { const l = len(v); return { x: v.x / l, y: v.y / l }; };
/* Left-hand normal, in screen space where y grows downward. */
const normal = (v) => ({ x: v.y, y: -v.x });

/* How far a mitred corner has to reach to keep the band's width.

   Capped at three widths: as two segments approach doubling back on
   themselves the mitre runs away to infinity, and a spike shooting off
   the drawing is worse than a corner that is a little narrow. */
const MITRE_LIMIT = 3;

/* One side of the band: every point offset by `d` along its bisector. */
function offsetSide(pts, d) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[i - 1];
    const next = pts[i + 1];

    if (!prev || !next) {
      /* An end: square off along the one segment there is. */
      const seg = unit(prev ? sub(pts[i], prev) : sub(next, pts[i]));
      const n = normal(seg);
      out.push({ x: pts[i].x + n.x * d, y: pts[i].y + n.y * d });
      continue;
    }

    const a = unit(sub(pts[i], prev));
    const b = unit(sub(next, pts[i]));
    const na = normal(a);
    const nb = normal(b);
    /* The bisector of the two offset edges. */
    const bis = { x: na.x + nb.x, y: na.y + nb.y };
    const l = len(bis);
    /* sin(θ/2) falls out of the half-angle between the segments. */
    const scale = Math.min(2 / (l || 1), MITRE_LIMIT);
    out.push({
      x: pts[i].x + (bis.x / (l || 1)) * d * scale,
      y: pts[i].y + (bis.y / (l || 1)) * d * scale,
    });
  }
  return out;
}

/* The band as a closed ring: up one side and back down the other. */
export function easementBand(pts, widthPx) {
  if (!pts || pts.length < 2) return [];
  const half = widthPx / 2;
  const left = offsetSide(pts, half);
  const right = offsetSide(pts, -half);
  return [...left, ...right.reverse()];
}

/* The hatch, as a canvas pattern.

   Built once per colour and cached: a pattern is a small offscreen
   canvas, and making one per feature per frame is the kind of thing
   that is invisible until a drawing has four hundred trench sections
   on it.

   Diagonal at 45 degrees, which is what the example shows and what
   every land drawing uses for a strip of ground. */
const patterns = new Map();

/* 10px squares with a thin line. At 6px and 1.6px wide the two
   directions nearly met and the band read as solid yellow \u2014 a mesh
   only reads as a mesh if there is more gap than ink. */
export function hatchPattern(ctx, colour = "#facc15", stepPx = 10) {
  const key = `${colour}@${stepPx}`;
  if (patterns.has(key)) return patterns.get(key);

  /* Cross-hatched: diagonals both ways, so the fill reads as a mesh of
     small squares rather than as a set of parallel lines.

     The tile clips \u2014 anything drawn outside it is thrown away, which
     is why a long diagonal across an oversized tile came out as dots.
     Each direction is a corner-to-corner stroke plus two short pieces
     filling the corners it leaves; without those the diagonals restart
     at every tile edge and the seams show as a grid of gaps. */
  const size = stepPx;
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const c = tile.getContext("2d");
  if (!c) return colour;

  c.strokeStyle = colour;
  c.lineWidth = 1;
  c.lineCap = "square";
  c.beginPath();
  /* "/" */
  c.moveTo(0, size); c.lineTo(size, 0);
  c.moveTo(-1, 1); c.lineTo(1, -1);
  c.moveTo(size - 1, size + 1); c.lineTo(size + 1, size - 1);
  /* and "\\", giving the squares */
  c.moveTo(0, 0); c.lineTo(size, size);
  c.moveTo(size - 1, -1); c.lineTo(size + 1, 1);
  c.moveTo(-1, size - 1); c.lineTo(1, size + 1);
  c.stroke();

  const pat = ctx.createPattern(tile, "repeat");
  patterns.set(key, pat);
  return pat;
}

/* Called when the drawing is torn down, so a cached pattern does not
   outlive the canvas it was made for. */
export const clearHatchCache = () => patterns.clear();
