/* The VYN pipeline.

   These are the rules the original Excel macro encoded, and the reason
   the pipeline is pure functions: they can be checked directly, with no
   spreadsheet and no browser. Each case below is a rule someone relies
   on being true of the weekly run. */
import * as P from "./src/features/vyn/pipeline.js";
import * as E from "./src/features/vyn/emails.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const eq = (got, want, what) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) fail(`${what}: got ${g}, wanted ${w}`);
};

// ── Header matching, not fixed positions ────────────────────────
{
  const header = ["Status (Hide)", "SLP (Hide)", "Site & Plot Details", "PLOT Details"];
  const map = P.buildColumnIndexMap(header, P.SITE_COLUMNS);
  eq(map.sitePlot, 2, "sitePlot index");
  eq(map.plotDetails, 3, "plotDetails index");
  eq(map.postCode, -1, "absent column reports -1");

  // A column inserted at the front must not shift everything silently.
  const shifted = ["New Column", ...header];
  eq(P.buildColumnIndexMap(shifted, P.SITE_COLUMNS).sitePlot, 3,
    "sitePlot index after a column is inserted");

  // Site Details carries "Connection Date" twice; each definition takes
  // the next unused one rather than both pointing at the first.
  const dup = ["Connection Date", "x", "Connection Date"];
  const m2 = P.buildColumnIndexMap(dup, [
    { key: "a", label: "Connection Date" }, { key: "b", label: "Connection Date" },
  ]);
  if (m2.a === m2.b) fail("duplicate labels both claimed the same column");

  // Headers wrap with a parenthetical note in the real exports.
  eq(P.buildColumnIndexMap(["Target\n(Month & Year)"], [{ key: "t", label: "Target (Month & Year)" }]).t,
    0, "wrapped header matched");
}

// ── Plot number extraction ──────────────────────────────────────
{
  const cases = [
    ["PLOT 60,", "60"], ["PLOT,60", "60"], ["PLOT 60", "60"],
    ["C60", "C60"], ["Y45", "Y45"], ["23B", "23B"], ["AB60CD", "AB60CD"],
    ["60", "60"], ["", ""],
  ];
  const rows = cases.map(([plotDetails]) => ({ plotDetails }));
  P.extractPlotNumbers(rows);
  cases.forEach(([input, want], i) => eq(rows[i].plotNumber, want, `plot from "${input}"`));
}

// ── AP code extraction ──────────────────────────────────────────
{
  const rows = [
    { sitePlot: "Some Site AP1234 Phase 2" }, { sitePlot: "no code here" },
    { sitePlot: "AP99" }, { sitePlot: "AP1234 and AP5678" },
  ];
  P.extractApCodes(rows);
  eq(rows.map((r) => r.apNumber), ["AP1234", "", "", "AP1234"], "AP codes (first match only)");
}

// ── Plot range expansion ────────────────────────────────────────
{
  eq(P.expandPlotRanges([{ plots: "23-27, 30" }]).map((r) => r.plots),
    ["23", "24", "25", "26", "27", "30"], "range expansion");
  eq(P.expandPlotRanges([{ plots: "5" }]).map((r) => r.plots), ["5"], "single plot");
  eq(P.expandPlotRanges([{ plots: "" }]).length, 1, "blank plots keeps the row");
  // A non-numeric range must not silently vanish.
  eq(P.expandPlotRanges([{ plots: "A-B" }]).map((r) => r.plots), ["A-B"],
    "non-numeric range kept whole");
  // The copy has to carry the rest of the row.
  eq(P.expandPlotRanges([{ plots: "1-2", teamName: "Gang 1" }]).map((r) => r.teamName),
    ["Gang 1", "Gang 1"], "expanded rows keep their source fields");
}

// ── Water services filter ───────────────────────────────────────
{
  const rows = [
    { utilities: "W", workType: "Services" },
    { utilities: "GW", workType: "services" },
    { utilities: "G", workType: "Services" },      // no water
    { utilities: "W", workType: "Mains" },         // not services
    { utilities: "w", workType: "Services" },      // lower case utility
  ];
  eq(P.filterToWaterServices(rows).length, 3, "water services filter");
}

