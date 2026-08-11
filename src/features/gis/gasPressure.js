/* Gas pressure through a low-pressure network.

   What a span node sits at, given the pressure the governor delivers
   and what the pipe between them has to carry.

   ── Where these numbers come from ──

   Not from a formula matched by name. A real design of ours — 22 pipes,
   72 dwellings, modelled in GASWorkS to IGE/TD/3 — was taken apart and
   this reproduces its pressure drops to within about 1.5% on every
   pipe. checkgaspressure.mjs holds that model and fails if this drifts
   from it.

   Two things were learned doing it that are worth stating, because both
   are easy to get wrong and neither is obvious:

     The friction factor varies with flow, not just diameter. The
     simplified IGE/TD/3 form — the one with 1/f = 1/(1 + 3.6/D + 0.03D)
     — gives about 62% of the real drop, because that term depends on
     bore alone. The constant backed out of the real model rises with
     flow: 8706 to 10125 on the same 50.9mm bore as flow goes from 2.8
     to 7.0 m³/h. That is Reynolds-dependent friction, so Colebrook-
     White is what is solved here.

     Pole's formula gives about 43%. It is the usual hand method for
     low-pressure gas and it is not what our models run on.

   ── What this cannot know ──

   Fittings. The real model adds equivalent lengths that dwarf the pipe:
   34.4m of fittings on a 12.5m run of 180mm. Including them took the
   agreement from 0.70 to 0.89 — the single largest term. They are
   entered per pipe in GASWorkS and cannot be read off a drawing, so a
   pressure from geometry alone reads optimistic. `fittingsM` is how
   they are supplied; without them, say so rather than quietly
   under-reporting. */

/* Standing design conditions, confirmed for our work.

   Efficiency is a derating for what the equation does not model —
   joints, fusion beads, slight ovality, minor bends, ageing. It is
   worth about 10% either way: 0.90 rather than 0.95 raises every drop
   by a tenth.

   5°C is the flowing gas temperature, which for a buried main is ground
   temperature in winter. Worth about 1.5% across the whole seasonal
   swing, so it is fixed rather than asked for. */
export const GAS_DEFAULTS = {
  efficiency: 0.95,
  temperatureC: 5,
  /* Natural gas relative to air. */
  specificGravity: 0.6,
  /* Absolute viscosity, centipoise, at the above. */
  viscosityCP: 0.0104,
  /* Internal roughness of MDPE, mm. */
  roughnessMM: 0.0015,
  /* Standard atmosphere, mbar — the base the gauge pressure sits on. */
  atmosphereMBar: 1013.103455,
};

/* Wall thickness from the pipe's SDR — outside diameter over SDR.

   Our sizes are not one SDR: 63mm is SDR11 while 90, 125 and 180 are
   SDR17.6. A fixed subtraction is close at 63 and 90 and 6% out at 180,
   which at the fifth power of diameter is about 35% of the drop. */
export const boreFor = (odMM, sdr) => (sdr ? odMM - 2 * (odMM / sdr) : null);

/* Colebrook-White, solved by repeated substitution.

   Converges in a handful of passes at these Reynolds numbers; the loop
   is capped so a pathological input cannot hang the drawing. */
export function frictionFactor(reynolds, relativeRoughness) {
  if (!(reynolds > 0)) return 0;
  let f = 0.02;
  for (let i = 0; i < 40; i++) {
    const next = (-2 * Math.log10(
      relativeRoughness / 3.7 + 2.51 / (reynolds * Math.sqrt(f)))) ** -2;
    if (Math.abs(next - f) < 1e-12) return next;
    f = next;
  }
  return f;
}

/* Gas density at the conditions it is flowing at, kg/m³.

   At the operating pressure, not at atmosphere. The network runs 23
   mbar above atmosphere, which is 2.3% denser and worth 1.5% of the
   drop — small, but it was the last of the gap between 0.97 and 0.985
   against the real model. */
export function density(gaugeMBar, opts = {}) {
  const { specificGravity, temperatureC, atmosphereMBar } = { ...GAS_DEFAULTS, ...opts };
  const air = 1.2929 * 273.15 / (273.15 + temperatureC);
  return specificGravity * air * ((atmosphereMBar + gaugeMBar) / atmosphereMBar);
}

/* The drop along one pipe, in mbar.

   `flowM3h` is what this pipe carries — everything downstream of it,
   diversified once on the count of dwellings rather than by adding up
   its branches' diversified figures.

   `fittingsM` is equivalent length for bends and tees. Absent means the
   drawing did not say, and the answer is optimistic by however much
   they would have added. */
