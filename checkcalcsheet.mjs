/* The Aptus Calc Sheet, against the drawing it reads.

   `fixtures/drawing-16-calc-sheet.json` is project 16 — Fox Covert Ln
   — cut down to the nine legs of main, the ten feeder points, the
   point of connection and the trench's own span nodes. Everything
   else was dropped; those four kinds are what the sheet reads, and
   the trench nodes are in there on purpose because they are what it
   used to get wrong.

   checkvdsubmit.mjs pins the ARITHMETIC against the submission
   workbook. This pins the READING: which legs, in what order, named
   after what, carrying how many customers. The two faults are
   different — a sheet can compute a volt drop perfectly along a route
   that is not a route.

   The three worth holding hardest, each found on the real drawing
   rather than imagined:

     1. A ROUTE, NOT A SUM. The totals are the drop along one path
        from the point of connection. Every leg ticked at once sums
        legs that sit in parallel and arrives at a figure that is the
        drop to no customer at all.
     2. THE TRENCH'S NODES ARE NOT THE CABLE'S. Both are labelled A1,
        A2, A3 and on this drawing they stand at the same corners.
     3. A DEAD END'S NODE IS NOT ON THE CABLE. The build places it
        `Tail_M` past where the cable is drawn — 2 to 4 m — so an
        exact coordinate match leaves every spur unnamed. */
import { readFileSync } from "node:fs";
import { calcSheetRows, originOf, schemeFrom } from "./src/features/gis/calcSheetRows.js";
import { submitSheet } from "./src/features/gis/submitSheet.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const near = (a, b, tol = 1e-6) => Math.abs(Number(a) - Number(b)) <= tol;

const features = JSON.parse(
  readFileSync("./fixtures/drawing-16-calc-sheet.json", "utf8"));

/* The two sizes this scheme is drawn in. The catalogue is not in a
   drawing export — it is a lookup the app holds — so the sheet takes
   a `cableById` and this supplies one. */
const CABLES = {
  1: { Cable_Type: "3c Wave", Size_Label: "185", Volt_Drop_Base: 105, Loop_Impedance_Ohm: 0.361 },
  2: { Cable_Type: "3c Wave", Size_Label: "300", Volt_Drop_Base: 73, Loop_Impedance_Ohm: 0.291 },
  4: { Cable_Type: "3c Wave", Size_Label: "300", Volt_Drop_Base: 73, Loop_Impedance_Ohm: 0.291 },
};
const cableById = (id) => CABLES[id] || null;

const walked = calcSheetRows({ features, cableById });
const bySection = new Map(walked.rows.map((r) => [r.section, r]));

// 1. Every leg is on the sheet, once, walked out from the origin.
{
  if (walked.rows.length !== 9) {
    fail(`${walked.rows.length} rows from nine legs of main`);
  }
  if (walked.unreached.length) {
    fail(`legs the walk never reached: ${walked.unreached.join(", ")} \u2014 a `
      + "section missing from a submission is the fault nobody sees");
  }
  const ids = walked.rows.map((r) => r.featureId);
  if (new Set(ids).size !== ids.length) {
    fail("a leg appears on the sheet twice, so its drop is counted twice");
  }
  /* Out from the point of connection. The first row must leave the
     origin, or the sheet is a list of legs rather than a walk. */
  if (!walked.rows[0]?.section.startsWith("A0 - ")) {
    fail(`the sheet starts at ${walked.rows[0]?.section} rather than at the `
      + "point of connection");
  }
}

