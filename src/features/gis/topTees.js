/* High Volume Top Tees on a gas main.

   Where a service pipe leaves the main, the connection is made with a
   top tee: a fitting clamped around the main with an outlet taking the
   service off it. Every gas service has one, so a drawing that shows
   the services and not the tees is short one fitting per plot on the
   take-off schedule.

   ── Where ──

   At the point the service meets the main. Not near it, not at the
   plot end: the tee is the join, and the join is one end of the service
   pipe sitting on the main's geometry.

   Which end is found rather than assumed. A service may have been drawn
   from the plot outwards as easily as towards it, and half a drawing
   done each way is ordinary — so both ends are tested against every gas
   main and the one that lands on a main is the connection.

   ── Which way round ──

   The body is clamped around the main, so it lies along the main; the
   outlet takes the service off, so the stem points down the service. On
   the drawing that means the bar follows the main's bearing at the
   point of connection, and the stem leaves at right angles on whichever
   side the service runs.

   Both are read from the geometry rather than fixed. A tee drawn along
   the service instead of the main reads as a fitting nobody could
   install, and one whose stem points into the road rather than at the
   plot is worse: it looks deliberate.

   ── Pure ──

   Features in, positions out. Nothing is created here; the canvas turns
   these into features and the backfill decides which are missing. */

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* How big, in metres of real ground.

   Metres rather than pixels because it is a thing in a hole with a
   size, and it should grow and shrink with everything else drawn to
   scale — the same reason the service valve's bar is a metre of ground
   rather than a fixed number of pixels.

   The proportions are taken from the drawing rather than from a
   catalogue. Change them here and every tee on every drawing follows,
   because nothing stores its own size. */
export const HVTT_ALONG_M = 1.1;    // the body, along the main
export const HVTT_BODY_M = 0.45;    // how thick that body is
export const HVTT_STEM_M = 0.55;    // the outlet, out from the main
export const HVTT_STEM_W_M = 0.4;   // how wide the outlet is

/* How close an end has to be to a main to count as joined to it.

   The same 0.25 m the drawing treats as connected everywhere else. A
   service that stops a metre short of the main has not been drawn onto
   it, and inventing a tee there would put a fitting where there is no
   join. */
export const HVTT_JOIN_M = 0.25;

function nearestOnSegment(p, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (!len2) return { q: [a[0], a[1]], d: dist(p, a), dir: [1, 0] };

  let t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const q = [a[0] + t * vx, a[1] + t * vy];
  const len = Math.sqrt(len2);
  return { q, d: dist(p, q), dir: [vx / len, vy / len] };
}

/* The closest point on a polyline, and which way it runs there. */
function nearestOnLine(p, geom) {
  let best = null;
  for (let i = 1; i < geom.length; i++) {
    const r = nearestOnSegment(p, geom[i - 1], geom[i]);
    if (!best || r.d < best.d) best = r;
  }
  return best;
}

const typeKey = (f) => String(f?.Attributes?.Line_Type ?? "");

/* The size of the pipe a tee is clamped to.

   A fitting is ordered by the main it goes on, so the tee carries the
   main's size rather than a size of its own. Copied at placement rather
   than looked up each time it is read: the take-off is a record of what
   was specified, and a tee that silently changed size because somebody
   resized the main afterwards would make yesterday's schedule wrong
   without anything saying so. Re-run the routine and the new tees carry
   the new size.

   A manual override wins where there is one, for the same reason it
   wins on the pipe: somebody typed it. */
export function sizeOfMain(main) {
  const a = main?.Attributes || {};
  const id = a.Manual_Gas_Pipe_Size_ID ?? a.Gas_Pipe_Size_ID ?? null;
  const label = a.Manual_Size ?? a.Size ?? null;
  return {
    ...(label != null ? { Size: label } : {}),
    ...(id != null ? { Gas_Pipe_Size_ID: Number(id) } : {}),
  };
}

/* Gas mains, by the layer the type belongs to rather than the spelling
   of the key — the same test the gas builder uses, so the two cannot
   disagree about what a main is. Trenches are not pipe. */
export function gasMains(features = [], lineTypes = []) {
  return features.filter((f) => {
    if (f.Feature_Type !== "line" || (f.Geometry || []).length < 2) return false;
    const key = typeKey(f);
    if (/service/i.test(key)) return false;
    const t = lineTypes.find((x) => x.Type_Key === key);
    const layer = t?.Layer_Key ?? f.Layer_Key;
    if (layer !== "gas") return false;
    return !/^trench/.test(key);
  });
}

export function gasServices(features = [], lineTypes = []) {
  return features.filter((f) => {
    if (f.Feature_Type !== "line" || (f.Geometry || []).length < 2) return false;
    const key = typeKey(f);
    if (!/service/i.test(key)) return false;
    if (/^trench/.test(key)) return false;
    const t = lineTypes.find((x) => x.Type_Key === key);
    return (t?.Layer_Key ?? f.Layer_Key) === "gas";
  });
}