// ── Already-connected rows drop out ─────────────────────────────
{
  eq(P.dropAlreadyConnected([
    { connectionDate: "" }, { connectionDate: null }, { connectionDate: "01/01/2026" },
  ]).length, 2, "rows with a connection date are dropped");
}

// ── Plot refs ───────────────────────────────────────────────────
{
  const site = [{ apNumber: "AP1234", plotNumber: "60" }, { apNumber: "", plotNumber: "" }];
  P.buildSitePlotRef(site);
  eq(site.map((r) => r.plotRef), ["AP1234-60", ""], "site plot refs");

  const sched = [{ contractCode: "AP1234", plots: "60" }];
  P.buildSchedulePlotRef(sched);
  eq(sched[0].plotRef, "AP1234-60", "schedule plot ref");
}

// ── The join ────────────────────────────────────────────────────
{
  const site = [
    { plotRef: "AP1234-60", engineer: "", operativeEmail: "", plannedDate: "" },
    { plotRef: "AP1234-61", engineer: "", operativeEmail: "", plannedDate: "" },
  ];
  P.mapScheduleOntoSiteDetails(site, [
    { plotRef: "AP1234-60", teamName: "Gang 1", teamEmail: "g1@x.com", startDate: "2026-01-05" },
  ]);
  eq(site[0].engineer, "Gang 1", "engineer copied across");
  eq(site[0].operativeEmail, "g1@x.com", "team email copied across");
  eq(site[1].engineer, "", "unmatched row untouched");

  // A blank team email must not wipe an address an earlier row supplied.
  const site2 = [{ plotRef: "R", engineer: "", operativeEmail: "", plannedDate: "" }];
  P.mapScheduleOntoSiteDetails(site2, [
    { plotRef: "R", teamName: "A", teamEmail: "a@x.com", startDate: "d1" },
    { plotRef: "R", teamName: "B", teamEmail: "", startDate: "d2" },
  ]);
  eq(site2[0].engineer, "B", "later row wins for engineer");
  eq(site2[0].operativeEmail, "a@x.com", "blank team email did not clear the address");
}

// ── Sheets that are never programme data ────────────────────────
{
  const hdr = ["Start Date", "Contract Code", "Utilities", "Work Type", "Plots", "Team Name"];
  const sheet = [[], hdr, ["2026-01-05", "AP1234", "W", "Services", "60", "Gang 1"]];
  const combined = P.combineScheduleSheets({
    "Water Program": sheet, "Schedule_Combined": sheet, "User": sheet, "Site Details": sheet,
  });
  eq(combined.length, 1, "only the programme sheet was stacked");
  eq(combined[0].contractCode, "AP1234", "combined row read by header");
}

// ── The BST bug the original called out ─────────────────────────
{
  // A July date built from local parts must read back as the same day.
  const d = new Date(2026, 6, 15);
  eq(P.toDateInputValue(d), "2026-07-15", "date input value uses local parts");
}

