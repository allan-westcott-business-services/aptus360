/* A heavy duty cut-out at the end of a mains trench.

   0209's cut-out is spliced into a feeder that already exists: the
   cable runs THROUGH it, no break, no feeder end point. This is the
   other half of what one is for — placed at the END of a mains
   trench, before any cable is drawn, as the thing the run terminates
   in. Nothing is assigned to it, and that is exactly why the build
   could not see it: the router walks toward load, and a branch worth
   no meters was never cabled.

   The rule added is one idea: a branch holding a cut-out is worth
   cabling even with no load on it. What must NOT change is the
   spliced case — a cut-out mid-run stays passive, breaks nothing and
   takes no point, which is the promise 0209 made. */
import { readFileSync } from "node:fs";
import {
  buildFeederModel, feederSections, endOfLineNodes, junctionNodes,
  carriesCable,
} from "./src/features/gis/feeder.js";
import {
  hdCutoutsOn, hdcoKva, hdcoAt, isTerminal,
} from "./src/features/gis/hdCutout.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

let nid = 1;
/* A straight dig from the substation out to 200 m, one plot seed with
   a meter at 60 m, and the trench carrying on past it to the end. */
const world = (extra = []) => {
  nid = 1;
  return [
    { Feature_ID: nid++, Feature_Type: "point", Feature_Role: "substation",
      Layer_Key: "electric", Geometry: [[0, 0]], Attributes: {} },
    /* A vertex at 30 m as well, so the spliced case below has a node to
       stand on: the model attaches a fitting to the nearest node within
       tolerance, and a cut-out thirty metres from the nearest vertex is
       not attached at all — which made the passivity test pass by
       testing nothing. */
    { Feature_ID: nid++, Feature_Type: "line", Feature_Role: "shape",
      Layer_Key: "trench", Geometry: [[0, 0], [30, 0], [60, 0], [200, 0]],
      Attributes: { Line_Type: "trench_main" } },
    { Feature_ID: nid++, Feature_Type: "point", Feature_Role: "plot",
      Layer_Key: "plot", Plot_ID: 5, Geometry: [[60, 0]], Attributes: {} },
    { Feature_ID: nid++, Feature_Type: "point", Feature_Role: "meter",
      Layer_Key: "electric", Plot_ID: 5, Geometry: [[60, 0]],
      Attributes: { Circuit_ID: 1, Meter_Utility: "Electric" } },
    ...extra,
  ];
};
const cutout = (at, attrs = {}) => ({ Feature_ID: 90, Feature_Type: "point",
  Feature_Role: "hdcutout", Layer_Key: "electric", Geometry: [at],
  Attributes: { Circuit_ID: 1, ...attrs } });

const opts = (fs, extra = {}) => ({
  plotById: () => ({ kva_load: 5 }),
  meterIds: new Set(fs.filter((f) => f.Feature_Role === "meter")
    .map((f) => f.Feature_ID)),
  seedIds: new Set(fs.filter((f) => f.Feature_Role === "plot")
    .map((f) => f.Feature_ID)),
  hdcoIds: new Set(fs.filter((f) => f.Feature_Role === "hdcutout")
    .map((f) => f.Feature_ID)),
  ...extra,
});

const reaches = (sections, x) => sections.some((s) =>
  s.pts.some((p) => Math.abs(p[0] - x) < 0.5));

// 1. Without a cut-out, the cable stops at the plot. The baseline the
//    complaint describes: the trench past 60 m stays empty.
{
  const fs = world();
  const r = feederSections(fs, opts(fs));
  if (r.error) fail(`the plain case does not route at all: ${r.error}`);
  else if (reaches(r.sections, 200)) {
    fail("cable runs to the end of the dig with nothing out there to feed");
  }
}

// 2. With a cut-out at the end, the cable runs out to it.
{
  const fs = world([cutout([200, 0])]);
  const r = feederSections(fs, opts(fs));
  if (r.error) fail(`a cut-out at the end broke the build: ${r.error}`);
  else {
    if (!reaches(r.sections, 200)) {
      fail("no cable is run out to the cut-out at the end of the trench");
    }
    /* And something is actually laid there: a section carrying zero
       cables is a route the build walks and lays nothing along. */
    const far = r.sections.find((s) =>
      s.pts.some((p) => Math.abs(p[0] - 200) < 0.5));
    if (far && !(far.cables > 0)) {
      fail(`the run to the cut-out carries ${far.cables} cables, so nothing is laid`);
    }
  }
}

// 3. A feeder end point lands ON the cut-out — the end of the line is
//    where the run terminates, and that point is what every level on
//    the leg is quoted at.
{
  const fs = world([cutout([200, 0])]);
  const M = buildFeederModel(fs, opts(fs));
  if (M.error) fail(`the model refused: ${M.error}`);
  else {
    const ends = endOfLineNodes(M);
    const atCutout = ends.find((e) => Math.abs(e.point[0] - 200) < 0.5);
    if (!atCutout) {
      fail("the cut-out is not an end of line, so no feeder end point is placed on it");
    }
    if (!isTerminal(M, atCutout?.index)) {
      fail("the cut-out at the end of the dig does not read as a terminal");
    }
  }
}

