/* Everything between a main and the thing that feeds the site.

   ── Why it matters ──

   A main is only live in the sense that matters — gas or current
   reaching a plot — if everything between it and the source is live
   too. A length marked Live with a dead length upstream of it is
   marked wrong: nothing can flow to it.

   So two things follow, and both are here because both are the same
   walk:

   Setting a length live sets everything upstream of it live, because
   that is what being live means. Somebody who energises a leg has
   energised the network back to the substation, and asking them to
   tick each length in turn is asking them to record the same fact
   several times and get it wrong once.

   And a plot can only be connected if the whole chain is live, which
   is the same statement read the other way.

   ── Where the source is ──

   A substation on the electric layer, a point of connection on gas and
   water. Both are points, and both are where the walk stops.

   ── How lengths connect ──

   End to end, or one ending part-way along another — a tee. Measured
   rather than read off Connects, because Connects records what a line
   was drawn against and a length added later may join two that never
   knew about it. */

import { isMainFeature, statusOf } from "./buildStatus.js";

/* How close two lengths have to be to count as joined.

   Three quarters of a metre for length-to-length: two mains that meet
   are drawn to meet, and anything further apart is two separate runs.

   The source is different. A substation or a point of connection is a
   symbol placed near where the main starts, not a vertex on it —
   somebody drops it beside the road and the main begins a metre or two
   away. At three quarters of a metre the walk found no root at all on
   ordinary drawings, so the cascade did nothing and, until it learned
   to say so, did it in silence.

   Five metres is wider than any gap somebody would call touching and
   narrower than the next junction. */
const JOIN_M = 0.75;
const SOURCE_M = 5;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* Whether a point lies on a line, anywhere along it. */
function onLine(point, geometry = [], within = JOIN_M) {
  for (let i = 0; i + 1 < geometry.length; i++) {
    const a = geometry[i];
    const b = geometry[i + 1];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const l2 = vx * vx + vy * vy;
    let u = l2 ? ((point[0] - a[0]) * vx + (point[1] - a[1]) * vy) / l2 : 0;
    u = Math.max(0, Math.min(1, u));
    if (dist([a[0] + vx * u, a[1] + vy * u], point) <= within) return true;
  }
  return false;
}

/* How far a point is from a line. */
function nearestOn(point, geometry = []) {
  let best = Infinity;
  for (let i = 0; i + 1 < geometry.length; i++) {
    const a = geometry[i];
    const b = geometry[i + 1];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const l2 = vx * vx + vy * vy;
    let u = l2 ? ((point[0] - a[0]) * vx + (point[1] - a[1]) * vy) / l2 : 0;
    u = Math.max(0, Math.min(1, u));
    best = Math.min(best, dist([a[0] + vx * u, a[1] + vy * u], point));
  }
  return best;
}

/* Whether two lines meet.

   Either one's end on the other's length. Two lines that merely cross
   without a vertex are not joined — on a drawing that is one main
   passing over another, and treating it as a junction would walk from
   the gas network into the water one. */
function meet(a, b) {
  const ga = a.Geometry || [];
  const gb = b.Geometry || [];
  if (ga.length < 2 || gb.length < 2) return false;
  return onLine(ga[0], gb) || onLine(ga[ga.length - 1], gb)
    || onLine(gb[0], ga) || onLine(gb[gb.length - 1], ga);
}

/* The source feeding a utility: a substation for electric, a point of
   connection for gas and water. */
export function sourcesFor(utility, features = []) {
  const role = utility === "electric" ? "substation" : "poc";
  /* Its layer where it has one, and any source of the right role
     otherwise.

     Requiring the layer to match looked tidy and was wrong: an electric
     POC is created on the electric layer, but a gas or water one takes
     whichever layer the menu was on, and a drawing made before that was
     settled has them on something else entirely. Insisting made every
     source invisible — which is a worse failure than occasionally
     walking to a source that belongs to another utility, because the
     mains graph is already filtered to this utility and a source that
     touches none of its lengths becomes no root at all. */
  const all = features.filter((f) => f.Feature_Role === role
    && (f.Geometry || []).length);
  const own = all.filter((f) => f.Layer_Key === utility);
  return own.length ? own : all;
}

/* Kept for callers that only want to know whether there is one. */
export function sourceFor(utility, features = []) {
  return sourcesFor(utility, features)[0] ?? null;
}

/* Every main of a utility, and which of them touch each other.

   Built once and handed to the walks, because a site of two hundred
   lengths is forty thousand comparisons and doing it per plot is what
   makes a drawing feel slow. */
