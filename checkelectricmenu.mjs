/* The Electric menu's left column, grouped into bands.

   It was one list of twenty-odd commands under four grey headings. A
   heading is a weak separator — the items under one look exactly like
   the items under the next — so the order the work is actually done in
   was invisible in the thing that lists it. Each job is boxed now.

   Two faults are worth guarding against, and only one of them is about
   looks.

   The first is an item outside every band. It renders, it works, and it
   reads as belonging to whichever box it happens to sit under, which is
   worse than the flat list was: a heading that is wrong says nothing,
   a box that is wrong says something false.

   The second is an item quietly lost in a reorganisation. Moving
   twenty-odd JSX blocks around is exactly the operation where one goes
   missing, and a menu is the one place nobody notices — you do not miss
   a command you cannot see, you conclude the feature was never built.
   So every label is named here, and dropping one fails.

   The band TONES are not tested. They are decoration, the mockup said
   as much, and pinning them would only make a palette change look like
   a break. What is tested is that a band draws an edge, because that is
   what still separates the groups when the tint does not carry. */

import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const PAGE = "src/features/gis/GISCanvasPage.jsx";
const MENUS = "src/features/gis/GisMenus.jsx";
const page = readFileSync(PAGE, "utf8");
const menus = readFileSync(MENUS, "utf8");

/* ── The region: the Electric menu, down to where the column breaks ──

   Bounded by the markup either side of it rather than by a line count,
   so adding an item does not move the window off the thing it frames. */
const region = (() => {
  const start = page.indexOf('<Menu id="electric"');
  if (start < 0) return null;
  const brk = page.indexOf('<MenuGroup label="Show or Hide" newColumn />', start);
  if (brk < 0) return null;
  return page.slice(start, brk);
})();

if (!region) {
  fail("the Electric menu's left column is no longer there to read");
  console.log(`\n${bad} problem(s)`);
  process.exit(1);
}

// ─── 1. Every command sits inside a band ───
{
  const lines = region.split("\n");
  let depth = 0;
  const loose = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("<MenuBand")) { depth++; continue; }
    if (t.startsWith("</MenuBand>")) { depth--; continue; }
    if (depth > 0) continue;
    /* A comment mentioning one is not one. Only the opening tag counts. */
    const m = /^<(MenuItem|MenuBranch|MenuGroup|MenuAction)\b/.exec(t);
    if (m) loose.push(t.slice(0, 64));
  }
  if (depth !== 0) fail(`the bands do not balance (${depth} left open)`);
  for (const l of loose) fail(`outside every band: ${l}`);
}

// ─── 2. The bands run in the order the work is done ───
{
  const order = [...region.matchAll(/<MenuBand[^>]*label="([^"]+)"/g)].map((m) => m[1]);
  const want = ["Supply", "Circuits", "Boxes and boards", "Feeder cable",
    "Service cable", "Joints", "Tools and reporting"];
  if (order.join(" | ") !== want.join(" | ")) {
    fail(`the bands read ${order.join(" | ") || "(none)"}\n         expected ${want.join(" | ")}`);
  }
  /* Named for a screen reader, which is the one reader a coloured box
     says nothing to. */
  const unlabelled = [...region.matchAll(/<MenuBand(?![^>]*\blabel=)[^>]*>/g)];
  if (unlabelled.length) fail(`${unlabelled.length} band(s) with no label`);
}

// ─── 3. Nothing was dropped on the way ───
{
  /* Every command the left column offered before the regrouping. A
     label may be reworded; it may not vanish. */
  const must = [
    "+ POC", "+ Substation", "Route POC to Substation",
    "HV Ring", "+ Primary Substation", "+ Ring Substation", "+ Normally Open Point",
    "Manually add Existing HV Cable",
    "Link to Circuit", "Split Circuit",
    "Link Box", "+ 2 Way", "+ 4 Way", "+ MSDB", "Heavy Duty Cut Out",
    "Feeder Cable", "Manually add HV Cable", "Manually add LV Cable",
    "Auto Build LV Network", "+ Feeder End Point",
    "Service Cable", "Manually add Service Cable", "Auto Lay Service Cable",
    "Joints", "+ Straight Joint", "+ Breech Joint", "+ Bottle End Joint",
    "+ Service Joint", "Auto Place Feeder Joints",
    "Circuit Report", "Run Levels Check", "Aptus Calc Sheet",
  ];
  for (const label of must) {
    if (!region.includes(label)) fail(`"${label}" has gone from the Electric menu`);
  }
}

