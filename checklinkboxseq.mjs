/* What a link box is called after a build.

   A box on a run IS that circuit's feeder end point: the cable comes in
   one face and leaves through fuses, so the run breaks there by
   definition. Build LV Network walks the circuit and numbers its stops
   outward from the origin, and a box standing on the first stop is A1.

   Three things were wrong, all in the same pass, and they compound:

   - **The name did not follow the number.** Adoption wrote Span_Seq and
     Span_Kind and not Span_Label. A box placed after nine feeder points
     takes A10 at placement — max sequence plus one, which is all
     placement can know — and every build since has resequenced it to 1
     and left it called A10. Every reader that names a stop reads
     Span_Label, so the report, the call-off spans and the levels table
     all said A10 for a point the build had made first. The same is
     true of a feeder point, whose Label is "Point A10" as well.

   - **A box placed in open ground was never adopted.** Placement gives
     it no circuit and no sequence, because there was no cable under
     the click; the cables get drawn to it afterwards. The build only
     considered boxes that already had both, so this one was invisible
     to it — and the walk, finding nothing at that position, made a
     generated feeder point of its own standing on top of it. That is
     the stray duplicate: two points at one place, one holding the
     figures and one holding the fuses.

   - **And nothing stopped the second circuit taking it too**, once
     unclaimed boxes were considered at all: each circuit is planned
     against the drawing as it was, so a box adopted by circuit A is
     still circuitless when circuit B looks.

   The decisions are imported from feederPoints.js rather than restated
   here — a check carrying its own copy of the rule agrees with itself
   for ever, which is how checkspannodes passed through every fault it
   was written for. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* Imported dynamically so an absent module is a named failure and not a
   crash that takes the rest of the suite's report with it — the pattern
   the missing-migration checks were moved onto. */
let fp = {};
try { fp = await import("./src/features/gis/feederPoints.js"); }
catch { /* said below, once, in the words of the fault */ }

const { planFeederPoints } = fp;

