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
     isolate would pass the test above and lose the feature.

     Two spellings, because the isolate moved for three of the four.
     `utilityMenuOpen` isolates on the first press and opens on the
     second; `soloClass` does both in one press and is what Street
     Lighting still does. Accepting either here keeps this test about
     "something isolates", which is all it was ever for — the split is
     tested below, by menu, so a menu that quietly lost its two-press
     behaviour cannot hide behind this line. */
  const isolating = opens.filter((o) => /soloClass\(|utilityMenuOpen\(/.test(o));
  if (!isolating.length) fail("no menu isolates its utility on opening");
}

/* Every utility menu isolates, named rather than counted.

   Counting the handlers is the wrong test: gas and water are one
   handler in a loop over two layers, so the number in the source says
   nothing about the number of menus. What matters is that each utility
   is named by something that isolates it — and Street Lighting was the
   one that was not, having no isolate at all rather than a guarded one. */
{
  /* Electric is named literally. Accepting `utilityMenuOpen(key` as
     evidence for it would let the gas and water loop stand in for it —
     which is how a missing lighting isolate hid once already. */
  if (!/onOpen=\{[^}]*utilityMenuOpen\("electric"/.test(canvas)) {
    fail("nothing isolates electric when its menu button is pressed");
  }

  /* Street lighting, on the same rule as the rest since it was brought
     into line. It was the exception twice — no isolate at all to begin
     with, then the one-press form after the others were split — so it
     is named separately rather than covered by a count, which is how
     the missing isolate hid the first time.

     `soloClass("lighting", true)` must NOT come back: that is the
     one-press form, and it would leave three buttons wanting two
     presses and a fourth wanting one. */
  if (!/onOpen=\{[^}]*utilityMenuOpen\("lighting"/.test(canvas)) {
    fail("street lighting does not isolate on the first press like the others");
  }
  if (canvas.includes(`soloClass("lighting", true)`)) {
    fail("street lighting is back to isolating and opening in one press");
  }

  /* Gas and water are one handler over a list of two. Both halves are
     checked: the loop has to exist, and it has to isolate. `name` is
     passed as well as `key`, because a utility with no layer on the
     drawing has no Label and the refusal message would read blank. */
  if (!/\[\["gas", "Gas"\], \["water", "Water"\]\]/.test(canvas)) {
    fail("the gas and water menus are no longer built from one list");
  }
  if (!/onOpen=\{[^}]*utilityMenuOpen\(key, name\)/.test(canvas)) {
    fail("the gas and water loop does not isolate on being pressed");
  }
}

// 2. Isolated with `only`, so pressing twice does not undo it.
//
//    soloClass toggles unless told otherwise: without the flag, the
//    second press — the one that opens the menu — would show every
//    layer again, which is the opposite of what pressing it is for.
//    That was true when the isolate sat in the handler and it is still
//    true now it sits in utilityMenuOpen, so both places are read.
{
  for (const m of canvas.matchAll(/onOpen=\{[^}]*soloClass\(([^)]*)\)/g)) {
    if (!/,\s*true/.test(m[1])) {
      fail(`a menu isolates without the only flag: soloClass(${m[1]})`);
    }
  }

  const body = canvas.match(
    /const utilityMenuOpen = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/);
  if (!body) {
    fail("utilityMenuOpen is not where this check can read it");
  } else {
    const solo = body[0].match(/soloClass\(([^)]*)\)/);
    if (!solo) fail("utilityMenuOpen no longer isolates anything");
    else if (!/,\s*true/.test(solo[1])) {
      fail(`utilityMenuOpen isolates without the only flag: soloClass(${solo[1]})`);
    }
    /* And it refuses. Isolating without returning false would leave the
       menu opening on the first press again, with the isolate still
       working — the feature lost while every other line here passed. */
    if (!/return false;/.test(body[0])) {
      fail("utilityMenuOpen isolates but does not hold the menu shut");
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
    /* To the end of the useMemo, found by its closing `]);` rather than
       by naming the last dependency.

       Anchoring on "boundaryStyle]" was itself a fixed guess: the list
       has now grown twice, and the second time it went red on correct
       code for exactly the reason the first fix was written to
       prevent. */
    const body = canvas.slice(at, canvas.indexOf("]);", at) + 3);
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

/* ── The two-press rule ──

   Pressing a utility menu button while looking at another utility means
   "show me this one". The menu is a list of things to do to a drawing,
   and opening it in the same press put it over a canvas that had become
   something else as it appeared. So the press isolates, and the next
   press — made with that drawing on screen — opens the menu.

   The rule is imported rather than restated. A local copy is what let
   checkspannodes pass through every fault it was written to catch. */
{
  const { utilityMenuPress, isIsolatedTo } =
    await import(process.cwd() + "/src/features/gis/utilityMenu.js");

  /* The sequence from the report, run as a sequence rather than as
     three unrelated assertions — the fault was never in one press, it
     was in what the second press did after the first. */
  let state = { solo: "gas", shownOnly: ["gas"] };            // looking at gas
  if (utilityMenuPress("electric", state) !== "isolate") {
    fail("pressing Electric from the gas drawing opened the electric menu");
  }
  state = { solo: "electric", shownOnly: ["electric"] };      // that press isolated
  if (utilityMenuPress("electric", state) !== "open") {
    fail("pressing Electric a second time did not open the electric menu");
  }
  /* And the way back is symmetrical: gas is now the one that takes two
     presses, because the drawing is no longer gas. */
  if (utilityMenuPress("gas", state) !== "isolate") {
    fail("pressing Gas from the electric drawing opened the gas menu");
  }

  /* Nothing isolated at all — the drawing showing everything. The menu
     does not open, because the press still has a change of subject to
     make first. */
  if (utilityMenuPress("gas", { solo: null, shownOnly: [] }) !== "isolate") {
    fail("pressing Gas on an un-isolated drawing opened the menu");
  }

  /* Two layers lit is not isolation. S can light gas and water together;
     the gas menu is not open-on-first-press there, because the drawing
     is not gas — it is gas and water. */
  if (utilityMenuPress("gas", { solo: null, shownOnly: ["gas", "water"] }) !== "isolate") {
    fail("a drawing showing two utilities counted as isolated to one");
  }
  if (isIsolatedTo("gas", { solo: "gas", shownOnly: ["gas", "water"] })) {
    fail("solo was trusted without the length beside it");
  }

  /* Isolated by some other route still counts. Pressing I on the gas row
     of the Layers menu leaves the drawing on gas, and the Gas button
     then opens on the first press — because there is nothing left for a
     first press to do. Reading "was this button pressed last" instead
     would be a second record of a fact the drawing already holds. */
  if (utilityMenuPress("gas", { solo: "gas", shownOnly: ["gas"] }) !== "open") {
    fail("a utility isolated from the Layers menu still demanded two presses");
  }

  /* ── Every utility menu is shaded, and only while it is live ──

     The colour comes off the layer, which is what the drawing is
     rendered in, so the button and the lines under it cannot disagree.
     There is no table of hexes to check against any more: 0183 made
     Utility.Colour the only record of a utility's colour, and the
     endpoint hands it over on the layer. */
  const { utilityTint } = await import(
    process.cwd() + "/src/features/gis/utilityMenu.js");

  /* Layers as the endpoint delivers them — colour already resolved. */
  const LAYERS = [
    { Layer_Key: "electric", Colour: "#ffbb00" },
    { Layer_Key: "gas", Colour: "#ff0000" },
    { Layer_Key: "water", Colour: "#2ccc00" },
    { Layer_Key: "lighting", Colour: "#ffbb00" },
    { Layer_Key: "trench", Colour: "#a855f7" },
  ];

  for (const key of ["electric", "gas", "water", "lighting"]) {
    const want = LAYERS.find((l) => l.Layer_Key === key).Colour;
    if (utilityTint(key, { solo: key, shownOnly: [key] }, LAYERS) !== want) {
      fail(`the ${key} button is not shaded in its layer's colour`);
    }
    if (utilityTint(key, { solo: "trench", shownOnly: ["trench"] }, LAYERS) !== null) {
      fail(`the ${key} button is shaded while another design is on screen`);
    }
  }

  /* The colour is read, not recognised: recolour the layer and the
     shading follows. This is what catches a lookup table creeping back
     in beside it. */
  if (utilityTint("gas", { solo: "gas", shownOnly: ["gas"] },
    [{ Layer_Key: "gas", Colour: "#123456" }]) !== "#123456") {
    fail("the shading does not follow the layer's colour");
  }

  /* A utility with no layer on this drawing shades nothing rather than
     falling back to a colour invented here. An empty utility is a real
     answer, and a hardcoded fallback is the copy 0183 removed. */
  if (utilityTint("water", { solo: "water", shownOnly: ["water"] },
    LAYERS.filter((l) => l.Layer_Key !== "water")) !== null) {
    fail("a utility with no layer on the drawing still shaded its button");
  }

  /* Only one at a time, which is what tells electric from lighting
     given they share a shade. */
  const lit = ["electric", "gas", "water", "lighting"]
    .filter((k) => utilityTint(k, { solo: "gas", shownOnly: ["gas"] }, LAYERS));
  if (lit.length !== 1 || lit[0] !== "gas") {
    fail(`${lit.length} buttons shaded at once: ${lit.join(", ")}`);
  }

  /* All four are wired in, and each is handed the layers — a tint call
     without them shades nothing, silently and for ever. */
  for (const call of ['utilityTint("electric"', "utilityTint(key,",
    'utilityTint("lighting"']) {
    if (!canvas.includes(call)) fail(`no menu asks for a tint via ${call}...)`);
  }
  for (const m of canvas.matchAll(/utilityTint\([^)]*\)/g)) {
    if (!/,\s*layers\)$/.test(m[0])) {
      fail(`a tint is asked for without the layers to read: ${m[0]}`);
    }
  }

  /* ── And no utility colour is written into the application ──

     The whole point of 0183. These may appear in the mock fixtures,
     which stand in for a response that has already resolved them, and
     nowhere else. Comments are stripped first so that describing a
     colour does not count as recording one. */
  {
    const { readdirSync, statSync } = await import("node:fs");
    const walk = (dir) => readdirSync(dir).flatMap((n) => {
      const f = `${dir}/${n}`;
      return statSync(f).isDirectory() ? walk(f) : [f];
    });
    const HEX = /#(?:ffbb00|ff0000|2ccc00)/i;
    for (const f of walk("./src").filter((x) => /\.(js|jsx)$/.test(x))) {
      if (f.endsWith("/api/gis.js") || f.endsWith("/lib/mockData.js")) continue;
      const body = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      if (HEX.test(body)) {
        fail(`${f.slice(2)} writes a utility colour — it belongs to Utility.Colour`);
      }
    }
  }
}

/* ── And the button obeys it ──

   Mounted and clicked, because the rule being right is only half of it:
   the Menu component has to act on a refusal, and the first version of
   this change left the previously open menu standing while the drawing
   changed underneath it. */
{
  const { build } = await import("esbuild");
  const { JSDOM } = await import("jsdom");

  const bundle = await build({
    entryPoints: ["src/features/gis/GisMenus.jsx"],
    bundle: true, write: false, format: "cjs", jsx: "automatic",
    platform: "browser", logLevel: "silent",
    external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
    define: { "process.env.NODE_ENV": '"development"' },
  });

  const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>",
    { url: "http://localhost/", pretendToBeVisual: true, runScripts: "outside-only" });
  const { window } = dom;
  for (const k of ["window", "document", "navigator", "HTMLElement", "Element",
    "Node", "Event", "MouseEvent", "getComputedStyle", "requestAnimationFrame",
    "cancelAnimationFrame", "sessionStorage", "localStorage"]) {
    if (globalThis[k] === undefined) globalThis[k] = window[k];
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const React = (await import("react")).default;
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const shared = {
    react: React,
    "react-dom": await import("react-dom"),
    "react-dom/client": await import("react-dom/client"),
    "react/jsx-runtime": await import("react/jsx-runtime"),
  };
  const shim = (id) => {
    const m = shared[id];
    if (!m) throw new Error("unexpected external: " + id);
    return m.default && m.default.createElement ? m.default : m;
  };
  const mod = { exports: {} };
  new Function("require", "module", "exports", "globalThis",
    bundle.outputFiles[0].text)(shim, mod, mod.exports, globalThis);
  const { MenuBar, Menu, MenuItem } = mod.exports;
  /* The drawing's colours, as the canvas receives them. */
  const COLOUR = { gas: "#ff0000", electric: "#ffbb00" };

  /* A drawing with two utility menus on it, sharing one isolate. The
     handler is the canvas's, in miniature: isolate and refuse, or allow
     the open — the branch under test, without the other twelve thousand
     lines around it.

     `tint` is derived from the same `isolated` the handler reads, which
     is how the canvas does it: both come off the drawing, so the shaded
     button and the open-on-first-press button are the same button by
     construction rather than by agreement. */
  const h = React.createElement;
  let isolated = "gas";                    // looking at gas
  const presses = [];
  function Bar() {
    const press = (key) => {
      presses.push(key);
      if (isolated === key) return true;   // already on it: open
      isolated = key;                      // change the subject, refuse
      return false;
    };
    const tintFor = (key) => (isolated === key ? COLOUR[key] : null);
    return h(MenuBar, null, ({ open, setOpen }) => [
      h(Menu, { key: "gas", id: "gas", label: "Gas", open, setOpen,
        onOpen: () => press("gas"), tint: tintFor("gas") },
      h(MenuItem, { label: "Gas thing" })),
      h(Menu, { key: "electric", id: "electric", label: "Electric", open, setOpen,
        onOpen: () => press("electric"), tint: tintFor("electric") },
      h(MenuItem, { label: "Electric thing" })),
    ]);
  }

  const root = createRoot(document.getElementById("root"));
  await act(async () => { root.render(h(Bar)); });

  const btn = (label) => [...document.querySelectorAll(".gm-btn")]
    .find((b) => b.textContent.trim() === label);
  const click = async (label) => {
    await act(async () => {
      btn(label).dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
  };
  const openMenus = () => [...document.querySelectorAll(".gm-menu")].length;
  const shows = (t) => document.body.textContent.includes(t);

  // Gas is what we are looking at, so its menu opens on one press.
  await click("Gas");
  if (!shows("Gas thing")) fail("the gas menu did not open on the gas drawing");

  /* Now Electric, from the gas menu. The drawing becomes electric and
     nothing opens — including the gas menu, which must not be left
     standing over a drawing that is no longer gas. */
  await click("Electric");
  if (shows("Electric thing")) fail("the electric menu opened on the first press");
  if (shows("Gas thing")) fail("the gas menu stayed open over the electric drawing");
  if (openMenus() !== 0) fail("a menu was left open by a refused press");
  if (isolated !== "electric") fail("the refused press did not isolate electric");

  // Pressed again, with electric on screen, it opens.
  await click("Electric");
  if (!shows("Electric thing")) fail("the electric menu did not open on the second press");

  /* ── Shaded in the utility's colour while it is the live design ──

     Read off the rendered button, not off the source: the shading is
     three CSS rules and a custom property, and every way this can break
     — a class not applied, a variable not set, the open state painting
     over it — is invisible to a grep. */
  {
    const e = btn("Electric");
    if (!e.classList.contains("util")) {
      fail("the electric button is not shaded while electric is the live design");
    }
    /* The full colour, and the tint derived from it. Checking only that
       something is set would pass on an empty string. */
    const line = e.style.getPropertyValue("--gm-line").trim();
    if (line !== COLOUR.electric) {
      fail(`the electric button is shaded ${line || "nothing"}, not ${COLOUR.electric}`);
    }
    const tint = e.style.getPropertyValue("--gm-tint").trim();
    if (!tint.startsWith(COLOUR.electric) || tint.length !== 9) {
      fail(`the electric tint is not an eight-digit hex of its colour: ${tint}`);
    }

    /* And the button for the utility that is NOT on screen is not
       shaded. A bar with every utility lit says nothing at all. */
    const g = btn("Gas");
    if (g.classList.contains("util")) {
      fail("the gas button is shaded while the electric design is on screen");
    }
    if (g.style.getPropertyValue("--gm-line")) {
      fail("the gas button carries a colour it should not");
    }

    /* Open does not paint over it. The accent would say "menu open",
       which the open menu already says, and would hide the utility at
       the moment somebody is working in it. */
    if (!e.classList.contains("on")) fail("the electric button is not marked open");
    if (!e.classList.contains("util")) {
      fail("opening the menu dropped the shading");
    }
  }

  /* ── And the stylesheet actually paints it ──

     The classes above being right proves nothing about what is drawn:
     `.gm-btn.on` and `.gm-btn.util` have the same specificity, so which
     one wins is decided by which is written last, and `.on` sets white
     text that is unreadable on every one of these tints. jsdom cannot
     settle it — it does not resolve custom properties, so the computed
     background of a `var(--gm-tint)` rule comes back transparent and a
     test that read it would pass on anything. So the rules are read
     instead, for the three hazards that are invisible in the classes. */
  {
    const menus = readFileSync("./src/features/gis/GisMenus.jsx", "utf8");
    const css = menus.slice(menus.indexOf("const CSS = `"));

    const at = (sel) => css.indexOf(sel + " {");
    const rule = (sel) => {
      const i = at(sel);
      return i < 0 ? null : css.slice(i, css.indexOf("}", i));
    };

    const shaded = rule(".gm-btn.util");
    if (!shaded) fail("nothing shades the live design's button");
    else if (!/background:\s*var\(--gm-tint\)/.test(shaded)) {
      fail("the shading is not the tint the button is given");
    }

    /* Same specificity, so source order decides. `.util` after `.on`. */
    if (at(".gm-btn.util") >= 0 && at(".gm-btn.on") >= 0
      && at(".gm-btn.util") < at(".gm-btn.on")) {
      fail("`.gm-btn.on` is written after `.gm-btn.util`, so the accent wins");
    }

    /* The open state keeps the shading AND takes back the white text.
       Without this rule the button is a light tint carrying `color:
       #fff` from `.on` — the label disappears. */
    const open = rule(".gm-btn.util.on");
    if (!open) {
      fail("no rule for a shaded button with its menu open — the accent paints over it");
    } else {
      if (!/color:/.test(open)) fail("the open shaded button keeps `.on`'s white text");
      if (/var\(--accent\)/.test(open)) fail("the open shaded button reverts to the accent");
    }

    /* Hover stays. A button that stopped answering the mouse would read
       as disabled, which is the opposite of being the live design. */
    if (!rule(".gm-btn.util:hover")) {
      fail("the shaded button has no hover state");
    }
  }

  /* Pressing it once more closes it. A refusal must never be able to
     make a menu that will not dismiss — the button that opened it is
     the one anybody reaches for to shut it. */
  await click("Electric");
  if (shows("Electric thing")) fail("an open menu would not close on its own button");
  /* Three, from four clicks. Only a press that would open is put to the
     handler, so the closing one is not counted — if this ever reads 4,
     closing has started asking permission to close. */
  if (presses.length !== 3) {
    fail(`the close press was put to the handler (${presses.length} of 4 clicks seen)`);
  }

  await act(async () => { root.unmount(); });
}

/* ── The Trench menu still has everything in it ──

   Rearranged on 27 Aug: Place Span Nodes to the top of the first
   column, the Services heading dissolved into Checks, Checks under
   Draw, and Show or Hide given the second column to itself.

   That is a large block of JSX moved by hand, and the way it goes wrong
   is not a crash — it is an item left behind in the cut. A command
   missing from a menu looks exactly like a command that was never
   written, and the only person who finds out is somebody who needed it.

   So: every command present, and present once. */
{
  const from = canvas.indexOf('<Menu id="trench"');
  const to = canvas.indexOf('<Menu id="electric"');
  if (from < 0 || to < 0 || to <= from) {
    fail("could not find the Trench menu \u2014 the assertions below are not being made");
  } else {
    const menu = canvas.slice(from, to);
    /* Without the commentary, so a command named in a note explaining
       it is not counted as a second copy of it. */
    const bare = menu.replace(/\/\*[\s\S]*?\*\//g, "");
    const items = bare.split("<MenuItem").slice(1)
      .map((chunk) => chunk.slice(0, chunk.indexOf("/>") + 2));

  /* Matched on the text, not on `label="..."`.

       Auto Lay Service Trench shows "Laying…" while it runs, so its
       label is an expression rather than a string literal and the
       stricter test reported it missing from a menu it was sitting in.
       A check that fires on correct code is one people learn to edit
       rather than read. */
    for (const label of [
      "Place Span Nodes",
      "Auto Lay Service Trench",
      "Check Services Reach the Mains",
      "Check Trench Joins",
      "Check Trench Connectivity",
    ]) {
      /* One MenuItem carrying it.

         The bare text appears elsewhere too — withUndo names the action
         "Place Span Nodes", and the comments name the commands they
         explain — so counting occurrences reported duplicates that are
         not rows. Comments are stripped first and the menu is split
         into MenuItem blocks, which is the row count. */
      const rows = items.filter((row) => row.includes(`"${label}"`)).length;
      if (rows === 0) fail(`the Trench menu lost "${label}"`);
      if (rows > 1) fail(`"${label}" is on ${rows} rows of the Trench menu`);
    }

    /* The two lists that are built from the line types: one of ways to
       draw, one of layers to show. Losing either leaves a menu that
       looks complete and offers nothing. */
    if ((menu.match(/typesOn\("trench"\)/g) || []).length !== 2) {
      fail("the Trench menu no longer builds both its draw list and its layer list");
    }
    if (!/<MenuLabels/.test(menu)) fail("the Trench menu lost its label switches");

    // The Services heading is gone, its item folded into Checks.
    if (/label="Services"/.test(menu)) {
      fail("the Services heading is still in the Trench menu");
    }
    /* Checks below Draw, and Place Span Nodes above both. */
    const spanAt = menu.indexOf('label="Place Span Nodes"');
    const drawAt = menu.indexOf('label="Draw"');
    const checksAt = menu.indexOf('label="Checks"');
    const showAt = menu.indexOf('label="Show or Hide"');
    if (!(spanAt < drawAt && drawAt < checksAt)) {
      fail("the Trench menu order is not Place Span Nodes, Draw, Checks");
    }
    /* And Show or Hide starts the second column, so the left is doing
       and the right is looking. */
    if (!(checksAt < showAt)) fail("Show or Hide is not after Checks");
    if (!/label="Show or Hide" newColumn/.test(menu)) {
      fail("Show or Hide does not start the second column");
    }
    if (/label="Draw" newColumn|label="Checks" newColumn/.test(menu)) {
      fail("a second column starts before Show or Hide");
    }
  }
}

/* ── The Electric menu keeps everything in it ──

   Rearranged on 27 Aug: the indents off Auto Lay Services and the
   feeder types, a Service cable added beside them, Sizes moved to the
   foot of the left column, Apply Cable Sizes moved under Build LV
   Network, and in Show or Hide the whole-layer row to the top with the
   colour swatches off and Labels moved below the span nodes.

   Same reasoning as the Trench menu check above: a large block of JSX
   moved by hand goes wrong by leaving an item behind, and a command
   missing from a menu looks exactly like one that was never written. */
{
  const from = canvas.indexOf('<Menu id="electric"');
  const to = canvas.indexOf("Gas and Water, the two menus built from the layer");
  if (from < 0 || to < 0 || to <= from) {
    fail("could not find the Electric menu \u2014 the assertions below are not being made");
  } else {
    const menu = canvas.slice(from, to);
    const bare = menu.replace(/\/\*[\s\S]*?\*\//g, "");
    const items = bare.split("<MenuItem").slice(1)
      .map((chunk) => chunk.slice(0, chunk.indexOf("/>") + 2));

    for (const label of [
      "+ POC", "+ Substation", "Route POC to Substation", "Auto Lay Services",
      "Link to Circuit", "Build LV Network", "Apply Cable Sizes to Span Nodes",
      "Place Feeder Joints", "Circuit Report", "Run Levels Check",
    ]) {
      const rows = items.filter((row) => row.includes(`"${label}"`)).length;
      if (rows === 0) fail(`the Electric menu lost "${label}"`);
      if (rows > 1) fail(`"${label}" is on ${rows} rows of the Electric menu`);
    }

    /* The three cables that can be drawn by hand. Service cable is the
       new one, and it is built from lineTypes so a missing type renders
       nothing rather than a dead button. */
    if (!/\["elec_service", "Service cable"\]/.test(bare)) {
      fail("the Electric menu cannot draw a service cable");
    }
    if (!/lineTypes\.find\(\(x\) => x\.Type_Key === key\)/.test(bare)) {
      fail("the draw list no longer checks the line type exists");
    }

    /* Sizes at the foot of the left column, Show or Hide starting the
       second. Doing on the left, looking on the right. */
    if (!/label="Show or Hide" newColumn/.test(bare)) {
      fail("Show or Hide does not start the Electric menu's second column");
    }
    if (/label="Sizes" newColumn/.test(bare)) {
      fail("Sizes still starts a column of its own");
    }
    const sizesAt = bare.indexOf('label="Sizes"');
    const showAt = bare.indexOf('label="Show or Hide"');
    const toolsAt = bare.indexOf('label="Tools & Reporting"');
    if (!(toolsAt < sizesAt && sizesAt < showAt)) {
      fail("Sizes is not at the foot of the left column");
    }

    /* Apply Cable Sizes finishes the build, so it sits with it rather
       than two groups away under Tools & Reporting. */
    const buildAt = bare.indexOf('"Build LV Network"');
    const applyAt = bare.indexOf('"Apply Cable Sizes to Span Nodes"');
    if (!(buildAt < applyAt && applyAt < toolsAt)) {
      fail("Apply Cable Sizes to Span Nodes is not under Build LV Network");
    }

    /* The whole layer governs everything under it, so it is above the
       list rather than at the foot of it. */
    const wholeAt = bare.indexOf('label="Whole Electric layer"');
    const metersAt = bare.indexOf('label="Electric Meters"');
    const labelsAt = bare.indexOf("<MenuLabels");
    if (!(showAt < wholeAt && wholeAt < metersAt)) {
      fail("Whole Electric layer is not at the top of Show or Hide");
    }
    if (!(metersAt < labelsAt)) {
      fail("the label switches are not below the layers they label");
    }

    /* No colour swatches on the electric rows: a square in a menu that
       only hides and shows adds nothing, and on the whole-layer row it
       claims one colour for four types. */
    const showOrHide = bare.slice(showAt);
    if (/colour=/.test(showOrHide)) {
      fail("a colour swatch is back on an Electric layer row");
    }
  }
}

/* ── The Draw line picker, grouped by layer ──

   It was one flat list of every active type. With fifteen of them, four
   named "Existing … (incumbent)", finding the gas main meant reading
   the lot — and two types on different layers can have near-identical
   names.

   The one way grouping can do harm is by losing a type: a flat list
   showed everything, and a type whose layer is not in the layer list
   would fall into no group and disappear off the menu without a word.
   That is what most of this checks. */
{
  const from = canvas.indexOf('aria-label="Line type to draw"');
  const to = canvas.indexOf("Undo and redo", from);
  if (from < 0 || to < 0 || to <= from) {
    fail("could not find the Draw line picker \u2014 the assertions below are not being made");
  } else {
    const picker = canvas.slice(from, to);

    if (!/<optgroup/.test(picker)) {
      fail("the Draw line picker is a flat list again");
    }

    /* Sections from the layers themselves, so their order and their
       names are set in Admin rather than written here \u2014 and a fifth
       utility appears without anybody editing this file. */
    if (!/layers\.map\(\(l\) => \(\{/.test(picker)) {
      fail("the picker's sections are hard-coded rather than read from the layers");
    }

    /* Nothing is lost. A type whose layer is missing from the list
       still has somewhere to go. */
    if (!/__other/.test(picker)) {
      fail("a line type on an unknown layer would vanish from the picker");
    }
    if (!/!layers\.some\(\(l\) => l\.Layer_Key === t\.Layer_Key\)/.test(picker)) {
      fail("the catch-all group does not collect the types no section claimed");
    }
    /* Empty sections are dropped, so a project with no gas does not
       show a Gas heading with nothing under it. */
    if (!/\.filter\(\(g\) => g\.types\.length\)/.test(picker)) {
      fail("a layer with no line types would show as an empty heading");
    }
    /* And inactive types stay out, as they were in the flat list. */
    if ((picker.match(/Is_Active !== false/g) || []).length !== 2) {
      fail("the picker no longer filters inactive types in both groups");
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Utility menus behave (empty utilities shown as empty; isolate first, menu second).");
process.exit(bad ? 1 : 0);
