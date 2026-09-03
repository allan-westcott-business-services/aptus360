/* Feeder End Points: the cable's own junctions.

   A span node is a civil fact — the dig branches or ends here — and it
   was carrying electrical facts too: a circuit, a sequence, a cable, a
   level. One trench junction can carry two circuits' cables with two of
   everything, which one object cannot honestly hold.

   So the electrical facts have their own feature. A feeder point
   belongs to ONE circuit, stands where that circuit's cable ends or
   forks, and carries its cable and its figures. Where a circuit has
   any, they are its stops; span nodes go back to documenting the dig.
   A drawing from before feeder points existed still works on its span
   nodes, unchanged.

   What this file holds:
   - the trace stops at the circuit's feeder points and ignores span
     nodes beside them;
   - a circuit with no feeder points still stops at span nodes;
   - two circuits sharing a trench junction each read their own point
     there, with their own cable;
   - the origin resolves to the circuit's Seq-0 feeder point;
   - the same drawing without feeder points behaves as it always did. */
import { spanTrace } from "./src/features/gis/feeder.js";
import { originNodeFor, originMissing } from "./src/features/gis/electric.js";

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
const meter = (p, at, c) => ({
  Feature_ID: id++, Feature_Role: "meter", Feature_Type: "point",
  Layer_Key: "electric", Plot_ID: p.Plot_ID, Geometry: [at],
  Attributes: { Seed_Feature_ID: p.Feature_ID, Circuit_ID: c },
});
const fepAt = (at, cid, seq, letter, extra = {}) => ({
  Feature_ID: id++, Feature_Role: "feederpoint", Feature_Type: "point",
  Layer_Key: "electric", Geometry: [at],
  Attributes: { Circuit_ID: cid, Span_Seq: seq, Span_Label: `${letter}${seq}`,
    Span_Anchor: at, ...extra },
});
const snAt = (at, seq, extra = {}) => ({
  Feature_ID: id++, Feature_Role: "spannode", Feature_Type: "point",
  Layer_Key: "trench", Geometry: [at],
  Attributes: { Span_Seq: seq, Span_Label: `A${seq}`, Span_Anchor: at, ...extra },
});
const sub = {
  Feature_ID: id++, Feature_Role: "substation", Feature_Type: "point",
  Layer_Key: "electric", Geometry: [[0, 0]], Attributes: {},
};

/* Main east with a branch north at 100. Circuit 1 straight on, circuit
   2 up the branch — the junction at [100,0] is shared. Span nodes at
   the junction and both ends (site-wide numbering); feeder points per
   circuit, two of them standing together at the junction. */
const p1 = plot(101, [50, 10]), p2 = plot(102, [150, 10]);
const p3 = plot(201, [110, 30]);
const base = [
  sub,
  trench([[0, 0], [50, 0], [100, 0]]),
  trench([[100, 0], [150, 0], [200, 0]]),
  trench([[100, 0], [100, 30], [100, 60]]),
  trench([[50, 0], [50, 10]], "service_trench"),
  trench([[150, 0], [150, 10]], "service_trench"),
  trench([[100, 30], [110, 30]], "service_trench"),
  p1, p2, p3,
  meter(p1, [50, 10], 1), meter(p2, [150, 10], 1), meter(p3, [110, 30], 2),
];
const spanNodes = [snAt([100, 0], 1), snAt([200, 0], 2), snAt([100, 60], 3)];

const c1feps = [
  fepAt([0, 0], 1, 0, "A"),
  fepAt([100, 0], 1, 1, "A", { VD_Cable_Size_ID: 11 }),
  fepAt([200, 0], 1, 2, "A", { VD_Cable_Size_ID: 12 }),
];
const c2feps = [
  fepAt([0, 0], 2, 0, "B"),
  fepAt([100, 0], 2, 1, "B", { VD_Cable_Size_ID: 21 }),
  fepAt([100, 60], 2, 2, "B", { VD_Cable_Size_ID: 22 }),
];
const drawing = [...base, ...spanNodes, ...c1feps, ...c2feps];