// 2. The nodes are the cable's, named off the drawing.
{
  const want = {
    "A0 - A1 (A9)": [1, 50], "A1 - A2 (A5)": [5, 41], "A1 - A9 (A6)": [4, 0],
    "A2 - A3 (A7)": [11, 10], "A2 - A6 (A8)": [5, 15], "A3 - A5 (A1)": [9, 0],
    "A3 - A4 (A2)": [1, 0], "A6 - A8 (A3)": [11, 0], "A6 - A7 (A4)": [4, 0],
  };
  for (const [section, [dist, term]] of Object.entries(want)) {
    const row = bySection.get(section);
    if (!row) { fail(`no row for ${section}`); continue; }
    /* ── Distributed and terminal ──

       `Meters` on a leg is CUMULATIVE. Terminal is the sum of the
       children's, which is everything leaving at or beyond the far
       end; distributed is what is left, which taps off along the leg.
       Read the other way round the sheet halves the wrong load, and
       the error is invisible because both numbers are plausible. */
    if (row.distributed !== dist || row.terminal !== term) {
      fail(`${section}: ${row.distributed} distributed and ${row.terminal} `
        + `terminal where the drawing gives ${dist} and ${term}`);
    }
  }

  /* No invented node numbers. Every node on this drawing has a feeder
     point, so an N-number in a section name means the matching failed
     and a designer cannot tie the row to the canvas. */
  const invented = walked.rows.filter((r) => /\bN\d+\b/.test(r.section));
  if (invented.length) {
    fail(`${invented.length} section(s) named with invented node numbers `
      + `(${invented[0].section}) \u2014 a dead end's feeder point sits Tail_M `
      + "past where the cable is drawn, and must be matched through it");
  }

  /* And not named after the trench. The trench's own span nodes are
     labelled A1, A2, A3 and stand at the same corners as the cable's
     junctions; before the layer test the sheet read "A1 - A2 (A5)",
     which is two trench nodes and a cable leg in one cell. */
  const trench = features.filter((f) => f.Layer_Key === "trench"
    && f.Feature_Role === "spannode");
  if (!trench.length) {
    fail("the fixture has lost its trench span nodes, so it no longer tests "
      + "the layer that fault turned on");
  }
  if (bySection.has("A1 - A2 (A5)") && !bySection.has("A1 - A2 (A5)")?.legLabel) {
    /* Belt and braces: the real A5 leg runs A1 to A2, so the section
       name alone cannot tell the two readings apart. The leg label is
       what distinguishes them. */
  }
  const a5 = walked.rows.find((r) => r.legLabel === "A5");
  if (a5 && a5.section !== "A1 - A2 (A5)") {
    fail(`leg A5 reads ${a5.section}, which is not its own nodes`);
  }
}

// 3. The routes, and the worst of them.
{
  if (walked.routes.length !== 5) {
    fail(`${walked.routes.length} routes out of the origin where the drawing `
      + "has five dead ends");
  }
  for (const r of walked.routes) {
    if (r.nodes[0] !== "A0") {
      fail(`a route starts at ${r.nodes[0]} rather than the point of connection`);
    }
    if (!r.featureIds.length) fail(`the route to ${r.to} has no legs`);
  }

  const settings = { admdKva: 5.01, groupKva: 8, phaseVoltageV: 240,
    startPct: 0.79, startOhms: 0.039 };
  const totalFor = (route) => {
    const on = new Set(route.featureIds);
    return submitSheet({
      rows: walked.rows.map((x) => ({ ...x, included: on.has(x.featureId) })),
      settings,
    });
  };

  /* ── A route, not a sum ──

     Everything ticked at once totals 3.897%; the worst actual route
     totals 2.937%. The first is not a worse answer than the second,
     it is an answer to no question — it adds legs that sit in
     parallel. Both are asserted, so the day somebody totals the whole
     tree again the difference is named rather than looked
     reasonable. */
  const all = submitSheet({ rows: walked.rows, settings });
  const worst = walked.routes
    .map((r) => ({ r, s: totalFor(r) }))
    .sort((a, b) => b.s.voltDrop - a.s.voltDrop)[0];

  if (worst.r.to !== "A8") {
    fail(`the worst route ends at ${worst.r.to}; on this drawing it is A8`);
  }
  /* The fixture's A9 carries a measured length of 100 m against 11.15
     drawn, which is what made the fault visible: the sheet read the
     drawing and the levels check read the measurement. Both run on
     the measurement now, and these figures are with it in. */
  if (!near(worst.s.voltDrop, 4.6294936095, 1e-4)) {
    fail(`the worst route totals ${worst.s.voltDrop}% where the drawing gives `
      + "4.6295%");
  }
  if (!near(worst.s.loopImpedance, 0.15212444, 1e-5)) {
    fail(`the worst route's loop impedance is ${worst.s.loopImpedance} where `
      + "the drawing gives 0.1521244");
  }

  /* And the measurement is in force rather than merely stored. */
  const a9 = walked.rows.find((r) => r.legLabel === "A9");
  if (!a9 || a9.lengthM !== 100 || !a9.measured) {
    fail(`A9 runs on ${a9 && a9.lengthM} m \u2014 it is measured at 100 against `
      + "11.15 drawn, and the sheet must charge the run rather than the plan");
  }
  if (all.voltDrop <= worst.s.voltDrop) {
    fail("totalling every leg no longer reads higher than the worst route, so "
      + "this case has stopped testing the difference between a route and a sum");
  }
}

