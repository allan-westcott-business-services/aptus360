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

/* Three-phase line current: I = kVA × 1000 ÷ (√3 × V), with V the line
   voltage.

   The same form as electric.js's `ampsFor`, which the substation
   way-fuse comparison uses. Written once here and once there rather
   than shared, because voltDrop.js imports nothing and making it import
   electric.js to borrow four lines of arithmetic would tie the two
   together for no gain \u2014 checksourceimpedance asserts the two agree,
   which is what stops them drifting.

   Zero volts gives zero rather than infinity: a substation with no
   output voltage recorded is a drawing that has not been finished, and
   an infinite current in the panel says less than a zero does. */
export function ampsOf(kva, voltageV) {
  const v = Number(voltageV);
  if (!(v > 0)) return 0;
  return (Number(kva) || 0) * 1000 / (Math.sqrt(3) * v);
}

export const VD_DEFAULTS = {
  unbalanced: false,
  maxLoopOhms: 0.28,
  maxVoltDropPct: 7,
  unbalancedConstant: 4.14,
  distributedLoadFactor: 0.5,
  /* Metres of its own cable charged for each plot connection (0187).
     Zero here so a caller that has not read the setting gets the
     calculation as it was, rather than an allowance it did not ask
     for. */
  jointEquivM: 0,
  ragAmberPct: 80,
};

/* One service tail: the run from the main to a single customer's cut-out.

   ── Why this is not just legVoltDrop with different numbers ──

   A service is the last few metres of the route and behaves unlike a
   leg of main in three ways.

   It carries ONE customer, so its load is terminal in full and there is
   nothing distributed along it.

   It gets no unbalanced correction. The correction is
   1 + 4.14/√K, and a single service has K = 1 — which would multiply
   its drop by 5.14. The spreadsheet does not apply it either: I37 works
   the service out with no correction term at all, while P15 applies one
   to every leg of main. That is a deliberate difference, not an
   omission: the correction models how unevenly a GROUP of single phase
   customers lands across three phases, and one customer is not a group.

   And it gets no joint allowance. The joint where it tees into the main
   is already charged, on the leg of main it tees into — charging it
   here as well would count the same joint twice.

   ── The load ──

   The plot's own kVA, which this app knows from its house type. The
   spreadsheet instead uses a notional (2 × ADMD + diversity) for every
   single phase service, because it has no per-plot figure to hand. Real
   data is used here in preference, so a service to a large plot is not
   judged on a small plot's load — but it means this figure and the
   spreadsheet's will differ where a plot is not close to twice ADMD. */
export function serviceVoltDrop({
  cable, lengthM = 0, kva = 0, voltageV = 400,
}) {
  const v = voltageV > 0 ? voltageV : 400;
  const amps = ampsOf(Number(kva) || 0, v);

  if (!cable || !(Number(lengthM) > 0)) {
    return { ohms: 0, pct: 0, amps, lengthM: Number(lengthM) || 0,
             missingSpec: !cable };
  }

  const len = Number(lengthM);
  const ohms = cable.Loop_Impedance_Ohm != null
    ? (len / 1000) * Number(cable.Loop_Impedance_Ohm)
    : 0;

  const base = cable.Volt_Drop_Base != null ? Number(cable.Volt_Drop_Base) : null;
  const pct = base != null ? (Number(kva) || 0) * (base * 1e-6) * len : 0;

  return {
    ohms, pct, amps, lengthM: len,
    /* Service cables came across from the original with no electrical
       figures on them — only a handful have been filled in since. One
       that contributes nothing cannot be told from one that genuinely
       drops nothing, so it is reported rather than counted as zero. */
    missingSpec: cable.Loop_Impedance_Ohm == null && base == null,
  };
}

