/* The GIS Styles rule pane, mounted and driven.

   ── Why this one renders ──

   Everything else about this screen is checked by calling the pure
   module behind it, and twice now that has not been enough. The fault
   reported this time was "when I add a Condition, when I pick one of the
   fields from the dropdown box, I cannot change my selection - I need to
   delete the condition" — and there was nothing wrong with the module.
   The field was an `<input list>`, and a datalist filters its
   suggestions by what is already in the box, so a box holding
   Build_Status suggested Build_Status and nothing else. No test of a
   function could have seen it; a test that picks a field and then picks
   another one sees it immediately.

   So this mounts the real component over a stubbed API and drives it:
   opens a rule from the list, changes a criterion twice, adds a second,
   saves, and reads what the save would have sent. Every assertion is
   about what the screen DOES, not what its source says.

   ── What it costs ──

   esbuild to bundle the JSX and jsdom to hold it, both already
   devDependencies, and about two seconds. It writes its entry and bundle
   into .tmp-stylespane/ and removes them again, pass or fail.

   Run: node checkstylespane.mjs */

import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { writeFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const DIR = ".tmp-stylespane";

/* Rules shaped like the ones in the live table: the seeded layer
   default, the role rule, the off-site rule the user sent a CSV of, and
   an operator's rule. */
const ROWS = [
  { GIS_Style_ID: 11, Style_Name: "Plots (layer default)", Layer_Key: "plot",
    Colour: "#2563eb", Is_Active: true },
  { GIS_Style_ID: 20, Style_Name: "Plot seed", Feature_Role: "plot", Is_Active: true },
  { GIS_Style_ID: 19, Style_Name: "Off site", Site: "Off-site", Is_Active: true },
  { GIS_Style_ID: 30, Style_Name: "ENW mains", Organisation_ID: 7,
    Line_Type: "elec_main", Colour: "#7c3aed", Is_Active: true },
];

try {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${DIR}/stub-gis.js`, `
export const listGisStyles = async () => ({ rows: ${JSON.stringify(ROWS)} });
export const saveGisStyle = async (body, id) => {
  globalThis.__saved.push({ body, id });
  return body;
};
export const deleteGisStyle = async () => ({ deleted: true });
`);
  writeFileSync(`${DIR}/stub-lookups.js`, `
export const getLookups = async () => ({
  utilities: [{ Utility_ID: 1, Utility: "Electricity" }, { Utility_ID: 3, Utility: "Water" }],
  orgOperators: [{ Organisation_ID: 7, Name: "Electricity North West" },
                 { Organisation_ID: 9, Name: "Northern Powergrid" }],
});
`);
  /* The entry has to sit inside the project or node cannot resolve react
     from it, so the pane's path is relative to DIR and not to here.
     Composed rather than written out, because a literal `import … from
     "../src/…"` in this file is an import THIS file appears to make, and
     checkimports resolves it from the wrong directory and says, quite
     correctly, that there is no such file. */
  const PANE_PATH = "../src/features/admin/GisStylesAdmin.jsx";
  writeFileSync(`${DIR}/entry.jsx`, [
    'import { createRoot } from "react-dom/client";',
    `import GisStylesAdmin from ${JSON.stringify(PANE_PATH)};`,
    "globalThis.__mount = () =>",
    '  createRoot(document.getElementById("root")).render(<GisStylesAdmin />);',
  ].join("\n"));

  await build({
    entryPoints: [`${DIR}/entry.jsx`],
    bundle: true, format: "iife", outfile: `${DIR}/app.js`,
    jsx: "automatic", logLevel: "error",
    /* The network and the lookups stubbed, so this tests the screen and
       not the API. Relative paths are not valid esbuild aliases, hence
       the resolver. */
    plugins: [{
      name: "stub-api",
      setup(b) {
        b.onResolve({ filter: /api\/(gis|lookups)\.js$/ }, (a) => ({
          path: process.cwd() + "/" + DIR
            + (a.path.endsWith("gis.js") ? "/stub-gis.js" : "/stub-lookups.js"),
        }));
      },
    }],
    define: { "process.env.NODE_ENV": '"development"' },
  });

  const dom = new JSDOM(
    `<!doctype html><html><body><div id="root"></div></body></html>`,
    { runScripts: "outside-only", pretendToBeVisual: true },
  );
  const { window } = dom;
  window.__saved = [];
  /* The preview draws on a canvas and jsdom has no 2d context. Stubbed
     to a no-op: what the preview draws is checkgisstyle's business, and
     an exception here would read as a broken pane. */
  const noop = () => {};
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
    get: () => noop, set: () => true,
  });

  window.eval(readFileSync(`${DIR}/app.js`, "utf8"));
  window.__mount();

  const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
  await tick(180);

  const $ = (s) => window.document.querySelector(s);
  const $$ = (s) => [...window.document.querySelectorAll(s)];
  const byLabel = (re) => $$("[aria-label]")
    .filter((e) => re.test(e.getAttribute("aria-label")));
  const fieldBoxes = () => byLabel(/Criterion \d+ field/);
  const valueBoxes = () => byLabel(/Criterion \d+ value/);
  const change = (el, v) => {
    el.value = v;
    el.dispatchEvent(new window.Event("change", { bubbles: true }));
  };
  const click = (el) => el.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true }));
  const button = (re) => $$("button").find((b) => re.test(b.textContent));
  const openRule = (name) => {
    const b = $$("button.gs-item").find((x) => x.textContent.includes(name));
    if (!b) { fail(`"${name}" is not in the rule list`); return false; }
    click(b);
    return true;
  };
  const text = () => window.document.body.textContent;
  const saved = () => window.__saved.at(-1)?.body;

  if ($$("button.gs-item").length === 0) fail("the rule list rendered nothing");

  // ─── 1. The five controls the report asked about are gone ───
  if (openRule("ENW mains")) {
    await tick();
    for (const [id, what] of [
      ["gs-op", "Operator"], ["gs-util", "Utility"], ["gs-layer", "Layer"],
      ["gs-role", "Point role"], ["gs-site", "Site"],
    ]) {
      if ($(`#${id}`)) fail(`the rule pane still has a ${what} dropdown`);
    }
    /* And the line type, which was not in the report, is still there. */
    if (!$("#gs-lt")) fail("the line type control went with them");

    // ─── 2. The operator reads as a criterion, by name ───
    let fields = fieldBoxes();
    if (fields.length !== 1) {
      fail(`${fields.length} criteria shown for a rule scoped to one operator`);
    }
    if (fields[0]?.tagName !== "SELECT") {
      fail(`the field control is a ${fields[0]?.tagName}, and a datalist input `
        + `is the reported bug`);
    }
    if (fields[0]?.value !== "Organisation_ID") {
      fail(`the criterion reads ${JSON.stringify(fields[0]?.value)} rather than `
        + `the operator the rule is scoped to`);
    }
    let values = valueBoxes();
    if (values[0]?.value !== "7") {
      fail(`the operator's value reads ${JSON.stringify(values[0]?.value)}, not 7`);
    }
    if (!/Electricity North West/.test(values[0]?.textContent ?? "")) {
      fail("the operators are not offered by name");
    }

    // ─── 3. The bug: the field changes, twice, without deleting the row ───
    change(fields[0], "Build_Status");
    await tick();
    if (fieldBoxes()[0]?.value !== "Build_Status") {
      fail(`after picking Build status the field reads `
        + JSON.stringify(fieldBoxes()[0]?.value));
    }
    if (valueBoxes()[0]?.value !== "") {
      fail("the operator's id survived into the build status, so the rule would "
        + "save Build_Status = 7");
    }
    if (!/Planned/.test(valueBoxes()[0]?.textContent ?? "")) {
      fail("the build statuses are not offered by name");
    }
    change(valueBoxes()[0], "planned");
    await tick();

    change(fieldBoxes()[0], "Site");
    await tick();
    if (fieldBoxes()[0]?.value !== "Site") {
      fail("the field could not be changed a second time — it reads "
        + JSON.stringify(fieldBoxes()[0]?.value));
    }
    if (valueBoxes()[0]?.value !== "") fail("the build status survived the change to Site");
    if (!/Off site/.test(valueBoxes()[0]?.textContent ?? "")) {
      fail("the Site criterion does not offer on and off site");
    }
    change(valueBoxes()[0], "Off-site");
    await tick();

    // ─── 4. A second criterion, and no field offered twice ───
    click($("button.gs-cond-add"));
    await tick();
    fields = fieldBoxes();
    if (fields.length !== 2) fail(`${fields.length} criteria after adding one`);
    const offered = [...(fields[1]?.options ?? [])].map((o) => o.value);
    if (offered.includes("Site")) {
      fail("Site is offered to a second criterion, which is a rule that never matches");
    }
    if (!offered.includes("Organisation_ID")) {
      fail("Operator is not offered to a second criterion");
    }
    change(fields[1], "Build_Status");
    await tick();
    change(valueBoxes()[1], "planned");
    await tick();

    // ─── 5. Saving puts each criterion where the cascade reads it ───
    click(button(/^Save rule$/));
    await tick(140);
    const body = saved();
    if (!body) fail("saving sent nothing");
    else {
      if (String(body.Site) !== "Off-site") {
        fail(`the Site criterion saved as Site=${JSON.stringify(body.Site)}`);
      }
      if (body.Organisation_ID !== "" && body.Organisation_ID != null) {
        fail(`the operator was still saved as `
          + `${JSON.stringify(body.Organisation_ID)} after being changed away`);
      }
      const conds = body.Conditions ?? [];
      if (conds.length !== 1 || conds[0]?.field !== "Build_Status"
          || conds[0]?.value !== "planned") {
        fail(`the conditions saved as ${JSON.stringify(conds)}`);
      }
      /* The one thing that must never happen: a column criterion left in
         the jsonb list, where it is matched against the feature's
         Attributes — which carry no Organisation_ID — so it saves
         cleanly, reads right and matches nothing. */
      for (const c of conds) {
        if (["Organisation_ID", "Site"].includes(c?.field)) {
          fail(`${c.field} was saved as a condition, where it can never match`);
        }
      }
      if (body.Line_Type !== "elec_main") fail("the line type was lost on save");
    }
  }

  // ─── 6. Scope with no control left is stated, and kept ───
  if (openRule("Plots (layer default)")) {
    await tick();
    if (!/Also limited to/.test(text())) {
      fail("a rule scoped to a layer does not say so, and there is no longer a "
        + "control that would show it");
    }
    if (!/layer plot/.test(text())) fail("the note does not name the layer");
    click(button(/^Save rule$/));
    await tick(140);
    if (saved()?.Layer_Key !== "plot") {
      fail(`saving that rule wrote Layer_Key=${JSON.stringify(saved()?.Layer_Key)} `
        + `— it would stop being the plot layer's rule and every plot on every `
        + `drawing would change`);
    }
  }

  // ─── 6b. A value left over from the old field is not saved ───
  if (openRule("ENW mains")) {
    await tick();
    /* Changing the field and saving without touching the value. Asked of
       the SAVE and not of the box, because a select cannot show a value
       none of its options has: with the operator's 7 still on the row,
       the build-status box reads "" in the DOM and the screen looks
       right while the rule would save Build_Status = 7. The DOM
       assertion above passed on exactly that mutation. */
    change(fieldBoxes()[0], "Build_Status");
    await tick();
    click(button(/^Save rule$/));
    await tick(140);
    const c = (saved()?.Conditions ?? [])[0];
    if (c?.field !== "Build_Status") {
      fail(`changing the field saved ${JSON.stringify(saved()?.Conditions)}`);
    } else if (c.value !== "") {
      fail(`the old field's value was saved as Build_Status = `
        + `${JSON.stringify(c.value)}`);
    }
  }

  // ─── 7. And the limit can be removed on purpose ───
  if (openRule("Plot seed")) {
    await tick();
    if (!/role Plot seed/.test(text())) {
      fail("a rule scoped to a role does not name the role, or names its key");
    }
    const b = button(/Remove that limit/);
    if (!b) fail("there is no way to remove a limit the screen no longer edits");
    else {
      click(b);
      await tick();
      if (/Also limited to/.test(text())) fail("removing the limit left the note up");
      click(button(/^Save rule$/));
      await tick(140);
      if ((saved()?.Feature_Role ?? "") !== "") {
        fail(`removing the role limit saved Feature_Role=`
          + JSON.stringify(saved()?.Feature_Role));
      }
    }
  }
} finally {
  rmSync(DIR, { recursive: true, force: true });
}

console.log(bad ? `\n${bad} problem(s)`
  : "The rule pane behaves: a criterion can be changed, each one lands where the "
    + "cascade reads it, and scope with no control left is kept.");
process.exit(bad ? 1 : 0);
