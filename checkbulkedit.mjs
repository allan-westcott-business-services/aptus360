/* Can several classes be edited at once, and only on what they share?

   And, since the kinds picker landed: does naming a category edit that
   category, rather than everything sharing a class with it?

   Run: node checkbulkedit.mjs */
import {
  fieldsFor, fieldsForMany, membersOfMany, planBulkEditMany,
  planBulkEditOn, classesIn,
} from "./src/features/gis/bulkEdit.js";
import { statusesFor, BUILD_STATUSES } from "./src/features/gis/buildStatus.js";
import { readFileSync, rmSync } from "node:fs";

const fails = [];
const fail = (m) => fails.push(m);

const lineTypes = [
  { Type_Key: "trench_service", Layer_Key: "trench", Is_Trench: true },
  { Type_Key: "elec_main", Layer_Key: "electric" },
];
const trench = { layer: "trench", lineType: "trench_service", role: null };
const cable = { layer: "electric", lineType: "elec_main", role: null };
const joint = { layer: "electric", lineType: null, role: "joint" };
const keys = (cs) => fieldsForMany(cs, { lineTypes }).map((f) => f.key);

// 1. Build status is offered on every class. Without it the commonest
//    bulk change on a drawing is the one thing this cannot do.
{
  for (const [name, c] of [["trench", trench], ["cable", cable], ["joint", joint]]) {
    if (!fieldsFor(c, { lineTypes }).some((f) => f.key === "Build_Status")) {
      fail(`${name} is offered no build status`);
    }
  }
}

// 2. A mixed selection offers only what they share. A cable field on a
//    joint is a form that writes a cable size onto a joint.
{
  const alone = keys([cable]);
  if (!alone.includes("VD_Cable_Size_ID")) fail("a cable alone is offered no cable field");
  const mixed = keys([cable, joint]);
  if (mixed.includes("VD_Cable_Size_ID")) fail("cable field survived into a mixed selection");
  if (!mixed.includes("Build_Status")) fail("status did not survive a mixed selection");

  /* Two fields survive a three-way mix and no more: the status every
     feature carries and the name every feature carries. Asserted as the
     whole set rather than as "no cable field", so a field that starts
     leaking into mixed sets is caught whichever field it is. */
  const three = keys([trench, cable, joint]).sort();
  if (three.join(",") !== "Build_Status,Label") {
    fail(`trench+cable+joint offered ${three.join(", ")}, expected Build_Status and Label`);
  }
  if (!keys([trench]).includes("Surface_Type")) fail("a trench alone is offered no surface");
  if (keys([trench, cable]).includes("Surface_Type")) fail("surface survived onto cables");
}

// 3. Same key, different catalogue, is two fields — not one. A mains
//    cable field and a service cable field differ in `usage`, and
//    merging them would offer service cables for a mains run.
{
  const svc = { layer: "electric", lineType: "elec_service", role: null };
  const merged = fieldsForMany([cable, svc], { lineTypes });
  const cableField = merged.find((f) => f.key === "VD_Cable_Size_ID");
  if (cableField) fail("mains and service cable fields were merged despite differing usage");
}

// 4. Members across classes, deduplicated. A feature written twice in
//    one save is a race against itself.
{
  const feats = [
    { Feature_ID: 1, Layer_Key: "electric", Attributes: { Line_Type: "elec_main" } },
    { Feature_ID: 2, Layer_Key: "electric", Feature_Role: "joint", Attributes: {} },
  ];
  const all = { layer: "electric", lineType: null, role: null };
  const got = membersOfMany(feats, [cable, joint, cable]);
  if (got.length !== 2) fail(`membersOfMany returned ${got.length}, expected 2 deduplicated`);
  if (new Set(got.map((f) => f.Feature_ID)).size !== got.length) fail("members were duplicated");
  if (all && membersOfMany(feats, []).length !== 0) fail("no classes should select nothing");
}

