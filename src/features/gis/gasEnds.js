/* The cap on the end of a gas main.

   Where a main stops it is capped, and the drawing says so with a mark
   at the end: a bar across the pipe with a short return off each end of
   it, which reads as a capital E turned to face back down the pipe.

   ── Derived, not stored ──

   Service valves are features. This is not, and the difference is worth
   stating because the two look alike on screen.

   A valve is a thing with a position somebody may disagree with: it
   goes a metre and a half down the spur because that is usually right,
   and on a drawing where it is not, it gets dragged. So it has to be
   selectable, and something computed at render time cannot be.

   A cap has no position of its own. It is at the end of the main, and
   the end of the main is wherever the geometry says — so a cap stored
   as a feature would be a second copy of a fact the pipe already holds,
   and the two would part company the first time somebody dragged the
   last vertex of a run. Derived, it cannot: move the end and the mark
   moves with it, redraw the network and no cap is left behind at an end
   that no longer exists.

   It also means no role to add to the schema, nothing to clean up on a
   rebuild, and no line in the BOM — the cap itself is a fitting, and
   fittings are counted from the pipe schedule rather than from marks on
   a drawing.

   ── Which ends ──

   The free ones. A main drawn in three lengths has six ends and four of
   them are joins; capping those would put a mark at every point the
   drawing happens to have been broken at, which says nothing about the
   network and a great deal about how it was drawn.

   The POC end is not a free end either. Something feeds the main there —
   that is what a point of connection is — so it is excluded by the same
   test the builder uses to find it, distance to the gas POC.

   ── Pure ──

   Features in, positions out. The canvas draws them. */

import { CONNECT_EPS, SNAP_TOL, isServiceLine } from "./feeder.js";

/* ── The size of the mark ──

   Metres of real ground, like the valve bar and for the same reason: it
   is drawn to scale with everything else, so it grows and shrinks with
   the drawing rather than sitting at a fixed number of pixels.

   The bar across the pipe, and how far the two returns come back along
   it. Named separately because they are two different measurements of
   the same symbol and a drawing standard may set either. */
export const GAS_CAP_SPINE_M = 1.5;
export const GAS_CAP_ARM_M = 1.0;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* Gas mains, judged on the layer the line type belongs to rather than
   on the spelling of the key — the same test the builder and the valves
   use, so none of the three can disagree about what a main is. */
function gasMains(features, lineTypes, layerKey) {
  return features.filter((f) => {
    if (f.Feature_Type !== "line" || (f.Geometry || []).length < 2) return false;
    if (isServiceLine(f)) return false;
    const t = lineTypes.find((x) => x.Type_Key === f.Attributes?.Line_Type);
    return t ? t.Layer_Key === layerKey : f.Layer_Key === layerKey;
  });
}

/* Every free end of every gas main, by feature.

   Keyed on Feature_ID so the canvas can ask about the line it is
   already drawing rather than walking a list per frame, and holding an
   array because an isolated main has two free ends and both get a cap.

   `dir` points outward — the direction the pipe was going when it
   stopped. The bar is drawn square to it and the returns come back
   along it, both worked out by the canvas from this one fact rather
   than stored three ways. */
export function gasMainEnds(features = [], opts = {}) {
  const {
    lineTypes = [],
    eps = CONNECT_EPS,
    tol = SNAP_TOL,
    layerKey = "gas",
  } = opts;

  const byFeature = new Map();
  const mains = gasMains(features, lineTypes, layerKey);
  if (!mains.length) return byFeature;

  const poc = features.find((f) => f.Feature_Role === "poc"
    && f.Layer_Key === layerKey
    && (f.Geometry || []).length);

  for (const f of mains) {
    const g = f.Geometry;
    const last = g.length - 1;
    const caps = [];

    for (const i of last === 0 ? [0] : [0, last]) {
      const p = g[i];

      /* Fed from here, so not an end. */
      if (poc && dist(p, poc.Geometry[0]) <= tol) continue;

      /* Meeting another main, or meeting itself somewhere that is not
         the vertex next door — a ring closed back on its own start has
         two coincident ends and neither is free. The neighbouring
         vertex is skipped because every end touches one by definition
         and it is not a join. */
      let joined = false;
      for (const o of mains) {
        const own = Number(o.Feature_ID) === Number(f.Feature_ID);
        for (let k = 0; k < o.Geometry.length; k++) {
          if (own && Math.abs(k - i) <= 1) continue;
          if (dist(p, o.Geometry[k]) <= eps) { joined = true; break; }
        }
        if (joined) break;
      }
      if (joined) continue;

      /* Outward, from the vertex before the end towards it. A zero
         length there is a duplicated point and says nothing about
         direction, so that end goes uncapped rather than capped at an
         arbitrary angle. */
      const inner = i === 0 ? g[1] : g[last - 1];
      const len = dist(p, inner);
      if (!len) continue;

      caps.push({
        at: [p[0], p[1]],
        dir: [(p[0] - inner[0]) / len, (p[1] - inner[1]) / len],
      });
    }

    if (caps.length) byFeature.set(Number(f.Feature_ID), caps);
  }

  return byFeature;
}
