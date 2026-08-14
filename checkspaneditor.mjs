/* The span node editor, mounted and driven.

   The build only proves the file parses. This proves the span node
   branch of FeatureEditor renders and that what it shows agrees with
   what the trace reads.

   It exists because that branch carried the one cable control in the
   app bound to VD_Cable_Size_ID alone, while every other reader takes
   the override first. A node fed by an overridden run therefore showed
   the calculated size while its own label and the levels report showed
   the override — and saving the field wrote the system value and left
   the override standing, so the control could not correct what it was
   displaying. Nothing mounted it, so nothing noticed.

   Run: node checkspaneditor.mjs */
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { rmSync } from "fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>",
  { url: "https://example.test", pretendToBeVisual: true });
/* Node owns some of these outright (navigator), so each is tried on its
   own rather than letting the first refusal take the rest with it \u2014 the
   same idiom checkhr.mjs and checkhome.mjs use. */
for (const k of ["window", "document", "navigator", "HTMLElement", "Element",
  "Node", "Event", "CustomEvent", "getComputedStyle", "MutationObserver",
  "requestAnimationFrame", "cancelAnimationFrame"]) {
  try { globalThis[k] = dom.window[k]; } catch { /* Node owns it */ }
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
global.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });

await build({
  entryPoints: ["src/features/gis/FeatureEditor.jsx"],
  bundle: true,
  format: "esm",
  outfile: "./.spaneditor.tmp.mjs",
  jsx: "automatic",
  external: ["react", "react-dom", "react/jsx-runtime"],
  define: {
    "import.meta.env": JSON.stringify({ VITE_USE_MOCKS: "true", MODE: "test", DEV: false }),
  },
  logLevel: "silent",
});

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const FeatureEditor = (await import("./.spaneditor.tmp.mjs")).default;

/* 3c WAVE 95 as the build's answer, 3c WAVE 300 as the override. */
const lookups = {
  cableTypes: [{ Cable_Type_ID: 1, Cable_Type: "3c WAVE", Usage_Type: "" }],
  cableSizes: [
    { Cable_Size_ID: 7, Cable_Type_ID: 1, Size_Label: "95", Material: "Aluminium", Loop_Impedance_Ohm: 0.32 },
    { Cable_Size_ID: 9, Cable_Type_ID: 1, Size_Label: "300", Material: "Aluminium", Loop_Impedance_Ohm: 0.1 },
  ],
};

const spanNode = (attrs) => ({
  Feature_ID: 1, Feature_Type: "point", Feature_Role: "spannode",
  Layer_Key: "trench", Geometry: [[24, 0]],
  Attributes: {
    Span_Label: "A1", Span_Seq: 1, Circuit_ID: 1, Circuit_Name: "Circuit 1",
    ...attrs,
  },
});

const { act } = React;

async function mount(feature) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(FeatureEditor, {
      feature,
      layers: [], lineTypes: [], surfaceTypes: [], plotList: [],
      lookups, allFeatures: [feature],
      onSave: async () => {}, onClose: () => {}, onDelete: async () => {},
    }));
  });
  return { host, root };
}

/* 1. A node carrying only the build's answer. */
{
  const { host, root } = await mount(spanNode({ VD_Cable_Size_ID: 7 }));
  const sys = host.querySelector("#fe-cable-sys");
  const man = host.querySelector("#fe-cable");

  if (!sys) fail("the span node editor shows no system calculated cable");
  if (!man) fail("the span node editor shows no override control");
  if (sys && !/95/.test(sys.value)) {
    fail(`system field shows "${sys.value}" rather than the calculated 95`);
  }
  if (man && man.value !== "") fail("an override was shown where none is set");
  if (!/trace reads 3c WAVE 95/.test(host.textContent)) {
    fail("the editor does not say the trace reads the calculated size");
  }
  await act(async () => root.unmount());
}

/* 2. A node fed by an overridden run — the reported case. The system
      field still says 95 because that is what the build worked out, and
      the editor must say plainly that 300 is what the trace reads. */
{
  const { host, root } = await mount(spanNode({
    VD_Cable_Size_ID: 7, Manual_VD_Cable_Size_ID: 9,
  }));
  const sys = host.querySelector("#fe-cable-sys");
  const man = host.querySelector("#fe-cable");

  if (sys && !/95/.test(sys.value)) fail("the build's answer was lost from the node editor");
  if (man && String(man.value) !== "9") {
    fail(`the override reads "${man?.value}" rather than 300 — this is the reported fault`);
  }
  if (!/trace reads 3c WAVE 300/.test(host.textContent)) {
    fail("the editor does not report the override as the figure the trace reads");
  }
  await act(async () => root.unmount());
}

/* 3. A node with nothing on it says so, rather than showing a blank
      that reads identically to "not yet looked at". */
{
  const { host, root } = await mount(spanNode({}));
  if (!/No cable set/.test(host.textContent)) {
    fail("a node with no cable does not say so");
  }
  await act(async () => root.unmount());
}

/* 4. Nothing feeds the origin, so it is not offered a cable at all. */
{
  const { host, root } = await mount(spanNode({ Span_Seq: 0, Span_Label: "E0" }));
  if (host.querySelector("#fe-cable")) {
    fail("the origin was offered a feeding cable");
  }
  await act(async () => root.unmount());
}

rmSync("./.spaneditor.tmp.mjs", { force: true });

console.log(bad ? `\n${bad} problem(s)`
  : "Span node editor behaves (both sizes shown, override read, origin exempt).");
process.exit(bad ? 1 : 0);
