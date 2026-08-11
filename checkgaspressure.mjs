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
  pipeDrop, boreFor, frictionFactor, nodePressures, serviceTees, gasLevels,
  suggestPipeChanges,
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

/* A run's flow comes off the run, and a zero must fail loudly.

   The first version of the canvas wiring asked the diversity table for
   a `kw` field it does not have — rows carry `max` and `factor` — so
   every flow came back zero, every drop was zero, and every span node
   read as the POC's pressure. It looked like a working panel full of
   23.00s.

   Zero flow is not a pressure of "no drop"; it is a calculation that
   did not happen. */
{
  const kwToM3h = (kw) => (Number(kw) || 0) * 3600 / 39500;
  const runs = [
    { id: "G1", fromNode: "P", endNode: "n2", metres: 15.5, services: 0, bore: 169, kw: 1210 },
    { id: "G2", fromNode: "n2", endNode: "n21", metres: 121.3, services: 11, bore: 52, kw: 48 },
  ];
  const r = gasLevels({ runs, source: "P", sourceMBar: 23, flowFor: (x) => kwToM3h(x.kw) });
  if (r.error) fail(`a straightforward network was refused: ${r.error}`);
  else {
    for (const l of r.legs) {
      if (!(l.flowM3h > 0)) fail(`${l.id} came out with no flow`);
      if (!(l.drop > 0)) fail(`${l.id} came out with no pressure drop`);
    }
    const last = r.legs[r.legs.length - 1];
    if (!(last.at < 23)) fail("the far node is still at the POC's pressure");
    /* 1210 kW diversified is about 110 m3/h at 39.5 MJ/m3. */
    if (Math.abs(r.legs[0].flowM3h - 110.3) > 1) {
      fail(`1210 kW became ${r.legs[0].flowM3h.toFixed(1)} m3/h, wanted about 110.3`);
    }
  }
}

/* A leg is named the way the drawing names things.

   G1 is a length of gas main. The nodes are G0 and the A-numbers, and
   there is exactly one G0. The first version reported the graph's own
   indices in the To column — "to 138" — which named nothing anybody
   could find on the drawing. */
{
  const kwToM3h = (kw) => (Number(kw) || 0) * 3600 / 39500;
  const runs = [
    { id: "G1", fromNode: 0, endNode: 1, fromLabel: "G0", toLabel: "A1",
      metres: 15.5, services: 0, bore: 169, kw: 1210 },
    { id: "G2", fromNode: 1, endNode: 2, fromLabel: "A1", toLabel: "A5",
      metres: 121.3, services: 11, bore: 52, kw: 48 },
    /* A run ending on a bend, which has no node and so no name. */
    { id: "G3", fromNode: 1, endNode: 3, fromLabel: "A1", toLabel: null,
      metres: 30, services: 0, bore: 79, kw: 136 },
  ];
  const r = gasLevels({ runs, source: 0, sourceMBar: 23, flowFor: (x) => kwToM3h(x.kw) });
  if (r.error) fail(`the network was refused: ${r.error}`);
  else {
    const first = r.legs[0];
    if (first.from !== "G0") fail(`the first leg starts at "${first.from}", wanted G0`);
    if (first.to !== "A1") fail(`the first leg ends at "${first.to}", wanted A1`);
    if (r.legs.some((l) => /^\d+$/.test(String(l.to)))) {
      fail("a leg reported a graph index instead of a label");
    }
    if (r.legs[2].to !== null) fail("a bend was given an invented name");
    /* Exactly one G0, and the mains are G-numbers rather than nodes. */
    const nodeNames = r.legs.flatMap((l) => [l.from, l.to]).filter(Boolean);
    if (nodeNames.filter((n) => n === "G0").length !== 1) {
      fail("G0 appears more than once, or not at all");
    }
    if (nodeNames.some((n) => /^G[1-9]/.test(n))) {
      fail("a node is named G-something; only the mains carry G numbers");
    }
    /* And the bores differ, because the loads do. A single bore
       everywhere was the symptom of every flow being zero. */
    if (new Set(r.legs.map((l) => l.boreMM)).size < 2) {
      fail("every leg came out the same bore");
    }
  }
}

