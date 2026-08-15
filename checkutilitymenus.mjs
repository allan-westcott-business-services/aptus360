/* Opening a utility menu switches to that utility.

   Even where there is none of it. The menus used to isolate only when
   the utility had something on the drawing — the intent was not to
   blank the canvas over nothing, and the effect was the opposite:
   opening Water on a site with no water left the electric drawing on
   screen, so the answer to "show me the water" was somebody else's
   design, and nothing said it had been refused.

   An empty utility is a real answer. A blank canvas over the site plan
   says there is no water design here, and it cannot be mistaken for a
   drawing of anything else. */
import { readFileSync } from "node:fs";
import { inLightingView } from "./src/features/gis/lightingView.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

// 1. No menu opens behind a count of what it holds.
//
//    The guard read `if (classCount.electric > 0)` and its equivalent in
//    the gas and water loop. Either form leaves a utility unreachable
//    the moment it is empty, which is exactly when somebody most needs
//    to see that it is.
{
  const opens = [...canvas.matchAll(/onOpen=\{[^}]*\}/g)].map((m) => m[0]);
  if (!opens.length) fail("no menu isolates on opening any more");

  for (const o of opens) {
    if (/classCount/.test(o)) {
      fail(`a menu still opens only when it has something in it: ${o.slice(0, 70)}`);
    }
  }

  /* And they do still isolate — removing the guard by removing the
     isolate would pass the test above and lose the feature. */
  const isolating = opens.filter((o) => /soloClass\(/.test(o));
  if (!isolating.length) fail("no menu isolates its utility on opening");
}

/* Every utility menu isolates, named rather than counted.

   Counting the handlers is the wrong test: gas and water are one
   handler in a loop over two layers, so the number in the source says
   nothing about the number of menus. What matters is that each utility
   is named by something that isolates it — and Street Lighting was the
   one that was not, having no isolate at all rather than a guarded one. */
{
  /* The two written out are named literally. Accepting `soloClass(key`
     as evidence for either would let the gas and water loop stand in
     for them — which it did, and hid a missing lighting isolate. */
  for (const key of ["electric", "lighting"]) {
    if (!canvas.includes(`soloClass("${key}", true)`)) {
      fail(`nothing isolates ${key} when its menu opens`);
    }
  }

  /* Gas and water are one handler over a list of two. Both halves are
     checked: the loop has to exist, and it has to isolate. */
  if (!/\[\["gas", "Gas"\], \["water", "Water"\]\]/.test(canvas)) {
    fail("the gas and water menus are no longer built from one list");
  }
  if (!/onOpen=\{[^}]*soloClass\(key, true\)/.test(canvas)) {
    fail("the gas and water loop does not isolate on opening");
  }
}

// 2. Isolated with `only`, so opening twice does not undo it.
//
//    soloClass toggles unless told otherwise: without the flag, opening
//    the Gas menu a second time would show every layer again, which is
//    the opposite of what opening it is for.
{
  for (const m of canvas.matchAll(/onOpen=\{[^}]*soloClass\(([^)]*)\)/g)) {
    if (!/,\s*true/.test(m[1])) {
      fail(`a menu isolates without the only flag: soloClass(${m[1]})`);
    }
  }
}

/* applyShown as the canvas has it, so what a menu does to the drawing
   can be checked without a browser. Two things survive an isolate on
   purpose — the background plan and the span nodes — and both are here
   because losing either would be a regression this file should catch. */
const BASEMAP_KEY = "basemap";
const classKeys = (f) => {
  const k = [f.Layer_Key];
  if (f.Attributes?.Line_Type) k.push(`lt:${f.Attributes.Line_Type}`);
  if (f.Feature_Role) k.push(`role:${f.Feature_Role}`);
  return k;
};
function hiddenFor(features, keys) {
  if (!keys.length) return [];
  const keep = new Set();
  const all = new Set();
  for (const f of features) {
    const ks = classKeys(f);
    ks.forEach((k) => all.add(k));
    if (ks.some((k) => keys.includes(k))) ks.forEach((k) => keep.add(k));
  }
  all.add(BASEMAP_KEY);
  keep.add(BASEMAP_KEY);
  for (const k of all) {
    if (k === "role:spannode" || k.endsWith(":role:spannode")) keep.add(k);
  }
  return [...all].filter((k) => !keep.has(k));
}

