/* The GIS Styles screen, mounted and driven.

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
  /* The example as it was given: an on-site electric cable that is
     3 px, yellow and dashed; continuous when the build status is Live;
     purple off site. */
  { GIS_Style_ID: 1, Style_Name: "Electric main", Line_Type: "elec_main",
    Colour: "#facc15", Width_Px: 3, Dashed: true, Is_Active: true },
  { GIS_Style_ID: 2, Style_Name: "Live", Line_Type: "elec_main",
    Conditions: [{ field: "Build_Status", value: "asbuilt" }],
    Dashed: false, Is_Active: true },
  { GIS_Style_ID: 3, Style_Name: "Off site", Line_Type: "elec_main",
    Site: "Off-site", Colour: "#7c3aed", Is_Active: true },
  /* A rule about the whole drawing, which is not a feature and belongs
     in the site-wide group. */
  { GIS_Style_ID: 4, Style_Name: "Everything", Width_Px: 1, Is_Active: true },
];

const LAYERS = [
  { Layer_Key: "electric", Label: "Electric" },
  { Layer_Key: "trench", Label: "Trench" },
];
const LINE_TYPES = [
  { Type_Key: "elec_main", Label: "Electric Main", Layer_Key: "electric" },
  /* Deliberately unstyled: a feature nobody has written a rule about
     has to be reachable, which is the reason the catalogue is read. */
  { Type_Key: "trench_main", Label: "Mains Trench", Layer_Key: "trench" },
];