/* One leg's own contribution, not cumulative. */
export function legVoltDrop({
  cable, lengthM = 0, distributedKva = 0, terminalKva = 0, meterCount = 0,
  unbalanced = false, distFactor = 0.5, unbalConst = 4.14, voltageV = 400,
  /* ── What a plot connection costs ──

     A service joint is not free: cutting a main and jointing a service
     onto it puts resistance in the run that undisturbed cable does not
     have. Nothing counted it \u2014 the word "joint" appeared nowhere in
     this calculation.

     Charged as an EQUIVALENT LENGTH of the joint's own cable, three
     metres by default (0187). Two reasons for that shape rather than a
     figure in ohms.

     The cost depends on the cable: a joint in 300mm waveform is not the
     same as one in 95mm. A length of the leg's own cable carries that
     dependency for nothing, because the leg is already charged at its
     own cable's figures.

     And it lands in both answers at once. Volt drop and loop impedance
     are each computed from length here, so the allowance moves both by
     the right amount without a second constant that could disagree with
     the first.

     Zero switches it off and gives the calculation this app had before,
     which is the way back if a design was submitted on the old numbers. */
  jointEquivM = 0,
  /* How many plot connections are made ON this leg.

     Its own, not `meterCount`. That one counts the customers on the
     section AND everything downstream, because the unbalanced
     correction wants the lot — but a joint downstream is made on the
     leg it is on, and charging it here as well would count one plot
     connection once per leg all the way back to the origin. A run of
     ten legs would charge the last plot's joint ten times. */
  jointCount = 0,
}) {
  const v = voltageV > 0 ? voltageV : 400;
  /* ── Three-phase line current ──

       I = kVA × 1000 ÷ (√3 × V)

     Both loads at full weight: the cable carries everything passing
     through it, wherever it leaves.

     ── What this was, and why it was wrong ──

     `kVA × 1000 ÷ 3 ÷ V`. That is a correct per-phase form and it wants
     the PHASE voltage. It was being handed `Output_V`, which is the
     substation's line voltage and defaults to 400 \u2014 so it divided a
     per-phase power by a line voltage and came out low by exactly √3.

     Thirty kVA at 400 V read 25.0 A where the answer is 43.3 A: 42%
     under, on the figure a designer sizes a cable against. The
     substation way-fuse comparison, ampsFor, has always used the form
     above, so the two disagreed by √3 across the app \u2014 which is what
     surfaced it.

     Volt drop and loop impedance do not use this. `pct` and `ohms` are
     worked out from kVA and length below and are unchanged; only the
     reported current moves. */
  const amps = ampsOf((distributedKva || 0) + (terminalKva || 0), v);

  if (!cable || !lengthM) return { ohms: 0, pct: 0, amps, missingSpec: !cable };

  /* The leg as the calculation sees it: the cable actually laid, plus
     the equivalent length of the plot connections made along it.

     `jointCount` is the connections tapped on THIS leg, between the
     previous span node and this one. Deliberately not `meterCount`,
     which includes everything downstream: a joint downstream is made on
     the leg it is on, and charging it here too would count one plot
     connection once per leg all the way back to the origin.

     Guarded, because a negative or unparseable setting would shorten
     the run and report a drop better than the truth. */
  const perJoint = Number(jointEquivM);
  const allowM = Number.isFinite(perJoint) && perJoint > 0
    ? perJoint * (Number(jointCount) || 0) : 0;
  const chargedM = lengthM + allowM;

  const ohms = cable.Loop_Impedance_Ohm != null
    ? (chargedM / 1000) * Number(cable.Loop_Impedance_Ohm)
    : 0;

  const base = cable.Volt_Drop_Base != null ? Number(cable.Volt_Drop_Base) : null;
  let pct = 0;
  const weightedKva = (distributedKva || 0) * distFactor + (terminalKva || 0);
  /* Keyed on how many customers are on the section, not on current.
     That is the spreadsheet's own rule. */
  const corr = unbalanced && meterCount > 0
    ? 1 + unbalConst / Math.sqrt(meterCount)
    : 1;
  if (base != null) {
    pct = weightedKva * (base * 1e-6) * chargedM * corr;
  }

  return {
    ohms, pct, amps,
    /* The working, so a figure can be read against another system's
       leg by leg rather than argued about as a total: what was
       distributed, what was terminal, what that weighed, the metres
       charged and the factor applied. */
    working: {
      distributedKva: distributedKva || 0,
      terminalKva: terminalKva || 0,
      weightedKva,
      chargedM,
      correction: corr,
      meterCount: meterCount || 0,
    },
    /* What the joints added, so a designer can see how much of a figure
       is cable and how much is connections. */
    jointAllowM: Math.round(allowM * 10) / 10,
    /* A cable with neither figure contributes nothing and cannot be
       distinguished from one that genuinely drops nothing, so it is
       reported rather than silently counted as zero. */
    missingSpec: cable.Loop_Impedance_Ohm == null && base == null,
  };
}

