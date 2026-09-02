/* Two electric POCs, each serving its own self-contained network.

   The drawing this exists for: a site fed from two points of connection
   in different roads, the networks never meeting, each POC carrying its
   own declared source figures. Electric used to refuse the second POC
   because every electric walk assumed one origin.

   What must hold:
   - the model roots each circuit at the origin on its OWN network,
     chosen by the trench component the circuit's seeds stand on, not by
     which POC is nearer or first;
   - the model hands back which origin it chose, so source impedance and
     the declared upstream drop are read off the right POC;
   - the circuit report measures each meter from the origin that reaches
     it, and none is called unreachable for being on the second network;
   - two POCs standing on ONE network is refused by name;
   - a substation sharing a network with a POC is still the ordinary
     incomer arrangement, not an error, and the substation wins. */
import { buildFeederModel, feederSections, trenchComponents } from "./src/features/gis/feeder.js";
import { circuitReport, lvOrigins, lvOrigin } from "./src/features/gis/electric.js";

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
const meter = (p, at, circuitId) => ({
  Feature_ID: id++, Feature_Role: "meter", Feature_Type: "point",
  Layer_Key: "electric", Plot_ID: p.Plot_ID, Geometry: [at],
  Attributes: { Seed_Feature_ID: p.Feature_ID, Circuit_ID: circuitId },
});
const poc = (at, label) => ({
  Feature_ID: id++, Feature_Role: "poc", Feature_Type: "point",
  Layer_Key: "electric", Label: label, Geometry: [at],
  Attributes: { Source_Volt_Drop_Pct: label === "POC East" ? 1.2 : 0.4 },
});

/* Two roads. West network: trench 0\u2192100 east from POC A at [0,0].
   East network: trench 300\u2192400, POC B at [400,0] \u2014 at its FAR end, so
   west plots are nearer POC B's trench than... no: so that plot 201's
   seed at [310,10] is geometrically NEARER POC A's trench end [100,0]
   than POC B is to it? [310,10] to POC A at [0,0] is 310; to POC B at
   [400,0] is 90. Make the point about components differently: put POC B
   at [400,0] and plot 202 at [390,10] \u2014 nothing ambiguous \u2014 and plot
   201 at [310,10], which is 210 from POC A's trench end and 90 from
   POC B: components decide, and here nearness agrees. The stronger
   case \u2014 nearness disagreeing with the network \u2014 is covered by seeds:
   plot 102 sits at [95,10], only 5 m from the west trench end but its
   circuit is west's, while the east trench starts 200 m away. */
const pA = poc([0, 0], "POC West");
const pB = poc([400, 0], "POC East");
const p101 = plot(101, [50, 10]);
const p102 = plot(102, [95, 10]);
const p201 = plot(201, [310, 10]);
const p202 = plot(202, [390, 10]);
const features = [
  pA, pB,
  trench([[0, 0], [50, 0], [95, 0], [100, 0]]),
  trench([[300, 0], [310, 0], [390, 0], [400, 0]]),
  trench([[50, 0], [50, 10]], "service_trench"),
  trench([[95, 0], [95, 10]], "service_trench"),
  trench([[310, 0], [310, 10]], "service_trench"),
  trench([[390, 0], [390, 10]], "service_trench"),
  p101, p102, p201, p202,
  meter(p101, [50, 10], 1),
  meter(p102, [95, 10], 1),
  meter(p201, [310, 10], 2),
  meter(p202, [390, 10], 2),
];

/* lvOrigins lists both, lvOrigin still answers the first. */
if (lvOrigins(features).length !== 2) fail("lvOrigins does not list both POCs");
if (lvOrigin(features) !== pA) fail("lvOrigin no longer answers the first origin");

/* Each circuit roots at its own POC, and the model says which. */
const m1 = buildFeederModel(features, {
  lineTypes, seedIds: new Set([p101.Feature_ID, p102.Feature_ID]),
});
const m2 = buildFeederModel(features, {
  lineTypes, seedIds: new Set([p201.Feature_ID, p202.Feature_ID]),
});
if (m1.error) fail(`circuit 1 refused: ${m1.error}`);
else if (m1.origin !== pA) fail("circuit 1 did not root at POC West");
if (m2.error) fail(`circuit 2 refused: ${m2.error}`);
else if (m2.origin !== pB) {
  fail("circuit 2 did not root at POC East \u2014 the origin was not chosen by "
    + "the network the circuit stands on");
}

/* The router draws each circuit from its own end of the site. */
const r2 = feederSections(features, {
  lineTypes, seedIds: new Set([p201.Feature_ID, p202.Feature_ID]),
});
if (r2.error) fail(`the router refused circuit 2: ${r2.error}`);
else {
  const starts = r2.sections.map((sec) => sec.pts[0]);
  if (!starts.every((q) => Math.hypot(q[0] - 400, q[1]) < 1)) {
    fail("circuit 2's runs do not start at POC East");
  }
}

/* The report reaches every meter, each measured from its own origin. */
const rep = circuitReport(features, { plotById: (pid) => ({ kva_load: 2.5, plot_number: pid }) });
if (rep.error) fail(`the report refused: ${rep.error}`);
else {
  const all = (rep.circuits || []).flatMap((c) => c.meters);
  const unreachable = rep.unreachable || [];
  if (unreachable.length) {
    fail(`${unreachable.length} meter(s) unreachable on a drawing where every`
      + " meter stands on a network with its own POC");
  }
  const d201 = all.find((m) => Number(m.plot) === 201)?.distM;
  if (d201 == null) fail("plot 201 has no distance");
  else if (Math.abs(d201 - 100) > 1) {
    fail(`plot 201 reads ${d201} m \u2014 measured from the wrong origin `
      + "(90+10 m from POC East is right; 310 m would be POC West)");
  }
  const lab = all.find((m) => Number(m.plot) === 201)?.originLabel;
  if (lab !== "POC East") fail(`plot 201's origin label reads "${lab}", wanted "POC East"`);
}

/* Two POCs on one network is refused by name. */
{
  const joined = features.concat([trench([[100, 0], [300, 0]])]);
  const r = buildFeederModel(joined, {
    lineTypes, seedIds: new Set([p101.Feature_ID, p102.Feature_ID]),
  });
  if (!r.error) fail("two POCs on one joined network were not refused");
  else if (!/same trench network/.test(r.error)) {
    fail(`the refusal does not say what is wrong: "${r.error}"`);
  }
}

/* A substation beside a POC on one network: the ordinary incomer
   arrangement, substation wins, no error. */
{
  const sub = { Feature_ID: id++, Feature_Role: "substation", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[0, 0]], Attributes: {} };
  const one = [sub, pA,
    trench([[0, 0], [50, 0], [100, 0]]),
    trench([[50, 0], [50, 10]], "service_trench"),
    p101, meter(p101, [50, 10], 1)];
  const r = buildFeederModel(one, { lineTypes, seedIds: new Set([p101.Feature_ID]) });
  if (r.error) fail(`a substation with its incomer POC was refused: ${r.error}`);
  else if (r.origin !== sub) fail("the substation did not win over the POC beside it");
}

/* The trench health calls both pieces connected \u2014 neither is an orphan
   to be joined to the other. */
{
  const t = trenchComponents(features, { lineTypes });
  if ((t.orphans || []).length) {
    fail("the second POC's network is reported as an orphan to be joined up");
  }
  if (!(t.groups || []).every((g) => g.hasOrigin)) {
    fail("a piece holding its own POC is not marked as having an origin");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Two electric POCs behave (each network rooted, measured and sourced from its own).");
process.exit(bad ? 1 : 0);