// 5. A status a feature cannot hold is refused for THAT feature, not
//    for the whole edit — and it is reported, not silently dropped.
{
  const feats = [
    { Feature_ID: 1, Layer_Key: "trench", Attributes: { Line_Type: "trench_service", Build_Status: "planned" } },
    { Feature_ID: 3, Layer_Key: "electric", Feature_Role: "joint", Attributes: { Build_Status: "planned" } },
  ];
  const ok = planBulkEditMany(feats, [trench, joint], { Build_Status: "remove" },
    { lineTypes, statusesFor });
  if (ok.rows.length !== 2) fail(`a valid status wrote ${ok.rows.length} rows, expected 2`);
  if ((ok.skipped || []).length) fail("a valid status skipped something");

  const bad = planBulkEditMany(feats, [trench, joint], { Build_Status: "\u0000nonsense" },
    { lineTypes, statusesFor });
  if (bad.rows.length) fail("a status nothing can hold was still written");
  if ((bad.skipped || []).length !== 2) fail("refused features were not reported back");
}

// 6. A feature already holding the value is not rewritten. Fewer rows,
//    and an undo entry listing only what actually moved.
{
  const feats = [
    { Feature_ID: 1, Layer_Key: "electric", Feature_Role: "joint", Attributes: { Build_Status: "planned" } },
    { Feature_ID: 2, Layer_Key: "electric", Feature_Role: "joint", Attributes: { Build_Status: "existing" } },
  ];
  const r = planBulkEditMany(feats, [joint], { Build_Status: "planned" },
    { lineTypes, statusesFor });
  if (r.rows.length !== 1) fail(`rewrote ${r.rows.length} rows, expected 1`);
  if (r.rows[0]?.Feature_ID !== 2) fail("rewrote the feature that already matched");
}

// 7. Nothing set writes nothing, and says why rather than doing nothing
//    quietly.
{
  const r = planBulkEditMany([], [joint], {}, { lineTypes, statusesFor });
  if (r.rows.length) fail("an empty draft wrote rows");
  if (!r.reason) fail("an empty draft gave no reason");
}

// 8. Other fields are untouched. Bulk editing is mostly one field
//    across features that differ in every other.
{
  const feats = [{
    Feature_ID: 1, Layer_Key: "electric", Feature_Role: "joint",
    Attributes: { Build_Status: "planned", Joint_Kind: "straight", Circuit_ID: 4 },
  }];
  const r = planBulkEditMany(feats, [joint], { Build_Status: "existing" },
    { lineTypes, statusesFor });
  const a = r.rows[0]?.Attributes || {};
  if (a.Joint_Kind !== "straight" || a.Circuit_ID !== 4) fail("bulk edit disturbed other fields");
  if (!BUILD_STATUSES.some((s) => s.key === "existing")) fail("fixture used an unreal status");
}

// 9. The classes present in a set, found once each. The kinds picker
//    hands over features and the fields follow from what is in them.
{
  const feats = [
    { Feature_ID: 1, Layer_Key: "electric", Attributes: { Line_Type: "elec_main" } },
    { Feature_ID: 2, Layer_Key: "electric", Attributes: { Line_Type: "elec_main" } },
    { Feature_ID: 3, Layer_Key: "electric", Feature_Role: "joint", Attributes: {} },
  ];
  const cs = classesIn(feats, { lineTypes });
  if (cs.length !== 2) fail(`classesIn found ${cs.length} classes, expected 2`);
  if (new Set(cs.map((c) => c.key)).size !== cs.length) fail("classesIn returned a class twice");
  if (classesIn([], { lineTypes }).length) fail("classesIn found a class in nothing");
  /* And the fields that follow are the ones those two share. */
  const ks = fieldsForMany(cs, { lineTypes }).map((f) => f.key).sort();
  if (ks.join(",") !== "Build_Status,Label") {
    fail(`a main and a joint were offered ${ks.join(", ")}`);
  }
}