try {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${DIR}/stub-gis.js`, `
export const listGisStyles = async () => ({
  rows: ${JSON.stringify(ROWS)},
  layers: ${JSON.stringify(LAYERS)},
  lineTypes: ${JSON.stringify(LINE_TYPES)},
});
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
  const openFeature = (name) => {
    const b = $$("button.gs-item").find((x) => x.textContent.includes(name));
    if (!b) { fail(`"${name}" is not in the feature list`); return false; }
    click(b);
    return true;
  };
  const text = () => window.document.body.textContent;
  const saved = () => window.__saved.at(-1)?.body;

  const featureNames = () => $$("button.gs-item .gs-nm").map((e) => e.textContent);

  if ($$("button.gs-item").length === 0) fail("the feature list rendered nothing");

  // ─── 1. The left pane is features, and adds nothing ───
  {
    /* "The Add Rule button should not be in the left hand pane as these
       are the Features that I want to apply the styles to." */
    const list = $(".gs-list");
    if (list?.querySelector(".gs-new")) {
      fail("the feature list still carries an Add-a-rule button");
    }
    if (/Add a rule/i.test(list?.textContent ?? "")) {
      fail("the feature list still offers to add a rule");
    }

    const names = featureNames();
    /* Named as the thing, not as somebody's rule. */
    if (!names.some((n) => n.includes("Electric Main"))) {
      fail(`the electric main is not listed as a feature: ${JSON.stringify(names)}`);
    }
    /* A feature with no rule at all is listed — the reason the
       catalogue is read rather than the rules. */
    const trench = names.find((n) => n.includes("Mains Trench"));
    if (!trench) fail("a feature nobody has styled is missing from the list");
    else if (!/no default/i.test(trench)) {
      fail("a feature with no default style does not say so, so a blank swatch "
        + "reads as an unfinished rule rather than an unwritten one");
    }
    /* And a rule that names no feature is not offered as one. */
    if (names.some((n) => n.trim() === "Off site" || n.trim() === "Live")) {
      fail("a variation is listed as a feature");
    }
    const heads = $$(".gs-sec-h").map((e) => e.textContent);
    if (!heads.includes("Site-wide")) {
      fail("the rules that apply to everything have nowhere to be edited");
    } else if (heads[0] !== "Site-wide") {
      fail(`the first group is ${JSON.stringify(heads[0])} \u2014 what everything `
        + `else is an exception to belongs at the top`);
    }
  }

  // ─── 2. Choosing a feature shows its default style ───
  if (openFeature("Electric Main")) {
    await tick();
    /* "I need to be able to set a DEFAULT style" */
    const tabs = $$(".gs-tab").map((t) => t.textContent);
    if (!tabs[0]?.startsWith("Default style")) {
      fail(`the first thing offered is ${JSON.stringify(tabs[0])}, not the default`);
    }
    if (tabs.length !== 3) {
      fail(`${tabs.length} styles shown for a cable with a default and two `
        + `variations: ${JSON.stringify(tabs)}`);
    }
    /* Variations named by what they apply to — their own names are
       often the feature's, repeated. */
    if (!tabs.some((t) => /Build status = asbuilt|Off-site/.test(t))) {
      fail(`the variations are not named by their criteria: ${JSON.stringify(tabs)}`);
    }

    /* The default's own values are in the form. */
    if ($("#gs-col")?.value !== "#facc15") {
      fail(`the default's colour reads ${$("#gs-col")?.value}`);
    }
    if ($("#gs-dashed")?.value !== "y") {
      fail(`the default's line reads ${JSON.stringify($("#gs-dashed")?.value)}, `
        + `and the default is dashed`);
    }
    /* A default has no criteria builder: a default with a criterion on
       it is a variation wearing the wrong name. */
    if (byLabel(/Criterion \d+ field/).length) {
      fail("the default style is offered criteria, which would make it a variation");
    }
    /* And no way to add one. Asserted on the control rather than on the
       rows: a default has no criteria, so an empty builder looks exactly
       like no builder and a mutation offering one walked through. */
    if ($("button.gs-cond-add")) {
      fail("the default style offers to add a criterion, which would make it a "
        + "variation of itself");
    }
    if (/Applies when/.test($(".gs-detail")?.textContent ?? "")) {
      fail("the default style is headed as though it applied only sometimes");
    }
  }

  // ─── 3. A variation shows what it changes, and inherits the rest ───
  {
    const live = $$(".gs-tab").find((t) => /asbuilt/.test(t.textContent));
    if (!live) fail("the Live variation cannot be opened");
    else {
      click(live);
      await tick();
      /* It sets the dash and nothing else. */
      if ($("#gs-dashed")?.value !== "n") {
        fail(`the Live variation's line reads ${JSON.stringify($("#gs-dashed")?.value)}, `
          + `and it is the one thing it changes`);
      }
      /* Everything else says what it takes from the default. This is
         "every other style variation should be derived from the default
         style", on the screen. */
      /* The picker shows the colour that WOULD be drawn, which is the
         default's — a picker showing slate grey under a yellow cable
         would be the swatch lying about the plan. The box beside it is
         where an override is typed, and it is empty. */
      if ($("#gs-col")?.value !== "#facc15") {
        fail(`the colour picker shows ${$("#gs-col")?.value} on a variation that `
          + `inherits the default's yellow`);
      }
      const colourBox = $$(".gs-colrow")[0]?.querySelectorAll("input")[1];
      if (colourBox?.value !== "") {
        fail(`the Live variation carries a colour of its own (${colourBox?.value})`);
      }
      if (!/inherits #facc15/i.test(colourBox?.placeholder ?? "")) {
        fail(`the colour box says ${JSON.stringify(colourBox?.placeholder)} rather `
          + `than what it inherits from the default`);
      }
      const widthBox = $("#gs-wpx");
      if (!/inherits 3/i.test(widthBox?.placeholder ?? "")) {
        fail(`the width box says ${JSON.stringify(widthBox?.placeholder)} rather `
          + `than the default's 3`);
      }
      /* And its criteria are editable. */
      if (byLabel(/Criterion \d+ field/).length !== 1) {
        fail("the Live variation does not show the criterion it applies under");
      }
    }
  }

  // ─── 4. A switch can say "inherits", which a checkbox cannot ───
  {
    /* Dashed, the draw-to-scale switches and the marker rotation were
       checkboxes, and BLANK started them false — so every rule written
       here set Dashed = false explicitly and a dashed default could
       never survive a variation over it. */
    const dash = $("#gs-dashed");
    if (dash?.tagName !== "SELECT") {
      fail(`the dashed control is a ${dash?.tagName}, which has two states `
        + `where the cascade has three`);
    }
    const opts = [...(dash?.options ?? [])].map((o) => o.value);
    if (!opts.includes("")) fail("the dashed control cannot say it inherits");
    if (!/Inherits/i.test(dash?.options?.[0]?.textContent ?? "")) {
      fail("the inherit option does not say so");
    }
    if (!/Dashed/.test(dash?.options?.[0]?.textContent ?? "")) {
      fail("the inherit option does not say what it would inherit");
    }
    for (const id of ["gs-scalew", "gs-scalesym", "gs-mrot"]) {
      const el = $(`#${id}`);
      if (el?.tagName !== "SELECT") fail(`#${id} is a ${el?.tagName}, not a three-state`);
    }
  }

  // ─── 5. Adding a variation happens beside the styles ───
  {
    const add = button(/Add a variation/);
    if (!add) fail("there is no way to add a variation");
    else {
      click(add);
      await tick();
      if (byLabel(/Criterion \d+ field/).length !== 0) {
        fail("a new variation starts with a criterion already in it");
      }
      /* It must narrow something, or it is the default under another
         name and whichever has the higher id wins. */
      click(button(/^Save rule$/) ?? button(/^Save/));
      await tick(120);
      if (window.__saved.length) {
        fail("a variation with no criteria saved, and it would replace the default");
      }
      if (!/at least one criterion/i.test(text())) {
        fail("saving a variation with no criteria says nothing about why it did not");
      }

      /* With one, it saves — scoped to the feature that was open, and
         setting only what was changed. */
      click($("button.gs-cond-add"));
      await tick();
      change(byLabel(/Criterion \d+ field/)[0], "Build_Status");
      await tick();
      change(byLabel(/Criterion \d+ value/)[0], "planned");
      await tick();
      change($("#gs-dashed"), "n");
      await tick();
      click(button(/^Save rule$/) ?? button(/^Save/));
      await tick(140);
      const body = window.__saved.at(-1)?.body;
      if (!body) fail("the variation did not save");
      else {
        if (body.Line_Type !== "elec_main") {
          fail(`the variation saved against ${JSON.stringify(body.Line_Type)}, not `
            + `the feature that was open`);
        }
        if (body.Dashed !== false) fail(`the variation saved Dashed=${body.Dashed}`);
        /* Everything it did not set must be null, or it overrides the
           default with the form's blanks. */
        for (const f of ["Colour", "Width_Px", "Scale_Width", "Symbol"]) {
          if (body[f] !== "" && body[f] != null) {
            fail(`the variation saved ${f}=${JSON.stringify(body[f])} without `
              + `anybody setting it, so it overrides the default`);
          }
        }
        const conds = body.Conditions ?? [];
        if (conds.length !== 1 || conds[0]?.field !== "Build_Status") {
          fail(`the variation saved criteria ${JSON.stringify(conds)}`);
        }
      }
    }
  }

  // ─── 6. A feature with no default can be given one ───
  {
    if (openFeature("Mains Trench")) {
      await tick();
      if (!/not set/i.test($$(".gs-tab")[0]?.textContent ?? "")) {
        fail("a feature with no default does not say so in its own pane");
      }
      /* Nothing is set until somebody sets it. A form that starts with
         answers in it writes them on save, which is how every style
         written here came to carry slate grey and an explicit
         "not dashed" that no variation could ever override. */
      for (const [id, what] of [
        ["gs-dashed", "the line"], ["gs-scalew", "the width"],
        ["gs-scalesym", "the symbol size"], ["gs-mrot", "the marker angle"],
      ]) {
        if ($(`#${id}`)?.value !== "") {
          fail(`a new style starts with ${what} already decided `
            + `(${JSON.stringify($(`#${id}`)?.value)})`);
        }
      }
      const freshColour = $$(".gs-colrow")[0]?.querySelectorAll("input")[1];
      if (freshColour?.value !== "") {
        fail(`a new style starts with a colour already in it `
          + `(${JSON.stringify(freshColour?.value)})`);
      }
      change($("#gs-dashed"), "y");
      await tick();
      click(button(/^Save rule$/) ?? button(/^Save/));
      await tick(140);
      const body = window.__saved.at(-1)?.body;
      if (body?.Line_Type !== "trench_main") {
        fail(`styling a feature that had no rule saved against `
          + `${JSON.stringify(body?.Line_Type)}`);
      }
      if (body?.Dashed !== true) fail("the default did not save what was set on it");
      for (const f of ["Colour", "Scale_Width", "Scale_Symbol", "Marker_Rotate"]) {
        if (body?.[f] !== "" && body?.[f] != null) {
          fail(`a style nobody touched saved ${f}=${JSON.stringify(body?.[f])}`);
        }
      }
      /* A default carries no criteria. */
      if ((body?.Conditions ?? null) !== null) {
        fail(`a default saved criteria: ${JSON.stringify(body?.Conditions)}`);
      }
    }
  }

} finally {
  rmSync(DIR, { recursive: true, force: true });
}

console.log(bad ? `\n${bad} problem(s)`
  : "The styles screen behaves: features on the left, a default style and the "
    + "variations derived from it on the right.");
process.exit(bad ? 1 : 0);