// ── Whole run, end to end ───────────────────────────────────────
{
  const siteRaw = [
    ["Status (Hide)", "SLP (Hide)", "Site & Plot Details", "PLOT Details", "Connection Date",
      "VYN Recording Link"],
    ["", "", "Elm Park AP1234", "PLOT 60,", "", "https://vyn/1"],
    ["", "", "Elm Park AP1234", "PLOT 61,", "", "https://vyn/2"],
    ["", "", "Elm Park AP1234", "PLOT 62,", "01/01/2026", "https://vyn/3"],  // done
  ];
  const schedHdr = ["Start Date", "Contract Code", "Team Name", "Team Email Addresses",
    "Utilities", "Work Type", "Plots"];
  const scheduleSheets = {
    "Water Program": [[], schedHdr,
      ["2026-07-15", "AP1234", "Gang 1", "g1@x.com", "W", "Services", "60-61"],
      ["2026-07-15", "AP1234", "Gang 9", "g9@x.com", "G", "Services", "99"],  // not water
    ],
  };
  const { siteRows, scheduleRows, matched, log } = P.runPipeline(siteRaw, scheduleSheets);
  eq(siteRows.length, 2, "connected plot dropped from the run");
  eq(scheduleRows.length, 2, "gas row filtered out, range expanded to two");
  eq(matched, 2, "both outstanding plots matched a visit");
  eq(siteRows[0].plotRef, "AP1234-60", "plot ref built end to end");
  eq(siteRows[0].engineer, "Gang 1", "engineer joined end to end");
  if (log.length !== 10) fail(`log has ${log.length} steps, expected 10`);

  // ── Emails ────────────────────────────────────────────────────
  const target = new Date(2026, 6, 15);
  const groups = E.buildEmailGroups(siteRows, target);
  eq(groups.length, 1, "one group (same operative, same day)");
  eq(groups[0].items.length, 2, "both plots in the group");
  eq(E.subjectFor(groups[0]), "Water Connections for Gang 1 for 15/07/2026", "subject line");
  const body = E.buildEmailBody(groups[0]);
  if (!body.includes("https://vyn/1")) fail("body is missing the recording link");
  if (/^[-*]\s|^\d+\./m.test(body)) fail("body has a list prefix Outlook would auto-format");
  if (!E.mailtoFor(groups[0]).startsWith("mailto:")) fail("mailto is malformed");

  // A different day yields nothing.
  eq(E.buildEmailGroups(siteRows, new Date(2026, 6, 16)).length, 0, "wrong day yields no groups");

  // Missing-email plots surface rather than vanishing.
  siteRows.forEach((r) => { r.operativeEmail = ""; });
  const missing = E.buildMissingEmailGroups(siteRows, target);
  eq(missing.length, 1, "team with no email is surfaced");
  eq(missing[0].rows.length, 2, "missing group carries its rows for write-back");
  eq(E.buildEmailGroups(siteRows, target).length, 0, "and is not in the ready-to-send list");
}

// ── The page mounts and the tabs gate on a run ──────────────────
{
  const { build } = await import("esbuild");
  const { JSDOM } = await import("jsdom");
  const bundle = await build({
    entryPoints: ["src/features/vyn/VynTrackerPage.jsx"],
    bundle: true, write: false, format: "cjs", jsx: "automatic",
    platform: "browser", logLevel: "silent",
    external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "xlsx"],
    define: { "import.meta.env": JSON.stringify({ VITE_USE_MOCKS: "true", MODE: "test", DEV: false }) },
  });
  const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>",
    { url: "http://localhost/", pretendToBeVisual: true });
  for (const k of ["window","document","navigator","HTMLElement","HTMLInputElement",
    "Element","Node","Event","MouseEvent","getComputedStyle","requestAnimationFrame",
    "cancelAnimationFrame","sessionStorage"]) {
    if (globalThis[k] === undefined) globalThis[k] = dom.window[k];
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = (await import("react")).default;
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const shared = { "react": React, "react/jsx-runtime": await import("react/jsx-runtime"),
    "react-dom": await import("react-dom"), "react-dom/client": await import("react-dom/client"),
    "xlsx": {} };
  const mod = { exports: {} };
  new Function("require","module","exports","globalThis", bundle.outputFiles[0].text)(
    (id) => shared[id].default?.createElement ? shared[id].default : shared[id],
    mod, mod.exports, globalThis);
  const Page = mod.exports.default;

  const root = createRoot(document.getElementById("root"));
  await act(async () => { root.render(React.createElement(Page)); });

  const tabs = [...document.querySelectorAll(".vy-tab")];
  if (tabs.length !== 6) fail(`expected 6 tabs, got ${tabs.length}`);
  // Only Import is reachable before a run — the rest have no data behind them.
  const enabled = tabs.filter((t) => !t.disabled).map((t) => t.textContent);
  eq(enabled, ["Import Data"], "tabs enabled before a run");
  if (document.querySelectorAll(".vy-dz").length !== 2) fail("expected two dropzones");
  if (document.querySelectorAll(".vy-node").length !== 9) fail("pipeline strip is not 9 steps");
  // Run is refused until both files are in.
  const runBtn = [...document.querySelectorAll("button")].find((b) => /Run pipeline/.test(b.textContent));
  if (!runBtn) fail("no run button");
  else if (!runBtn.disabled) fail("run button enabled with no files loaded");
  if (!/entirely in your browser/i.test(document.body.textContent))
    fail("the page does not say the files stay local");
  await act(async () => { root.unmount(); });
}

console.log(bad ? `\n${bad} problem(s)` : "VYN pipeline and page behave.");
process.exit(bad ? 1 : 0);
