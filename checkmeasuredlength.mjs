/* A measured length overrides the drawing, everywhere length means run.

   ── Its own attribute ──

   This was `Length_m`, which `gis_length_trg` maintains from the
   geometry on every change. So every line arrived carrying a "measured"
   length equal to its drawn length: the label said "299.8 m entered"
   about a figure nobody had entered, the panel announced that
   calculations read 299.8 m instead of the drawn 299.8 m, and a real
   measurement would have been overwritten by the next drag.

   `Measured_Length_m` is written by a person and by nothing else, so
   its presence means what it says. `Length_m` goes back to being the
   trigger's mirror of the drawing, which the bill of materials reads in
   SQL and which nothing in the client reads at all.

   The plan is flat and the run is not: a duct that rises and falls, a
   trench dug round an obstruction, slack the drawing cannot show.
   Measured_Length_m on a line says what the run really is, and every calculation
   that means "how far does the electricity travel" reads it — scaled
   along the line, so a tee half way along the drawing is half way along
   the measurement. Everything that means "how near is this thing"
   keeps reading the geometry, because a measured length does not move
   the trench.

   Readers checked here: the feeder model's edges (and through them the
   volt drop and the trace legs), the circuit-report distances, and the
   service tails. The gas network has honoured the same attribute since
   its metres were first read (gasNetwork.js). */
