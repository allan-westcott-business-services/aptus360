/* Carrying what is in a trench when the trench moves.

   A trench is dug once and the cables and pipes lie in it. Reshape the
   trench — pull a vertex out into a dog leg, drag an end, add a bend —
   and everything in it was left where it was, hanging in the ground
   beside the new route. The only way back was to delete the cables and
   run Auto Lay Services again, which loses every size and status set on
   them by hand.

   ── How a line is carried ──

   By fraction of length along the trench, not by absolute distance.

   Each vertex of the cable is measured as "40% of the way along the old
   trench", and put at 40% of the way along the new one. That one rule
   answers all three ways a trench changes:

     a dog leg      the route is longer and bends; a cable at 40% is
                    still at 40%, so it follows the bend
     extended       the trench grows at one end; a cable that ran the
                    whole run still runs the whole run
     an end moved   the same, in the other direction

   Absolute distance was the alternative and gets the second case
   wrong: extend a trench by three metres and every cable in it stops
   three metres short of where the dig now ends, which is a drawing
   nobody would sign.

   ── What it does not do ──

   It does not decide what is in the trench. `contentsOf` does that, by
   measuring how much of each line runs along it, and a line that merely
   crosses is not content. This module is handed the answer.

   It does not preserve straightness. A cable drawn straight along a
   trench that has since been dog-legged comes out dog-legged, because
   the trench is where the ground is open. That is the point. */

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* Cumulative length at each vertex, and the total. */
function measure(g = []) {
  const at = [0];
  let total = 0;
  for (let i = 1; i < g.length; i++) {
    total += dist(g[i - 1], g[i]);
    at.push(total);
  }
  return { at, total };
}

/* Where a point sits along a polyline: the distance from its start to
   the nearest point on it.

   Nearest by perpendicular distance to each segment, because a cable's
   vertex sits in the trench rather than exactly on a drawn vertex of
   it — the two are laid to the same route and recorded to different
   precisions. */
export function alongAt(g = [], p) {
  const { at } = measure(g);
  let best = Infinity;
  let bestAlong = 0;

  for (let i = 0; i + 1 < g.length; i++) {
    const a = g[i];
    const b = g[i + 1];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;

    let t = 0;
    if (len2) {
      t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
      t = Math.max(0, Math.min(1, t));
    }
    const foot = [a[0] + t * vx, a[1] + t * vy];
    const d = dist(p, foot);
    if (d < best) {
      best = d;
      bestAlong = at[i] + t * Math.sqrt(len2);
    }
  }

  return { along: bestAlong, gap: best };
}

/* The point a given distance along a polyline. Past either end it
   clamps, because a fraction cannot land outside 0 and 1 and clamping
   is the honest answer to floating point that says otherwise. */
export function pointAlong(g = [], m) {
  if (!g.length) return null;
  const { at, total } = measure(g);
  if (m <= 0) return [...g[0]];
  if (m >= total) return [...g[g.length - 1]];

  for (let i = 0; i + 1 < g.length; i++) {
    if (m <= at[i + 1]) {
      const seg = at[i + 1] - at[i];
      const t = seg ? (m - at[i]) / seg : 0;
      return [
        g[i][0] + t * (g[i + 1][0] - g[i][0]),
        g[i][1] + t * (g[i + 1][1] - g[i][1]),
      ];
    }
  }
  return [...g[g.length - 1]];
}

/* One line, carried from the old trench route to the new one.

   Returns null where it cannot be carried honestly, and the caller
   leaves the line alone. Two cases:

     - a trench of no length, before or after. There is no "40% of the
       way along" a point, and inventing one would collapse every cable
       in it onto that point.

     - a vertex that is not on the trench at all. A cable running along
       a trench and then off to a meter has vertices past the end of the
       dig, and those must not be dragged onto it. They keep their
       offset from where the trench ended instead — see below. */
