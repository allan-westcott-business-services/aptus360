/* NCR rules: aging, drill-down, auditor labels and register filtering.

   Checked directly because these are the numbers two screens have to
   agree on. A dashboard count that disagrees with the rows in the
   register reads as the data being wrong, which is the most expensive
   kind of bug to be told about. */
import * as N from "./src/features/hsqe/ncr.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const eq = (g, w, what) => {
  if (JSON.stringify(g) !== JSON.stringify(w))
    fail(`${what}: got ${JSON.stringify(g)}, wanted ${JSON.stringify(w)}`);
};

const today = new Date(2026, 0, 31);      // 31 Jan 2026
const names = {
  status: (id) => ({ 1: "Open", 2: "On Hold", 3: "Closed" })[id] ?? null,
  region: (id) => ({ 10: "North", 11: "South" })[id] ?? null,
  bu: (id) => ({ 20: "Operations" })[id] ?? null,
};

// ── Aging ───────────────────────────────────────────────────────
{
  const at = (iso) => ({ Date_Received: iso, NCR_Status_ID: 1 });
  eq(N.agingBucket(at("2026-01-31"), today), "0-30", "received today");
  eq(N.agingBucket(at("2026-01-01"), today), "0-30", "30 days");
  eq(N.agingBucket(at("2025-12-31"), today), "31-60", "31 days");
  eq(N.agingBucket(at("2025-12-02"), today), "31-60", "60 days");
  eq(N.agingBucket(at("2025-12-01"), today), "61-90", "61 days");
  eq(N.agingBucket(at("2025-10-01"), today), ">90", "well over 90");
  // No received date is the one nobody can age — it must still be counted.
  eq(N.agingBucket({ Date_Received: null }, today), ">90", "no received date");

  // A time on the date must not shift the bucket.
  eq(N.agingBucket({ Date_Received: "2026-01-31T23:30:00Z" }, today), "0-30",
    "a timestamp on the received date");

  // The bar must add up to the Open count beside it.
  const rows = [at("2026-01-20"), at("2025-11-01"), at(null),
    { Date_Received: "2026-01-20", NCR_Status_ID: 3 }];   // closed, excluded
  const counts = N.agingCounts(rows, names.status, today);
  const summed = Object.values(counts).reduce((a, b) => a + b, 0);
  const open = rows.filter((r) => names.status(r.NCR_Status_ID) === "Open").length;
  if (summed !== open) fail(`aging bar totals ${summed}, Open count is ${open}`);
}

// ── Auditor ─────────────────────────────────────────────────────
{
  const l = { dnoName: (id) => (id === 5 ? "Northern Powergrid" : null),
    idnoName: (id) => (id === 7 ? "ESP Electricity" : null) };
  eq(N.auditorLabel({ Auditor_Type: "DNO", Auditor_DNO_ID: 5 }, l),
    "Northern Powergrid", "DNO auditor");
  eq(N.auditorLabel({ Auditor_Type: "IDNO", Auditor_IDNO_ID: 7 }, l),
    "ESP Electricity", "IDNO auditor");
  // No type means found internally, not missing.
  eq(N.auditorLabel({ Auditor_Type: null }, l), "Aptus Utilities", "internal auditor");
  // A type with an id nothing matches still says which kind it was.
  eq(N.auditorLabel({ Auditor_Type: "DNO", Auditor_DNO_ID: 999 }, l), "DNO",
    "DNO auditor whose name is unknown");
}

// ── Drill-down ──────────────────────────────────────────────────
{
  eq(N.nextLevel([]), "status", "first level");
  eq(N.nextLevel([{ level: "status", label: "Open" }]), "region", "second level");
  // Entered part-way: picking region first leaves status still to come.
  eq(N.nextLevel([{ level: "region", label: "North" }]), "status",
    "non-contiguous drill");
  eq(N.nextLevel(N.DRILL_LEVELS.map((l) => ({ level: l.key, label: "x" }))), null,
    "all levels used");

  const rows = [
    { NCR_Status_ID: 1, Region_ID: 10, Business_Unit_ID: 20 },
    { NCR_Status_ID: 1, Region_ID: 11, Business_Unit_ID: 20 },
    { NCR_Status_ID: 3, Region_ID: 10, Business_Unit_ID: null },
  ];
  eq(N.applyDrill(rows, [{ level: "status", label: "Open" }], names).length, 2,
    "drill by status");
  eq(N.applyDrill(rows, [{ level: "status", label: "Open" },
    { level: "region", label: "North" }], names).length, 1, "drill by status then region");
  // An unset value is a bucket, not a gap.
  eq(N.applyDrill(rows, [{ level: "bu", label: "(Unassigned)" }], names).length, 1,
    "drill into unassigned");

  eq(N.aggregate(rows, "status", names),
    [{ label: "Open", value: 2 }, { label: "Closed", value: 1 }],
    "aggregate, largest first");
  // Every row lands in exactly one slice.
  const total = N.aggregate(rows, "bu", names).reduce((a, s) => a + s.value, 0);
  if (total !== rows.length) fail(`aggregate covers ${total} of ${rows.length} rows`);
}