export function pipeDrop({
  flowM3h, boreMM, lengthM, fittingsM = 0, gaugeMBar = 23,
} = {}, opts = {}) {
  const o = { ...GAS_DEFAULTS, ...opts };
  if (!(flowM3h > 0) || !(boreMM > 0) || !(lengthM > 0)) return 0;

  const d = boreMM / 1000;
  const rho = density(gaugeMBar, o);
  /* Efficiency derates the pipe, so the same flow behaves as a larger
     one through a pipe that is not quite ideal. */
  const q = (flowM3h / o.efficiency) / 3600;
  const area = Math.PI * d * d / 4;
  const v = q / area;
  const re = rho * v * d / (o.viscosityCP * 1e-3);
  const f = frictionFactor(re, (o.roughnessMM / 1000) / d);

  /* Darcy-Weisbach, Pa, then to mbar. */
  return f * ((lengthM + fittingsM) / d) * (rho * v * v / 2) / 100;
}

/* Service tees on a length of main.

   A tee is where a service pipe meets a main. There is no Service Tee
   object and there does not need to be: the drawing already knows, the
   same way it knows where a span node falls — a service end sitting on
   a main is a connection.

   ── Why derived rather than counted by hand ──

   The GASWorkS model carried 15 fittings against 72 dwellings, on
   pipes that do not correspond to where the services actually are: one
   pipe with nine customers has one fitting, another with five has
   none, and a pipe with no customers has one. Whatever those 15 were,
   they were not service tees. Counting from the drawing is both more
   faithful to the ground and impossible to forget to update when a
   service moves.

   ── The tolerance ──

   CONNECT_M, the same distance the rest of the drawing treats as
   joined. Tighter and a service drawn a centimetre short stops being a
   tee; looser and a service passing near a main is counted as meeting
   it.

   Only the service's ends are considered. A service crossing a main on
   its way somewhere else is not teed into it, and counting the crossing
   would add a fitting nobody installs. */
export function serviceTees({
  mains = [], services = [], toleranceM = 0.25,
} = {}) {
  const near = (p, a, b) => {
    /* Distance from p to the segment a-b. */
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const wx = p[0] - a[0], wy = p[1] - a[1];
    const len2 = vx * vx + vy * vy;
    const t = len2 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;
    return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
  };

  const counts = new Map(mains.map((m) => [String(m.id), 0]));
  for (const svc of services) {
    const geom = svc.geometry || [];
    if (geom.length < 2) continue;
    /* Both ends: a service runs main to plot, and which end was drawn
       first is not something to depend on. */
    for (const end of [geom[0], geom[geom.length - 1]]) {
      let best = null;
      for (const m of mains) {
        const g = m.geometry || [];
        for (let i = 1; i < g.length; i++) {
          const d = near(end, g[i - 1], g[i]);
          if (d <= toleranceM && (!best || d < best.d)) best = { id: String(m.id), d };
        }
      }
      /* The nearest main only. A tee joins one main, and a service end
         at a junction of two would otherwise be counted twice. */
      if (best) {
        counts.set(best.id, (counts.get(best.id) ?? 0) + 1);
        break;
      }
    }
  }
  return counts;
}

/* Pressure at every node, walking out from the source.

   `segments` are {from, to, flowM3h, boreMM, lengthM, fittingsM}. The
   tree is walked from `source` outward, so a node's pressure is the
   source less every drop on the way to it.

   ── A ring gets no answer ──

   Walking works because a tree has exactly one path to each node. A
   ring has two, the flow divides between them, and which one the walk
   happens to take decides the answer: on a test ring, node 3 came out
   at 22.999 mbar by the short leg carrying 1 m³/h, when the real path
   through node 2 gives 22.816. Both are traversal artefacts.

   Splitting flow round a ring needs the network solved, not walked. So
   a ring is refused — `pressures` comes back null with the offending
   segments named — rather than answered with a figure that depends on
   the order the segments happened to be listed in.

   `unreached` names anything the walk never got to: a length of main
   drawn but not joined to the rest. */