export function carryLine(oldG = [], newG = [], line = [], opts = {}) {
  const { withinM = 1.5 } = opts;

  const before = measure(oldG);
  const after = measure(newG);
  if (oldG.length < 2 || newG.length < 2) return null;
  if (before.total <= 0 || after.total <= 0) return null;

  const scale = after.total / before.total;
  let moved = false;

  /* ── The trench's own corners ──

     Mapping the cable's vertices is not enough on its own. A cable
     drawn straight along a straight trench has two vertices, at 0% and
     100%. Pull the middle of the trench out into a dog leg and both
     ends are still at 0% and 100% — nothing moves, and the cable cuts
     across the corner the dig now goes round.

     So the new route's own vertices are inserted between them. A corner
     in the ground is a corner in everything laid in it, whether or not
     the cable happened to have a vertex there before.

     Only the corners inside the stretch the cable occupies: a service
     that runs the first ten metres of a trench does not gain the bends
     in the other ninety. */
  const corners = after.at.slice(1, -1);

  const mapped = line.map((p) => {
    const { along, gap } = alongAt(oldG, p);

    /* ── A point that is not in the trench ──

       The tail of a service cable leaves the dig and crosses to the
       meter. Those vertices are near the END of the trench and not
       along it, so carrying them by fraction would swing them onto the
       new route and detach the cable from its meter.

       They keep their position relative to the trench end they hang
       off: the end moves, they move with it by the same vector, and
       the run from the dig to the meter is preserved rather than
       recomputed. */
    if (gap > withinM) {
      const endBefore = along <= 0 ? oldG[0] : oldG[oldG.length - 1];
      const endAfter = along <= 0 ? newG[0] : newG[newG.length - 1];
      const dx = endAfter[0] - endBefore[0];
      const dy = endAfter[1] - endBefore[1];
      if (dx || dy) moved = true;
      return { pt: [p[0] + dx, p[1] + dy], along: null, onTrench: false };
    }
    const q = pointAlong(newG, along * scale);
    if (dist(q, p) > 1e-9) moved = true;
    return { pt: q, along: along * scale, onTrench: true };
  });

  const out = [];
  for (let i = 0; i < mapped.length; i++) {
    const cur = mapped[i];
    const prev = mapped[i - 1];

    /* Corners between the previous in-trench point and this one, in the
       direction the cable runs — a cable drawn from the far end back
       needs them in reverse or it doubles back on itself. */
    if (prev && prev.onTrench && cur.onTrench) {
      const lo = Math.min(prev.along, cur.along);
      const hi = Math.max(prev.along, cur.along);
      const inside = corners.filter((c) => c > lo + 1e-6 && c < hi - 1e-6);
      if (prev.along > cur.along) inside.reverse();
      for (const c of inside) {
        out.push(pointAlong(newG, c));
        moved = true;
      }
    }

    out.push(cur.pt);
  }

  return moved ? out : null;
}


/* A point sitting on the trench, carried the same way.

   Joints, span nodes and link boxes are placed on the dig: a service
   joint where the service leaves the main, a bottle end at the end of
   the run, a span node at a junction. Reshape the trench and they stay
   where they were, and a bottle end that was on the end of a cable is
   now beside it.

   The same fraction rule as a line, because it has to be: a joint at
   the end of a cable and the cable's own last vertex must land on the
   same point, and two rules would put them a few centimetres apart —
   which is worse than both being wrong, because nothing looks wrong
   until something measures it.

   Null where the point is not on the trench, so a meter standing beside
   the dig is left alone. A meter is placed against a plot, not against
   the ground, and dragging one because the trench beside it moved would
   move a thing nobody had asked about. */
export function carryPoint(oldG = [], newG = [], point, opts = {}) {
  const { withinM = 1.5 } = opts;
  if (!point || oldG.length < 2 || newG.length < 2) return null;

  const before = measure(oldG);
  const after = measure(newG);
  if (before.total <= 0 || after.total <= 0) return null;

  const { along, gap } = alongAt(oldG, point);
  if (gap > withinM) return null;

  const q = pointAlong(newG, along * (after.total / before.total));
  return dist(q, point) > 1e-9 ? q : null;
}
