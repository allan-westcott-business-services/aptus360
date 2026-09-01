/* Load tapped along a leg counts on that leg.

   From the levels check on 2608_018: A36 to A39 is 100.7 m of 95 with
   seven plots along it and nothing beyond, and it reported 0 A and the
   same volt drop at A39 as at A36. A dead-end leg carrying seven
   customers dropped nothing.

   A meter's load sits in the model at its cut-out — the far end of its
   service spur, a node off the mains. cumulativeToNode walked the mains
   and read meterKva only at the nodes it passed, so a spur's load was
   never distributed on the leg it left. It was terminal load of the leg
   BEFORE (in cumKva at the previous span node) and then gone. Every leg
   was short by whatever teed off it; a dead-end leg by everything.

   Driven through the real model so the spurs are where the model puts
   them, not where this file imagines. */
import { buildFeederModel } from "./src/features/gis/feeder.js";
import { cumulativeToNode, ampsOf } from "./src/features/gis/voltDrop.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const lineTypes = [
  { Type_Key: "trench", Label: "Trench", Layer_Key: "trench" },
  { Type_Key: "service_trench", Label: "Service trench", Layer_Key: "trench" },
];
let id = 1;
const trench = (pts, key = "trench") => ({
  Feature_ID: id++, Feature_Type: "line", Layer_Key: "trench",
  Geometry: pts, Attributes: { Line_Type: key },
});
const plot = (n, at) => ({
  Feature_ID: id++, Feature_Role: "plot", Feature_Type: "point",
  Plot_ID: n, Geometry: [at], Attributes: {},
});
const meter = (p, at) => ({
  Feature_ID: id++, Feature_Role: "meter", Feature_Type: "point",
  Layer_Key: "electric", Plot_ID: p.Plot_ID, Geometry: [at],
  Attributes: { Seed_Feature_ID: p.Feature_ID, Circuit_ID: 1 },
});
const sub = {
  Feature_ID: id++, Feature_Role: "substation", Feature_Type: "point",
  Layer_Key: "electric", Geometry: [[0, 0]], Attributes: {},
};

/* E0 at 0, A36 at 100, A39 at 200: one plot beside A36 on the first
   leg, seven along the second, nothing beyond A39. Every plot 2.9 kVA. */
const KVA = 2.9;
const xs = [50, 110, 125, 140, 155, 170, 185, 195];
const plots = xs.map((x, i) => plot(100 + i, [x, 10]));
const features = [
  sub,
  trench([[0, 0], ...xs.map((x) => [x, 0]), [100, 0], [200, 0]]
    .sort((a, b) => a[0] - b[0])),
  ...xs.map((x) => trench([[x, 0], [x, 10]], "service_trench")),
  ...plots,
  ...plots.map((p) => meter(p, p.Geometry[0])),
];
const model = buildFeederModel(features, {
  lineTypes, plotById: () => ({ kva_load: KVA }),
});
if (model.error) { fail(`the model refused: ${model.error}`); }

const nearest = (x) => {
  let best = -1, d = Infinity;
  model.nodes.forEach((n, i) => {
    const dd = Math.hypot(n[0] - x, n[1]);
    if (dd < d) { d = dd; best = i; }
  });
  return best;
};
const a36 = nearest(100);
const a39 = nearest(200);
const cable = { Cable_Size_ID: 1, Loop_Impedance_Ohm: 0.6, Volt_Drop_Base: 1.1 };
const at = (targetIdx) => cumulativeToNode({
  model, targetIdx, cableById: () => cable, voltageV: 400,
  spanNodes: [{ index: a36, cableSizeId: 1 }, { index: a39, cableSizeId: 1 }],
  settings: { distributedLoadFactor: 0.5, jointEquivM: 3 },
});

/* The model's own view, as a sanity check on the fixture: seven plots
   beyond A36 (not eight — the first is beside it on the first leg) and
   nothing beyond A39. */
if (model.cum[a36] !== 7) fail(`${model.cum[a36]} plots beyond A36, expected 7`);
if (model.cum[a39] !== 0) fail(`${model.cum[a39]} plots beyond A39, expected 0`);

const vd36 = at(a36);
const vd39 = at(a39);

/* The reported fault: the same figure at both ends of a loaded leg. */
if (!(vd39.pctOwn > vd36.pctOwn + 1e-9)) {
  fail(`A39 reads ${vd39.pctOwn}% and A36 ${vd36.pctOwn}% \u2014 a hundred metres`
    + " carrying seven plots dropped nothing");
}

/* By the right amount: seven plots at 2.9 kVA, distributed, at half
   weight, over 100 m plus 21 m of joint allowance. */
const expect = 7 * KVA * 0.5 * (cable.Volt_Drop_Base * 1e-6) * (100 + 7 * 3);
if (Math.abs((vd39.pctOwn - vd36.pctOwn) - expect) > 1e-9) {
  fail(`the leg A36\u2192A39 drops ${(vd39.pctOwn - vd36.pctOwn).toFixed(6)}%,`
    + ` expected ${expect.toFixed(6)} (seven plots distributed at 0.5)`);
}

/* And the first leg: one plot beside it (distributed) and seven beyond
   (terminal), with one joint on it. */
const first = 1 * KVA * 0.5 * (cable.Volt_Drop_Base * 1e-6) * (100 + 3)
  + 7 * KVA * (cable.Volt_Drop_Base * 1e-6) * (100 + 3);
if (Math.abs(vd36.pctOwn - first) > 1e-9) {
  fail(`the leg E0\u2192A36 drops ${vd36.pctOwn.toFixed(6)}%, expected ${first.toFixed(6)}`);
}

/* Nothing counted twice: the plot beside A36 is on the first leg and
   not on the second, and the seven are on the second and not the
   first. The two legs' loads sum to the eight plots on the drawing. */
const legKva = (vd) => vd.pctOwn;
if (legKva(vd36) <= 0) fail("the first leg carried no load");

/* The current is the current in the cable arriving. E0→A36 carries all
   eight; A36→A39 carries the seven along it, and read 0 A on the page
   because the only figure was the load passing on THROUGH the far
   node — which at a dead end is nothing. That figure is still there
   as ampsThrough. */
if (Math.abs(vd36.amps - ampsOf(8 * KVA, 400)) > 1e-9) {
  fail(`the cable into A36 carries ${vd36.amps.toFixed(2)} A, expected ${ampsOf(8 * KVA, 400).toFixed(2)}`);
}
if (Math.abs(vd39.amps - ampsOf(7 * KVA, 400)) > 1e-9) {
  fail(`the cable into A39 carries ${vd39.amps.toFixed(2)} A, expected ${ampsOf(7 * KVA, 400).toFixed(2)}`);
}
if (Math.abs(vd36.ampsThrough - ampsOf(7 * KVA, 400)) > 1e-9) {
  fail("the load passing on through A36 is not the seven beyond it");
}
if (vd39.ampsThrough !== 0) fail("something passes on through a dead end");

console.log(bad ? `\n${bad} problem(s)`
  : "Load tapped along a leg is charged on that leg (spurs off the route are seen).");
process.exit(bad ? 1 : 0);
