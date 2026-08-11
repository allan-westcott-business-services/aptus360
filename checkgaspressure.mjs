/* Gas pressure drop, against a real design.

   This is not a formula checked against itself. It is one of our own
   jobs — 22 pipes, 72 dwellings, source 23.0 mbar — modelled in
   GASWorkS to IGE/TD/3, with the flow, bore, length, fitting allowance
   and resulting pressure drop for every pipe as the model computed
   them.

   Reproducing GASWorkS is the whole point: a pressure that disagrees
   with the model we submit is worse than no pressure at all. So this
   fails if any pipe drifts more than 5% from it, and if the median
   drifts more than 2%.

   The fixture also documents what was tried and rejected, because the
   near misses are the ones somebody will reach for again:

     Pole's formula                            0.43 of the real drop
     IGE/TD/3 as commonly written              0.62
     Colebrook-White, pipe length only         0.70
     + fitting equivalent lengths              0.89
     + 0.95 efficiency                         0.97
     + density at operating pressure           0.985  <- this
*/
import {
  pipeDrop, boreFor, frictionFactor, nodePressures, serviceTees,
} from "./src/features/gis/gasPressure.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* From Gasworks_Model_Data.xls, sheet "Pipe". */
const MODEL = [
  { from: 1, to: 2, q: 110.3035, bore: 158.75, L: 12.490, fit: 34.449, dp: 0.079735 },
  { from: 2, to: 3, q: 4.3799, bore: 50.90, L: 32.592, fit: 39.370, dp: 0.104311 },
  { from: 2, to: 4, q: 12.3664, bore: 79.20, L: 106.890, fit: 14.764, dp: 0.127296 },
  { from: 2, to: 5, q: 101.7196, bore: 158.75, L: 28.891, fit: 0.000, dp: 0.042606 },
  { from: 7, to: 8, q: 80.7783, bore: 158.75, L: 7.442, fit: 34.449, dp: 0.041356 },
  { from: 8, to: 9, q: 17.2173, bore: 110.30, L: 78.886, fit: 0.000, dp: 0.030545 },
  { from: 11, to: 13, q: 4.3799, bore: 50.90, L: 18.835, fit: 0.000, dp: 0.027304 },
  { from: 11, to: 12, q: 6.9514, bore: 79.20, L: 42.032, fit: 0.000, dp: 0.016716 },
  { from: 8, to: 14, q: 68.8178, bore: 158.75, L: 37.944, fit: 34.449, dp: 0.054124 },
  { from: 14, to: 15, q: 55.5403, bore: 158.75, L: 15.121, fit: 34.449, dp: 0.025586 },
  { from: 15, to: 16, q: 6.9514, bore: 79.20, L: 60.624, fit: 14.764, dp: 0.029983 },
  { from: 15, to: 17, q: 50.9601, bore: 158.75, L: 59.497, fit: 34.449, dp: 0.041808 },
  { from: 14, to: 18, q: 11.3454, bore: 79.20, L: 54.863, fit: 14.764, dp: 0.062985 },
  { from: 7, to: 19, q: 22.6903, bore: 110.30, L: 39.756, fit: 24.606, dp: 0.039832 },
  { from: 21, to: 22, q: 6.9514, bore: 50.90, L: 39.076, fit: 40.989, dp: 0.251737 },
  { from: 21, to: 23, q: 10.3003, bore: 79.20, L: 76.879, fit: 14.764, dp: 0.070428 },
  { from: 19, to: 21, q: 19.0741, bore: 110.30, L: 86.866, fit: 24.606, dp: 0.051347 },
  { from: 19, to: 20, q: 4.3799, bore: 50.90, L: 44.163, fit: 39.370, dp: 0.121096 },
  { from: 5, to: 7, q: 96.9810, bore: 158.75, L: 9.250, fit: 0.000, dp: 0.012552 },
  { from: 5, to: 6, q: 6.9514, bore: 50.90, L: 32.221, fit: 0.000, dp: 0.101291 },
  { from: 9, to: 11, q: 11.3454, bore: 110.30, L: 31.690, fit: 0.000, dp: 0.006080 },
  { from: 9, to: 10, q: 2.8293, bore: 50.90, L: 23.456, fit: 0.000, dp: 0.016521 },
];