/* Everything from the substation out to one node, summed span by span. */
export function cumulativeToNode({
  model, targetIdx, spanNodes = [], cableById = () => null, partialCableId = null,
  transformer = null, voltageV = 400, settings = {},
  /* ── What the feeding network has already used ──

     A site connecting to an existing network does not start at zero.
     The DNO's cable has already dropped some of the permitted volt
     drop before it reaches the point of connection, and a design
     checked from E0 as though it began there reads better than it is —
     by exactly the amount somebody else already spent.

     Declared on the POC, in percent, the same way the loop impedance
     already is: `transformer.Loop_Impedance_Ohm` seeds `ohms` a few
     lines below on precisely this argument, and this is the same
     argument about the other figure.

     Zero for a substation-fed scheme, where the transformer IS the
     start and there is nothing upstream of it to account for. */
  startPct = 0,
}) {
  const s = { ...VD_DEFAULTS, ...settings };
  const { nodes, parent, cum, cumKva, meterKva, meterCount, S } = model;

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  /* The transformer sets the baseline every downstream figure adds to.
     Without one there is no starting impedance, and a total that began
     at zero would read better than the truth. */
  let ohms = transformer?.Loop_Impedance_Ohm != null
    ? Number(transformer.Loop_Impedance_Ohm) : 0;
  /* Kept apart from the cable's own drop, and added at the end. Two
     figures rather than one running total, because both are wanted: the
     design's own contribution is what a cable change moves, and the
     cumulative figure is what the limit is judged against. Adding
     upstream in here would make the first unrecoverable. */
  const upstream = Number(startPct) > 0 ? Number(startPct) : 0;
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
  /* The load passing on through the target — its whole subtree,
     unweighted. Kept as `ampsThrough`. */
  const ampsThrough = ampsOf((cumKva?.[targetIdx]) || 0, v);
  /* And the current in the cable arriving at it, which is what a row
     of the levels table is about. The two differ by whatever leaves
     along the last leg: on a dead-end leg with seven plots along it
     the first is zero and the second is seven plots' worth, and zero
     was the one on the page. Settled by the last leg charged below. */
  let amps = ampsThrough;
  /* And the last leg's working, for the same reason. */
  let working = null;

  /* ── The load that leaves the route part way along a leg ──

     A meter's load sits in the model at its cut-out: the far end of its
     service spur, which is a node OFF the mains. The walk below goes up
     the mains, node by node, and only ever read `meterKva` at the nodes
     it passed \u2014 so a spur's load was never seen as distributed on the
     leg it tees off. It was in `cumKva` at the span node *before* the
     leg, as terminal load of the previous leg, and then simply gone.

     Which is why A36 to A39 \u2014 a hundred metres of 95 with seven
     plots along it and nothing beyond \u2014 reported no current and no
     drop at all: the seven were on spurs, the spurs were off the
     route, and `cumKva` at A39 is zero because nothing lies beyond a
     dead end. Every leg on every drawing was short by whatever tees
     off it; a dead-end leg was short by everything.

     The load tapped at a node is its own meters plus everything hanging
     off it that is not the route onward: the service spurs, and a mains
     branch at a fork nobody put a span node on. Counted at the node the
     spur leaves from, which is on the route, where the sum can see it.

     `parSvc` says which of those are plot connections, for the joint
     allowance. A fixture model without it counts every side branch,
     which is what the allowance always did for meters it could see. */
  const kids = new Map();
  for (let i = 0; i < parent.length; i++) {
    if (parent[i] < 0) continue;
    if (!kids.has(parent[i])) kids.set(parent[i], []);
    kids.get(parent[i]).push(i);
  }
  const { parSvc } = model;
  /* `onward` is the next node on the route, left out; with none given
     every child counts. `spursOnly` limits the joints to service spurs
     and asks nothing of a model without `parSvc` \u2014 the case at a span
     node, where the mains carry on and are not connections. */
  const tapped = (u, onward, spursOnly = false) => {
    let kva = (meterKva?.[u]) || 0;
    let count = (meterCount?.[u]) || 0;
    let joints = count;
    for (const c of kids.get(u) || []) {
      if (c === onward) continue;
      kva += (cumKva?.[c]) || 0;
      count += (cum?.[c]) || 0;
      const isSpur = parSvc ? !!parSvc[c] : !spursOnly;
      if (isSpur) joints += (cum?.[c]) || 0;
    }
    return { kva, count, joints };
  };

  let legLenM = 0, distKva = 0, distCount = 0, distJoints = 0;
  for (let i = 1; i < path.length; i++) {
    const cur = path[i];
    legLenM += dist(nodes[path[i - 1]], nodes[cur]);

    const sn = spanAt.get(cur);
    if (sn) {
      /* Plot connections AT this node: its own meters and the spurs
         leaving it. Their load is beyond the node and counts as
         terminal through `cumKva`; their joints are on the leg
         arriving here. Nothing onward is excluded, because the mains
         beyond a span node are the next leg's business and a spur
         is not onward. */
      const here = tapped(cur, -1, true);
      const leg = legVoltDrop({
        cable: cableById(sn.cableSizeId),
        lengthM: legLenM,
        distributedKva: distKva,
        terminalKva: (cumKva?.[cur]) || 0,
        meterCount: distCount + ((cum?.[cur]) || 0),
        /* The connections made on this leg: the ones tapped between the
           previous span node and this one, PLUS the ones at this node
           itself.

           `distCount` alone was zero on every real drawing. A service
           tees into the main and Place Span Nodes puts a node where it
           leaves, so the connection is AT a node rather than between
           two \u2014 and the allowance never fired anywhere. It only showed
           up in a fixture with meters deliberately placed mid-leg.

           The node's own meters belong to the leg arriving at it,
           which is the leg being charged here, and to no other. */
        jointCount: distJoints + here.joints,
        jointEquivM: s.jointEquivM,
        unbalanced: s.unbalanced,
        distFactor: s.distributedLoadFactor,
        unbalConst: s.unbalancedConstant,
        voltageV: v,
      });
      ohms += leg.ohms;
      pct += leg.pct;
      amps = leg.amps;
      working = leg.working || null;
      if (leg.missingSpec) missingCable = true;
      legLenM = 0; distKva = 0; distCount = 0; distJoints = 0;
    } else {
      /* Load tapped between span nodes is distributed load on the leg
         being accumulated \u2014 at the node itself and down every spur
         leaving it. The route onward is the next node on the path. */
      const t = tapped(cur, path[i + 1] ?? -1);
      distKva += t.kva;
      distCount += t.count;
      distJoints += t.joints;
    }
  }

  /* The part of a run between the last span node and here.

     A span node is where a length of cable is settled, so asking for a
     figure part way along one used to return the figure at its start:
     eleven service joints on one run all reported the same volt drop and
     the same voltage, which reads as the sum having stalled.

     Charged at the cable the run is made of — the one recorded at the
     span node this length is heading towards, since that is where Build
     LV Network writes it. Nothing is charged at a span node itself,
     where this length is zero, so every figure that was right before is
     unchanged.

     The cable is passed in rather than looked up: the caller already
     knows which run this point is on — the leg it is reporting carries
     it — and a second way of working it out is a second thing to keep
     in step. With none given, nothing is charged and the answer is
     exactly what it was before. */
  if (legLenM > 0.001 && partialCableId != null) {
    /* The target is the last node on the path, so the loop above has
       already counted what is tapped there as distributed \u2014 with
       no onward node to exclude, that took in the whole of its
       subtree. Terminal load is what lies beyond it, and the two must
       not both hold the same plots. */
    const beyond = tapped(targetIdx, -1, true);
    const leg = legVoltDrop({
      cable: cableById(partialCableId),
      lengthM: legLenM,
      distributedKva: distKva - beyond.kva,
      terminalKva: (cumKva?.[targetIdx]) || 0,
      meterCount: distCount - beyond.count + ((cum?.[targetIdx]) || 0),
      jointCount: distJoints,
      jointEquivM: s.jointEquivM,
      unbalanced: s.unbalanced,
      distFactor: s.distributedLoadFactor,
      unbalConst: s.unbalancedConstant,
      voltageV: v,
    });
    ohms += leg.ohms;
    pct += leg.pct;
    amps = leg.amps;
    working = leg.working || null;
    if (leg.missingSpec) missingCable = true;
    legLenM = 0;
  }

  /* Both figures, always computed, and named for what they are.

     `pctOwn` is this design's own drop, from the origin node outward.
     It is what a cable change moves and what a designer is working on.

     `pct` is the cumulative figure including whatever the feeding
     network already used. It is what the limit is judged against,
     because a plot does not care which side of the POC a volt was lost
     on.

     `pct` stays the name of the cumulative one so that every existing
     reader — the panel, the CSV, the node labels, the scenario search —
     keeps judging against the right figure without being changed. On a
     substation-fed scheme upstream is zero and the two are equal, which
     is why nothing had to distinguish them before. */
  const pctOwn = pct;
  const pctTotal = pct + upstream;

  return {
    ohms,
    pct: pctTotal,
    pctOwn,
    upstreamPct: upstream,
    amps,
    ampsThrough,
    /* The arithmetic of the leg arriving at the target. Null where no
       leg was charged. */
    working,
    missing: missingTransformer || missingCable,
    missingTransformer,
    missingCable,
    /* Length past the last span node, which no cable spec covers. */
    remainderM: Math.round(legLenM * 10) / 10,
    overOhms: s.maxLoopOhms != null && ohms > s.maxLoopOhms,
    /* Judged on the cumulative figure. A run that passes on its own and
       fails once the feeding network is counted is a run that fails. */
    overPct: s.maxVoltDropPct != null && pctTotal > s.maxVoltDropPct,
  };
}