import { readFileSync } from "node:fs";
import { buildFeederModel, spanTrace } from "./src/features/gis/feeder.js";
import { cumulativeToNode } from "./src/features/gis/voltDrop.js";
import { distancesFrom } from "./src/features/gis/electric.js";
import { serviceFor } from "./src/features/gis/routing.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const lineTypes = [
  { Type_Key: "trench", Label: "Trench", Layer_Key: "trench" },
  { Type_Key: "service_trench", Label: "Service trench", Layer_Key: "trench" },
];
let id = 1;
const trench = (pts, key = "trench", extra = {}) => ({
  Feature_ID: id++, Feature_Type: "line", Layer_Key: "trench",
  Geometry: pts, Attributes: { Line_Type: key, ...extra },
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

/* One trench drawn 100 m but measured 150; the plot tees at its middle,
   which is 50 m on the plan and must be 75 m on the measurement. A
   span node at the end for the trace and the drop. */
const p1 = plot(101, [50, 10]);
const drawing = [
  sub,
  trench([[0, 0], [50, 0], [100, 0]], "trench", { Measured_Length_m: 150 }),
  trench([[50, 0], [50, 10]], "service_trench"),
  p1,
  meter(p1, [50, 10]),
  { Feature_ID: id++, Feature_Role: "spannode", Feature_Type: "point",
    Layer_Key: "trench", Geometry: [[100, 0]],
    Attributes: { Span_Label: "A1", Span_Seq: 1, Circuit_ID: 1, Span_Anchor: [100, 0] } },
];

/* The model's edges carry the measurement, scaled along the line. */
const model = buildFeederModel(drawing, {
  lineTypes, plotById: () => ({ kva_load: 2.9 }),
});
if (model.error) fail(`the model refused: ${model.error}`);
else {
  const at = (p) => {
    let best = -1, d = Infinity;
    model.nodes.forEach((n, i) => {
      const dd = Math.hypot(n[0] - p[0], n[1] - p[1]);
      if (dd < d) { d = dd; best = i; }
    });
    return best;
  };
  const n0 = at([0, 0]), n50 = at([50, 0]), n100 = at([100, 0]);
  if (Math.abs(model.mBetween(n0, n50) - 75) > 0.01) {
    fail(`the first half reads ${model.mBetween(n0, n50)} m, wanted 75 — the tee`
      + " half way along the drawing is not half way along the measurement");
  }
  if (Math.abs(model.mBetween(n50, n100) - 75) > 0.01) {
    fail(`the second half reads ${model.mBetween(n50, n100)} m, wanted 75`);
  }
  /* Nearness stayed geometric: the node positions did not move. */
  if (Math.abs(model.nodes[n100][0] - 100) > 0.01) {
    fail("a measured length moved the trench");
  }

  /* The volt drop runs on 150 m. Terminal-only settings so the sum is
     the one a hand can check: 2.9 kVA × base × 150 m. */
  const cable = { Cable_Size_ID: 1, Loop_Impedance_Ohm: 0.6, Volt_Drop_Base: 191 };
  const vd = cumulativeToNode({
    model, targetIdx: n100, cableById: () => cable, voltageV: 400,
    spanNodes: [{ index: n100, cableSizeId: 1 }],
    settings: { distributedLoadFactor: 1, jointEquivM: 0 },
  });
  const want = 2.9 * 1 * (191e-6) * 150;
  if (Math.abs(vd.pctOwn - want) > 1e-9) {
    fail(`the drop reads ${vd.pctOwn.toFixed(6)}%, wanted ${want.toFixed(6)}`
      + " — 150 measured metres, load tapped at the middle");
  }
  if (Math.abs(vd.ohms - (150 / 1000) * 0.6) > 1e-9) {
    fail(`the loop reads ${vd.ohms.toFixed(4)} Ω, wanted ${(0.09).toFixed(4)}`);
  }
}

/* The trace's legs say 150 m too. */
{
  const origin = { Feature_ID: id++, Feature_Role: "spannode", Feature_Type: "point",
    Layer_Key: "trench", Geometry: [[0, 0]],
    Attributes: { Span_Label: "E0", Span_Seq: 0, Circuit_ID: 1, Span_Anchor: [0, 0] } };
  const r = spanTrace([...drawing, origin], origin.Feature_ID, {
    lineTypes, plotById: () => ({ kva_load: 2.9 }), stopAt: "spannodes",
  });
  if (r.error) fail(`the trace refused: ${r.error}`);
  else {
    const leg = (r.legs || []).find((l) => l.to === "A1");
    if (!leg) fail("no leg to A1");
    else if (Math.abs(leg.metres - 150) > 0.1) {
      fail(`the leg to A1 reads ${leg.metres} m, wanted the measured 150`);
    }
  }
}

/* The circuit-report distances already honoured it; held so it stays. */
{
  const d = distancesFrom(drawing, sub.Feature_ID);
  const m = drawing.find((f) => f.Feature_Role === "meter");
  if (Math.abs(d.get(Number(m.Feature_ID)) - 85) > 0.1) {
    fail(`the meter reads ${d.get(Number(m.Feature_ID))} m from the substation,`
      + " wanted 85 — 75 along the measured main and 10 up the service");
  }
}

/* A service with a measured length charges its tail on it. */
{
  const svc = { Feature_ID: id++, Feature_Type: "line", Layer_Key: "trench",
    Geometry: [[50, 0], [50, 10]], Attributes: { Line_Type: "service_trench", Measured_Length_m: 18 } };
  const main = { Feature_ID: id++, Feature_Type: "line", Layer_Key: "trench",
    Geometry: [[0, 0], [100, 0]], Attributes: { Line_Type: "trench" } };
  const m = { Feature_ID: id++, Feature_Role: "meter", Geometry: [[50, 10]], Attributes: {} };
  const found = serviceFor(m, [svc], [main], { attachM: 2 });
  if (!found) fail("the tail's service was not found at all");
  else if (Math.abs(found.serviceM - 18) > 0.01) {
    fail(`the tail reads ${found.serviceM} m, wanted the measured 18`);
  }
}

/* No measurement, no change: the same drawing without Measured_Length_m reads
   the drawn hundred. */
{
  const plain = drawing.map((f) => (f.Attributes?.Measured_Length_m
    ? { ...f, Attributes: { ...f.Attributes, Measured_Length_m: null } } : f));
  const m2 = buildFeederModel(plain, { lineTypes, plotById: () => ({ kva_load: 2.9 }) });
  const at = (p) => {
    let best = -1, d = Infinity;
    m2.nodes.forEach((n, i) => {
      const dd = Math.hypot(n[0] - p[0], n[1] - p[1]);
      if (dd < d) { d = dd; best = i; }
    });
    return best;
  };
  if (Math.abs(m2.mBetween(at([0, 0]), at([50, 0])) - 50) > 0.01) {
    fail("with no measurement entered, the drawn length is no longer the answer");
  }
}

/* And nothing in the GIS client reads Length_m any more. Leaving one
   reader behind would put a line's calculations back on a figure the
   database rewrites underneath them. */
{
  const files = [
    "GISCanvasPage.jsx", "FeatureEditor.jsx", "electric.js", "feeder.js",
    "routing.js", "gasNetwork.js", "waterNetwork.js",
  ];
  for (const f of files) {
    const src = readFileSync(`./src/features/gis/${f}`, "utf8");
    /* In code, not in the comments that explain why it is not read. */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
    if (/Attributes\??\.?\??\.Length_m/.test(code)) {
      fail(`${f} still reads Length_m, which the trigger rewrites from the `
        + "geometry");
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Measured lengths behave (the run is charged, the drawing does not move).");
process.exit(bad ? 1 : 0);