export function nodePressures({ segments = [], source, sourceMBar = 23 } = {}, opts = {}) {
  const out = new Map([[String(source), sourceMBar]]);
  const bySide = new Map();
  for (const s of segments) {
    for (const [a, b] of [[s.from, s.to], [s.to, s.from]]) {
      const k = String(a);
      if (!bySide.has(k)) bySide.set(k, []);
      bySide.get(k).push({ ...s, other: String(b) });
    }
  }

  const seen = new Set();
  const visited = new Set([String(source)]);
  const queue = [String(source)];
  const loops = [];
  while (queue.length) {
    const here = queue.shift();
    for (const s of bySide.get(here) || []) {
      const id = String(s.id ?? `${s.from}-${s.to}`);
      if (seen.has(id)) continue;
      seen.add(id);
      if (visited.has(s.other)) { loops.push(id); continue; }
      visited.add(s.other);
      const p = out.get(here) - pipeDrop({ ...s, gaugeMBar: out.get(here) }, opts);
      out.set(s.other, p);
      queue.push(s.other);
    }
  }

  const unreached = [...new Set(segments.flatMap((s) => [String(s.from), String(s.to)]))]
    .filter((n) => !visited.has(n));

  /* A ring makes every pressure beyond it a guess, not just the node
     that closed it, so nothing is returned rather than part of it. */
  if (loops.length) return { pressures: null, loops, unreached };

  return { pressures: out, loops, unreached };
}

/* Equivalent length allowed for one service tee, in metres of its own
   bore.

   About 60 diameters, the usual figure for a tee taken through the
   branch. Not from our GASWorkS model: that carried 15 "fittings"
   against 72 dwellings, on pipes that do not correspond to where the
   services are, so whatever they were they were not service tees and
   their 186-773 diameters do not transfer.

   A number to be calibrated rather than trusted. With the drawing
   behind a modelled job, the allowance that reproduces its measured
   drop can be solved for directly, and this becomes that. */
/* What one service tee costs, as a multiple of the pipe's own bore.

   A fitting's resistance is conventionally given as a length of
   straight pipe: this tee costs about as much pressure as N pipe-widths
   of ordinary main would. Expressing it as a multiple rather than a
   fixed length means one number covers every size, because a fitting on
   a big pipe resists more than the same fitting on a small one.

   ── Why not a flat metre figure ──

   It was three metres for a while, which is easier to enter and check.
   But a fixed length under-states the larger pipes: on a leg with six
   tees it is right at 63mm and 13% out at 180mm, always in the
   optimistic direction.

   ── Which number ──

   60 is the textbook figure for gas taken *through the branch* — in the
   top of the tee and out of the leg, a right-angle turn into a smaller
   opening. That is the journey the service makes.

   Gas continuing along the main does not make that turn; it goes
   straight through the run, which is cheaper — nearer 20 diameters. The
   levels check measures the main, so 60 is the conservative reading
   rather than the exact one. It is a setting for that reason: the
   figure our designers allow is the one that belongs here. */
export const TEE_DIAMETERS = 60;

export const teeAllowanceM = (boreMM, diameters = TEE_DIAMETERS) =>
  (Number(boreMM) / 1000) * (Number(diameters) || 0);

/* Pressure at every span node on a gas network.

   `runs` are what gasMainRuns produces — a length of main between two
   nodes, with its size, its length, and the services teed off it.

   The pressure at a node is the POC's less every drop on the way to it,
   and each run's drop uses the flow that run carries: everything
   downstream, diversified once on the count of dwellings rather than by
   adding up its branches' diversified figures.

   Returns the pressure at each node and the drop on each run, plus
   anything that stopped it being answerable. */
