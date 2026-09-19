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
import { calcSheetRows } from "./src/features/gis/calcSheetRows.js";

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
    /* `stops`, not `spanNodes`.

       cumulativeToNode's parameter was renamed when feeder points
       took over from span nodes — "a span node belongs to the trench,
       a feeder point to the cable", as voltDrop.js puts it. This case
       kept the old name, so it passed NO stops, no cable was applied,
       and the drop came back 0.000000% against a wanted 0.083085.

       It has been one of the suite's standing failures ever since,
       reported as "the calculation ignores measured lengths" when the
       calculation had honoured them all along. A stale check is worse
       than no check: it spends somebody's attention every run and
       accuses working code. */
    stops: [{ index: n100, cableSizeId: 1 }],
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

/* ── A length measured on the CABLE, not on the trench ──

   The editor offers the measured-length box on every line and its
   note promises that "the levels, distances and tails use that
   figure instead". The model is built on the dig, so only trenches
   were read: a designer who measured a cable run, typed 100 against
   a cable drawn at 11.15 and watched Run Levels Check go on
   reporting 11.15 was reading a promise the code did not keep.

   The measurement goes into the MODEL rather than into the table, so
   the volt drop, the loop impedance and the printed length are one
   figure. A length shown in a table that its own calculation does
   not use is worse than a wrong length — it is two answers with
   nothing to say which is which. */
{
  const cp = plot(202, [50, 10]);
  const cableDrawing = [
    sub,
    trench([[0, 0], [50, 0], [100, 0]], "trench"),
    trench([[50, 0], [50, 10]], "service_trench"),
    cp,
    meter(cp, [50, 10]),
    { Feature_ID: id++, Feature_Type: "line", Layer_Key: "electric",
      Label: "A1", Feature_Role: "shape",
      Geometry: [[0, 0], [50, 0], [100, 0]],
      Attributes: { Line_Type: "elec_main", Circuit_ID: 1,
        Measured_Length_m: 150 } },
    { Feature_ID: id++, Feature_Role: "spannode", Feature_Type: "point",
      Layer_Key: "trench", Geometry: [[100, 0]],
      Attributes: { Span_Label: "A1", Span_Seq: 1, Circuit_ID: 1,
        Span_Anchor: [100, 0] } },
  ];
  const m3 = buildFeederModel(cableDrawing, { lineTypes, plotById: () => ({ kva_load: 2.9 }) });
  if (m3.error) fail(`the model refused a measured cable: ${m3.error}`);
  else {
    const at = (p) => {
      let best = -1; let d = Infinity;
      m3.nodes.forEach((n, i) => {
        const dd = Math.hypot(n[0] - p[0], n[1] - p[1]);
        if (dd < d) { d = dd; best = i; }
      });
      return best;
    };
    /* The dig is the dig. A cable measured at 150 over 100 m of
       trench leaves the trench reading 100 — the cable's figure is
       charged by the leg, not by the graph. */
    const first = m3.mBetween(at([0, 0]), at([50, 0]));
    const second = m3.mBetween(at([50, 0]), at([100, 0]));
    if (Math.abs(first + second - 100) > 0.01) {
      fail(`the dig reads ${first + second} m under a cable measured at 150 `
        + "\u2014 a cable's measurement must not move the trench graph");
    }
    /* And the node did not move: a measured length changes how far
       the electricity travels, not where the cable is drawn. */
    if (Math.abs(m3.nodes[at([100, 0])][0] - 100) > 0.01) {
      fail("a cable measurement moved the drawing");
    }
  }

  /* ── A cable's length is not its trench's ──

     The measurement is NOT pushed into the model any more, and the
     model is the dig. Two attempts were made and each failed in its
     own way: matching cable segments to trench edges covered only the
     segments that happened to be one edge, and matching by geometry
     swept up the service stubs and the tail past the last plot. Two
     polylines over one route are not the same length.

     So the model keeps measuring the dig, and `spanTrace` charges
     each leg the run of the cable covering it. Asserted the other way
     round here on purpose: a cable measurement that HAS moved the
     model is the old architecture coming back. */
  const m5 = buildFeederModel(cableDrawing, { lineTypes, plotById: () => ({ kva_load: 2.9 }) });
  if (!m5.error) {
    const at = (p) => {
      let best = -1; let d = Infinity;
      m5.nodes.forEach((n, i) => {
        const dd = Math.hypot(n[0] - p[0], n[1] - p[1]);
        if (dd < d) { d = dd; best = i; }
      });
      return best;
    };
    const dig = m5.mBetween(at([0, 0]), at([50, 0]))
      + m5.mBetween(at([50, 0]), at([100, 0]));
    if (Math.abs(dig - 100) > 0.01) {
      fail(`the dig reads ${dig} m with a cable measured at 150 over it \u2014 `
        + "a cable's measurement must not move the trench graph, which is "
        + "what routing, nearness and the dig rates all read");
    }
  }

  /* A cable drawn off its trench must not add a node. Interning its
     vertices here would put a junction in the routing graph that no
     trench dug, and the router could route through it. */
  const op = plot(203, [50, 10]);
  const offDig = [
    sub,
    trench([[0, 0], [50, 0], [100, 0]], "trench"),
    trench([[50, 0], [50, 10]], "service_trench"),
    op,
    meter(op, [50, 10]),
    { Feature_ID: id++, Feature_Type: "line", Layer_Key: "electric",
      Feature_Role: "shape", Geometry: [[0, 40], [100, 40]],
      Attributes: { Line_Type: "elec_main", Measured_Length_m: 150 } },
  ];
  const m4 = buildFeederModel(offDig, { lineTypes, plotById: () => ({ kva_load: 2.9 }) });
  if (!m4.error && m4.nodes.some((n) => Math.abs(n[1] - 40) < 0.01)) {
    fail("a cable drawn off its trench added nodes to the routing graph");
  }
}

