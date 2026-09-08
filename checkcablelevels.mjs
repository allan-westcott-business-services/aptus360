/* Changing a cable changes the levels below it.

   A cable's size is held twice: on the run, and on the span point the
   volt drop sum reads it from. Keeping the two in step is
   `syncNodeCables`, and which point a cable feeds was decided by
   `nodeFedBy` — from where the cable's ends lie relative to the
   substation.

   That is a guess, and where two points sit close together it picks the
   wrong one. On the reported drawing, cable "B1" — the section leaving
   the substation — was paired with point B2. Changing it moved B2's
   figure and left B1's exactly where it was. */
import { readFileSync } from "node:fs";
import { nodeFedBy, nodesFedBy } from "./src/features/gis/spanNodes.js";
import { cableIdOf, circuitMembership, circuitTraceParts } from "./src/features/gis/feeder.js";
import { levelsForParts } from "./src/features/gis/voltDrop.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const raw = JSON.parse(readFileSync("./fixtures/drawing-6-cable-levels.json", "utf8"));
const f = raw.features;

// 1. The build's own answer is preferred to the geometric guess.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/const pointByLabel = new Map\(\);/.test(canvas)) {
    fail("the sync has no way to read the build's own pairing");
  }
  if (!/const named = line\.Attributes\?\.Generated/.test(canvas)) {
    fail("a section the build laid is paired by geometry rather than by the "
      + "point it was named after");
  }
  /* Only for what the build laid. A cable drawn by hand carries no
     section label and has only its ends to go on. */
  if (!/const node = named \?\? nodeFedBy\(line, src\);/.test(canvas)) {
    fail("the geometric rule was removed, so a hand-drawn cable pairs with "
      + "nothing at all");
  }
}

// 2. On the reported drawing, every level below the changed cable moves.
{
  const origin = f.find((x) => x.Feature_Role === "feederpoint"
    && Number(x.Attributes?.Circuit_ID) === 2 && Number(x.Attributes?.Span_Seq) === 0);
  /* Two sizes far enough apart that a wrong pairing cannot look right. */
  const cat = {
    1: { Cable_Size_ID: 1, Loop_Impedance_Ohm: 0.9785, Volt_Drop_Base: 3094 },
    3: { Cable_Size_ID: 3, Loop_Impedance_Ohm: 0.3200, Volt_Drop_Base: 1000 },
  };
  const base = { cableById: (id) => cat[Number(id)] ?? null, limits: {},
    transformer: { Loop_Impedance_Ohm: 0.02 }, voltageV: 400, startPct: 0 };

  const sync = (world) => {
    const byLabel = new Map();
    for (const x of world) {
      if (x.Feature_Role !== "feederpoint" && x.Feature_Role !== "spannode") continue;
      const lab = x.Attributes?.Span_Label;
      if (lab != null && lab !== "") byLabel.set(String(lab), x);
    }
    const pairs = new Map();
    for (const line of world) {
      if (line.Feature_Type !== "line" || line.Layer_Key !== "electric") continue;
      const named = line.Attributes?.Generated
        ? byLabel.get(String(line.Label ?? "")) : null;
      const node = named ?? nodeFedBy(line, world);
      const id = cableIdOf(line);
      if (node && id != null) pairs.set(Number(node.Feature_ID), id);
    }
    return world.map((x) => (pairs.has(Number(x.Feature_ID))
      ? { ...x, Attributes: { ...x.Attributes,
        Manual_VD_Cable_Size_ID: pairs.get(Number(x.Feature_ID)) } } : x));
  };
  const pcts = (world) => {
    const { seedIds, meterIds } = circuitMembership(world, 2);
    const parts = circuitTraceParts(world, origin.Feature_ID,
      { lineTypes: raw.lineTypes || [], circuitId: 2, plotById: () => null,
        nrsById: () => null, seedIds, meterIds, stopAt: "spannodes" });
    const figs = levelsForParts(parts, { features: world, base });
    const out = {};
    for (const [id, v] of figs) {
      const ft = world.find((x) => Number(x.Feature_ID) === Number(id));
      out[ft?.Attributes?.Span_Label ?? id] = v.pct;
    }
    return out;
  };

  /* The section leaving the substation: the one the build named after
     the first point on the circuit. */
  const first = f.find((x) => x.Attributes?.Line_Type === "elec_main"
    && Number(x.Attributes?.Circuit_ID) === 2 && x.Label === "B1");
  if (!first) {
    fail("the fixture has no section leaving the substation, so this is "
      + "untested");
  } else {
    const before = pcts(sync(f));
    const after = pcts(sync(f.map((x) => (Number(x.Feature_ID) === Number(first.Feature_ID)
      ? { ...x, Attributes: { ...x.Attributes, Manual_VD_Cable_Size_ID: 3 } } : x))));

    /* A bigger cable drops less: every point below it must improve. */
    for (const k of Object.keys(before)) {
      if (!(after[k] < before[k])) {
        fail(`${k} did not improve when the cable leaving the substation was `
          + `made bigger: ${before[k]?.toFixed(3)}% then ${after[k]?.toFixed(3)}%`);
      }
    }
  }
}

// 3. A cable set BY HAND counts as out of step.
//
//    `cablesOutOfStep` compared `VD_Cable_Size_ID` on each side and
//    ignored the override entirely. So a cable set by hand drifted from
//    its point without ever being reported: the calculated field was
//    unchanged on both, the warning never appeared, the "fix" button
//    never offered itself, and the levels went on being costed from the
//    point's old size.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("const cablesOutOfStep");
  const body = canvas.slice(at, canvas.indexOf("\n  }, [", at));
  if (!/wantManual/.test(body)) {
    fail("the out-of-step check ignores the override, so a cable set by hand "
      + "never reports drift and the fix button never appears");
  }
  if (!/String\(a\.Manual_VD_Cable_Size_ID \?\? ""\) !== String\(wantManual \?\? ""\)/
    .test(body)) {
    fail("the override is read and not compared");
  }
  /* A cable with neither size is not drift, it is a cable nobody has
     sized. */
  if (!/if \(wantSystem == null && wantManual == null\) continue;/.test(body)) {
    fail("a cable with no size at all is reported as out of step");
  }

  /* And on the reported drawing an override does register. */
  const changed = f.map((x) => (x.Attributes?.Line_Type === "elec_main"
    && Number(x.Attributes?.Circuit_ID) === 2 && x.Label === "B1"
    ? { ...x, Attributes: { ...x.Attributes, Manual_VD_Cable_Size_ID: 3 } } : x));
  let seen = 0;
  for (const line of changed) {
    if (line.Feature_Type !== "line" || line.Layer_Key !== "electric") continue;
    if (line.Attributes?.Circuit_ID == null) continue;
    const ws = line.Attributes?.VD_Cable_Size_ID ?? null;
    const wm = line.Attributes?.Manual_VD_Cable_Size_ID ?? null;
    if (ws == null && wm == null) continue;
    for (const nd of nodesFedBy(line, changed)) {
      const a = nd.Attributes || {};
      if (String(a.VD_Cable_Size_ID ?? "") !== String(ws ?? "")
        || String(a.Manual_VD_Cable_Size_ID ?? "") !== String(wm ?? "")) seen++;
    }
  }
  if (!seen) {
    fail("overriding a cable on the fixture reports no drift at all, so "
      + "nothing would prompt the points to be brought into step");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Changing a cable changes the levels below it.");
process.exit(bad ? 1 : 0);