const ratios = MODEL.map((p) => {
  const got = pipeDrop({
    flowM3h: p.q, boreMM: p.bore, lengthM: p.L, fittingsM: p.fit, gaugeMBar: 23,
  });
  return { ...p, got, ratio: got / p.dp };
});

const sorted = [...ratios].map((r) => r.ratio).sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
const worst = ratios.reduce((w, r) =>
  (Math.abs(r.ratio - 1) > Math.abs(w.ratio - 1) ? r : w));

for (const r of ratios) {
  if (Math.abs(r.ratio - 1) > 0.05) {
    fail(`${r.bore}mm ${r.L.toFixed(0)}m at ${r.q.toFixed(2)} m3/h: `
      + `${r.got.toFixed(4)} against the model's ${r.dp.toFixed(4)} `
      + `(${((r.ratio - 1) * 100).toFixed(1)}%)`);
  }
}
if (Math.abs(median - 1) > 0.02) {
  fail(`median is ${median.toFixed(3)} of the model; wanted within 2%`);
}

/* Bore from SDR is an approximation, and this says how good it is.

   GASWorkS carries tabulated bores — 50.9, 79.2, 110.3, 158.75 — which
   are the manufacturer's, not OD minus twice OD/SDR. The formula runs
   0.5% to 1.3% large, and at the fifth power of diameter 1.3% of bore
   is about 6.6% of pressure drop.

   So the formula is a fallback and the real bore belongs in the pipe
   size table. Held to 2% here: further than that means the SDRs have
   been mixed up, which is a different and much larger error.

   Ours are not one SDR — 63mm is SDR11 while 90, 125 and 180 are
   SDR17.6 — so a single fixed subtraction is wrong at one end or the
   other whatever value is picked. */
const bores = [[63, 11, 50.9], [90, 17.6, 79.2], [125, 17.6, 110.3], [180, 17.6, 158.75]];
for (const [od, sdr, tabulated] of bores) {
  const got = boreFor(od, sdr);
  const off = Math.abs(got / tabulated - 1);
  if (off > 0.02) {
    fail(`${od}mm SDR${sdr}: formula gives ${got.toFixed(1)}mm against the `
      + `tabulated ${tabulated}mm (${(off * 100).toFixed(1)}%)`);
  }
}

/* Friction rises as flow falls, which is the whole reason the
   simplified form does not fit. Same bore, more flow, lower factor. */
const fLow = frictionFactor(2e4, 0.0015 / 50.9);
const fHigh = frictionFactor(2e5, 0.0015 / 50.9);
if (!(fHigh < fLow)) fail("the friction factor does not fall as flow rises");

/* Nothing silly on degenerate input: a pipe with no flow drops nothing
   rather than dividing by zero. */
for (const bad of [{}, { flowM3h: 0, boreMM: 50, lengthM: 10 },
  { flowM3h: 10, boreMM: 0, lengthM: 10 }, { flowM3h: 10, boreMM: 50, lengthM: 0 }]) {
  if (pipeDrop(bad) !== 0) fail(`${JSON.stringify(bad)} did not give a zero drop`);
}

/* Walking the network, against the model's own node pressures. */
{
  const chain = MODEL.filter((p) => (p.from === 1 && p.to === 2) || (p.from === 2 && p.to === 3))
    .map((p, i) => ({
      id: `s${i}`, from: p.from, to: p.to,
      flowM3h: p.q, boreMM: p.bore, lengthM: p.L, fittingsM: p.fit,
    }));
  const { pressures } = nodePressures({ segments: chain, source: 1, sourceMBar: 23 });
  /* GASWorkS: node 2 at 22.920259, node 3 at 22.815947. */
  for (const [node, want] of [["2", 22.920259], ["3", 22.815947]]) {
    const got = pressures.get(node);
    if (got === undefined) fail(`node ${node} was never reached`);
    else if (Math.abs(got - want) > 0.01) {
      fail(`node ${node} came out ${got.toFixed(4)} mbar against the model's ${want}`);
    }
  }
}

