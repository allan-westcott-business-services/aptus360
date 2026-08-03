/* Splitting an estate into circuits.

   Above about seventy properties a single LV circuit runs out — of
   cable, of volt drop, or of the substation way feeding it — so the site
   has to be divided. Done by eye that means dragging plots into groups
   and re-running the levels check until it passes.

   ── Why the trench tree and not the map ──

   The obvious approach is to cluster the plots by position: k-means on
   the coordinates, three tidy blobs. It gives the wrong answer, because
   two houses either side of a road are close on the map and far apart
   along the cable — the trench may run to the end of the street and
   back. A circuit built from map proximity ends up interleaved with its
   neighbour, both running the same length of trench, and the drawing has
   to be unpicked by hand.

   The trench network is a tree rooted at the substation, and a circuit
   is a contiguous part of it. Cutting the tree into balanced connected
   pieces gives circuits that each own a branch: no two circuits share a
   run, and the cable is as short as the trenches allow.

   ── How the cut is chosen ──

   The plots are put in the order the network reaches them — depth first
   from the substation, so everything on one branch is consecutive — and
   that order is then cut into equal runs.

   Cutting the sequence rather than the tree is what lets a branch be
   split. Ninety plots on three thirty-plot branches make two circuits of
   forty-five, not three of thirty: the limit says two circuits, and two
   circuits should carry half each. One branch is divided between them,
   which is ordinary — two circuits run separate cables down the same
   trench.

   An earlier version refused to split a branch and returned sixty and
   thirty. That kept each circuit on its own run and got the balance
   wrong, which is the wrong way round: a circuit at sixty is near its
   limit while its neighbour sits half empty. */

import { buildFeederModel, METERS_PER_CABLE } from "./feeder.js";

/* Plots per circuit, and how many circuits that implies.

   Sized so no group exceeds the limit and the groups come out as even as
   they can: 100 plots at 70 is two circuits of fifty, not one of seventy
   and one of thirty. An even split leaves headroom on both rather than
   one circuit at its limit and another half empty. */
export function planGroupCount(total, maxPer = METERS_PER_CABLE) {
  if (!(total > 0)) return { groups: 0, target: 0 };
  const groups = Math.ceil(total / maxPer);
  return { groups, target: Math.ceil(total / groups) };
}

/* The groups, as sets of meter feature ids.

   Returns a plan rather than applying one: splitting an estate into
   circuits is not something to do to someone without showing them
   first. */