// 4. It is a terminal, not a customer.
{
  const fs = world([cutout([200, 0])]);
  const M = buildFeederModel(fs, opts(fs));
  /* One meter on the drawing, and the cut-out is not a second. A
     count that included it would put a customer on the schedule, send
     the levels looking for a service cable it does not have, and bill
     for a connection nobody makes. */
  if (M.cum[M.S] !== 1) {
    fail(`the cut-out is counted as a customer: ${M.cum[M.S]} meters at the origin`);
  }
  if (Math.round(M.cumKva[M.S] * 10) / 10 !== 5) {
    fail(`the cut-out invented load: ${M.cumKva[M.S]} kVA at the origin`);
  }
  /* Unless somebody states one, in which case it is load like any
     other and the run is sized for it. */
  const fs2 = world([cutout([200, 0], { Circuit_ID: 1, Supply_kVA: 12 })]);
  const M2 = buildFeederModel(fs2, opts(fs2));
  if (Math.round(M2.cumKva[M2.S] * 10) / 10 !== 17) {
    fail(`a stated supply is not carried: ${M2.cumKva[M2.S]} kVA where 17 was expected`);
  }
  if (M2.cum[M2.S] !== 1) {
    fail("a cut-out with a stated supply is counted as a customer as well");
  }
  if (hdcoKva({ Attributes: {} }) !== 0) fail("a cut-out with no figure invents one");
  if (hdcoKva({ Attributes: { Supply_kVA: 12 } }) !== 12) fail("a stated supply is not read");
}

// 5. **The spliced cut-out is untouched.** 0209's promise: mid-run it
//    is passive — the cable runs through it, it ends no section and
//    takes no point of its own.
{
  const fs = world([
    cutout([30, 0], { Circuit_ID: 1, On_Cable_ID: 77 }),
  ]);
  const M = buildFeederModel(fs, opts(fs));
  /* It must actually be ON the network for this to prove anything: a
     fitting out of reach is skipped, and a skipped fitting breaks
     nothing whatever the rule says. */
  if (M.skipped?.some((x) => Number(x.id) === 90)) {
    fail("the spliced cut-out is not attached, so this proves nothing");
  }
  const ends = endOfLineNodes(M);
  if (ends.some((e) => Math.abs(e.point[0] - 30) < 0.5)) {
    fail("a cut-out spliced mid-run is treated as an end of line, which "
      + "breaks the run it is supposed to pass through");
  }
  const r = feederSections(fs, opts(fs));
  const breaksThere = r.sections?.some((s) => {
    const last = s.pts[s.pts.length - 1];
    return Math.abs(last[0] - 30) < 0.5;
  });
  if (breaksThere) {
    fail("a cut-out spliced mid-run breaks the cable at it \u2014 0209 says it "
      + "is a fitting the conductor runs through");
  }
}

// 6. A cut-out on no circuit is nobody's to reach, and one on another
//    circuit is not this walk's.
{
  /* Circuit_ID null, not absent from the spread: the helper defaults
     it to 1, and an earlier version of this passed `{}` and tested
     nothing at all. */
  const fs = world([cutout([200, 0], { Circuit_ID: null })]);
  const mine = new Set();  // this circuit owns no cut-out
  const r = feederSections(fs, { ...opts(fs), hdcoIds: mine });
  if (reaches(r.sections || [], 200)) {
    fail("a cut-out this circuit does not own still pulls its cable");
  }
  if (hdCutoutsOn(fs, 1).length !== 0) {
    fail("a cut-out with no circuit is claimed by circuit 1");
  }
  if (hdCutoutsOn(world([cutout([200, 0])]), 1).length !== 1) {
    fail("a cut-out naming circuit 1 is not found for it");
  }
  if (hdCutoutsOn(world([cutout([200, 0])]), 2).length !== 0) {
    fail("a cut-out naming circuit 1 is claimed by circuit 2");
  }
}

// 7. Off the dig entirely: said, not silently skipped.
{
  const fs = world([cutout([200, 400])]);
  const M = buildFeederModel(fs, opts(fs));
  if (!M.skipped?.some((s) => Number(s.id) === 90)) {
    fail("a cut-out nowhere near the trench is dropped without a word");
  }
}

// 8. The shared rule, and its tolerance of older models.
{
  if (carriesCable({ cum: [0], cumDemand: [1] }, 0) !== true) {
    fail("a branch demanded by a cut-out does not read as cabled");
  }
  if (carriesCable({ cum: [2] }, 0) !== true) {
    fail("a model built before demand existed stops reading as cabled");
  }
  if (carriesCable({ cum: [0], cumDemand: [0] }, 0) !== false) {
    fail("a branch with neither load nor a cut-out reads as cabled");
  }
  if (hdcoAt({ Attributes: { Span_Anchor: [1, 2] }, Geometry: [[9, 9]] })[0] !== 1) {
    fail("the anchor the walk adopted is not preferred over the raw geometry");
  }
}

// 9. The pieces are wired in, not just written.
{
  const canvas = readFileSync("src/features/gis/GISCanvasPage.jsx", "utf8");
  const editor = readFileSync("src/features/gis/FeatureEditor.jsx", "utf8");
  const feeder = readFileSync("src/features/gis/feeder.js", "utf8");

  if (!/function mainsTrenchAt\(/.test(canvas)) {
    fail("a cut-out still cannot be placed on a bare mains trench");
  }
  if (!/const dig = hit \? null : mainsTrenchAt\(point\)/.test(canvas)) {
    fail("placement does not fall through from the feeder to the dig");
  }
  if (!/hdcoIds/.test(feeder)) {
    fail("the build never tells the model which cut-outs the circuit owns");
  }
  if (!/fe-hdco-circuit/.test(editor)) {
    fail("a cut-out on a bare trench has no way to name its circuit, so the "
      + "build has no reason to reach it");
  }
  if (!/fe-hdco-kva/.test(editor)) {
    fail("a cut-out cannot be given the supply it was agreed");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The build runs out to a cut-out at the end of the dig (and still runs through a spliced one).");
process.exit(bad ? 1 : 0);