/* Where every top tee belongs.

   One per service that reaches a main. A service drawn to nothing gets
   none rather than one guessed at the nearest pipe — an unconnected
   service is a fault worth seeing, and a tee invented on it would hide
   it. */
export function topTees(features = [], opts = {}) {
  const { lineTypes = [], joinM = HVTT_JOIN_M } = opts;

  const mains = gasMains(features, lineTypes);
  const services = gasServices(features, lineTypes);
  if (!mains.length || !services.length) return { tees: [], unjoined: [] };

  const tees = [];
  const unjoined = [];

  for (const svc of services) {
    const g = svc.Geometry;
    const ends = [
      { at: g[0], away: g[1] },
      { at: g[g.length - 1], away: g[g.length - 2] },
    ];

    let best = null;
    for (const end of ends) {
      for (const main of mains) {
        const r = nearestOnLine(end.at, main.Geometry);
        if (!r || r.d > joinM) continue;
        if (!best || r.d < best.d) best = { ...r, end, main };
      }
    }

    if (!best) { unjoined.push(svc.Feature_ID); continue; }

    /* Square to the main, on the side the service runs.

       Taken from the service's own next vertex rather than from its far
       end: a service that turns after a metre still leaves the main in
       one direction, and that direction is the one the outlet faces. */
    const ax = best.end.away[0] - best.q[0];
    const ay = best.end.away[1] - best.q[1];
    const nx = -best.dir[1];
    const ny = best.dir[0];
    const side = (ax * nx + ay * ny) >= 0 ? 1 : -1;

    tees.push({
      at: best.q,
      dir: best.dir,
      stem: [nx * side, ny * side],
      service: svc.Feature_ID,
      main: best.main.Feature_ID,
      plot: svc.Plot_ID ?? null,
      seed: svc.Attributes?.Seed_Feature_ID ?? null,
      size: sizeOfMain(best.main),
    });
  }

  return { tees, unjoined };
}

/* Which of those are not on the drawing yet.

   Matched on position, because that is what a tee is: the join it sits
   on. A fitting somebody dragged half a metre is still that join's
   fitting, and replacing it would undo their nudge — while one left on
   a service since deleted is not matched by anything and is reported
   rather than removed. */
export function missingTees(features = [], tees = [], nearM = HVTT_JOIN_M * 4) {
  const placed = features.filter((f) => f.Feature_Role === "hvtt"
    && (f.Geometry || []).length);

  const missing = tees.filter((t) =>
    !placed.some((f) => dist(f.Geometry[0], t.at) <= nearM));

  const orphans = placed.filter((f) =>
    !tees.some((t) => dist(f.Geometry[0], t.at) <= nearM));

  return { missing, orphans };
}

/* The angle the body lies at, for the drawing to rotate to.

   Degrees, rounded to a tenth. Stored on the feature so the symbol does
   not have to find its main again every frame — and so a tee stays
   pointing the right way if the main it came off is later deleted. */
export function angleOf(dir) {
  return Math.round((Math.atan2(dir[1], dir[0]) * 180) / Math.PI * 10) / 10;
}

/* ── Tees where one main branches off another ──

   The other place the same fitting goes: a gas pipe routed from a point
   along the length of another gas pipe. Not a service leaving the main
   but the main itself dividing, and it takes the same tee.

   ── Ends and bends get nothing ──

   Arms are counted the way junctionsOf counts them: what ends at the
   point, plus twice anything passing through it. Three or more is a
   division and takes a tee. Exactly one is where a run stops — an end,
   and the drawing says plainly that an end span node does not get one.
   Exactly two is a bend, one pipe turning a corner, which needs no
   fitting at all.

   That count is why this is worked out from the pipe rather than read
   off the span nodes. A span node is placed on the trench network, and
   a trench junction is not a pipe junction: three trenches meet and one
   of them may carry no gas, in which case the gas runs straight through
   and there is nothing to tee. The nodes are where these land, not what
   decides them — so the node's letter is borrowed for the label and
   nothing more.

   ── Which way the body lies ──

   Along the run that carries straight on, with the stem down the
   branch. At a division of three, the two legs most nearly opposite
   each other are the run and the third is the branch: that is what
   "routed from a point along the length of" means geometrically.

   Where four or more meet there is no single branch, so the two most
   opposite are still the body and the stem takes the widest gap left.
   A cross is not really a tee, but drawing nothing at a crossroads
   would leave the one junction on the drawing that has no fitting. */