// 10. Naming a category edits THAT category.
//
//     The trap the kinds picker walks into if it plans from classes
//     rather than from the features it was given: tick "service joints"
//     and every one of them is an electric joint, which is also the
//     breeches and the straights. It would edit four times what was
//     ticked, and it would look right — the count would be of joints,
//     and they would all be joints.
{
  const drawing = [
    { Feature_ID: 1, Layer_Key: "electric", Feature_Role: "joint",
      Attributes: { Joint_Kind: "service", Build_Status: "planned" } },
    { Feature_ID: 2, Layer_Key: "electric", Feature_Role: "joint",
      Attributes: { Joint_Kind: "straight", Build_Status: "planned" } },
  ];
  const ticked = drawing.filter((f) => f.Attributes.Joint_Kind === "service");

  const named = planBulkEditOn(ticked, { Build_Status: "existing" }, { lineTypes, statusesFor });
  if (named.rows.length !== 1) {
    fail(`naming one joint kind wrote ${named.rows.length} rows, expected 1`);
  }
  if (named.rows[0]?.Feature_ID !== 1) fail("a kind edit reached outside what was named");

  /* The class route over the same drawing takes both, which is exactly
     why the picked features are carried through as themselves. */
  const byClass = planBulkEditMany(drawing, [joint], { Build_Status: "existing" },
    { lineTypes, statusesFor });
  if (byClass.rows.length !== 2) fail("the class route stopped covering its whole class");
}

// 11. A column is written as a column. Label lives on the feature, not
//     inside its Attributes, where nothing would read it back — and a
//     line type carries the layer it belongs to, or a trench ends up on
//     the electric layer and hiding that layer hides the wrong things.
{
  const feats = [{ Feature_ID: 1, Label: "old", Layer_Key: "electric",
    Attributes: { Line_Type: "elec_main" } }];
  const r = planBulkEditOn(feats, { Label: "Phase 2", Line_Type: "trench_service" },
    { lineTypes, statusesFor });
  const row = r.rows[0] || {};
  if (row.Label !== "Phase 2") fail("Label was not written as a column");
  if (row.Attributes?.Label) fail("Label was buried in Attributes");
  if (row.Layer_Key !== "trench") fail("a line type was written without its layer");
  if (row.Attributes?.Line_Type !== "trench_service") fail("the line type itself was not written");
  /* Nothing to change is still nothing to change, whichever half it is. */
  const same = planBulkEditOn(feats, { Label: "old" }, { lineTypes, statusesFor });
  if (same.rows.length) fail("a Label already held was rewritten");
}

