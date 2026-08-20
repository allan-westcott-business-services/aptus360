/* Adding plots to a circuit that already exists.

   Two faults, and the second is what made the first unrecoverable.

   Link to Circuit called nextCircuitId every time, so it could only
   ever make a new circuit. Drawing round the second phase of an estate
   put those meters on a brand new circuit with its own way on the
   board, and nothing said so.

   The only way to move a meter between circuits is the Circuit Report,
   and that was greyed unless a substation existed — while everything
   else that needs a source asks lvOrigin, which takes a substation OR
   an electric POC. So on a POC-fed design the escape route was the one
   control disabled, with a hint describing what it would do rather than
   why it would not.

   Read from the source rather than mounted: the canvas is nineteen
   thousand lines and does not mount without a project, a basemap and a
   drawing. What is checkable here is the arithmetic underneath — which
   is imported — and that the two call sites still ask the right
   question. */
import { readFileSync } from "node:fs";
import {
  circuitsFrom, nextCircuitId, assignWay, circuitLetter,
} from "./src/features/gis/electric.js";
import { lvOrigin } from "./src/features/gis/feeder.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

const meter = (id, circuitId, plotId) => ({
  Feature_ID: id, Layer_Key: "electric", Feature_Role: "meter",
  Geometry: [[id, 0]],
  Attributes: circuitId == null
    ? { Plot_ID: plotId ?? id }
    : {
      Plot_ID: plotId ?? id, Circuit_ID: circuitId,
      Circuit_Name: `Circuit ${circuitId}`, Circuit_Letter: circuitLetter(circuitId),
    },
});

// 1. A POC is a source, and the report must be gated on that.
{
  const poc = {
    Feature_ID: 900, Layer_Key: "electric", Feature_Role: "poc",
    Geometry: [[0, 0]], Attributes: { Output: 500 },
  };
  const sub = {
    Feature_ID: 901, Layer_Key: "electric", Feature_Role: "substation",
    Geometry: [[0, 0]], Attributes: {},
  };
  if (!lvOrigin([poc])) fail("a POC is not treated as an LV origin");
  if (!lvOrigin([sub])) fail("a substation is not treated as an LV origin");
  if (lvOrigin([])) fail("a drawing with no source produced one");

  /* The menu item must ask lvOrigin, not look for a substation. That
     one word is the whole of the second fault. */
  const item = /<MenuItem label="Circuit Report"[\s\S]*?onClick=\{[^}]*\}\s*\/>/
    .exec(canvas);
  if (!item) fail("the Circuit Report menu item is not where this can read it");
  else {
    if (/disabled=\{![^}]*Feature_Role === "substation"/.test(item[0])) {
      fail("the Circuit Report is still greyed unless there is a substation"
        + " \u2014 a POC-fed design has circuits and no transformer");
    }
    if (!/disabled=\{!lvOrigin\(features\)\}/.test(item[0])) {
      fail("the Circuit Report is not gated on lvOrigin like everything else");
    }
    /* And says why when it is off. A greyed control with no reason is
       what sent somebody looking for a control that already existed. */
    if (!/hint=\{lvOrigin\(features\)/.test(item[0])) {
      fail("the Circuit Report gives no reason when it is disabled");
    }
  }
}