// ── Register filters ────────────────────────────────────────────
{
  const rows = [
    { ref: "NCR00001", site: "Elm Park", received: "2026-01-15" },
    { ref: "NCR00002", site: "", received: "2026-02-20" },
    { ref: "NCR00003", site: "Oak Rise", received: null },
  ];
  const get = (r, k) => r[k];
  const run = (filters, blanks = {}) =>
    rows.filter((r) => N.rowMatches(r, filters, blanks, get)).map((r) => r.ref);

  eq(run({ site: "elm" }), ["NCR00001"], "text filter, case-insensitive");
  eq(run({}), ["NCR00001", "NCR00002", "NCR00003"], "no filter keeps everything");
  eq(run({}, { site: true }), ["NCR00002"], "blanks-only finds the empty cell");
  // Blanks-only wins over a typed term: the two together ask for nothing.
  eq(run({ site: "elm" }, { site: true }), ["NCR00002"],
    "blanks-only overrides a typed filter");

  eq(run({ received_from: "2026-02-01" }), ["NCR00002"], "date range, from");
  eq(run({ received_to: "2026-01-31" }), ["NCR00001"], "date range, to");
  eq(run({ received_from: "2026-01-01", received_to: "2026-12-31" }),
    ["NCR00001", "NCR00002"], "date range, both ends");
  // A missing date is outside every range rather than inside all of them.
  if (run({ received_from: "2020-01-01" }).includes("NCR00003"))
    fail("a row with no date passed a date-range filter");
}

// ── The two screens mount and behave ────────────────────────────
{
  const { build } = await import("esbuild");
  const { JSDOM } = await import("jsdom");
  const mount = async (entry) => {
    const bundle = await build({
      entryPoints: [entry], bundle: true, write: false, format: "cjs", jsx: "automatic",
      platform: "browser", logLevel: "silent",
      external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
      define: { "import.meta.env": JSON.stringify({ VITE_USE_MOCKS: "true", MODE: "test", DEV: false }) },
    });
    const mod = { exports: {} };
    new Function("require","module","exports","globalThis", bundle.outputFiles[0].text)(
      (id) => shared[id].default?.createElement ? shared[id].default : shared[id],
      mod, mod.exports, globalThis);
    return mod.exports.default;
  };

  const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>",
    { url: "http://localhost/", pretendToBeVisual: true });
  for (const k of ["window","document","navigator","HTMLElement","HTMLInputElement",
    "HTMLSelectElement","Element","Node","Event","MouseEvent","SVGElement",
    "getComputedStyle","requestAnimationFrame","cancelAnimationFrame","sessionStorage"]) {
    if (globalThis[k] === undefined) globalThis[k] = dom.window[k];
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.confirm = () => true;
  const React = (await import("react")).default;
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const shared = { "react": React, "react/jsx-runtime": await import("react/jsx-runtime"),
    "react-dom": await import("react-dom"), "react-dom/client": await import("react-dom/client") };

  const all = (s) => [...document.querySelectorAll(s)];
  const settle = async (ms = 400) => { await act(async () => {
    await new Promise((r) => setTimeout(r, ms)); }); };
  const click = async (el) => { await act(async () => {
    el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); }); await settle(80); };

  // ── Register ──
  const NcrList = await mount("src/features/hsqe/NcrListPage.jsx");
  let root = createRoot(document.getElementById("root"));
  await act(async () => { root.render(React.createElement(NcrList)); });
  await settle();

  const dataRows = () => all("tbody tr").filter((r) => !r.querySelector(".ncr-empty"));
  if (dataRows().length !== 7) fail(`register shows ${dataRows().length} rows, expected 7`);
  if (!document.body.textContent.includes("NCR00001")) fail("register is missing NCR00001");
  // Business Unit is absent until HR lands — the screen must say so, not break.
  if (!/arrives with the HR section/i.test(document.body.textContent))
    fail("no note explaining the missing Business Unit lookup");
  // Every column has a blanks toggle.
  const blanks = all(".ncr-blank");
  if (blanks.length !== 13) fail(`expected 13 blanks toggles, got ${blanks.length}`);
  // Blanks-only on Close Date finds the five that are still open.
  await click(blanks[12]);
  if (dataRows().length !== 5) fail(`blanks-only on Close Date gave ${dataRows().length}, expected 5`);
  await click(blanks[12]);
  if (dataRows().length !== 7) fail("turning the blanks toggle off did not restore the rows");
  await act(async () => { root.unmount(); });

  // ── Dashboard ──
  const Dash = await mount("src/features/hsqe/HsqeDashboardPage.jsx");
  root = createRoot(document.getElementById("root"));
  await act(async () => { root.render(React.createElement(Dash)); });
  await settle();

  const kpis = all(".hq-kpi-value").map((e) => e.textContent);
  eq(kpis, ["7", "4", "1", "2"], "KPI counts (total, open, on hold, closed)");
  // The aging bar must account for every open report.
  const bars = all(".hq-bar span").map((e) => Number(e.textContent));
  const barTotal = bars.reduce((a, b) => a + b, 0);
  if (barTotal !== 4) fail(`aging bar totals ${barTotal}, but 4 are open`);
  // Drill: click a status slice and the table below narrows.
  const keys = all(".hq-keys button");
  if (!keys.length) fail("no drill options rendered");
  else {
    const before = all(".hq-scroll tbody tr").length;
    await click(keys[0]);
    const after = all(".hq-scroll tbody tr").length;
    if (after >= before) fail(`drilling did not narrow the table (${before} -> ${after})`);
    if (!/Back/.test(document.body.textContent)) fail("no way back out of a drill");
    // And the next level offered is region, not status again.
    if (!/By region/i.test(document.body.textContent))
      fail("after drilling by status the next level was not region");
  }
  await act(async () => { root.unmount(); });
}

console.log(bad ? `\n${bad} problem(s)` : "NCR rules and screens behave.");
process.exit(bad ? 1 : 0);