export function mainsGraph(utility, features = [], lineTypes = []) {
  const mains = features.filter((f) =>
    f.Layer_Key === utility && isMainFeature(f, lineTypes)
    && (f.Geometry || []).length >= 2);

  const near = new Map(mains.map((m) => [Number(m.Feature_ID), []]));
  for (let i = 0; i < mains.length; i++) {
    for (let j = i + 1; j < mains.length; j++) {
      if (!meet(mains[i], mains[j])) continue;
      near.get(Number(mains[i].Feature_ID)).push(Number(mains[j].Feature_ID));
      near.get(Number(mains[j].Feature_ID)).push(Number(mains[i].Feature_ID));
    }
  }

  /* ── Every source, not the first one ──

     A site can be fed from more than one side: two gas mains in from
     different roads, or a water main from each end of an estate. The
     drawing allows several gas and water points of connection for
     exactly that reason.

     Taking only the first meant a main fed from the second one reached
     no source at all — so the walk returned nothing, the cascade did
     nothing, and it did it silently. Electric has one substation, which
     is why this only ever went wrong on gas and water. */
  const sources = sourcesFor(utility, features);
  const roots = [];
  for (const src of sources) {
    const at = (src.Geometry || [])[0];
    if (!at) continue;
    /* Nearest first, so a source beside a junction roots the length it
       actually sits on rather than every length within reach. */
    let best = null;
    for (const m of mains) {
      if (!onLine(at, m.Geometry, SOURCE_M)) continue;
      const d = nearestOn(at, m.Geometry);
      if (!best || d < best.d) best = { d, id: Number(m.Feature_ID) };
      /* Anything genuinely touching is a root in its own right: several
         mains leave a substation, and taking only the closest would
         strand the others. */
      if (onLine(at, m.Geometry, JOIN_M)) {
        const id = Number(m.Feature_ID);
        if (!roots.includes(id)) roots.push(id);
      }
    }
    if (best && !roots.includes(best.id)) roots.push(best.id);
  }

  return { mains, near, roots, sources, source: sources[0] ?? null };
}

/* The path from a main back to the source, as feature ids.

   Breadth first, so the answer is the shortest way back rather than
   whichever way the search wandered. A length the source cannot reach
   returns null — which is not the same as an empty path, and the
   difference matters: one is "nothing upstream", the other is "not
   connected to anything".

   Includes the length asked about, because every caller wants it: the
   cascade sets it live, and the connectable test asks whether it is. */
