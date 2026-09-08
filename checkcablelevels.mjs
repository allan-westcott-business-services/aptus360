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

// 2. The pairing prefers the build's own answer.
//
//    `syncNodeCables` keeps each point's COPY of the cable size in step
//    with the cable. Which point a cable feeds was decided by
//    `nodeFedBy`, from where the cable's ends lie relative to the
//    substation \u2014 a guess, and on the reported drawing it paired the
//    section leaving the substation with the wrong point.
//
//    The copy is now only a fallback for the levels (see 4 below), so
//    this no longer decides the figures. It still decides what the
//    drawing and the bill show against a point, which is reason enough
//    to keep it right.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/const pointByLabel = new Map\(\);/.test(canvas)) {
    fail("the sync has no way to read the build's own pairing");
  }
  if (!/const named = line\.Attributes\?\.Generated/.test(canvas)) {
    fail("a section the build laid is paired by geometry rather than by the "
      + "point it was named after");
  }
  /* The geometric rule stays for anything the build did not lay: a
     hand-drawn cable carries no section label. */
  if (!/const node = named \?\? nodeFedBy\(line, src\);/.test(canvas)) {
    fail("the geometric rule was removed, so a hand-drawn cable pairs with "
      + "nothing at all");
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

// 4. The levels read the RUN, not the point's copy of it.
//
//    This is the root the three fixes above were patching around. The
//    volt drop is settled from a part's span nodes, and each of those
//    took its cable from `cableIdOf(feature)` \u2014 the copy stored on the
//    point. So changing a cable moved the legs and left every figure
//    exactly where it was, and the only thing that helped was writing
//    the copy too.
//
//    The legs had always preferred the run: "the run is where the cable
//    actually lives; the node's copy is fault 13 waiting to be read."
//    The span nodes never learnt it.
{
  const src = readFileSync("./src/features/gis/feeder.js", "utf8");
  if (!/cableSizeId: legCableAt\.get\(index\) \?\? cableIdOf\(f\)/.test(src)) {
    fail("a span node takes its cable from the point's stored copy, so the "
      + "levels cannot follow a cable that was changed");
  }
  /* The copy stays as the FALLBACK: a stop no leg reached has nothing
     else to go on. */
  if (!/\?\? cableIdOf\(f\)/.test(src)) {
    fail("the point's copy was removed entirely, so a stop no leg reached "
      + "has no cable at all");
  }
  const decl = src.indexOf("const legCableAt = new Map();");
  if (decl < 0 || decl > src.indexOf("legCableAt.get(index)")) {
    fail("the map is used before it is built");
  }

  /* And the figures follow a cable change with NOTHING else touched \u2014
     no sync, no copy written, no rebuild. */
  const origin = f.find((x) => x.Feature_Role === "feederpoint"
    && Number(x.Attributes?.Circuit_ID) === 2 && Number(x.Attributes?.Span_Seq) === 0);
  const cat = {
    1: { Cable_Size_ID: 1, Loop_Impedance_Ohm: 0.9785, Volt_Drop_Base: 3094 },
    3: { Cable_Size_ID: 3, Loop_Impedance_Ohm: 0.3200, Volt_Drop_Base: 1000 },
  };
  const base = { cableById: (id) => cat[Number(id)] ?? null, limits: {},
    transformer: { Loop_Impedance_Ohm: 0.02 }, voltageV: 400, startPct: 0 };
  const pcts = (world) => {
    const mem = circuitMembership(world, 2);
    const parts = circuitTraceParts(world, origin.Feature_ID,
      { lineTypes: raw.lineTypes || [], circuitId: 2, plotById: () => null,
        nrsById: () => null, seedIds: mem.seedIds, meterIds: mem.meterIds,
        stopAt: "spannodes" });
    const figs = levelsForParts(parts, { features: world, base });
    const out = {};
    for (const [id, v] of figs) {
      const ft = world.find((x) => Number(x.Feature_ID) === Number(id));
      out[ft?.Attributes?.Span_Label ?? id] = v.pct;
    }
    return out;
  };
  const first = f.find((x) => x.Attributes?.Line_Type === "elec_main"
    && Number(x.Attributes?.Circuit_ID) === 2 && x.Label === "B1");
  if (first) {
    const before = pcts(f);
    const after = pcts(f.map((x) => (Number(x.Feature_ID) === Number(first.Feature_ID)
      ? { ...x, Attributes: { ...x.Attributes, Manual_VD_Cable_Size_ID: 3 } } : x)));
    const moved = Object.keys(before).filter((k) => before[k] !== after[k]);
    if (!moved.length) {
      fail("changing a cable moved no figure at all, with no sync in the way");
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Changing a cable changes the levels below it.");
process.exit(bad ? 1 : 0);
