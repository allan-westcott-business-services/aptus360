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