export function gasLevels({
  runs = [], source, sourceMBar, flowFor, teeDiameters = TEE_DIAMETERS,
} = {}, opts = {}) {
  if (!(sourceMBar > 0)) {
    return { error: "No output pressure is set on the gas POC." };
  }

  const segments = runs.map((r, i) => {
    const bore = r.bore ?? null;
    return {
      id: r.id ?? `r${i}`,
      from: r.fromNode,
      to: r.endNode,
      boreMM: bore,
      lengthM: r.metres,
      /* One allowance per service teed off this length. */
      fittingsM: (r.services || 0) * teeAllowanceM(bore, teeDiameters),
      flowM3h: flowFor ? flowFor(r) : 0,
      run: r,
    };
  });

  const missing = segments.filter((s) => !(s.boreMM > 0)).map((s) => s.id);
  if (missing.length) {
    return {
      error: `${missing.length} length${missing.length === 1 ? "" : "s"} of main `
        + "have no pipe size, so their drop cannot be worked out. Build the gas "
        + "network first.",
    };
  }

  const walked = nodePressures({ segments, source, sourceMBar }, opts);
  if (!walked.pressures) {
    return {
      error: "The mains form a ring, so the flow divides and the pressures "
        + "depend on which way round it is walked. A ring needs solving "
        + "rather than tracing.",
      loops: walked.loops,
    };
  }

  const legs = segments.map((s) => ({
    id: s.id,
    /* Where this length of main is on the drawing, so a row in the
       report can be clicked and found. The same points a suggestion
       carries, so the two cannot disagree about which pipe is which. */
    runPts: s.run.pts || null,
    /* Over its rated capacity, whatever the pressure says.

       A build that lays everything at the smallest pipe no longer
       respects the kW ceiling on a size \u2014 that was the trade for
       letting the levels check drive the sizing. So the check has to
       report it, or an undersized main passes on pressure and nobody
       hears about the capacity at all. */
    overCapacity: s.run.maxKw != null && Number(s.run.kw) > Number(s.run.maxKw),
    maxKw: s.run.maxKw ?? null,
    kw: s.run.kw ?? null,
    /* What the drawing calls each end, where it calls it anything. The
       graph indices behind them are of no use to a reader. */
    from: s.run.fromLabel ?? null,
    to: s.run.toLabel ?? null,
    metres: s.lengthM,
    fittingsM: Math.round(s.fittingsM * 100) / 100,
    services: s.run.services || 0,
    boreMM: s.boreMM,
    flowM3h: s.flowM3h,
    drop: pipeDrop({ ...s, gaugeMBar: walked.pressures.get(String(s.from)) ?? sourceMBar }, opts),
    at: walked.pressures.get(String(s.to)),
  }));

  return {
    pressures: walked.pressures,
    /* The runs exactly as they were measured, so a suggestion is worked
       out against the same network rather than one rebuilt from
       different assumptions. */
    runsUsed: runs,
    legs,
    unreached: walked.unreached,
    lowest: [...walked.pressures.entries()]
      .reduce((lo, e) => (e[1] < lo[1] ? e : lo), [String(source), sourceMBar]),
    /* The drawing's name for the lowest node, where it has one. The
       graph index it is keyed on is not something to show anybody. */
    lowestLabel: (() => {
      const worst = [...walked.pressures.entries()]
        .reduce((lo, e) => (e[1] < lo[1] ? e : lo), [String(source), sourceMBar]);
      const leg = segments.find((s) => String(s.to) === worst[0]);
      return leg?.run?.toLabel ?? null;
    })(),
  };
}

/* What would bring a failing node back inside its limit.

   A node fails because of everything between it and the origin, so the
   fix is rarely at the node that reports it. Upsizing the last length
   may not clear it, and upsizing an early one clears every node beyond
   it at once. The useful answer is the cheapest change that clears
   everything, not the first change that clears something.

   The physics is not repeated here. gasLevels already works out the
   pressures given the sizes on the runs, and a scenario is that same
   function called again with one size swapped \u2014 anything else would be
   a second implementation of the sum, and the two would drift, which is
   how a suggestion comes to promise something the check then disagrees
   with. Deliberately the same approach as suggestCableChanges.

   Tried smallest change first, nearest the origin first: a bigger pipe
   early is usually cheaper than several bigger pipes late, and it is
   the one that clears the most nodes. */