// 12. The house type is not a feature field. It lives on the plot, and
//     the panel writes it through a second call — so the field says so,
//     and the panel drops it before planning.
{
  const seed = { layer: "plot", lineType: null, role: "plot" };
  const f = fieldsFor(seed, { lineTypes }).find((x) => x.key === "Property_Config_ID");
  if (!f) fail("plot seeds are offered no house type");
  if (f && !f.onPlot) fail("the house type field does not say it lives on the plot");
  if (fieldsFor(joint, { lineTypes }).some((x) => x.key === "Property_Config_ID")) {
    fail("a joint was offered a house type");
  }
  const be = readFileSync("./src/features/gis/BulkEditor.jsx", "utf8");
  /* The panel must not hand the raw draft to the planner. It carries
     the house type, which is not a feature field, and it outlives the
     set it was filled in against — see 15c. */
  if (/planBulkEditOn\(\s*targets\s*,\s*draft/.test(be)) {
    fail("BulkEditor plans over the raw draft, house type and all");
  }
  if (!/Property_Config_ID/.test(be)) {
    fail("BulkEditor never mentions the house type it is supposed to keep out");
  }
}

// 13. The panel: two ways in, one picker, and the refusal in the module.
{
  const be = readFileSync("./src/features/gis/BulkEditor.jsx", "utf8");
  const bd = readFileSync("./src/features/gis/BulkDelete.jsx", "utf8");

  if (!/statusesFor/.test(be)) fail("BulkEditor offers no build status");
  if (/only the name can be set in bulk/.test(be)) {
    fail("BulkEditor still says a mixed selection can only set the name");
  }
  /* Refused per feature, and refused in one place. The panel used to
     carry its own copy of the test beside the module's.

     Named with its argument, not just named: the first version of this
     matched the import line, so a panel that had gone back to planning
     from classes still passed. What is being asserted is that the set
     it planned over is the set it was given. */
  if (!/planBulkEditOn\(\s*targets/.test(be)) {
    fail("BulkEditor does not plan over the features it is working on");
  }
  if (/planBulkEditMany/.test(be)) {
    fail("BulkEditor plans from classes, which is wider than what was ticked");
  }
  /* Both ways in, and the kinds one over the same category list bulk
     delete uses — the sentence is "all the service trenches" either
     way. */
  if (!/bulkDeleteCategories/.test(be) || !/idsForKeys/.test(be)) {
    fail("BulkEditor does not name kinds from the shared category list");
  }
  for (const [what, src] of [["BulkEditor", be], ["BulkDelete", bd]]) {
    if (!/CategoryPicker/.test(src)) fail(`${what} does not use the shared picker`);
    if (/indeterminate/.test(src)) fail(`${what} carries its own copy of the picker`);
  }

  /* The cable field is not drawn, deliberately: a run's size is held
     again on the span node that feeds the volt drop sum, and only the
     canvas can write both. Absence is not enough — a field that is
     missing for a reason has to say the reason, or the next person adds
     it back. */
  if (/VD_Cable_Size_ID/.test(be)) fail("BulkEditor draws a cable field");
  if (!/span node/i.test(be)) fail("BulkEditor does not say why cable size is not here");
}

// 14. Every class either panel draws with is in the shared stylesheet.
//
//     A <style> block is injected only while its own component is
//     mounted, so a rule left in one is missing for every other panel —
//     which is how .fe gave a transparent panel and .fe-body gave one
//     with no padding and no gap between fields. The picker moved out of
//     BulkDelete for the same reason, before it could happen again.
//
//     Checked as a set rather than one rule at a time: fixing .fe and
//     leaving .fe-body is what happened the first time round.
{
  const css = readFileSync("./src/styles.css", "utf8");
  const fe = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  const be = readFileSync("./src/features/gis/BulkEditor.jsx", "utf8");
  const bd = readFileSync("./src/features/gis/BulkDelete.jsx", "utf8");
  const cp = readFileSync("./src/features/gis/CategoryPicker.jsx", "utf8");

  const shared = ["fe", "fe-head", "fe-body", "fe-sub", "fe-tip", "fe-foot", "fe-backdrop"];
  for (const c of shared) {
    const re = new RegExp(`^\\.${c}\\s*\\{`, "m");
    if (!re.test(css)) fail(`.${c} is not in the shared stylesheet`);
    if (re.test(fe)) fail(`.${c} is still in FeatureEditor's block`);
  }

  /* And nothing draws with a class that exists nowhere. fe-in was one
     of mine; fe-tip had been unstyled since it was written. Both
     prefixes, because the picker's classes are shared now and a panel
     drawing with a private copy of one is the same fault. */
  const defined = (c) => new RegExp(`\\.${c}[\\s{.:,]`).test(css);
  for (const [what, src] of [["BulkEditor", be], ["BulkDelete", bd], ["CategoryPicker", cp]]) {
    for (const m of src.matchAll(/"([^"]*)"/g)) {
      for (const c of m[1].split(/\s+/).filter((x) => /^(fe|cat)-/.test(x))) {
        if (!defined(c)) fail(`${what} draws with .${c}, which is defined nowhere`);
      }
    }
    if (/\.cat-/.test(src)) fail(`${what} defines a picker class in its own block`);
  }
}

// 15. Mounted and driven, both ways in.
//
//     Everything above reads the module and greps the panel. Neither
//     proves the panel runs: the kinds mode opens with no selection, on
//     props the selection mode never sees, and a panel that throws on an
//     empty `features` array would pass every assertion in this file and
//     blank the page on the first click. checkspaneditor exists for the
//     same reason and found the same kind of thing.
{
  const { JSDOM } = await import("jsdom");
  const { build } = await import("esbuild");

  const dom = new JSDOM("<!doctype html><html><body></body></html>",
    { url: "https://example.test", pretendToBeVisual: true });
  /* Node owns some of these outright (navigator), so each is tried on
     its own rather than letting the first refusal take the rest with
     it — the same idiom checkhome.mjs and checkspaneditor.mjs use. */
  for (const k of ["window", "document", "navigator", "HTMLElement", "Element",
    "Node", "Event", "CustomEvent", "getComputedStyle", "MutationObserver",
    "requestAnimationFrame", "cancelAnimationFrame"]) {
    try { globalThis[k] = dom.window[k]; } catch { /* Node owns it */ }
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const tmp = "./.bulkeditor.tmp.mjs";
  await build({
    entryPoints: ["src/features/gis/BulkEditor.jsx"],
    bundle: true, format: "esm", outfile: tmp, jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
    define: {
      "import.meta.env": JSON.stringify({ VITE_USE_MOCKS: "true", MODE: "test", DEV: false }),
    },
    logLevel: "silent",
  });

  const React = (await import("react")).default;
  const { createRoot } = await import("react-dom/client");
  const BulkEditor = (await import(tmp)).default;
  const { act } = React;

  const uiLayers = [
    { Layer_Key: "electric", Label: "Electric", Colour: "#e11d48" },
    { Layer_Key: "trench", Label: "Trench", Colour: "#78716c" },
  ];
  const uiTypes = [
    { Type_Key: "trench_service", Label: "Service trench", Layer_Key: "trench", Is_Trench: true },
    { Type_Key: "elec_main", Label: "LV main", Layer_Key: "electric" },
  ];
  const surfaceTypes = [{ Surface_Key: "carriageway", Label: "Carriageway" }];

  const drawing = [
    { Feature_ID: 1, Feature_Type: "line", Layer_Key: "trench",
      Geometry: [[0, 0], [10, 0]], Attributes: { Line_Type: "trench_service" } },
    { Feature_ID: 2, Feature_Type: "line", Layer_Key: "trench",
      Geometry: [[0, 5], [10, 5]], Attributes: { Line_Type: "trench_service" } },
    { Feature_ID: 3, Feature_Type: "point", Feature_Role: "meter",
      Layer_Key: "electric", Geometry: [[1, 1]], Attributes: {} },
    { Feature_ID: 4, Feature_Type: "point", Feature_Role: "meter",
      Layer_Key: "electric", Geometry: [[2, 1]], Attributes: {} },
  ];

  const applied = [];
  async function mount(props) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(BulkEditor, {
        features: [], allFeatures: drawing, layers: uiLayers, lineTypes: uiTypes,
        surfaceTypes, configs: [], propertyTypes: [],
        onApply: async (rows, plots) => { applied.push({ rows, plots }); },
        onClose: () => {},
        ...props,
      }));
    });
    return { host, root };
  }

  /* React tracks the value it last wrote, so assigning through the
     prototype setter is what makes it see a change. */
  const setValue = (el, v) => {
    const proto = el.tagName === "SELECT"
      ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  };
  const tick = (host, text) => [...host.querySelectorAll("label.cat-row")]
    .find((l) => l.textContent.includes(text))?.querySelector("input");

  /* a. Kinds mode, opened on nothing at all. */
  {
    const { host, root } = await mount({ mode: "kinds" });
    if (!/Nothing ticked yet/.test(host.textContent)) {
      fail("the kinds panel does not say that nothing is ticked");
    }
    if (host.querySelector("#be-status")) fail("fields were offered before anything was ticked");

    const box = tick(host, "All meters");
    if (!box) fail("the kinds panel offers no meters category");
    else {
      await act(async () => { box.click(); });
      if (!/2 features/.test(host.textContent)) {
        fail("ticking a category did not count what it holds");
      }
      /* Points, so no surface — and no cable control anywhere, ever. */
      if (host.querySelector("#be-surface")) fail("meters were offered a surface");
      const status = host.querySelector("#be-status");
      if (!status) fail("a ticked category was offered no build status");
      else {
        await act(async () => { setValue(status, BUILD_STATUSES[0].key); });
        const apply = [...host.querySelectorAll("button")]
          .find((b) => /^Apply to/.test(b.textContent));
        if (!apply || apply.disabled) fail("a set field left Apply disabled");
        if (apply && !/Apply to 2$/.test(apply.textContent)) {
          fail(`the button reads "${apply?.textContent}" rather than Apply to 2`);
        }
        await act(async () => { apply.click(); });
      }
    }
    await act(async () => root.unmount());
  }

  /* And what it applied is what was ticked — the meters, not the
     trenches that were never named. This is assertion 10 again, through
     the panel rather than the module. */
  {
    const rows = applied[0]?.rows || [];
    if (rows.length !== 2) fail(`the panel applied ${rows.length} rows, expected the 2 meters`);
    if (rows.some((r) => r.Feature_ID === 1 || r.Feature_ID === 2)) {
      fail("editing a named kind reached the trenches");
    }
    if (rows[0] && rows[0].Attributes?.Build_Status !== BUILD_STATUSES[0].key) {
      fail("the status picked was not the status written");
    }
  }

  /* c. A field filled in for one set does not follow it to another.
        The draft outlives the set: type a surface for a hundred
        trenches, switch to kinds, tick the meters, and a panel that
        planned over the whole draft would write a surface onto a
        meter. Found by reading, not by the greps above, which is why
        this one is driven. */
  {
    const { host, root } = await mount({ features: drawing.slice(0, 2), mode: "selection" });
    const surface = host.querySelector("#be-surface");
    if (!surface) fail("no surface control to fill in");
    else {
      await act(async () => { setValue(surface, "carriageway"); });
      const kinds = [...host.querySelectorAll('[role="tab"]')]
        .find((b) => /Named kinds/.test(b.textContent));
      await act(async () => { kinds.click(); });
      const box = tick(host, "All meters");
      await act(async () => { box.click(); });

      if (host.querySelector("#be-surface")) fail("meters were offered a surface");
      if (/surface/i.test(host.querySelector(".be-summary")?.textContent || "")) {
        fail("a surface typed for trenches followed the panel onto the meters");
      }
      const apply = [...host.querySelectorAll("button")]
        .find((b) => /^Apply to/.test(b.textContent));
      if (apply && !apply.disabled) {
        fail("a set nothing was set on offered to be applied to");
      }
    }
    await act(async () => root.unmount());
  }

  /* b. Selection mode, on two trenches. */
  {
    const { host, root } = await mount({
      features: drawing.slice(0, 2), mode: "selection",
    });
    if (!/Edit 2 selected/.test(host.textContent)) fail("the selection panel miscounts");
    if (!host.querySelector("#be-surface")) fail("a pair of trenches was offered no surface");
    if (!host.querySelector("#be-status")) fail("a pair of trenches was offered no build status");
    if (host.querySelector("#be-Size")) fail("a trench was offered a size");
    if (!host.querySelector("#be-Label")) fail("the selection panel offers no name");
    /* Both ways in are reachable from either. */
    const tabs = [...host.querySelectorAll('[role="tab"]')].map((b) => b.textContent);
    if (tabs.length !== 2) fail(`the panel shows ${tabs.length} modes, expected 2`);
    await act(async () => root.unmount());
  }

  rmSync(tmp, { force: true });
}