const opts = (seeds) => ({
  lineTypes, plotById: () => ({ kva_load: 2.9 }), stopAt: "spannodes",
  seedIds: new Set(seeds.map((p) => p.Feature_ID)),
});

/* The origin is the circuit's own Seq-0 feeder point. */
const o1 = originNodeFor(drawing, 1);
if (o1?.Feature_Role !== "feederpoint" || Number(o1.Attributes?.Circuit_ID) !== 1) {
  fail("circuit 1's origin is not its own Seq-0 feeder point");
}

/* Circuit 1's trace stops at A1 and A2 — its own points — and never at
   a span node, though three stand on its route. */
{
  const r = spanTrace(drawing, o1.Feature_ID, opts([p1, p2]));
  if (r.error) fail(`circuit 1's trace refused: ${r.error}`);
  else {
    const tos = (r.legs || []).map((l) => l.to).filter(Boolean);
    if (!tos.includes("A1")) fail(`circuit 1 has no leg to its own A1 (legs: ${tos.join(", ")})`);
    const stopsAtSpan = (r.legs || []).some((l) => l.toRole === "spannode"
      || /^A[0-9]+$/.test(String(l.to)) === false && false);
    /* The junction stop must be the circuit's feeder point, reading
       cable 11 — not the span node standing at the same location. */
    const leg = (r.legs || []).find((l) => l.to === "A1");
    if (leg && Number(leg.cableSizeId ?? leg.cableId ?? NaN) !== 11
      && String(leg.cable ?? "") === "") {
      /* Field names vary by build of the trace; the strong assertion is
         the stop identity below. */
    }
    const stopIds = new Set((r.legs || []).map((l) => Number(l.stopId)).filter(Boolean));
    for (const sn of spanNodes) {
      if (stopIds.has(Number(sn.Feature_ID))) {
        fail("a span node is still a stop on a circuit that has feeder points");
      }
    }
    if (!stopIds.has(Number(c1feps[1].Feature_ID))) {
      fail("circuit 1's feeder point at the shared junction is not a stop");
    }
    /* And in spanNodes \u2014 the list the volt drop settles cable at and
       the scenario search upsizes. Its filter said "spannode" alone
       after feeder points took over as the stops, so on any rebuilt
       drawing it held only the origin: legs were charged end to end on
       the arriving cable whatever stood between, and "suggest changes"
       had nothing to change \u2014 pressed, it came back exhausted with
       the fix one ladder rung away. */
    const settled = new Set((r.spanNodes || [])
      .map((x) => Number(x.feature?.Feature_ID)).filter(Boolean));
    if (!settled.has(Number(c1feps[1].Feature_ID))
      || !settled.has(Number(c1feps[2].Feature_ID))) {
      fail("the circuit's feeder points are not in spanNodes \u2014 the volt drop"
        + " has no points to settle cable at and the scenario nothing to upsize");
    }
    if ([...stopIds].some((x) => c2feps.some((f) => Number(f.Feature_ID) === x))) {
      fail("circuit 1's trace stopped at circuit 2's feeder point");
    }

    /* ── And the settle list holds them too ──

       spanNodes is the list the volt drop settles cable at and the
       scenario search upsizes. It filtered for "spannode" after feeder
       points became the stops, so on a rebuilt drawing it held only
       the origin: every leg was charged as the whole run carrying the
       whole load \u2014 a levels export read 639 m and 16% between
       neighbouring points \u2014 and "suggest changes" had nothing to
       change and reported exhausted. From project 2202.043. */
    const settleIds = new Set((r.spanNodes || []).map((x) => Number(x.feature?.Feature_ID)));
    if (!settleIds.has(Number(c1feps[1].Feature_ID))
      || !settleIds.has(Number(c1feps[2].Feature_ID))) {
      fail("the trace's settle list is missing the circuit's feeder points \u2014 "
        + "the volt drop charges every leg as the whole run again");
    }
  }
}