/* Recommending pipe sizes, the way the electric check recommends
   cables: apply the best single upsize, re-run, repeat.

   One bigger pipe rarely clears a network failing at several nodes —
   upsizing the spine fixes what is near it and leaves the far leg
   short — so a single suggestion would read as a fix and not be one. */
{
  const kwToM3h = (kw) => kw * 3600 / 39500;
  const runs = [
    { id: "G1", fromNode: "P", endNode: "A1", fromLabel: "G0", toLabel: "A1",
      metres: 20, services: 0, bore: 52, kw: 900 },
    { id: "G2", fromNode: "A1", endNode: "A5", fromLabel: "A1", toLabel: "A5",
      metres: 400, services: 14, bore: 52, kw: 300 },
  ];
  const sizes = [{ bore: 52, label: "63mm" }, { bore: 79, label: "90mm" },
    { bore: 114, label: "125mm" }, { bore: 169, label: "180mm" }];
  const common = { source: "P", sourceMBar: 23, flowFor: (r) => kwToM3h(r.kw), sizes };

  const r = suggestPipeChanges({ runs, minMBar: 19, ...common });
  if (r.error) fail(`the recommender refused a plain network: ${r.error}`);
  else {
    if (r.failing.length !== 2) fail(`${r.failing.length} nodes reported failing, wanted 2`);
    if (!r.suggestions.length) fail("nothing was suggested for a network that fails");
    if (!r.clearsAll) fail("the cascade did not clear the network");
    /* Each step must be a real upsize, and named the way the drawing is. */
    for (const x of r.suggestions) {
      if (!(x.toBore > x.fromBore)) fail(`${x.runId} was told to go smaller`);
      if (!x.from || !x.to) fail(`${x.runId} has an unnamed end`);
    }
    /* And it must actually hold afterwards, checked against gasLevels
       rather than trusted \u2014 a suggestion that promises something the
       check then disagrees with is worse than none. */
    let after = runs;
    for (const x of r.suggestions) {
      after = after.map((y) => (y.id === x.runId ? { ...y, bore: x.toBore } : y));
    }
    const proved = gasLevels({ runs: after, ...common });
    const lowest = Math.min(...proved.pressures.values());
    if (lowest < 19) {
      fail(`after every suggested change the lowest is still ${lowest.toFixed(2)} mbar`);
    }
  }

  /* A network already inside its limit gets no advice. */
  const fine = suggestPipeChanges({ runs, minMBar: 1, ...common });
  if (fine.failing.length || fine.suggestions.length) {
    fail("a passing network was given suggestions");
  }
}