export function pathToSource(featureId, graph) {
  const start = Number(featureId);
  if (!graph?.near?.has(start)) return null;
  if (!graph.roots.length) return null;

  const roots = new Set(graph.roots);
  if (roots.has(start)) return [start];

  const from = new Map([[start, null]]);
  const queue = [start];

  while (queue.length) {
    const at = queue.shift();
    for (const next of graph.near.get(at) || []) {
      if (from.has(next)) continue;
      from.set(next, at);
      if (roots.has(next)) {
        const path = [next];
        let step = at;
        while (step != null) { path.push(step); step = from.get(step); }
        return path.reverse().reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

/* Which lengths upstream of this one are not live.

   Empty means the whole chain is live and a plot off this length can be
   connected. Null means the length does not reach the source at all,
   which is a drawing problem rather than an answer. */
export function deadUpstream(featureId, graph) {
  const path = pathToSource(featureId, graph);
  if (!path) return null;

  const byId = new Map(graph.mains.map((m) => [Number(m.Feature_ID), m]));
  return path
    .map((id) => byId.get(id))
    .filter(Boolean)
    .filter((m) => statusOf(m) !== "live");
}

/* Everything to set live when one length is.

   The length itself and everything between it and the source. Only
   those not already live, so the change says what actually changed
   rather than rewriting half the drawing with the value it already
   had. */
export function liveCascade(featureId, graph) {
  /* Null passed through rather than flattened to an empty list.

     They mean different things — nothing to change, and no way to tell
     — and returning [] for both let a main that reached no source look
     exactly like one already fully live upstream. That is how a
     cascade came to do nothing without saying so. */
  return deadUpstream(featureId, graph);
}

/* Whether two lengths run along each other at all.

   Either the trench lies along the main — the ordinary case, where one
   main covers several sections of road — or the main lies along the
   trench, which is a main that stops part way down a section. That
   ground is opened either way, and asking only the first question left
   a half-laid section unmarked.

   Neither test alone is enough, and neither is wrong: they are the two
   ways one line can sit inside another. */
/* How far a main may sit from its trench's centreline and still be in
   it.

   Mains share a trench and are drawn side by side: a joint trench is
   about 1.2m wide and carries electric, gas and water across it, so a
   main sits up to 0.6m off centre by design. The default half metre
   was inside that, so a main drawn on the outside of a shared trench
   matched nothing — and no trench was marked.

   Two metres: wider than any trench somebody would draw, narrower than
   the gap to the next road. */
const IN_TRENCH_M = 2;

/* How much of a trench has to run alongside a main to count as holding
   it. */
const OVERLAP_SHARE = 0.4;
const OVERLAP_M = 2;

/* Whether a trench and a main run along each other for a real distance.

   ── Why not "every point lies on the other" ──

   That is what lineFollows asks, and it is true only when one line is
   wholly inside the other. Real drawings are not like that: a main
   covers part of a trench and carries on into the next, the two have
   vertices in different places, and a main is drawn to one side because
   three utilities share the width. Any one of those makes the answer
   false, and the answer being false is why no trench was ever marked.

   ── What is asked instead ──

   Walk the trench in metre steps and count how many of those steps sit
   near the main. If a decent share of the trench runs beside it — or a
   few metres do, whichever is the lower bar — the main is in that
   trench.

   A share rather than a count, so a fifty-metre trench is not matched
   by two metres of a main crossing it; and a floor in metres as well,
   so a short section wholly under a long main still counts. */
function alongEachOther(trench = [], main = []) {
  if (trench.length < 2 || main.length < 2) return false;

  let total = 0;
  let near = 0;
  for (let i = 0; i + 1 < trench.length; i++) {
    const a = trench[i];
    const b = trench[i + 1];
    const segLen = dist(a, b);
    if (segLen <= 0) continue;

    const steps = Math.max(1, Math.round(segLen));
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const at = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      const w = segLen / (steps + 1);
      total += w;
      if (nearestOn(at, main) <= IN_TRENCH_M) near += w;
    }
  }

  if (!total) return false;

  /* Both a share and a length.

     The share alone misses a main that has been laid down three metres
     of a fifty-metre section — real, and that ground is open.

     The length alone matched a main crossing the trench at right
     angles: four metres of it pass within two metres of the crossing
     point, which is enough to clear a bare metres test and is plainly
     not a main laid in that trench.

     Together they say the same thing from both ends: a fair part of the
     trench, and enough of it to be a length of dig rather than a
     crossing. */
  return near >= OVERLAP_M && near / total >= OVERLAP_SHARE;
}

/* The trenches a set of mains are laid in.

   ── Why setting a main live touches them ──

   A main cannot be live unless it is in the ground, and it cannot be in
   the ground unless the trench was dug, laid and closed. So a live main
   says its trench is as-built, and asking somebody to record that
   separately is asking them to state the same fact twice.

   ── Which trenches are left alone ──

   Existing ground is not something this job built: marking it as-built
   would claim work nobody did. A trench marked for removal is being
   taken out, and calling it as-built says the opposite. Both are left
   exactly as they are — the cascade only answers for lengths that were
   Planned or have no stage at all.

   `follows` is passed in rather than imported so this module does not
   depend on the gas pressure code for a geometric test. */
export function trenchesUnder(mains = [], features = [], follows) {
  const trenches = features.filter((f) =>
    f.Feature_Type === "line"
    && f.Layer_Key === "trench"
    && (f.Geometry || []).length >= 2);

  const out = new Map();
  for (const m of mains) {
    for (const t of trenches) {
      const stage = t.Attributes?.Build_Status ?? null;
      if (stage === "existing" || stage === "remove" || stage === "asbuilt") continue;

      /* ── The trench follows the main, not the main the trench ──

         A main runs the length of a road and the road is drawn as
         several trenches: one gas main of 156 metres over sections of
         31. Asking whether the main lies along one trench is asking
         whether all 156 metres fit inside 31, which is false for every
         one of them — so nothing was ever matched and no trench was
         ever marked.

         Asked the right way round, each section lies along the main and
         each is marked. A main that stops half way down a trench still
         matches it, which is right: that ground was opened. */
      if (!alongEachOther(t.Geometry || [], m.Geometry || [])) continue;
      out.set(Number(t.Feature_ID), t);
    }
  }
  return [...out.values()];
}