export function planCircuitGroups(features = [], opts = {}) {
  const {
    lineTypes = [], plotById = () => null, maxPer = METERS_PER_CABLE,
    /* How far a cut may drift from the balanced position to reach a
       better one, as a fraction of the group size. Generous enough to
       find a branch boundary a few houses away, tight enough that it
       cannot return sixty and thirty when forty-five and forty-five is
       what the site allows. */
    tolerance = 0.15,
  } = opts;

  const meters = features.filter((f) =>
    f.Feature_Role === "meter" && f.Layer_Key === "electric");
  if (!meters.length) return { error: "No electric meters to group." };

  const { groups: wanted, target } = planGroupCount(meters.length, maxPer);
  if (wanted < 2) {
    return {
      ok: true,
      groups: [],
      reason: `${meters.length} propert${meters.length === 1 ? "y" : "ies"} `
        + `fits one circuit — nothing to split.`,
    };
  }

  const model = buildFeederModel(features, { lineTypes, plotById });
  if (model.error) return { error: model.error };

  const { parent, cum, S, nodes } = model;

  /* Which meters sit at which node, so a group of nodes becomes a group
     of meters. Built the same way spanTrace builds it, through the
     service foot, so a meter lands where its service leaves the main
     rather than where the house is. */
  const at = new Map();
  const serviceFoot = (seedId) => {
    const svc = features.find((t) => t.Feature_Type === "line"
      && String(t.Attributes?.Line_Type || "").includes("service")
      && Number(t.Attributes?.Seed_Feature_ID) === Number(seedId)
      && (t.Geometry || []).length);
    return svc ? svc.Geometry[0] : null;
  };
  const nearest = (p) => {
    let bi = -1;
    let bd = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = Math.hypot(nodes[i][0] - p[0], nodes[i][1] - p[1]);
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  };

  for (const m of meters) {
    const sid = m.Attributes?.Seed_Feature_ID;
    const seed = sid != null
      ? features.find((f) => f.Feature_Role === "plot" && Number(f.Feature_ID) === Number(sid))
      : features.find((f) => f.Feature_Role === "plot"
        && m.Plot_ID != null && Number(f.Plot_ID) === Number(m.Plot_ID));
    const anchor = (seed ? serviceFoot(seed.Feature_ID) : null)
      || (seed?.Geometry || [])[0] || (m.Geometry || [])[0];
    if (!anchor) continue;
    const i = nearest(anchor);
    if (i < 0) continue;
    if (!at.has(i)) at.set(i, []);
    at.get(i).push(m);
  }

  /* Children of each node, in a stable order. */
  const kids = new Map();
  for (let i = 0; i < nodes.length; i++) {
    if (parent[i] < 0) continue;
    if (!kids.has(parent[i])) kids.set(parent[i], []);
    kids.get(parent[i]).push(i);
  }

  /* The plots in the order the network reaches them.

     Depth first from the substation, finishing one branch before
     starting the next, so everything on a branch is consecutive in the
     list. Cutting that list then gives runs that are geographically
     coherent without any further work.

     Iterative, because a long radial circuit is hundreds of nodes deep
     and a recursive walk would overflow the stack on a real estate
     rather than in a test. */
  const ordered = [];
  const stack = [S];
  const been = new Set([S]);
  while (stack.length) {
    const u = stack.pop();
    for (const m of at.get(u) || []) ordered.push(m);
    /* Reversed, so the children come off the stack in their own order
       and two runs of the same drawing give the same answer. */
    const cs = (kids.get(u) || []).slice().reverse();
    for (const k of cs) {
      if (been.has(k)) continue;
      been.add(k);
      stack.push(k);
    }
  }

  /* Anything the walk never reached — a plot whose service foot is not
     on the trench network. Appended rather than dropped: a plot missing
     from every group is a property nobody has allowed for, which is
     worse than one in the wrong group. */
  const reached = new Set(ordered.map((m) => m.Feature_ID));
  const stranded = meters.filter((m) => !reached.has(m.Feature_ID));
  ordered.push(...stranded);

  /* Where each plot attaches, so the distance between two of them along
     the network can be measured. */
  const nodeOf = new Map();
  for (const [i, list] of at) for (const m of list) nodeOf.set(m.Feature_ID, i);

  const depthOf = new Array(nodes.length).fill(0);
  {
    const q = [S];
    const seenD = new Set([S]);
    while (q.length) {
      const u = q.shift();
      for (const k of kids.get(u) || []) {
        if (seenD.has(k)) continue;
        seenD.add(k);
        depthOf[k] = depthOf[u] + 1;
        q.push(k);
      }
    }
  }

  /* How far apart two plots are along the network, in nodes.

     Large where the walk has come back down one branch and gone up
     another, small where it has moved to the house next door. That
     distance is the cable two circuits would each have to run if the cut
     fell between them, so it is exactly what a cut wants to maximise. */
  const apart = (a2, b2) => {
    let x = nodeOf.get(a2?.Feature_ID);
    let y = nodeOf.get(b2?.Feature_ID);
    if (x == null || y == null) return 0;
    let steps = 0;
    let guard = 0;
    while (x !== y && guard++ < nodes.length * 2) {
      if (depthOf[x] >= depthOf[y]) { x = parent[x]; steps += 1; }
      else { y = parent[y]; steps += 1; }
      if (x < 0 || y < 0) break;
    }
    return steps;
  };

  /* Cut the sequence, letting each cut drift to the best place near it.

     Equal groups are not the object — the shortest cable is. Cutting
     exactly at the target splits whichever street happens to fall there,
     and both circuits then run the length of it. Allowing the cut to
     move to a branch boundary nearby costs a few plots of balance and
     saves that duplicated run.

     The window is what keeps it honest. Ninety plots on three
     thirty-plot branches have boundaries at thirty and sixty, both too
     far from forty-five to be worth sixty and thirty — so the cut stays
     at forty-five and one branch is divided. A boundary at fifty is
     within reach, and fifty and forty is the better answer. */
  const out = [];
  const n = ordered.length;
  const window = Math.max(1, Math.round(target * tolerance));

  let from = 0;
  for (let g = 0; g < wanted; g++) {
    const remaining = wanted - g;
    if (remaining === 1) {
      if (n - from > 0) out.push({ meters: ordered.slice(from), index: g });
      break;
    }

    const ideal = from + Math.ceil((n - from) / remaining);
    let best = ideal;
    let bestScore = -1;

    for (let cut = Math.max(from + 1, ideal - window);
      cut <= Math.min(n - (remaining - 1), ideal + window); cut++) {
      /* The gap the cut would fall in, and how far it is from the
         balanced position — near enough ties are broken towards
         balance. */
      const gap = apart(ordered[cut - 1], ordered[cut]);
      const score = gap - Math.abs(cut - ideal) * 0.02;
      if (score > bestScore) { bestScore = score; best = cut; }
    }

    out.push({ meters: ordered.slice(from, best), index: g });
    from = best;
  }

  const sizes = out.map((g) => g.meters.length);
  const spread = sizes.length ? Math.max(...sizes) - Math.min(...sizes) : 0;

  return {
    ok: true,
    target,
    wanted,
    groups: out,
    sizes,
    /* How far from even the split came out.

       Not a fault: a cut moves off the balanced point on purpose, to
       land where the network divides and save both circuits running the
       same street. Fifty and forty is a better answer than forty-five
       and forty-five when the branch ends at fifty.

       Reported so the size of that trade is visible before it is
       accepted, and flagged only when it is larger than the drift
       allowed — which would mean the cut went somewhere it should not
       have. */
    uneven: spread > Math.max(2, Math.round(target * tolerance * 2)),
    spread,
    /* As above: a group over the limit would mean the count was sized
       wrongly, not that the site is awkward. */
    overLimit: sizes.filter((n) => n > maxPer).length,
  };
}