/* A minimum-size build, and what the check has to say about it.

   The build now lays everything at the smallest pipe and leaves the
   sizing to this. That trade means capacity is no longer respected when
   the pipe goes in, so the check has to report it — otherwise a main
   carrying ten times its rating passes on pressure and nobody hears
   about it. */
{
  const kwToM3h = (kw) => kw * 3600 / 39500;
  const runs = [
    { id: "G1", fromNode: "P", endNode: "A1", fromLabel: "G0", toLabel: "A1",
      metres: 20, services: 0, bore: 52, kw: 900, maxKw: 120 },
    { id: "G2", fromNode: "A1", endNode: "A5", fromLabel: "A1", toLabel: "A5",
      metres: 150, services: 6, bore: 52, kw: 90, maxKw: 120 },
  ];
  const sizes = [
    { bore: 52, label: "63mm", maxKw: 120 },
    { bore: 79, label: "90mm", maxKw: 340 },
    { bore: 169, label: "180mm", maxKw: 2400 },
  ];
  const common = { source: "P", sourceMBar: 23, flowFor: (r) => kwToM3h(r.kw) };

  const base = gasLevels({ runs, ...common });
  const over = base.legs.filter((l) => l.overCapacity);
  if (over.length !== 1) fail(`${over.length} runs flagged over capacity, wanted 1`);
  if (over[0]?.id !== "G1") fail("the wrong run was flagged over capacity");

  const r = suggestPipeChanges({ runs, minMBar: 19, sizes, ...common });
  /* One instruction per pipe: the cascade can reach a run twice, and
     "upsize G1, then upsize G1 again" is two lines for one job. */
  if (new Set(r.suggestions.map((x) => x.runId)).size !== r.suggestions.length) {
    fail("a run was listed for upsizing more than once");
  }
  if (!r.clearsAll) fail("the cascade did not clear a network it could fix");

  /* And the result must hold on both counts, checked rather than
     trusted: a suggestion that clears the pressure and leaves the pipe
     over capacity has not fixed anything. */
  let after = runs;
  for (const x of r.suggestions) {
    const size = sizes.find((z) => z.bore === x.toBore);
    after = after.map((y) => (y.id === x.runId
      ? { ...y, bore: x.toBore, maxKw: size.maxKw } : y));
  }
  const proved = gasLevels({ runs: after, ...common });
  if (proved.legs.some((l) => l.overCapacity)) {
    fail("a run is still over capacity after every suggested change");
  }
  if (Math.min(...proved.pressures.values()) < 19) {
    fail("a node is still below the limit after every suggested change");
  }
}

/* The pipe size picker offers pipes, not sizing rules.

   Gas_Pipe_Size holds one row per rule: 63mm appears once per capacity
   band and again for each operator with its own ceiling. Listed as they
   come, the picker showed "63mm PE" five times over with nothing to
   tell the rows apart, which makes somebody wonder which is right.

   The grouping lives in the editor, so this checks the rule it applies
   rather than importing a component. */
{
  const rules = [
    { Gas_Pipe_Size_ID: 1, Diameter_mm: 32, Max_kW: 40, Pressure_Tier: "LP" },
    { Gas_Pipe_Size_ID: 2, Diameter_mm: 32, Max_kW: 55, Pressure_Tier: "LP" },
    { Gas_Pipe_Size_ID: 3, Diameter_mm: 63, Max_kW: 90, Pressure_Tier: "LP" },
    { Gas_Pipe_Size_ID: 4, Diameter_mm: 63, Max_kW: 120, Pressure_Tier: "LP" },
    { Gas_Pipe_Size_ID: 5, Diameter_mm: 90, Max_kW: 340, Pressure_Tier: "LP" },
    { Gas_Pipe_Size_ID: 6, Diameter_mm: 180, Max_kW: 2400, Pressure_Tier: "MP" },
  ];
  const byBore = new Map();
  for (const x of rules) {
    if ((x.Pressure_Tier ?? "LP") !== "LP") continue;
    const bore = Number(x.Diameter_mm);
    const held = byBore.get(bore);
    if (!held || Number(x.Max_kW || 0) > Number(held.Max_kW || 0)) byBore.set(bore, x);
  }
  const offered = [...byBore.values()]
    .sort((a, b) => Number(a.Diameter_mm) - Number(b.Diameter_mm));

  if (offered.length !== 3) fail(`${offered.length} sizes offered from 6 rules, wanted 3`);
  if (offered.some((x) => x.Pressure_Tier === "MP")) {
    fail("a medium pressure size was offered on a low pressure scheme");
  }
  /* The highest ceiling for the bore, so the note under the field reads
     as what the pipe carries rather than the tightest rule mentioning
     it. */
  if (offered.find((x) => x.Diameter_mm === 63)?.Max_kW !== 120) {
    fail("63mm was offered at its tightest rule rather than its widest");
  }
  /* Smallest first, by bore. "125" sorts before "63" as text. */
  const bores = offered.map((x) => Number(x.Diameter_mm));
  if (bores.join() !== [...bores].sort((a, b) => a - b).join()) {
    fail(`sizes came out in the order ${bores.join(", ")}`);
  }
}