/* ─── 3b. The three that left went somewhere ───

   Trace from a Point moved to Tools & Reporting, and the two size modes
   to Setup. Both were asked for, and both are the kind of move where
   "gone from here" and "arrived there" have to be one assertion: a
   removal that lands nowhere passes a test that only looks at the menu
   it left, and the feature is then unreachable with nothing failing.

   The destination is named by the menu's id, which is the thing that
   does not change when somebody retitles a menu. */
{
  const menuBody = (id) => {
    const open = page.indexOf(`<Menu id="${id}"`);
    if (open < 0) return null;
    /* To the next <Menu, or to the end. Menus are siblings here, so the
       next opening tag is this one's end for the purpose of asking what
       it holds. */
    const next = page.indexOf("<Menu id=", open + 8);
    return page.slice(open, next < 0 ? page.length : next);
  };

  for (const [what, id] of [
    ["Trace from a Point", "tools"],
    ["System calculated", "setup"],
    ["Manually set", "setup"],
  ]) {
    if (region.includes(what)) fail(`${what} is still on the Electric menu`);
    const dest = menuBody(id);
    if (!dest) fail(`there is no <Menu id="${id}"> to have moved ${what} to`);
    else if (!dest.includes(what)) fail(`${what} did not arrive on the ${id} menu`);
  }

  /* One Trace, not four. The whole point of the move: it was on each
     utility menu because that is how it knew which network was meant,
     and the click answers that now. */
  const traces = page.split('"Trace from a Point"').length - 1;
  if (traces !== 1) fail(`"Trace from a Point" appears ${traces} times, expected 1`);

  /* And it starts with no utility named, or it has not really moved. */
  const tools = menuBody("tools") ?? "";
  if (!/setTraceFrom\(\{\s*layerKey:\s*null/.test(tools)) {
    fail("the Trace on Tools & Reporting still names a utility up front");
  }
}

// ─── 4. Inside the bands, the order the mockup asked for ───
{
  const at = (s) => region.indexOf(s);
  const before = (a, b, why) => {
    const i = at(a); const j = at(b);
    if (i < 0 || j < 0) return;          // step 3 already reported it
    if (i > j) fail(`${a} comes after ${b} — ${why}`);
  };
  before('label="Link Box"', '"+ MSDB', "the box comes first in the mockup");
  before('"+ MSDB', 'label="Heavy Duty Cut Out"', "the mockup's order");
  before('label="Circuit Report"', 'label="Run Levels Check"', "the mockup's order");
  before('label="Run Levels Check"', 'label="Aptus Calc Sheet"', "the mockup's order");
  /* Circuits second: it is the step between placing the supply and
     everything that reads a circuit. */
  const bands = [...region.matchAll(/<MenuBand[^>]*label="([^"]+)"/g)];
  const circuits = bands.findIndex((m) => m[1] === "Circuits");
  if (circuits !== 1) fail(`the Circuits band is number ${circuits + 1}, expected 2`);
  /* Link to Circuit must be IN that band and not merely somewhere. */
  const open = bands[circuits]?.index ?? -1;
  const close = open < 0 ? -1 : region.indexOf("</MenuBand>", open);
  if (open >= 0 && !region.slice(open, close).includes('"Link to Circuit"')) {
    fail("Link to Circuit is not in the Circuits band");
  }
}

// ─── 5. A band draws an edge, whatever the tint does ───
{
  const css = menus.slice(menus.indexOf("const CSS = `"));
  const rule = /\.gm-band\s*\{([^}]*)\}/.exec(css);
  if (!rule) fail("there is no .gm-band rule — the bands have no box");
  else {
    if (!/border\s*:/.test(rule[1])) {
      fail("a band has no border, so the groups vanish wherever the tint does not carry");
    }
    if (!/background\s*:/.test(rule[1])) fail("a band has no background");
  }
  /* Bands are direct children of the menu, and the menu is two columns.
     Without this a band splits across the break — half a group at the
     foot of one column, half at the head of the next. */
  if (!/\.gm-2col\s*>\s*\*\s*\{[^}]*break-inside:\s*avoid/.test(css)) {
    fail("nothing stops a band splitting across the two-column break");
  }
}

// ─── 6. The component itself, rendered ───
{
  const bundle = await build({
    entryPoints: [MENUS],
    bundle: true, write: false, format: "cjs", jsx: "automatic",
    platform: "browser", logLevel: "silent",
    external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
    loader: { ".png": "empty", ".css": "empty" },
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
  const { MenuBand, MenuItem } = mod.exports;

  if (typeof MenuBand !== "function") fail("MenuBand is not exported");
  else {
    const host = window.document.getElementById("root");
    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(MenuBand,
        { tone: "#2563eb", label: "Feeder cable" },
        React.createElement(MenuItem, { label: "Manually add HV Cable" }),
        React.createElement(MenuItem, { label: "+ Feeder End Point" })));
    });

    const el = host.querySelector(".gm-band");
    if (!el) fail("a band renders nothing with a .gm-band class");
    else {
      if (el.getAttribute("role") !== "group") {
        fail("a band is not announced as a group");
      }
      if (el.getAttribute("aria-label") !== "Feeder cable") {
        fail("a band does not carry its label for a screen reader");
      }
      if (el.querySelectorAll(".gm-item").length !== 2) {
        fail("a band did not render the items inside it");
      }
      /* The tint is built as eight-digit hex, the house idiom — a
         browser that does not know color-mix() drops the declaration
         and takes the background with it. */
      for (const v of ["--gm-band", "--gm-band-edge", "--gm-band-hover"]) {
        const got = el.style.getPropertyValue(v);
        if (!/^#[0-9a-f]{8}$/i.test(got.trim())) {
          fail(`${v} is "${got}", not an eight-digit hex tint`);
        }
      }
    }
    await act(async () => { root.unmount(); });
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The Electric menu reads as seven jobs, in order, with nothing loose and nothing lost.");
process.exit(bad ? 1 : 0);