// 2. Link to Circuit can join an existing circuit.
{
  if (!/async function createCircuitFrom\(meters, how, joinId = null\)/.test(canvas)) {
    fail("createCircuitFrom cannot be told which circuit to join");
  }
  /* Unconditionally calling nextCircuitId is the fault itself. It must
     now be reached only when nothing is being joined. */
  if (/const circuitId = nextCircuitId\(features\);/.test(canvas)) {
    fail("a new circuit id is still taken unconditionally");
  }
  /* And the dialog has to be offered. finishCircuit going straight to
     createCircuitFrom is what it did before. */
  if (!/setCircuitPick\(\{/.test(canvas)) {
    fail("Link to Circuit never asks which circuit");
  }
  /* Not asked when there is nothing to join — a dialog offering one
     option is a click for no reason. */
  if (!/if \(!circuits\.length\) \{/.test(canvas)) {
    fail("the dialog is offered even when no circuit exists to join");
  }
}

// 3. Joining reuses the way; it does not consume a second one.
{
  const sub = {
    Feature_ID: 901, Feature_Role: "substation", Layer_Key: "electric",
    Geometry: [[0, 0]],
    Attributes: { Ways: 4, Way_Fuse_A: 400, Output_V: 400, Way_Circuits: { 1: 1 } },
  };
  const joined = assignWay(sub, 1, 30);
  if (joined.changed) fail("joining a circuit allocated it another way");
  if (Number(joined.way) !== 1) fail(`joining circuit 1 landed on way ${joined.way}`);
  if (Object.keys(joined.map).length !== 1) {
    fail("joining a circuit left a second way spoken for");
  }

  /* A genuinely new circuit still takes the next free one. */
  const fresh = assignWay(sub, 2, 30);
  if (!fresh.changed || Number(fresh.way) !== 2) {
    fail(`a new circuit took way ${fresh.way}, changed=${fresh.changed}`);
  }
}

// 4. The load is the circuit's, not the newcomers'.
//
//    A circuit gaining two plots draws what all its plots draw. Sizing
//    the way from the two being added would say a mature circuit is
//    tiny, which is the number the over-fuse warning is read off.
{
  if (!/const onCircuit = existing/.test(canvas)) {
    fail("the way's load is measured from the meters being added, not the circuit");
  }
  /* And a meter cannot be counted twice if it is somehow in both
     lists. */
  if (!/!meters\.some\(\(x\) => Number\(x\.Feature_ID\) === Number\(m\.Feature_ID\)\)/
    .test(canvas)) {
    fail("a meter present in both lists would be counted twice");
  }
}

// 5. What the dialog is offered, read off the drawing.
{
  const features = [
    meter(1, 7), meter(2, 7),          // an existing circuit, two meters
    meter(3, 8),                        // another
    meter(4, null), meter(5, null),     // the new plots, on nothing
  ];
  const circuits = circuitsFrom(features);
  if (circuits.length !== 2) fail(`${circuits.length} circuits found, not 2`);
  if (circuits[0].id !== 7 || circuits[1].id !== 8) {
    fail("circuits are not listed in order");
  }
  if (circuits[0].meters.length !== 2) fail("a circuit's meters were miscounted");

  /* The name comes off the circuit, not from recomputing it — a circuit
     renamed by hand must not be silently renamed back. */
  const renamed = [{ ...meter(1, 7), Attributes: {
    Plot_ID: 1, Circuit_ID: 7, Circuit_Name: "Phase 1 west", Circuit_Letter: "G",
  } }];
  const one = circuitsFrom(renamed)[0];
  if (one.name !== "Phase 1 west") fail(`a renamed circuit came back as "${one.name}"`);
  if (one.letter !== "G") fail(`a circuit's letter was recomputed to "${one.letter}"`);

  /* A new circuit takes the lowest free number, not the highest in use
     plus one. Deliberate: releaseWays puts a deleted circuit's number
     back into use, so with 7 and 8 drawn the next one is 1. Asserting
     "above everything" here would have been asserting a bug. */
  const used = new Set(features.map((f) => Number(f.Attributes?.Circuit_ID))
    .filter((n) => Number.isFinite(n)));
  const next = nextCircuitId(features);
  if (used.has(next)) fail(`the next circuit id is ${next}, which is already taken`);
  if (next !== 1) fail(`the next circuit id is ${next}; 1 is free and should be reused`);
}

// 6. Meters already on a circuit are left alone.
//
//    Moving one is a different act: the Circuit Report is where a meter
//    comes off one circuit and goes on another, and doing it silently
//    here would reassign without freeing the old circuit's way.
{
  if (!/const free = meters\.filter\(\(m\) => m\.Attributes\?\.Circuit_ID == null\)/
    .test(canvas)) {
    fail("Link to Circuit no longer leaves already-circuited meters alone");
  }
  if (!/Circuit Report to move one from one circuit to another/.test(canvas)) {
    fail("an outline of meters already circuited does not say what to do instead");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Circuits behave (join an existing one, one way per circuit, report reachable).");
process.exit(bad ? 1 : 0);
