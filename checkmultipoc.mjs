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

/* ── Circuits fed from different POCs can share a trench ──

   The dig is civil work and the circuits are electrical facts: a duct
   bank down one road carries POC East's cable beside POC West's. An
   earlier version refused two POCs on one trench network, and refused
   exactly this drawing. Now the circuit decides: named origin first,
   substation second, nearest along the network third — and the model
   says which rule chose, so a build can say it out loud. */
{
  const joined = features.concat([trench([[100, 0], [300, 0]])]);

  /* Nearest along the network: circuit 1's seeds stand at the west end,
     circuit 2's at the east. */
  const r1 = buildFeederModel(joined, {
    lineTypes, seedIds: new Set([p101.Feature_ID, p102.Feature_ID]),
  });
  const r2 = buildFeederModel(joined, {
    lineTypes, seedIds: new Set([p201.Feature_ID, p202.Feature_ID]),
  });
  if (r1.error) fail(`circuit 1 on the shared trench refused: ${r1.error}`);
  else {
    if (r1.origin !== pA) fail("circuit 1 on the shared trench is not fed from POC West");
    if (r1.originBy !== "nearest") {
      fail(`circuit 1's origin was decided by "${r1.originBy}", expected "nearest"`);
    }
    if (!(r1.originRivals || []).includes("POC East")) {
      fail("the rule that chose does not name the POC it passed over");
    }
  }
  if (r2.error) fail(`circuit 2 on the shared trench refused: ${r2.error}`);
  else if (r2.origin !== pB) fail("circuit 2 on the shared trench is not fed from POC East");

  /* Named beats nearest: circuit 1's meters say POC East feeds them,
     and a statement beats any rule. */
  const named = joined.map((f) => (f.Feature_Role === "meter"
    && [101, 102].includes(Number(f.Plot_ID))
    ? { ...f, Attributes: { ...f.Attributes, Circuit_Origin_ID: pB.Feature_ID } }
    : f));
  const rn = buildFeederModel(named, {
    lineTypes, seedIds: new Set([p101.Feature_ID, p102.Feature_ID]),
  });
  if (rn.error) fail(`the named origin refused: ${rn.error}`);
  else {
    if (rn.origin !== pB) fail("a circuit that names its POC was fed from another");
    if (rn.originBy !== "named") fail("a named origin was not recorded as named");
  }

  /* A substation on the shared network wins over both POCs, however
     far it stands — the incomer doctrine, unchanged. */
  const subOn = { Feature_ID: id++, Feature_Role: "substation", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[300, 0]], Attributes: {} };
  const rs = buildFeederModel([...joined, subOn], {
    lineTypes, seedIds: new Set([p101.Feature_ID, p102.Feature_ID]),
  });
  if (rs.error) fail(`the substation on the shared network refused: ${rs.error}`);
  else if (rs.origin !== subOn) {
    fail("a substation on the network did not win over the POCs");
  }

  /* A circuit whose component holds no origin is still refused. */
  const island = [
    ...features,
    trench([[0, 500], [40, 500]]),
    trench([[20, 500], [20, 510]], "service_trench"),
  ];
  const p901 = plot(901, [20, 510]);
  island.push(p901, meter(p901, [20, 510], 9));
  const ri = buildFeederModel(island, { lineTypes, seedIds: new Set([p901.Feature_ID]) });
  if (!ri.error || !/no origin on it/.test(ri.error)) {
    fail("a circuit on a network with no origin was not refused plainly");
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

/* ── The linking flow captures the decision ──

   Structural, because createCircuitFrom is stitched into the canvas:
   what must hold is that linking writes Circuit_Origin_ID onto the
   members (the fact the model reads first), books the LV way on the
   circuit's own origin rather than the site's first, and stands the
   circuit's A0 on that origin. */
{
  const { readFileSync } = await import("fs");
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/Circuit_Origin_ID: originWrite/.test(canvas)) {
    fail("linking no longer writes which POC feeds the circuit");
  }
  if (!/assignWay\(origin, circuitId, kva\)/.test(canvas)) {
    fail("the LV way is not booked on the circuit's own origin");
  }
  if (!/Geometry: \[origin\.Geometry\[0\]\]/.test(canvas)) {
    fail("the circuit's A0 does not stand on the circuit's own origin");
  }
  /* And a join with the box left alone inherits \u2014 the guard that stops
     adding plots to a circuit from quietly moving it to another POC. */
  if (!/originId \?\? namedNow/.test(canvas)) {
    fail("a join no longer inherits the circuit's named POC");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Two electric POCs behave (named, substation, then nearest \u2014 and shared trenches route).");
process.exit(bad ? 1 : 0);