/* The cable a generated feeder starts on.

   Design works upward: put the smallest cable on everything, run the
   trace, and upsize the legs that fail. Starting from the largest would
   hide every problem and cost a fortune; starting from nothing means the
   trace reports "cable not set" on a network the router has just drawn.

   Smallest is read as highest impedance per km rather than by parsing a
   size label — 95 sorts before 185 as text, but "1c 630" would not, and
   impedance is the property that actually orders them.

   Restricted to LV mains: a service cable or an HV triplex is not what a
   feeder is built from, and a cable with no figures cannot be reported
   on even if it is chosen. */
export function defaultFeederCable(cableSizes = [], cableTypes = [], opts = {}) {
  const { voltageRatingId = 1, usage = "Mains" } = opts;

  const usable = cableSizes.filter((c) => {
    if (c.Loop_Impedance_Ohm == null && c.Volt_Drop_Base == null) return false;
    const t = cableTypes.find((x) => x.Cable_Type_ID === c.Cable_Type_ID);
    if (!t) return false;
    /* Voltage rating is null on some types — Earth Cable, for one. An
       unrated type is excluded rather than allowed through: defaulting to
       a cable nobody has said is LV is worse than defaulting to nothing,
       and an earth cable has the highest impedance in the catalogue so it
       would win outright. */
    if (Number(t.Voltage_Rating_ID) !== voltageRatingId) return false;
    if (t.Usage_Type && t.Usage_Type !== usage) return false;
    return true;
  });
  if (!usable.length) return null;

  return usable.slice().sort((a, b) => {
    const ai = a.Loop_Impedance_Ohm == null ? -Infinity : Number(a.Loop_Impedance_Ohm);
    const bi = b.Loop_Impedance_Ohm == null ? -Infinity : Number(b.Loop_Impedance_Ohm);
    if (bi !== ai) return bi - ai;
    /* Same cable in two constructions — 3c and 4c WAVE 95 are identical
       on impedance. Lowest id wins, which is the order they were entered
       and so the one anyone would think of first. */
    return Number(a.Cable_Size_ID) - Number(b.Cable_Size_ID);
  })[0];
}