if (typeof planFeederPoints !== "function") {
  fail("feederPoints.js does not export planFeederPoints — the sequencing "
    + "is still inline in the build, where nothing can drive it");
} else {
  const circuit = { id: 1, name: "Circuit 1", letter: "A" };
  let id = 500;
  const box = (at, attrs = {}) => ({
    Feature_ID: id++, Feature_Role: "linkbox", Feature_Type: "point",
    Layer_Key: "electric", Label: "Link Box 1", Geometry: [at],
    Attributes: { Link_Ways: 4, Way_Fuse_A: {}, Span_Anchor: at, ...attrs },
  });
  const point = (at, attrs = {}) => ({
    Feature_ID: id++, Feature_Role: "feederpoint", Feature_Type: "point",
    Layer_Key: "electric", Label: "Point A9", Geometry: [at],
    Attributes: { Circuit_ID: 1, Span_Anchor: at, ...attrs },
  });
  const walk = [
    { point: [0, 0], kind: "origin" },
    { point: [100, 0], kind: "junction" },
    { point: [200, 0], kind: "end" },
  ];
  const plan = (existing, opts = {}) => planFeederPoints({
    nodes: walk, existing, circuit, ...opts,
  });
  const writeFor = (r, f) => (r.adopt || []).find((w) =>
    Number(w.Feature_ID) === Number(f.Feature_ID));
  const madeAt = (r, x, y) => (r.create || []).filter((p) =>
    Math.hypot(p.Geometry[0][0] - x, p.Geometry[0][1] - y) < 0.5);

  // 1. A box on the first stop is A1, in the name as well as the number.
  {
    const b = box([100, 0], { Circuit_ID: 1, Span_Seq: 10, Span_Label: "A10" });
    const r = plan([b]);
    const w = writeFor(r, b);
    if (!w) fail("a box standing on the first stop is not resequenced at all");
    else {
      if (String(w.Attributes.Span_Seq) !== "1") {
        fail(`the box was numbered ${w.Attributes.Span_Seq}, wanted 1`);
      }
      if (w.Attributes.Span_Label !== "A1") {
        fail(`the box is still called ${w.Attributes.Span_Label ?? "nothing"} `
          + "after being resequenced to 1");
      }
    }
    if (madeAt(r, 100, 0).length) {
      fail("a generated point was made where the box already stands");
    }
  }

  // 2. A box placed in open ground, cables drawn to it afterwards. It
  //    has no circuit and no sequence, and it is still the point the run
  //    stops at — so it is adopted, not duplicated.
  {
    const b = box([100, 0]);
    const r = plan([b]);
    const w = writeFor(r, b);
    if (!w) fail("a box with no circuit yet is not adopted by the run that "
      + "now stops at it");
    else {
      if (Number(w.Attributes.Circuit_ID) !== 1) {
        fail("the adopted box was not given the circuit it stands on");
      }
      if (w.Attributes.Span_Label !== "A1" || String(w.Attributes.Span_Seq) !== "1") {
        fail("a box adopted from open ground is not numbered as the first stop");
      }
    }
    if (madeAt(r, 100, 0).length) {
      fail("the stray duplicate is still made beside the circuitless box");
    }
  }

  // 3. Claimed once. Each circuit is planned against the drawing as it
  //    was, so without a shared claim the next circuit adopts it again.
  {
    const b = box([100, 0]);
    const claimed = new Set();
    plan([b], { claimed });
    const second = planFeederPoints({
      nodes: walk, existing: [b], claimed,
      circuit: { id: 2, name: "Circuit 2", letter: "B" },
    });
    if (writeFor(second, b)) {
      fail("a box adopted by one circuit is adopted again by the next");
    }
    if (!madeAt(second, 100, 0).length) {
      fail("the second circuit lost its own point at the junction");
    }
  }

  // 4. A box nowhere near the walk keeps out of it. Considering
  //    circuitless boxes must not sweep one standing in a field into
  //    this circuit's numbering.
  {
    const b = box([900, 900]);
    const r = plan([b]);
    if (writeFor(r, b)) {
      fail("a box eight hundred metres away was given a place in the sequence");
    }
  }

  // 5. A feeder point's own name follows its number too — "Point A9"
  //    on a point the build has just made second is the same fault.
  {
    const p = point([200, 0], { Span_Seq: 9, Span_Label: "A9" });
    const r = plan([p]);
    const w = writeFor(r, p);
    if (!w) fail("a hand-placed feeder point on the walk is not resequenced");
    else {
      if (w.Attributes.Span_Label !== "A2") {
        fail(`the point is still called ${w.Attributes.Span_Label} at sequence 2`);
      }
      if (w.Label !== "Point A2") {
        fail(`the point's own name is still ${w.Label}`);
      }
    }
  }

  // 6. A hand-placed point the walk did not land on is a break somebody
  //    chose: sequenced after the walk, and named to match.
  {
    const p = point([150, 0], { Span_Seq: 7, Span_Label: "A7" });
    const r = plan([p]);
    const w = writeFor(r, p);
    if (!w) fail("a mid-run point off the walk lost its resequencing");
    else if (w.Attributes.Span_Label !== "A3" || String(w.Attributes.Span_Seq) !== "3") {
      fail(`a mid-run break was sequenced ${w.Attributes.Span_Seq}/`
        + `${w.Attributes.Span_Label}, wanted 3/A3 after the two walked stops`);
    }
  }

  // 7. The reaches that were already settled hold: two metres for a box
  //    placed by eye, one for anything else.
  {
    const b = box([101.2, 0]);
    if (!writeFor(plan([b]), b)) {
      fail("a box a metre off the node is no longer adopted — the build "
        + "makes a point beside it again");
    }
    /* The same distance for a feeder point is out of reach: it is not
       placed by eye against a symbol, it is placed on the cable. The
       stop gets a point of its own, and the one standing off it is
       sequenced after the walk like any other chosen break. */
    const p = point([101.2, 0], { Span_Seq: 4, Span_Label: "A4" });
    const r = plan([p]);
    if (!madeAt(r, 100, 0).length) {
      fail("a feeder point reaches further than a metre");
    }
    const w = writeFor(r, p);
    if (!w || String(w.Attributes.Span_Seq) !== "3") {
      fail("the point off the walk was not sequenced after it");
    }
  }

  // 8. Nothing rewritten for nothing. A drawing already in order is not
  //    churned through the database on every build.
  {
    const b = box([100, 0], { Circuit_ID: 1, Span_Seq: 1, Span_Label: "A1",
      Span_Kind: "junction", Circuit_Name: "Circuit 1", Circuit_Letter: "A" });
    if (writeFor(plan([b]), b)) {
      fail("a box already correctly numbered is rewritten anyway");
    }
  }

  // 9. The build's own points are still the build's: the generated ones
  //    it laid last time are named for deletion.
  {
    const g = point([200, 0], { Span_Seq: 2, Span_Label: "A2", Generated: true });
    const r = plan([g]);
    if (!(r.remove || []).includes(g.Feature_ID)) {
      fail("the generated points from the last build are not replaced");
    }
    if (writeFor(r, g)) fail("a point about to be deleted was resequenced first");
  }
}

/* And the build consumes it, rather than keeping a second copy of the
   rule beside the one under test. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("async function buildLvNetwork");
  if (at < 0) fail("buildLvNetwork has gone");
  else {
    const body = canvas.slice(at, at + 30000);
    if (!/planFeederPoints\(/.test(body)) {
      fail("Build LV Network no longer plans its feeder points through "
        + "planFeederPoints");
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Feeder point sequencing behaves (a box on the first stop is A1, named "
  + "to match, and only one point stands there).");
process.exit(bad ? 1 : 0);
