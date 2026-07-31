/* Volt drop, loop impedance and phase current along a circuit.

   A port of the original's gisVdLegCalc and gisVdCumulativeToNode. Its
   own comments record the formulas as verified against regulat.xls, and
   they are reproduced exactly rather than rederived:

     Ω   = (length ÷ 1000) × the cable's loop impedance per km
     %VD = (distributed kVA × distFactor + terminal kVA)
           × (voltDropBase × 10⁻⁶) × length in metres × correction

     correction = 1 + unbalancedConstant ÷ √(meter count), when the
     network is set to unbalanced

   Two ideas do the work.

   Distributed against terminal. A load tapped half way along a leg
   drops roughly half as much as the same load at its end, so the two are
   weighted differently — distributed at 0.5 by default, terminal at
   full. Amps, unlike volt drop, take both at full weight: the cable
   carries the whole lot regardless of where it leaves.

   The route is broken at each span node, and each stretch uses that
   node's own cable. A span node's cable is the one feeding it — the run
   from the previous node to this one — which is why a missing spec on
   any node along a route makes the total for everything beyond it
   unknowable rather than merely approximate. */

export const VD_DEFAULTS = {
  unbalanced: false,
  maxLoopOhms: 0.28,
  maxVoltDropPct: 7,
  unbalancedConstant: 4.14,
  distributedLoadFactor: 0.5,
  ragAmberPct: 80,
};

/* One leg's own contribution, not cumulative. */
export function legVoltDrop({
  cable, lengthM = 0, distributedKva = 0, terminalKva = 0, meterCount = 0,
  unbalanced = false, distFactor = 0.5, unbalConst = 4.14, voltageV = 400,
}) {
  const v = voltageV > 0 ? voltageV : 400;
  /* Three-phase, so the current in one phase. Both loads at full weight:
     the cable carries everything passing through it. */
  const amps = ((distributedKva || 0) + (terminalKva || 0)) * 1000 / 3 / v;

  if (!cable || !lengthM) return { ohms: 0, pct: 0, amps, missingSpec: !cable };

  const ohms = cable.Loop_Impedance_Ohm != null
    ? (lengthM / 1000) * Number(cable.Loop_Impedance_Ohm)
    : 0;

  const base = cable.Volt_Drop_Base != null ? Number(cable.Volt_Drop_Base) : null;
  let pct = 0;
  if (base != null) {
    const weightedKva = (distributedKva || 0) * distFactor + (terminalKva || 0);
    /* Keyed on how many customers are on the section, not on current.
       That is the spreadsheet's own rule. */
    const corr = unbalanced && meterCount > 0
      ? 1 + unbalConst / Math.sqrt(meterCount)
      : 1;
    pct = weightedKva * (base * 1e-6) * lengthM * corr;
  }

  return {
    ohms, pct, amps,
    /* A cable with neither figure contributes nothing and cannot be
       distinguished from one that genuinely drops nothing, so it is
       reported rather than silently counted as zero. */
    missingSpec: cable.Loop_Impedance_Ohm == null && base == null,
  };
}

/* Everything from the substation out to one node, summed span by span. */
export function cumulativeToNode({
  model, targetIdx, spanNodes = [], cableById = () => null,
  transformer = null, voltageV = 400, settings = {},
}) {
  const s = { ...VD_DEFAULTS, ...settings };
  const { nodes, parent, cum, cumKva, meterKva, meterCount, S } = model;

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  /* The transformer sets the baseline every downstream figure adds to.
     Without one there is no starting impedance, and a total that began
     at zero would read better than the truth. */
  let ohms = transformer?.Loop_Impedance_Ohm != null
    ? Number(transformer.Loop_Impedance_Ohm) : 0;
  let pct = 0;
  let missingCable = false;
  const missingTransformer = !transformer;

  /* Back up the parent chain, then forwards. */
  const path = [];
  let u = targetIdx;
  let guard = 0;
  while (u !== S && u >= 0 && guard++ < 100000) { path.push(u); u = parent[u]; }
  path.push(S);
  path.reverse();

  const spanAt = new Map();
  for (const sn of spanNodes) if (sn.index >= 0) spanAt.set(sn.index, sn);

  const v = voltageV > 0 ? voltageV : 400;
  /* The load passing through the target itself — its whole subtree,
     unweighted. */
  const amps = ((cumKva?.[targetIdx]) || 0) * 1000 / 3 / v;

  let legLenM = 0, distKva = 0, distCount = 0;
  for (let i = 1; i < path.length; i++) {
    const cur = path[i];
    legLenM += dist(nodes[path[i - 1]], nodes[cur]);

    const sn = spanAt.get(cur);
    if (sn) {
      const leg = legVoltDrop({
        cable: cableById(sn.cableSizeId),
        lengthM: legLenM,
        distributedKva: distKva,
        terminalKva: (cumKva?.[cur]) || 0,
        meterCount: distCount + ((cum?.[cur]) || 0),
        unbalanced: s.unbalanced,
        distFactor: s.distributedLoadFactor,
        unbalConst: s.unbalancedConstant,
        voltageV: v,
      });
      ohms += leg.ohms;
      pct += leg.pct;
      if (leg.missingSpec) missingCable = true;
      legLenM = 0; distKva = 0; distCount = 0;
    } else {
      /* Meters tapped between span nodes are distributed load on the leg
         being accumulated. */
      distKva += (meterKva?.[cur]) || 0;
      distCount += (meterCount?.[cur]) || 0;
    }
  }

  return {
    ohms, pct, amps,
    missing: missingTransformer || missingCable,
    missingTransformer,
    missingCable,
    /* Length past the last span node, which no cable spec covers. */
    remainderM: Math.round(legLenM * 10) / 10,
    overOhms: s.maxLoopOhms != null && ohms > s.maxLoopOhms,
    overPct: s.maxVoltDropPct != null && pct > s.maxVoltDropPct,
  };
}