/* Every setting on the Admin panel has to move the answer.

   The check read the minimum and the amber band and left the rest to
   their defaults, so changing the tee allowance, the efficiency or the
   temperature did nothing at all — the fields were there and the
   numbers never budged. A setting that cannot be felt is worse than no
   setting, because somebody trusts it. */
{
  const kwToM3h = (kw) => kw * 3600 / 39500;
  const runs = [{
    id: "G1", fromNode: "P", endNode: "A1",
    metres: 200, services: 8, bore: 52, kw: 110,
  }];
  const base = { source: "P", sourceMBar: 23, flowFor: (r) => kwToM3h(r.kw) };
  const drop = (teeMetres, opts) =>
    gasLevels({ ...base, runs, teeMetres }, opts || {}).legs[0].drop;

  const normal = drop(3);
  if (!(drop(10) > normal)) fail("a larger tee allowance did not increase the drop");
  if (!(drop(0) < normal)) fail("removing the tee allowance did not reduce the drop");
  if (!(drop(3, { efficiency: 0.70 }) > normal)) {
    fail("a lower pipe efficiency did not increase the drop");
  }
  if (!(drop(3, { temperatureC: 30 }) < normal)) {
    fail("warmer gas did not reduce the drop");
  }
  /* And the suggestions honour them too, or advice would be worked out
     against different conditions from the check that produced it.

     Compared on the pressure the advice reports, not on how many nodes
     fail: a one-run network has one node, and it either passes or does
     not whatever the allowance. Counting failures said nothing, which
     is why the first version of this test failed against correct
     code. */
  const sizes = [{ bore: 52, label: "63mm" }, { bore: 79, label: "90mm" }];
  const after = (teeMetres) => suggestPipeChanges(
    { ...base, runs, minMBar: 22.5, sizes, teeMetres },
  ).suggestions[0]?.lowestAfter;
  if (!(after(10) < after(0))) {
    fail("the tee allowance did not reach the pipe size advice");
  }
}

/* A suggestion has to be applyable.

   "Make change" finds the features a run is drawn as by matching their
   geometry against the run's polyline — gasMainRuns does not carry
   their ids. Without runPts on the suggestion there is nothing to match
   against, and the button can only report that it could not find the
   pipe it had just named. */
{
  const kwToM3h = (kw) => kw * 3600 / 39500;
  const runs = [{
    id: "G1", fromNode: "P", endNode: "A1", fromLabel: "G0", toLabel: "A1",
    metres: 200, services: 6, bore: 52, kw: 900, maxKw: 120,
    pts: [[0, 0], [200, 0]],
  }];
  const sizes = [{ bore: 52, label: "63mm", maxKw: 120 },
    { bore: 169, label: "180mm", maxKw: 2400 }];
  const a = suggestPipeChanges({
    runs, source: "P", sourceMBar: 23, flowFor: (r) => kwToM3h(r.kw),
    minMBar: 19, sizes,
  });
  if (!a.suggestions.length) fail("nothing suggested for a failing network");
  for (const x of a.suggestions) {
    if (!Array.isArray(x.runPts) || x.runPts.length < 2) {
      fail(`${x.runId} carries no geometry, so it cannot be applied`);
    }
    /* And enough to write the change: which bore to move to, and what
       to call it on the drawing. */
    if (!(x.toBore > 0)) fail(`${x.runId} names no bore to change to`);
    if (!x.sizeLabel) fail(`${x.runId} names no size label`);
  }
}

