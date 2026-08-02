/* What would bring the design back inside its limits.

   A span node fails on loop impedance or volt drop because of everything
   between it and the substation — so the fix is rarely at the node that
   reports the problem. Upsizing the last leg may not clear it, and
   upsizing an early leg clears every node beyond it at once. The useful
   answer is the cheapest change that clears everything, not the first
   change that clears something.

   The physics is not repeated here. cumulativeToNode already works out
   the figures at a node given the cables on the legs feeding it, and a
   scenario is that same function called again with one cable swapped.
   Anything else would be a second implementation of the sum, and the two
   would drift — which is how a suggestion comes to promise something the
   trace then disagrees with. */

import { cumulativeToNode } from "./voltDrop.js";

/* Cables ordered smallest to largest.

   By impedance per unit length rather than by parsing a size label: 95
   sorts before 185 as text but "1c 630" does not, and impedance is the
   property that actually orders them. Same reasoning as
   defaultFeederCable, and deliberately the same rule. */
export function cableLadder(cables = [], { usage = "Mains", cableTypes = [] } = {}) {
  const usageOf = (c) => String(
    cableTypes.find((t) => t.Cable_Type_ID === c.Cable_Type_ID)?.Usage_Type ?? "",
  ).trim().toLowerCase();

  return cables
    .filter((c) => {
      const u = usageOf(c);
      /* A type with no usage recorded stays in: an unfilled field is not
         a statement that the cable is the wrong kind. */
      return !u || u === String(usage).trim().toLowerCase();
    })
    .filter((c) => Number(c.Loop_Impedance_Ohm) > 0)
    .slice()
    .sort((a, b) => Number(b.Loop_Impedance_Ohm) - Number(a.Loop_Impedance_Ohm));
}

/* The span nodes on the way from the substation to a target, in order.

   The same walk cumulativeToNode does, because the legs that can fix a
   node are exactly the legs it sums. Ordered from the substation
   outward, since a change high up clears more than one low down. */
export function chainTo(model, targetIdx, spanNodes = []) {
  const { parent, S } = model;
  const at = new Map();
  for (const sn of spanNodes) if (sn.index >= 0) at.set(sn.index, sn);

  const path = [];
  let u = targetIdx;
  let guard = 0;
  while (u !== S && u >= 0 && guard++ < 100000) { path.push(u); u = parent[u]; }
  path.reverse();

  return path.map((i) => at.get(i)).filter(Boolean);
}

/* Cost of a change, as a proxy.

   Metres times cross-section: not a price, but it ranks two answers the
   way a price would, and it needs no rate card to be maintained. Where
   CSA is not recorded, impedance stands in inversely — a heavier cable
   has lower impedance — so the ranking still works on a catalogue that
   has not been filled in.

   Named a proxy in the result so nobody reads it as money. */
export function changeCost(lengthM, cable) {
  const csa = Number(cable?.CSA_mm2);
  if (Number.isFinite(csa) && csa > 0) return Math.round(lengthM * csa);
  const z = Number(cable?.Loop_Impedance_Ohm);
  return Number.isFinite(z) && z > 0 ? Math.round(lengthM / z) : Math.round(lengthM);
}

/* The leg arriving at a span node: how long it is, and where it starts.

   A cable belongs to a run between two points, and naming only the far
   one — "A1 to 185mm²" — leaves the reader to work out which stretch of
   cable that means. The upstream node is the other end of it.

   Both come from the same walk, because they are the same leg: back up
   the parent chain to the previous span node, which is where the run
   this cable covers begins. */
function legOf(model, spanNodes, sn) {
  const { nodes, parent, S } = model;
  const at = new Map(spanNodes.map((x) => [x.index, x]));
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  let total = 0;
  let from = null;
  let u = sn.index;
  let guard = 0;
  while (u !== S && u >= 0 && guard++ < 100000) {
    const p = parent[u];
    if (p < 0) break;
    total += dist(nodes[p], nodes[u]);
    if (at.has(p)) { from = at.get(p); break; }
    /* The substation itself, where no span node has been placed on it. */
    if (p === S) { from = at.get(S) ?? null; break; }
    u = p;
  }
  return { lengthM: total, from };
}

/* Does this arrangement of cables clear every node that was failing? */
function clears(model, spanNodes, targets, ctx) {
  for (const t of targets) {
    const r = cumulativeToNode({
      model, targetIdx: t, spanNodes,
      cableById: ctx.cableById,
      transformer: ctx.transformer,
      voltageV: ctx.voltageV,
      settings: ctx.settings,
    });
    if (r.overOhms || r.overPct) return false;
  }
  return true;
}

/* What to change, and what it would achieve.

   Searched from the substation outward and one change at a time first,
   because one change high up is both cheaper and less disruptive than
   several low down. Only where no single change clears everything does
   it try pairs — and it says plainly when nothing in the catalogue will,
   which is a real answer and more use than the largest cable in the
   list offered without comment.

   Returns suggestions ranked by the cost proxy, cheapest first. */