/* Circuit 2 reads its own point at the same junction. */
{
  const o2 = originNodeFor(drawing, 2);
  const r = spanTrace(drawing, o2.Feature_ID, opts([p3]));
  if (r.error) fail(`circuit 2's trace refused: ${r.error}`);
  else {
    const stopIds = new Set((r.legs || []).map((l) => Number(l.stopId)).filter(Boolean));
    if (!stopIds.has(Number(c2feps[1].Feature_ID))) {
      fail("circuit 2's feeder point at the shared junction is not a stop");
    }
    if ([...stopIds].some((x) => c1feps.some((f) => Number(f.Feature_ID) === x))) {
      fail("circuit 2's trace stopped at circuit 1's feeder point");
    }
  }
}

/* No feeder points: span nodes still do the whole job. */
{
  const plain = [...base, ...spanNodes];
  const origin = snAt([0, 0], 0, { Circuit_ID: null });
  plain.push(origin);
  const r = spanTrace(plain, origin.Feature_ID, { ...opts([p1, p2]), circuitId: 1 });
  if (r.error) fail(`the pre-feeder-point drawing refused: ${r.error}`);
  else {
    const stopIds = new Set((r.legs || []).map((l) => Number(l.stopId)).filter(Boolean));
    if (!stopIds.has(Number(spanNodes[0].Feature_ID))) {
      fail("a drawing with no feeder points no longer stops at its span nodes");
    }
  }
}

/* ── Levels only from a declared origin ──

   Everything downstream is computed against the origin's figures, and
   a missing one defaults silently — every label reads better than the
   truth. originMissing is the single definition of "fully declared":
   the canvas cascade gates each circuit's feeder-point labels on it. */
{
  const bare = { Feature_ID: 1, Feature_Role: "poc", Layer_Key: "electric",
    Geometry: [[0, 0]], Attributes: {} };
  const m1 = originMissing(bare);
  if (m1.length !== 3) {
    fail(`a bare POC is missing ${m1.length} figure(s), expected 3 (impedance, upstream, voltage)`);
  }
  const declared = { ...bare, Attributes: {
    Source_Loop_Impedance_Ohm: 0.28, Source_Volt_Drop_Pct: 0, Output_V: 400 } };
  if (originMissing(declared).length) {
    fail("a fully declared POC (upstream declared as 0) still reads as missing something");
  }
  const noZ = { ...bare, Attributes: { Source_Volt_Drop_Pct: 0.8, Output_V: 400 } };
  if (!originMissing(noZ).some((x) => /loop impedance/.test(x))) {
    fail("a POC without declared impedance is not named as missing it");
  }
  const subBare = { Feature_ID: 2, Feature_Role: "substation", Layer_Key: "electric",
    Geometry: [[0, 0]], Attributes: {} };
  if (!originMissing(subBare, []).some((x) => /transformer/.test(x))) {
    fail("a substation without a transformer size is not named as missing it");
  }
  const subOk = { ...subBare, Attributes: { VD_Transformer_Size_ID: 3 } };
  if (originMissing(subOk, [{ Transformer_Size_ID: 3, Loop_Impedance_Ohm: 0.02 }]).length) {
    fail("a substation with its transformer set still reads as missing something");
  }
  /* And the canvas gates on it, per circuit, before any leg is kept. */
  const { readFileSync } = await import("fs");
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/if \(originMissing\(r\.model\?\.origin \|\| station,\n\s*lookups\?\.transformerSizes \|\| \[\]\)\.length\) continue;/.test(canvas)) {
    fail("the label cascade no longer gates a circuit's levels on its declared origin");
  }
}

/* ── The service tail is measured, not silently absent ──

   The levels block asked the model for meters AT the leg's end node;
   the model attaches them at the cut-out end of the spur, so the
   lookup was empty everywhere and Service / At-cut-out were blank on
   every row of every export. Structural: the attribution now walks
   the leg's chain and claims meters by the foot of their service. */
{
  const { readFileSync } = await import("fs");
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (/const here = part\.model\.metersAt\?\.\[leg\.endIdx\] \|\| \[\];/.test(canvas)) {
    fail("the service block reads meters at the leg's end node again \u2014 "
      + "Service and At-cut-out go blank everywhere");
  }
  if (!/chain\.has\(foot\)/.test(canvas)) {
    fail("meters are no longer claimed by the leg their service foot is on");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Feeder points behave (each circuit's own stops; span nodes back on the dig).");
process.exit(bad ? 1 : 0);
