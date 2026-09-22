/* Splitting a circuit that has grown too big.

   Asked for: when a circuit passes 80 plots, or its end-of-line
   levels fall outside tolerance, divide it into circuits carrying as
   near as possible an equal number of meters.

   ── What a split IS ──

   A circuit is a set of meters and one LV way. The build routes each
   circuit's cable to its own meters along the same dig, so two
   circuits can share a trench for as long as they like. That means a
   split is a question about the TREE the feeder model already
   builds: which subtrees go to which circuit. A subtree is the
   natural unit because everything in it is fed through one point,
   so giving it to a circuit gives that circuit one cable to run.

   ── Where the cuts are ──

   The branches leaving the origin first. Where one branch alone
   carries more than a circuit's share, it is opened at its first
   junction and its own parts are dealt out instead — the new
   circuit's cable runs beside the old one as far as that junction
   and takes its subtree from there. Repeated until no part is bigger
   than a share or cannot be opened further.

   Then longest-processing-time: parts largest first, each to the
   circuit with the fewest meters so far. Not optimal in the textbook
   sense, but within a few meters of it on any real estate, and it
   gives an answer somebody can read and argue with.

   ── What it does not do ──

   Choose cable sizes, run the levels, or decide whether the result
   passes. It proposes the membership; the build and the levels check
   say what that membership costs, and a caller that wants to compare
   splits runs them both on each proposal. Pure, so that is cheap. */

export const SPLIT_DEFAULTS = {
  /* The count a single circuit is allowed to carry. Asked for as 80. */
  maxMeters: 80,
  /* How far over an equal share a part may be before it is opened.

     None, because "as close as possible" is what was asked for and
     that is what it means: on project 20, 85 meters go 43 / 42 with
     no slack, 44 / 41 at a twentieth and 46 / 39 at a tenth.

     Worth knowing what it buys. Every opened part is one more place
     the second circuit's cable runs beside the first before taking
     its own way, so a little slack is fewer parallel runs for a few
     meters of imbalance — 33 parts against 29 on that drawing. A
     caller that would rather have the shorter dig than the even
     count passes 0.05 or 0.1. */
  slack: 0,
};

/* The children of every node, from the model's parent array. */
function childrenOf(model) {
  const kids = new Map();
  (model.parent || []).forEach((p, i) => {
    if (p == null || p < 0 || p === i) return;
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(i);
  });
  return kids;
}

/* Every meter at or beneath a node, by Feature_ID. */
function metersUnder(model, node, kids) {
  const out = [];
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    for (const m of model.metersAt?.[n] || []) {
      if (m?.meter?.Feature_ID != null) out.push(m.meter);
    }
    for (const c of kids.get(n) || []) stack.push(c);
  }
  return out;
}

/* How many circuits the count calls for. */
export function circuitsNeeded(totalMeters, { maxMeters = SPLIT_DEFAULTS.maxMeters, over = false } = {}) {
  const byCount = Math.max(1, Math.ceil((Number(totalMeters) || 0) / Math.max(1, maxMeters)));
  /* Out of tolerance on one circuit is a reason for two even under
     the count: the count is a rule of thumb, the levels are the
     measurement, and the measurement wins. */
  return over && byCount < 2 ? 2 : byCount;
}

/* The plan.

   `model` is a feeder model over ONE circuit's members, rooted at the
   origin. `over` says its levels are outside tolerance. Returns the
   proposed circuits, each with its meters, or null where there is
   nothing to split. */
export function splitPlan(model, opts = {}) {
  const maxMeters = opts.maxMeters ?? SPLIT_DEFAULTS.maxMeters;
  const slack = opts.slack ?? SPLIT_DEFAULTS.slack;
  if (!model || model.error || model.S == null) return null;

  const kids = childrenOf(model);
  const count = (n) => Number(model.cum?.[n]) || 0;
  const own = (n) => Number(model.meterCount?.[n]) || 0;
  const total = count(model.S);
  if (!total) return null;

  const k = opts.circuits ?? circuitsNeeded(total, { maxMeters, over: !!opts.over });
  if (k < 2) {
    return { circuits: 1, total, target: total, groups: null,
      reason: `${total} meters fits one circuit` };
  }
  const target = total / k;
  const limit = target * (1 + slack);

  /* ── The parts ──

     Start with the origin's own meters (rare, but a plot on the
     substation's doorstep is one) and every branch leaving it. Open
     any part bigger than a share into its node's own meters plus its
     child subtrees, until none is, or none can be. A part that
     cannot be opened — a single service tee carrying more than a
     share — is left whole and reported; the arithmetic cannot cut a
     cable. */
  let parts = [];
  if (own(model.S)) parts.push({ node: model.S, atNode: true, count: own(model.S) });
  for (const c of kids.get(model.S) || []) parts.push({ node: c, atNode: false, count: count(c) });

  let opened = true;
  while (opened) {
    opened = false;
    const next = [];
    for (const p of parts) {
      const canOpen = !p.atNode && p.count > limit
        && ((kids.get(p.node) || []).length > 0);
      if (!canOpen) { next.push(p); continue; }
      opened = true;
      if (own(p.node)) next.push({ node: p.node, atNode: true, count: own(p.node) });
      for (const c of kids.get(p.node) || []) {
        if (count(c)) next.push({ node: c, atNode: false, count: count(c) });
      }
    }
    parts = next;
  }

  /* ── Dealing them out ──

     Largest first, each to the lightest circuit. Ties go to the
     lower-numbered circuit so the same drawing gives the same plan
     twice, which is what lets somebody compare a plan to yesterday's. */
  parts.sort((a, b) => b.count - a.count || a.node - b.node);
  const groups = Array.from({ length: k }, (_, i) => ({ index: i, count: 0, parts: [] }));
  for (const p of parts) {
    const g = groups.reduce((best, x) => (x.count < best.count ? x : best), groups[0]);
    g.parts.push(p);
    g.count += p.count;
  }

  /* Meters per group. A part at a node is that node's own meters
     only; a subtree part is everything beneath it. */
  for (const g of groups) {
    const ids = new Set();
    g.meters = [];
    for (const p of g.parts) {
      const found = p.atNode
        ? (model.metersAt?.[p.node] || []).map((m) => m.meter).filter(Boolean)
        : metersUnder(model, p.node, kids);
      for (const m of found) {
        if (ids.has(m.Feature_ID)) continue;
        ids.add(m.Feature_ID);
        g.meters.push(m);
      }
    }
  }

  const counts = groups.map((g) => g.count);
  return {
    circuits: k,
    total,
    target: Math.round(target * 10) / 10,
    groups,
    spread: Math.max(...counts) - Math.min(...counts),
    /* Parts bigger than a share that could not be opened: the plan
       is as even as the drawing allows, and this says why it is not
       more so. */
    stuck: parts.filter((p) => p.count > limit).map((p) => ({ node: p.node, count: p.count })),
  };
}