/* ── Services can be sized in bulk; mains still cannot ──

   The span-node-copy guard was applied to every cable field, and it
   blocked the one bulk edit services exist to need: eighty-four
   unsized tails, one fact, eighty-four editors. A service is copied
   nowhere — its size lives on the line alone — so the panel offers
   the field for the service class and keeps the guard's text for
   mains, whose size really is held twice. */
{
  const be = readFileSync("./src/features/gis/BulkEditor.jsx", "utf8");
  if (!/f\.kind === "cable" && f\.usage !== "service"/.test(be)) {
    fails.push("the mains guard no longer spares the service class");
  }
  if (!/The tail each customer is fed through/.test(be)) {
    fails.push("the service class has lost its bulk cable field");
  }
  const svcRow = (i) => ({ Feature_ID: i, Feature_Type: "line", Layer_Key: "electric",
    Attributes: { Line_Type: "elec_service" }, Geometry: [[0, 0], [1, 1]] });
  const rr = planBulkEditOn([svcRow(1), svcRow(2)], { VD_Cable_Size_ID: 7 }, { lineTypes: [] });
  if (rr.rows.length !== 2 || rr.rows[0].Attributes?.VD_Cable_Size_ID !== 7) {
    fails.push("a bulk service-cable size does not reach the attributes");
  }
}

console.log(fails.length
  ? "FAIL\n - " + fails.join("\n - ")
  : "Bulk edit behaves (many classes, only shared fields, per-feature status refusal).");
process.exit(fails.length ? 1 : 0);