/* A ring is refused rather than answered.

   Walking a ring gives whichever answer the segment order produces: on
   this one, node 3 came out at 22.999 by the leg carrying 1 m³/h
   instead of 22.816 by the real path. Splitting flow round a ring needs
   the network solved. */
{
  const ring = [
    { id: "a", from: 1, to: 2, flowM3h: 110.3, boreMM: 158.75, lengthM: 12.5, fittingsM: 34.4 },
    { id: "b", from: 2, to: 3, flowM3h: 4.38, boreMM: 50.9, lengthM: 32.6, fittingsM: 39.4 },
    { id: "c", from: 3, to: 1, flowM3h: 1, boreMM: 50.9, lengthM: 10 },
  ];
  const r = nodePressures({ segments: ring, source: 1, sourceMBar: 23 });
  if (r.pressures !== null) fail("a ring main was answered rather than refused");
  if (!r.loops.length) fail("a ring main was not reported");
}

/* And a length of main drawn but not joined to anything is named. */
{
  const island = [
    { id: "a", from: 1, to: 2, flowM3h: 10, boreMM: 50.9, lengthM: 20 },
    { id: "z", from: 8, to: 9, flowM3h: 5, boreMM: 50.9, lengthM: 20 },
  ];
  const r = nodePressures({ segments: island, source: 1, sourceMBar: 23 });
  if (!r.unreached.includes("8") || !r.unreached.includes("9")) {
    fail("a detached run was not reported as unreached");
  }
}

/* Service tees, counted off the drawing.
 
   The model's own 15 fittings did not correspond to where the services
   are — one pipe with nine customers had one, another with five had
   none, and a pipe with no customers had one. So they are derived
   instead, and these are the cases that decide whether the derivation
   is trustworthy. */
{
  const mains = [
    { id: "M1", geometry: [[0, 0], [100, 0]] },
    { id: "M2", geometry: [[100, 0], [200, 0]] },
  ];
  const stub = (x, y) => ({ geometry: [[x, y], [x, y + 10]] });
  const counts = serviceTees({
    mains,
    services: [
      stub(20, 0),        // squarely on M1
      stub(50, 0.1),      // 100mm off, within the joining tolerance
      stub(150, 0),       // on M2
      stub(60, 5),        // five metres away: not a tee
      /* Crosses M1 without ending on it. A service passing over a main
         on its way elsewhere is not teed into it, and counting the
         crossing would add a fitting nobody installs. */
      { geometry: [[30, -20], [30, 20]] },
    ],
  });
  if (counts.get("M1") !== 2) fail(`M1 got ${counts.get("M1")} tees, wanted 2`);
  if (counts.get("M2") !== 1) fail(`M2 got ${counts.get("M2")} tees, wanted 1`);

  /* A service ending where two mains meet joins one of them, not both. */
  const junction = serviceTees({ mains, services: [stub(100, 0)] });
  const total = [...junction.values()].reduce((a, b) => a + b, 0);
  if (total !== 1) fail(`a service at a junction of two mains counted ${total} times`);

  /* And nothing silly on degenerate input. */
  if (serviceTees({}).size !== 0) fail("no mains produced counts");
  const oneNode = serviceTees({ mains, services: [{ geometry: [[20, 0]] }] });
  if ([...oneNode.values()].some((n) => n)) fail("a one-point service counted as a tee");
}

console.log(bad ? `\n${bad} problem(s)`
  : `Gas pressure behaves (${MODEL.length} real pipes, median `
    + `${median.toFixed(3)} of GASWorkS, worst ${worst.ratio.toFixed(3)}).`);
process.exit(bad ? 1 : 0);