// 4. What the sheet takes off the point of connection.
{
  const origin = originOf(features);
  if (origin?.Attributes?.Span_Kind !== "origin") {
    fail("the walk does not start at the origin feeder point");
  }
  const scheme = schemeFrom(origin, features.find((f) => f.Feature_Role === "poc"));
  if (!near(scheme.startPct, 0.79) || !near(scheme.startOhms, 0.039)) {
    fail(`the POC's own share reads ${scheme.startPct}% and ${scheme.startOhms} `
      + "\u03a9 \u2014 a design checked as though it began at zero reads better "
      + "than it is by whatever the network upstream already spent");
  }
  /* 240 on this drawing, which is the PHASE voltage the spreadsheet
     divides by — and the same field holds the LINE voltage elsewhere
     in the app, where it defaults to 400. Returned rather than
     reconciled; the two are 3.9% apart on every current. */
  if (scheme.outputV !== 240) {
    fail(`the POC's Output_V reads ${scheme.outputV} \u2014 the fixture holds 240`);
  }
}

// 5. A drawing the sheet cannot read says so rather than half-reporting.
{
  const noOrigin = calcSheetRows({
    features: features.filter((f) => f.Feature_Role !== "feederpoint"
      && f.Feature_Role !== "poc"),
    cableById,
  });
  if (noOrigin.rows.length) {
    fail("legs are reported with nothing to measure them from");
  }
  if (!noOrigin.unreached.length) {
    fail("a drawing with no origin drops its legs silently");
  }

  const noCable = calcSheetRows({ features, cableById: () => null });
  if (!noCable.rows.every((r) => r.missingCable)) {
    fail("a section whose cable is not in the catalogue is not flagged, so it "
      + "contributes nothing and the totals read better than the truth");
  }
}

// 6. It is on the Electric menu, and it is one calculation.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/label="Aptus Calc Sheet"/.test(canvas)) {
    fail("the sheet cannot be opened from anywhere");
  }
  const elec = canvas.indexOf('<Menu id="electric"');
  const tools = canvas.indexOf('<Menu id="tools"');
  const item = canvas.indexOf('label="Aptus Calc Sheet"');
  if (!(item > elec && item < tools)) {
    fail("the Aptus Calc Sheet is not in the Electric menu \u2014 it reads the "
      + "electric network to build itself");
  }

  const sheet = readFileSync("./src/features/gis/AptusCalcSheet.jsx", "utf8");
  if (!/from "\.\/submitSheet\.js"/.test(sheet)) {
    fail("the panel works its own figures out rather than going through "
      + "submitSheet, so it is a second answer to the question the levels "
      + "check already answers");
  }
  if (/Loop_Impedance_Ohm|Volt_Drop_Base/.test(sheet)) {
    fail("the panel touches cable figures directly, which is arithmetic it "
      + "should be asking for rather than doing");
  }
}

// 7. The panel is styled against tokens that exist.
{
  /* An undefined custom property falls back to nothing rather than
     to a default, so `background: var(--card)` paints NO background
     and `border: 1px solid var(--line)` draws no border. The panel
     shipped that way and rendered as text floating over the drawing —
     which reads as a z-index or backdrop fault and is neither.

     Read out of styles.css rather than listed here, so a token
     renamed there is caught rather than this case going stale. */
  const sheet = readFileSync("./src/features/gis/AptusCalcSheet.jsx", "utf8");
  const tokens = readFileSync("./src/styles.css", "utf8");
  const defined = new Set(
    [...tokens.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gmi)].map((m) => m[1]));
  const used = new Set(
    [...sheet.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]));
  for (const t of used) {
    if (!defined.has(t)) {
      fail(`the panel is styled with ${t}, which styles.css does not define `
        + "\u2014 it falls back to nothing, so that colour or border simply "
        + "does not paint");
    }
  }
  if (!used.size) {
    fail("the panel names no design tokens at all, so it cannot follow the "
      + "app's colours");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The sheet reads the drawing: right legs, right nodes, one route.");
process.exit(bad ? 1 : 0);