export function suggestCableChanges({
  trace, cables = [], cableTypes = [], transformer = null,
  voltageV = 400, settings = {}, maxSuggestions = 4,
} = {}) {
  if (!trace?.model || !trace?.spanNodes?.length) {
    return { error: "Run Full Trace first — there is nothing to work from." };
  }

  /* The nodes that fail today. Dead-end legs end at meters rather than
     at a node, so they are not somewhere a cable change can be aimed. */
  const targets = [...new Set((trace.legs || [])
    .filter((l) => l.stopId != null && l.vd && (l.vd.overOhms || l.vd.overPct))
    .map((l) => l.endIdx))];

  if (!targets.length) return { ok: true, targets: [], suggestions: [] };

  const ladder = cableLadder(cables, { usage: "Mains", cableTypes });
  if (ladder.length < 2) {
    return { error: "The cable catalogue has too few mains sizes to suggest a change." };
  }
  const ctx = {
    cableById: (id) => cables.find((c) => String(c.Cable_Size_ID) === String(id)) || null,
    transformer, voltageV, settings,
  };

  /* Every span node feeding a failing one, nearest the substation first.
     A node appearing on two failing paths is worth changing once. */
  const chain = [];
  const seen = new Set();
  for (const t of targets) {
    for (const sn of chainTo(trace.model, t, trace.spanNodes)) {
      if (seen.has(sn.index)) continue;
      seen.add(sn.index);
      chain.push(sn);
    }
  }

  const legOfNode = new Map(
    chain.map((sn) => [sn.index, legOf(trace.model, trace.spanNodes, sn)]),
  );
  const lengthOf = new Map(
    [...legOfNode].map(([i, l]) => [i, l.lengthM]),
  );
  /* The run this cable covers, named at both ends. Where the upstream
     end is the substation and no node has been placed on it, it is named
     as the substation rather than left blank — "to A1" without a from is
     the ambiguity this exists to remove. */
  const fromLabel = (index) => {
    const l = legOfNode.get(index);
    return l?.from?.feature?.Attributes?.Span_Label ?? "the substation";
  };
  const rank = new Map(ladder.map((c, i) => [String(c.Cable_Size_ID), i]));
  const swap = (index, sizeId) => trace.spanNodes
    .map((sn) => (sn.index === index ? { ...sn, cableSizeId: sizeId } : sn));

  const label = (c) => {
    const t = cableTypes.find((x) => x.Cable_Type_ID === c.Cable_Type_ID);
    return [t?.Cable_Type, c.Size_Label].filter(Boolean).join(" ");
  };

  /* ── One change ── */
  const single = [];
  for (const sn of chain) {
    const nowAt = rank.get(String(sn.cableSizeId));
    /* Only larger. Offering a smaller cable on a node that already
       fails is not a suggestion. */
    const from = nowAt == null ? 0 : nowAt + 1;
    for (let i = from; i < ladder.length; i++) {
      const cable = ladder[i];
      if (!clears(trace.model, swap(sn.index, cable.Cable_Size_ID), targets, ctx)) continue;
      single.push({
        changes: [{
          spanLabel: sn.feature?.Attributes?.Span_Label ?? String(sn.index),
          fromLabel: fromLabel(sn.index),
          featureId: sn.feature?.Feature_ID ?? null,
          fromCable: ctx.cableById(sn.cableSizeId),
          toCable: cable,
          toLabel: label(cable),
          lengthM: Math.round((lengthOf.get(sn.index) || 0) * 10) / 10,
        }],
        cost: changeCost(lengthOf.get(sn.index) || 0, cable),
      });
      /* The smallest cable that clears at this node — anything larger
         clears too and costs more. */
      break;
    }
  }

  if (single.length) {
    single.sort((a, b) => a.cost - b.cost);
    return { ok: true, targets, suggestions: single.slice(0, maxSuggestions), pairs: false };
  }

  /* ── Two changes ──
     Only reached when no single change is enough. Bounded to the chain,
     which is the legs feeding the failures rather than the whole
     drawing. */
  const pairs = [];
  for (let a = 0; a < chain.length; a++) {
    for (let b = a + 1; b < chain.length; b++) {
      const sa = chain[a];
      const sb = chain[b];
      const fa = rank.get(String(sa.cableSizeId));
      const fb = rank.get(String(sb.cableSizeId));
      for (let i = (fa == null ? 0 : fa + 1); i < ladder.length; i++) {
        for (let j = (fb == null ? 0 : fb + 1); j < ladder.length; j++) {
          const withA = swap(sa.index, ladder[i].Cable_Size_ID);
          const both = withA.map((sn) => (sn.index === sb.index
            ? { ...sn, cableSizeId: ladder[j].Cable_Size_ID } : sn));
          if (!clears(trace.model, both, targets, ctx)) continue;
          pairs.push({
            changes: [sa, sb].map((sn, k) => ({
              spanLabel: sn.feature?.Attributes?.Span_Label ?? String(sn.index),
              fromLabel: fromLabel(sn.index),
              featureId: sn.feature?.Feature_ID ?? null,
              fromCable: ctx.cableById(sn.cableSizeId),
              toCable: k === 0 ? ladder[i] : ladder[j],
              toLabel: label(k === 0 ? ladder[i] : ladder[j]),
              lengthM: Math.round((lengthOf.get(sn.index) || 0) * 10) / 10,
            })),
            cost: changeCost(lengthOf.get(sa.index) || 0, ladder[i])
              + changeCost(lengthOf.get(sb.index) || 0, ladder[j]),
          });
          break;
        }
        if (pairs.length > 40) break;
      }
    }
  }

  if (pairs.length) {
    pairs.sort((a, b) => a.cost - b.cost);
    return { ok: true, targets, suggestions: pairs.slice(0, maxSuggestions), pairs: true };
  }

  /* Nothing in the catalogue clears it.

     Said plainly rather than offering the largest cable and letting
     someone find out. A run too long at any size needs the substation
     moved, another way taken off it, or the circuit split — none of
     which is a cable change, and none of which this should pretend to
     recommend. */
  return {
    ok: true,
    targets,
    suggestions: [],
    exhausted: true,
    largest: ladder[ladder.length - 1] ? label(ladder[ladder.length - 1]) : null,
  };
}
