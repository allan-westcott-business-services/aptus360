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

  /* Street Lighting still isolates and opens in one press. It is the
     one menu the two-press rule was not asked for, so it is pinned
     here rather than left to drift into whichever behaviour the next
     edit happens to give it. If it is brought into line, this line
     changes to match the electric one above and the mount below gains
     a lighting case — do not simply delete it. */
  if (!canvas.includes(`soloClass("lighting", true)`)) {
    fail("nothing isolates lighting when its menu opens");
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

  /* A drawing with two utility menus on it, sharing one isolate. The
     handler is the canvas's, in miniature: isolate and refuse, or allow
     the open — the branch under test, without the other twelve thousand
     lines around it. */
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
    return h(MenuBar, null, ({ open, setOpen }) => [
      h(Menu, { key: "gas", id: "gas", label: "Gas", open, setOpen,
        onOpen: () => press("gas") },
      h(MenuItem, { label: "Gas thing" })),
      h(Menu, { key: "electric", id: "electric", label: "Electric", open, setOpen,
        onOpen: () => press("electric") },
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

console.log(bad ? `\n${bad} problem(s)`
  : "Utility menus behave (empty utilities shown as empty; isolate first, menu second).");
process.exit(bad ? 1 : 0);