/* A site with electric and gas drawn, and no water — the case that
   started this. */
const SITE = [
  { Feature_ID: 1, Layer_Key: "electric", Attributes: { Line_Type: "elec_main" } },
  { Feature_ID: 5, Layer_Key: "lighting", Attributes: { Line_Type: "light_main" } },
  { Feature_ID: 2, Layer_Key: "gas", Attributes: { Line_Type: "gas_main" } },
  { Feature_ID: 3, Layer_Key: "trench", Attributes: { Line_Type: "trench_main" } },
  { Feature_ID: 4, Layer_Key: "electric", Feature_Role: "spannode" },
];
const onScreen = (keys) => {
  const hidden = hiddenFor(SITE, keys);
  return SITE.filter((f) => !classKeys(f).some((k) => hidden.includes(k)))
    .map((f) => f.Feature_ID);
};

// 3. A utility with nothing drawn shows nothing.
{
  const water = onScreen(["water"]);
  if (water.length) fail(`isolating water left ${water.length} feature(s) on screen`);

  /* Specifically, none of the electric — which is what was happening. */
  if (water.includes(1)) fail("isolating water left the electric main on screen");
}

// 4. A utility with something drawn still shows it, and only it.
{
  const gas = onScreen(["gas"]);
  if (!gas.includes(2)) fail("isolating gas hid the gas main");
  if (gas.includes(1)) fail("isolating gas left the electric main on screen");
  if (gas.includes(3)) fail("isolating gas left the trench on screen");
}

// 5. Street Lighting behaves like the rest.
//
//    It had no isolate at all, so opening it left whatever was on screen
//    where it was — the same wrong answer the guard gave elsewhere,
//    arrived at by doing nothing rather than by checking first.
{
  const lit = onScreen(["lighting"]);
  if (!lit.includes(5)) fail("isolating street lighting hid the lighting");
  if (lit.includes(1)) fail("isolating street lighting left the electric on screen");
  if (lit.includes(2)) fail("isolating street lighting left the gas on screen");
}

// 6. Span nodes survive an isolate, empty or not.
//
//    A utility shown without the points it is measured between is half
//    the drawing. They survive by their own rule rather than by
//    belonging to the utility, so an empty utility keeps them too.
{
  if (!onScreen(["electric"]).includes(4)) {
    fail("isolating electric hid the span nodes");
  }
  const hidden = hiddenFor(SITE, ["water"]);
  if (hidden.includes("role:spannode")) {
    fail("isolating an empty utility hid the span nodes");
  }
  /* And the background plan, which is not a feature at all. A utility
     over no survey is a blank screen rather than an empty design. */
  if (hidden.includes(BASEMAP_KEY)) {
    fail("isolating an empty utility hid the background plan");
  }
}