/* The trace's legs say 150 m too, and say which figure they are. */
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
    } else {
      /* The drawn figure carried beside it, and flagged, so the table
         can say a row does not scale off the drawing rather than
         leaving somebody to wonder. */
      if (Math.abs(leg.drawnMetres - 100) > 0.1) {
        fail(`the leg reports ${leg.drawnMetres} m drawn, wanted 100`);
      }
      if (!leg.measured) {
        fail("the leg does not say it is running on a measurement, so the "
          + "table cannot tell one row from another");
      }
    }
  }
}

/* ── The leg charges the cable, not the dig ──

   The point of the whole thing. A leg whose cable is measured
   charges the measurement; a leg whose cable is not charges the
   cable's own drawn length, INCLUDING the tail past the last plot
   that the trench under it does not reach. On project 16 that tail
   is the 15.2 m between 565.4 m of trench and 580.6 m of cable, and
   the volt drop never counted it. */
{
  const tp = plot(301, [50, 10]);
  const withCable = [
    sub,
    trench([[0, 0], [50, 0], [100, 0]], "trench"),
    trench([[50, 0], [50, 10]], "service_trench"),
    tp,
    meter(tp, [50, 10]),
    { Feature_ID: id++, Feature_Type: "line", Layer_Key: "electric",
      Feature_Role: "shape", Label: "A1",
      /* Runs the length of the dig and then 20 m past the last plot
         to the point at the end \u2014 which is the ordinary shape of a
         spur, not an oddity. */
      Geometry: [[0, 0], [50, 0], [100, 0], [120, 0]],
      Attributes: { Line_Type: "elec_main", Circuit_ID: 1 } },
    { Feature_ID: id++, Feature_Role: "spannode", Feature_Type: "point",
      Layer_Key: "trench", Geometry: [[100, 0]],
      Attributes: { Span_Label: "A1", Span_Seq: 1, Circuit_ID: 1,
        Span_Anchor: [100, 0] } },
    { Feature_ID: id++, Feature_Role: "spannode", Feature_Type: "point",
      Layer_Key: "trench", Geometry: [[0, 0]],
      Attributes: { Span_Label: "E0", Span_Seq: 0, Circuit_ID: 1,
        Span_Anchor: [0, 0] } },
  ];
  const origin = withCable[withCable.length - 1];
  const r = spanTrace(withCable, origin.Feature_ID, {
    lineTypes, plotById: () => ({ kva_load: 2.9 }), stopAt: "spannodes",
  });
  if (r.error) fail(`the trace refused: ${r.error}`);
  else {
    const leg = (r.legs || []).find((l) => l.to === "A1");
    if (!leg) fail("no leg to A1");
    else {
      if (Math.abs(leg.metres - 120) > 0.1) {
        fail(`the leg charges ${leg.metres} m where its cable runs 120 \u2014 the `
          + "dig under it stops at 100, and the 20 m past the last plot is "
          + "cable that carries load and drops volts");
      }
      if (Math.abs(leg.trenchMetres - 100) > 0.1) {
        fail(`the dig under the leg reads ${leg.trenchMetres} m, wanted 100 \u2014 `
          + "kept beside the charged figure so the two can be compared");
      }
    }

    /* And the volt drop is computed on the same 120, not on the 100
       the model measures: a table saying one length with a percentage
       beside it worked out on another is the worst of the three. */
    const cable = { Cable_Size_ID: 1, Loop_Impedance_Ohm: 0.6, Volt_Drop_Base: 191 };
    const stop = (r.stops || []).find((x) => x.feature?.Attributes?.Span_Label === "A1");
    if (!stop) fail("the trace hands back no stop for A1");
    else {
      if (!(Number(stop.metres) > 0)) {
        fail("the stop does not carry its leg's run, so the volt drop falls "
          + "back to re-measuring the dig");
      }
      const vd = cumulativeToNode({
        model: r.model, targetIdx: stop.index, stops: r.stops,
        cableById: () => cable, voltageV: 400,
        settings: { distributedLoadFactor: 1, jointEquivM: 0 },
      });
      if (Math.abs(vd.ohms - (120 / 1000) * 0.6) > 1e-6) {
        fail(`the loop reads ${vd.ohms.toFixed(4)} \u03a9, wanted `
          + `${((120 / 1000) * 0.6).toFixed(4)} \u2014 120 m of cable, not the `
          + "100 m of trench under it");
      }
    }
  }
}