export function mainTees(features = [], opts = {}) {
  const { lineTypes = [], eps = HVTT_JOIN_M } = opts;

  const mains = gasMains(features, lineTypes);
  if (mains.length < 2) return { tees: [] };

  /* Interned points, so a junction found on two pipes is one place. */
  const nodes = [];
  const intern = (p) => {
    for (let i = 0; i < nodes.length; i++) {
      if (dist(nodes[i].at, p) <= eps) return nodes[i];
    }
    const n = { at: [p[0], p[1]], ends: 0, through: 0, legs: [] };
    nodes.push(n);
    return n;
  };

  const unit = (a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    return len ? [dx / len, dy / len] : null;
  };

  /* Every pipe end, and every point another pipe ends against. */
  for (const m of mains) {
    const g = m.Geometry;
    for (const [end, next] of [[g[0], g[1]], [g[g.length - 1], g[g.length - 2]]]) {
      const n = intern(end);
      n.ends += 1;
      const u = unit(n.at, next);
      if (u) n.legs.push({ u, main: m });
    }
  }

  /* And where one pipe passes through the point another ends at: the
     "along the length of" case, which is the whole point of this. */
  for (const m of mains) {
    const g = m.Geometry;
    for (const n of nodes) {
      const atEnd = dist(g[0], n.at) <= eps || dist(g[g.length - 1], n.at) <= eps;
      if (atEnd) continue;
      const r = nearestOnLine(n.at, g);
      if (!r || r.d > eps) continue;
      n.through += 1;
      n.legs.push({ u: [r.dir[0], r.dir[1]], main: m },
        { u: [-r.dir[0], -r.dir[1]], main: m });
    }
  }

  const tees = [];
  for (const n of nodes) {
    const arms = n.ends + n.through * 2;
    if (arms < 3) continue;              // an end, or a bend
    if (n.legs.length < 3) continue;

    /* The two most nearly opposite are the run. */
    let run = null;
    for (let i = 0; i < n.legs.length; i++) {
      for (let j = i + 1; j < n.legs.length; j++) {
        const dot = n.legs[i].u[0] * n.legs[j].u[0] + n.legs[i].u[1] * n.legs[j].u[1];
        if (!run || dot < run.dot) run = { dot, i, j };
      }
    }
    if (!run) continue;

    /* And the branch is whatever is left that is furthest from both. */
    let branch = null;
    for (let k = 0; k < n.legs.length; k++) {
      if (k === run.i || k === run.j) continue;
      const along = Math.abs(n.legs[k].u[0] * n.legs[run.i].u[0]
        + n.legs[k].u[1] * n.legs[run.i].u[1]);
      if (!branch || along < branch.along) branch = { along, k };
    }
    if (!branch) continue;

    const dir = n.legs[run.i].u;
    const leg = n.legs[branch.k].u;
    /* Square to the run, on the branch's side: the body is clamped to
       the pipe going through, so the outlet can only be at right angles
       to it however the branch actually leaves. */
    const nx = -dir[1];
    const ny = dir[0];
    const side = (leg[0] * nx + leg[1] * ny) >= 0 ? 1 : -1;

    tees.push({
      at: n.at,
      dir,
      stem: [nx * side, ny * side],
      kind: "junction",
      service: null,
      /* The pipe carrying straight through is the one the fitting is
         clamped to, so its size is the tee's size. The branch may be
         narrower — a 63 off a 180 is ordinary — and sizing the fitting
         from the branch would order the wrong part. */
      main: n.legs[run.i].main?.Feature_ID ?? null,
      plot: null,
      seed: null,
      size: sizeOfMain(n.legs[run.i].main),
    });
  }

  return { tees };
}

/* Every tee a gas drawing should have: the ones on the services and the
   ones where the main divides.

   Deduped by position, because a service leaving at the same point the
   main divides is one hole with one fitting in it. The service tee wins
   where they coincide: it knows which plot it belongs to, and that is
   worth more on a take-off than knowing it was also a junction. */
export function allTees(features = [], opts = {}) {
  const service = topTees(features, opts);
  const junction = mainTees(features, opts);
  const near = (opts.joinM ?? HVTT_JOIN_M) * 4;

  const kept = service.tees.map((t) => ({ ...t, kind: "service" }));
  for (const t of junction.tees) {
    if (kept.some((k) => dist(k.at, t.at) <= near)) continue;
    kept.push(t);
  }

  return { tees: kept, unjoined: service.unjoined };
}

/* The span node a tee stands at, if there is one.

   Only for the label. A junction tee reads better as "Tee A7" than as a
   number nobody can find on the drawing, and A7 is what somebody would
   say out loud. Absent where the nodes have not been placed, which is
   not a reason to withhold the fitting. */
export function nodeCodeAt(features = [], at, withinM = 2) {
  let best = null;
  for (const f of features) {
    if (f.Feature_Role !== "spannode") continue;
    const p = (f.Geometry || [])[0];
    if (!p) continue;
    const d = dist(p, at);
    if (d <= withinM && (!best || d < best.d)) {
      best = { d, code: f.Label || f.Attributes?.Code || null };
    }
  }
  return best?.code ?? null;
}