/* Changing the pipe has to change the pressure.

   gasMainRuns works out what each length ought to be from the load it
   carries. That is right for a build and wrong for a check: the levels
   check re-sized the network from scratch every time and never looked
   at the pipe on the drawing, so "Make change" wrote a bigger size and
   the next run computed the same size again and reported the same
   pressures. The button appeared to do nothing.

   The engine was never the problem, which is why this checks the thing
   that was: a bigger bore must produce a smaller drop. */
{
  const kwToM3h = (kw) => kw * 3600 / 39500;
  const base = { source: "P", sourceMBar: 23, flowFor: (r) => kwToM3h(r.kw) };
  const at = (bore) => gasLevels({
    ...base,
    runs: [{
      id: "G1", fromNode: "P", endNode: "A1",
      metres: 300, services: 9, bore, kw: 110,
    }],
  }).legs[0];

  const small = at(52);
  const big = at(114);
  if (!(big.drop < small.drop)) fail("a bigger bore did not reduce the drop");
  if (!(big.at > small.at)) fail("a bigger bore did not raise the node pressure");
  /* And by a lot: drop goes as the fifth power of diameter, so this is
     not a rounding difference. Anything under a halving means the bore
     is not reaching the calculation. */
  if (!(big.drop < small.drop / 2)) {
    fail(`52mm to 114mm changed the drop only from ${small.drop.toFixed(3)} `
      + `to ${big.drop.toFixed(3)}`);
  }
}

/* The picker shows the size that is stored, whichever rule it came
   from.

   Gas_Pipe_Size holds one row per sizing rule, so 63mm appears several
   times. The picker keeps one row per bore; the build stores whichever
   row the load selected. Comparing ids meant the stored value matched
   no option, the browser fell back to the first, and every built main
   read "Sized by the build" however it had actually been sized.

   Matched on bore instead, which is what a pipe size is. */
{
  const all = [
    { Gas_Pipe_Size_ID: 1, Diameter_mm: 32, Max_kW: 40, Pressure_Tier: "LP" },
    { Gas_Pipe_Size_ID: 3, Diameter_mm: 63, Max_kW: 90, Pressure_Tier: "LP" },
    { Gas_Pipe_Size_ID: 4, Diameter_mm: 63, Max_kW: 120, Pressure_Tier: "LP" },
    { Gas_Pipe_Size_ID: 6, Diameter_mm: 90, Max_kW: 340, Pressure_Tier: "LP" },
  ];
  const byBore = new Map();
  for (const x of all) {
    const held = byBore.get(Number(x.Diameter_mm));
    if (!held || Number(x.Max_kW) > Number(held.Max_kW)) {
      byBore.set(Number(x.Diameter_mm), x);
    }
  }
  const choices = [...byBore.values()]
    .sort((a, b) => Number(a.Diameter_mm) - Number(b.Diameter_mm));

  const shown = (storedId) => {
    const stored = all.find((x) => Number(x.Gas_Pipe_Size_ID) === Number(storedId));
    if (!stored) return "";
    const match = choices
      .find((x) => Number(x.Diameter_mm) === Number(stored.Diameter_mm));
    return match ? Number(match.Diameter_mm) : "";
  };

  /* Both 63mm rules resolve to the one 63mm entry. This is the case
     that was broken: rule 3 is not in the list, and comparing ids gave
     nothing. */
  if (shown(3) !== 63) fail(`a main stored as rule 3 showed "${shown(3)}", wanted 63`);
  if (shown(4) !== 63) fail(`a main stored as rule 4 showed "${shown(4)}", wanted 63`);
  if (shown(6) !== 90) fail("a 90mm main did not show 90mm");
  /* An id that is no longer in the table falls back to the blank
     option, which is honest: nothing can be said about it. */
  if (shown(99) !== "") fail("an unknown pipe size resolved to something");
}

console.log(bad ? `\n${bad} problem(s)`
  : `Gas pressure behaves (${MODEL.length} real pipes, median `
    + `${median.toFixed(3)} of GASWorkS, worst ${worst.ratio.toFixed(3)}).`);
process.exit(bad ? 1 : 0);
