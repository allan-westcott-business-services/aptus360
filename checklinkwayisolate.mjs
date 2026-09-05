/* Reading one output of a link box with the others put away.

   A box's outputs are several cables in one trench wearing several
   colours, and past a certain density that is not enough to read one of
   them. Same shape as isolating a circuit: a piece of state, a rule
   about what it hides, and the same banner offering everything back.

   The rule is the interesting part. What says which output something is
   on is what the build and the lasso WROTE — Link_Box_ID and Link_Way
   on the runs and the meters — and, for anything holding a Plot_ID, the
   output of that plot's meter. Nothing is guessed from position: a
   feeder point at a junction carries no stamp, and inventing one for it
   from where it stands is the geometry-guessing this repo keeps being
   bitten by. */
import { readFileSync } from "node:fs";
import { wayOf, outsideWay, metersByPlot, wayColourOf } from "./src/features/gis/linkWays.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const box = { Feature_ID: 10, Feature_Role: "linkbox", Feature_Type: "point",
  Layer_Key: "electric", Label: "Link Box 1", Geometry: [[0, 0]],
  Attributes: { Link_Ways: 4, Circuit_ID: 1 } };
const run = (id, way) => ({ Feature_ID: id, Feature_Type: "line",
  Layer_Key: "electric", Geometry: [[0, 0], [50, 0]],
  Attributes: { Line_Type: "elec_main", Circuit_ID: 1, Link_Box_ID: 10, Link_Way: way } });
const meter = (id, plot, way) => ({ Feature_ID: id, Feature_Role: "meter",
  Feature_Type: "point", Layer_Key: "electric", Plot_ID: plot, Geometry: [[50, 5]],
  Attributes: { Circuit_ID: 1, Link_Box_ID: 10, Link_Way: way } });
const service = (id, plot) => ({ Feature_ID: id, Feature_Type: "line",
  Layer_Key: "electric", Plot_ID: plot, Geometry: [[50, 0], [50, 5]],
  Attributes: { Line_Type: "elec_service" } });
const trunk = { Feature_ID: 90, Feature_Type: "line", Layer_Key: "electric",
  Geometry: [[-100, 0], [0, 0]], Attributes: { Line_Type: "elec_main", Circuit_ID: 1 } };
const trench = { Feature_ID: 91, Feature_Type: "line", Layer_Key: "trench",
  Geometry: [[0, 0], [50, 0]], Attributes: { Line_Type: "trench_main" } };
const fep = { Feature_ID: 92, Feature_Role: "feederpoint", Feature_Type: "point",
  Layer_Key: "electric", Geometry: [[50, 0]],
  Attributes: { Circuit_ID: 1, Span_Seq: 2, Span_Label: "A2" } };

const world = [box, trunk, trench, fep,
  run(11, 1), run(12, 2), meter(21, 101, 1), meter(22, 102, 2),
  service(31, 101), service(32, 102)];
const byPlot = metersByPlot(world);
const iso = { box: 10, way: 1 };
const hidden = (f) => outsideWay(f, iso, byPlot);

// 1. The stamps the build and the lasso wrote.
{
  if (wayOf(run(11, 1), byPlot)?.way !== 1) fail("a run does not name its output");
  if (!hidden(run(12, 2))) fail("another output's cable is still shown");
  if (hidden(run(11, 1))) fail("this output's own cable was hidden");
  if (!hidden(meter(22, 102, 2))) fail("another output's meter is still shown");
  if (hidden(meter(21, 101, 1))) fail("this output's own meter was hidden");
}

// 2. A service is on an output because its plot's meter is.
{
  if (wayOf(service(32, 102), byPlot)?.way !== 2) {
    fail("a service does not take the output of the plot it feeds");
  }
  if (!hidden(service(32, 102))) fail("another output's service is still shown");
  if (hidden(service(31, 101))) fail("this output's own service was hidden");
}

// 3. What must NOT be hidden. Somebody reading output 1 wants to see
//    what feeds it and where it runs.
{
  if (hidden(trunk)) fail("the input feeding the box was hidden");
  if (hidden(trench)) fail("the trench was hidden");
  if (hidden(box)) fail("the box itself was hidden \u2014 it is where the "
    + "outputs start, not a thing on one of them");
  /* A feeder point carries no stamp. Unknown is not the same as "on
     another output", and hiding on a guess loses work. */
  if (hidden(fep)) fail("an unstamped feeder point was hidden on a guess");
}

// 4. Another box's outputs are nothing to do with this isolate.
{
  const other = { ...run(13, 2), Attributes: { ...run(13, 2).Attributes, Link_Box_ID: 99 } };
  if (hidden(other)) fail("a different box's output was hidden");
}

// 5. No isolate hides nothing at all.
{
  for (const f of world) {
    if (outsideWay(f, null, byPlot)) fail("something is hidden with no isolate set");
  }
}

/* Both ways in, and a way back out. An isolate with nothing on screen
   saying so is a drawing somebody will believe. */
{
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/Show all outputs" : "Isolate"/.test(editor)) {
    fail("the link box editor cannot isolate one of its outputs");
  }
  if (!/Isolate this output/.test(editor)) {
    fail("an object on an output cannot isolate the output it is on");
  }
  if (!/isolatedWay != null && \(/.test(canvas)) {
    fail("the banner does not say an output is isolated, so somebody can "
      + "believe the drawing is the whole design");
  }
  if (!/setIsolatedWay\(null\);/.test(canvas)) {
    fail("Show everything does not end an output isolation");
  }
}

/* ── The colour of a stop on an output ──

   A feeder end point on a link box output wears that output's colour,
   not the circuit's: a stop on a coloured output drawn in the circuit's
   colour reads as belonging to something else.

   One rule, because two places ask — the drawing and the "objects here"
   picker. The picker asked the STYLE and showed amber for a point drawn
   pink, on a dialog whose whole job is telling apart things lying on
   top of each other. */
{
  const box = { Feature_ID: 10, Feature_Role: "linkbox",
    Attributes: { Way_Colours: { 1: "#f50ad6", 2: "#fa9e00" } } };
  const fep = (way) => ({ Feature_Role: "feederpoint",
    Attributes: { Circuit_ID: 3, Link_Box_ID: 10, Link_Way: way } });

  if (wayColourOf(fep(1), [box]) !== "#f50ad6") {
    fail("a stop on output 1 does not take output 1's colour");
  }
  if (wayColourOf(fep(2), [box]) === wayColourOf(fep(1), [box])) {
    fail("two outputs' stops come out the same colour");
  }
  /* Null, not a guess, so the caller falls back to the circuit. */
  if (wayColourOf({ Attributes: { Circuit_ID: 3 } }, [box]) != null) {
    fail("a point that is not on an output was given an output's colour");
  }
  if (wayColourOf(fep(1), []) != null) {
    fail("a point whose box has gone was given a colour from nowhere");
  }
  if (wayColourOf(fep(4), [box]) != null) {
    fail("an output with no colour set was given one anyway");
  }

  /* And both readers go through it. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const uses = canvas.split("wayColourOf(").length - 1;
  if (uses < 2) {
    fail(`${uses} place(s) use the shared rule \u2014 the drawing and the picker `
      + "both need it, or the swatch and the symbol disagree");
  }
  if (/const boxId = f\.Attributes\?\.Link_Box_ID;/.test(canvas)) {
    fail("the canvas still works the output's colour out for itself");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Output isolation behaves (the other outputs go, the input and the "
  + "dig stay).");
process.exit(bad ? 1 : 0);