// 7. The lighting drawing shows what was asked for, and nothing else.
{
  const shown = [
    ["lighting cable", { Layer_Key: "lighting", Attributes: { Line_Type: "light_main" } }],
    ["lighting column", { Layer_Key: "lighting", Feature_Role: "column" }],
    ["the substation", { Layer_Key: "electric", Feature_Role: "substation" }],
    ["the LV mains", { Layer_Key: "electric", Attributes: { Line_Type: "elec_main" } }],
    ["breech joints", {
      Layer_Key: "electric", Feature_Role: "joint", Attributes: { Joint_Type: "breech" },
    }],
    ["breech joints by code", {
      Layer_Key: "electric", Feature_Role: "joint", Attributes: { Joint_Code: "BRE" },
    }],
    ["span nodes", { Layer_Key: "electric", Feature_Role: "spannode" }],
  ];
  const hidden = [
    ["services to plots", { Layer_Key: "electric", Attributes: { Line_Type: "elec_service" } }],
    ["service joints", {
      Layer_Key: "electric", Feature_Role: "joint", Attributes: { Joint_Type: "service" },
    }],
    ["electric meters", { Layer_Key: "electric", Feature_Role: "meter" }],
    /* Not on either list, and left out: the lighting cable runs in
       trench, but the trench is not wanted on this drawing. */
    ["the trench", { Layer_Key: "trench", Attributes: { Line_Type: "trench_main" } }],
    ["gas", { Layer_Key: "gas", Attributes: { Line_Type: "gas_main" } }],
    ["water", { Layer_Key: "water", Attributes: { Line_Type: "water_main" } }],
    ["plot seeds", { Layer_Key: "plot", Feature_Role: "plot" }],
  ];

  for (const [what, f] of shown) {
    if (!inLightingView(f)) fail(`the lighting drawing hides ${what}`);
  }
  for (const [what, f] of hidden) {
    if (inLightingView(f)) fail(`the lighting drawing shows ${what}`);
  }

  /* The one the class keys cannot do. A breech joint and a service
     joint carry the same keys — role:joint and electric:role:joint — so
     if this ever stops being a feature test and becomes a key test,
     both come back or neither does. */
  const breech = {
    Layer_Key: "electric", Feature_Role: "joint", Attributes: { Joint_Type: "breech" },
  };
  const service = {
    Layer_Key: "electric", Feature_Role: "joint", Attributes: { Joint_Type: "service" },
  };
  if (inLightingView(breech) === inLightingView(service)) {
    fail("breech and service joints are treated alike, which is the fault this fixes");
  }
}

// 8. The canvas uses it, and uses it before the hidden keys.
//
//    The isolate that turns this drawing on hides the electric layer
//    wholesale, so asking the hidden set first would take the LV mains
//    and the substation with it — which are the point of the view.
{
  if (!/import \{ inLightingView \} from "\.\/lightingView\.js"/.test(canvas)) {
    fail("the canvas does not use the shared lighting predicate");
  }
  if (!/const lightingView = solo === "lighting"/.test(canvas)) {
    fail("the lighting drawing is not derived from the isolate");
  }
  if (!/if \(lightingView\) return inLightingView\(f\);/.test(canvas)) {
    fail("the visible list does not use the lighting drawing");
  }
  const at = canvas.indexOf("if (lightingView) return inLightingView(f);");
  const keys = canvas.indexOf("if (keys.some((k) => hidden.includes(k))) return false;");
  if (at < 0 || keys < 0 || at > keys) {
    fail("the lighting drawing is asked after the hidden keys, which would hide the LV mains");
  }
  /* Off `solo` rather than a second flag, so there is nothing to fall
     out of step with the isolate that set it. */
  if (/useState\([^)]*\)\s*;\s*\/\/\s*lightingView/.test(canvas)) {
    fail("the lighting drawing has its own state to keep in step");
  }
}

// 9. The property boundary point is off the lighting drawing.
//
//    It marks where a plot's supplies enter it — a house connection,
//    like the services and meters already left off. It needs its own
//    rule because it is not a feature: it is an attribute of the plot
//    seed, painted in a pass of its own, so hiding the seeds does not
//    take it with them and the isolate cannot see it at all. Its key,
//    "plot:boundary", is carried by nothing, so the sweep that builds
//    the hidden set never touches it.
{
  const at = canvas.indexOf("const boundaryShown = useMemo(");
  if (at < 0) fail("nothing decides whether the boundary point is drawn");
  else {
    /* To the end of the useMemo rather than a fixed number of
       characters past its dependency list — that list has grown once
       already and the check went red for it. */
    const body = canvas.slice(at, canvas.indexOf("boundaryStyle]", at) + 20);
    if (!/!lightingView/.test(body)) {
      fail("the boundary point is still drawn on the lighting drawing");
    }
    if (!/\blightingView\b(?=[^[]*\])/.test(body) && !/lightingView[,\]]/.test(body)) {
      fail("the boundary point does not re-read when the drawing changes");
    }
    /* And still shown everywhere else — a boundary point is worth
       reading on a drawing with the plot seeds turned off, which is why
       it does not simply follow them. */
    if (!/!hidden\.includes\("plot:boundary"\)/.test(body)) {
      fail("the boundary point no longer answers to its own switch");
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Utility menus behave (an empty utility is shown as empty, not skipped).");
process.exit(bad ? 1 : 0);