/* ── The sheet and the check agree about one cable ──

   The Aptus Calc Sheet reads a length per leg and so does Run Levels
   Check, and they are two readers of one fact. They agree today:
   569.2 m each, leg for leg, on project 16. Pinned because the way
   they could drift is silent — each reads its own way to the same
   cable, and a submission disagreeing with the check behind it is the
   worst of the three possible faults.

   The same fixture as the case above, so the tail is in it. */
{
  const tp = plot(302, [50, 10]);
  const both = [
    sub,
    trench([[0, 0], [50, 0], [100, 0]], "trench"),
    trench([[50, 0], [50, 10]], "service_trench"),
    tp,
    meter(tp, [50, 10]),
    { Feature_ID: id++, Feature_Type: "line", Layer_Key: "electric",
      Feature_Role: "shape", Label: "A1",
      Geometry: [[0, 0], [50, 0], [100, 0], [120, 0]],
      Attributes: { Line_Type: "elec_main", Circuit_ID: 1, Meters: 1,
        /* What the database trigger keeps from the geometry. Set
           wrong on purpose: a reader that takes this instead of the
           run is reading a figure the trigger rewrites on every
           drag. */
        Length_m: 999 } },
    { Feature_ID: id++, Feature_Role: "feederpoint", Feature_Type: "point",
      Layer_Key: "electric", Geometry: [[120, 0]],
      Attributes: { Span_Label: "A1", Span_Seq: 1, Circuit_ID: 1,
        Span_Anchor: [120, 0] } },
    { Feature_ID: id++, Feature_Role: "feederpoint", Feature_Type: "point",
      Layer_Key: "electric", Geometry: [[0, 0]],
      Attributes: { Span_Label: "A0", Span_Seq: 0, Circuit_ID: 1,
        Span_Kind: "origin", Span_Anchor: [0, 0] } },
  ];
  const sheet = calcSheetRows({ features: both, cableById: () => null });
  const row = sheet.rows[0];
  if (!row) fail("the calc sheet finds no leg on a drawing with one main");
  else if (Math.abs(row.lengthM - 120) > 0.1) {
    fail(`the calc sheet charges ${row.lengthM} m where the cable runs 120 \u2014 `
      + "it must read the run, not Length_m, which the trigger rewrites from "
      + "the geometry");
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

/* The levels table shows the figure the calculation ran on, and says
   when it is not the drawn one. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/l\.measured &&/.test(canvas)) {
    fail("the levels table does not say which rows run on a measurement, so "
      + "a length that will not scale off the drawing looks like an error");
  }
  if (!/drawn \{l\.drawnMetres/.test(canvas)) {
    fail("the drawn figure is not shown beside the measured one");
  }
}

/* And nothing in the GIS client reads Length_m any more. Leaving one
   reader behind would put a line's calculations back on a figure the
   database rewrites underneath them. */
{
  const files = [
    "GISCanvasPage.jsx", "FeatureEditor.jsx", "electric.js", "feeder.js",
    "routing.js", "gasNetwork.js", "waterNetwork.js",
    /* The Aptus Calc Sheet read it too, so a submission and the
       levels check behind it reported different lengths for one leg. */
    "calcSheetRows.js",
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