export function suggestPipeChanges({
  runs = [], source, sourceMBar, flowFor, minMBar,
  sizes = [], teeDiameters = TEE_DIAMETERS, maxSuggestions = 4,
} = {}, opts = {}) {
  const base = gasLevels({ runs, source, sourceMBar, flowFor, teeDiameters }, opts);
  if (base.error) return { error: base.error };

  /* A node fails on pressure; a run fails on capacity. Both are the
     network being undersized, and a cascade that fixed one and left the
     other would send somebody back round for a second answer.

     A run over capacity is reported against the node it ends at, so the
     two kinds of failure count and clear the same way. */
  const failing = (r) => {
    const out = [...r.pressures.entries()].filter(([, p]) => p < minMBar);
    const named = new Set(out.map(([n]) => n));
    for (const l of r.legs) {
      if (l.overCapacity && l.to && !named.has(String(l.to))) {
        out.push([String(l.to), r.pressures.get(String(l.to)) ?? sourceMBar]);
        named.add(String(l.to));
      }
    }
    return out;
  };
  const bad = failing(base);
  if (!bad.length) return { ok: true, failing: [], suggestions: [] };

  /* Sizes smallest first, by bore, which is the property that orders
     them \u2014 a label sorts "125" before "63" as text. */
  const ladder = sizes
    .filter((x) => Number(x.bore) > 0)
    .slice()
    .sort((a, b) => Number(a.bore) - Number(b.bore));
  if (ladder.length < 2) {
    return { error: "The gas pipe table has too few sizes to suggest a change." };
  }

  /* The runs on the way to a failing node, nearest the origin first. A
     run feeding two failing nodes is worth changing once. */
  const onPathTo = (target, from = runs) => {
    const byTo = new Map(from.map((r) => [String(r.endNode), r]));
    const path = [];
    let at = String(target);
    const guard = new Set();
    while (byTo.has(at) && !guard.has(at)) {
      guard.add(at);
      const r = byTo.get(at);
      path.unshift(r);
      at = String(r.fromNode);
    }
    return path;
  };

  /* A cascade, not a list of alternatives.

     One bigger pipe rarely clears a network that fails at several
     nodes: upsizing the spine fixes the nodes near it and leaves the
     far leg still short. So the best single change is found, applied,
     and the search run again on the result \u2014 giving a set of changes
     that together bring the network inside its limit, in the order they
     do the most good.

     Capped, because a network that needs more changes than this is not
     a sizing problem: it is a design that needs looking at, and a list
     of nine upsizes reads as a fault in the tool. */
  let current = runs;
  let remaining = bad;
  const suggestions = [];

  while (remaining.length && suggestions.length < maxSuggestions) {
    const onPath = new Set();
    for (const [node] of remaining) {
      for (const r of onPathTo(node, current)) onPath.add(String(r.id));
    }

    let best = null;
    for (const r of current) {
      if (!onPath.has(String(r.id))) continue;
      const now = ladder.findIndex((x) => Number(x.bore) === Number(r.bore));
      for (let i = now + 1; i < ladder.length; i++) {
        const bigger = ladder[i];
        /* The rating comes with the size, or a suggestion could move a
           run to a pipe that is still over capacity and report it as
           cleared. */
        const swapped = current.map((x) => (String(x.id) === String(r.id)
          ? { ...x, bore: bigger.bore, maxKw: bigger.maxKw ?? x.maxKw }
          : x));
        const after = gasLevels(
          { runs: swapped, source, sourceMBar, flowFor, teeDiameters }, opts);
        if (after.error) continue;
        const left = failing(after);
        if (left.length >= remaining.length) continue;
        const cleared = remaining.length - left.length;
        /* Most cleared, then the smaller pipe: the cheapest change that
           does the most. */
        if (!best || cleared > best.cleared
          || (cleared === best.cleared && bigger.bore < best.bigger.bore)) {
          best = { run: r, bigger, cleared, left, after, swapped };
        }
        break;   /* the smallest size of this run that helps */
      }
    }

    if (!best) break;   /* nothing left that any single upsize improves */

    /* One line per run. The cascade can reach a pipe twice — 63 to 90
       clears the pressure, then 90 to 180 clears the capacity — and
       "upsize G1, then upsize G1 again" is two instructions for one
       piece of work. The earlier line is raised to the final size. */
    const already = suggestions.find((x) => String(x.runId) === String(best.run.id));
    if (already) {
      already.toBore = best.bigger.bore;
      already.sizeLabel = best.bigger.label ?? `${best.bigger.bore}mm bore`;
      already.clears += best.cleared;
      already.stillFailing = best.left.length;
      already.lowestAfter = [...best.after.pressures.values()]
        .reduce((a, b) => Math.min(a, b));
      current = best.swapped;
      remaining = best.left;
      continue;
    }

    suggestions.push({
      runId: best.run.id,
      /* The polyline this run covers, so a caller can find the features
         it is drawn as and change them. gasMainRuns does not carry
         their ids, and matching by geometry is what the labels already
         do. */
      runPts: best.run.pts || null,
      from: best.run.fromLabel ?? String(best.run.fromNode),
      to: best.run.toLabel ?? String(best.run.endNode),
      fromBore: best.run.bore,
      toBore: best.bigger.bore,
      sizeLabel: best.bigger.label ?? `${best.bigger.bore}mm bore`,
      clears: best.cleared,
      stillFailing: best.left.length,
      lowestAfter: [...best.after.pressures.values()].reduce((a, b) => Math.min(a, b)),
    });
    current = best.swapped;
    remaining = best.left;
  }

  return {
    ok: true,
    failing: bad.map(([node, mbar]) => ({ node, mbar })),
    suggestions,
    /* Whether the cascade actually gets there. A set of changes that
       leaves nodes short is still worth showing \u2014 it is progress, and
       hiding it would leave somebody with a failing network and no
       indication of what helps \u2014 but it must not read as a fix. */
    clearsAll: remaining.length === 0,
    stillFailing: remaining.map(([node, mbar]) => ({ node, mbar })),
  };
}
