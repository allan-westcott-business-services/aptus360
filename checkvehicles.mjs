/* The vehicles screen, driven the way a user would.

   Mounts against the mock admin API, so it exercises the real component
   with the real sample fleet: list and search, expiry urgency, expanding
   a row to the five histories, and the writes that leave the screen. */
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const bundle = await build({
  entryPoints: ["src/features/vehicles/VehiclesPage.jsx"],
  bundle: true, write: false, format: "cjs", jsx: "automatic",
  platform: "browser", logLevel: "silent",
  external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
  define: { "import.meta.env": JSON.stringify({ VITE_USE_MOCKS: "true", MODE: "test", DEV: false }) },
});

const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>",
  { url: "http://localhost/", pretendToBeVisual: true });
for (const k of ["window","document","navigator","HTMLElement","HTMLInputElement",
  "HTMLSelectElement","HTMLTextAreaElement","Element","Node","Event","MouseEvent",
  "KeyboardEvent","FocusEvent","getComputedStyle","requestAnimationFrame",
  "cancelAnimationFrame","sessionStorage"]) {
  if (globalThis[k] === undefined) globalThis[k] = dom.window[k];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const confirms = [];
dom.window.confirm = (m) => { confirms.push(m); return true; };

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const shared = { "react": React, "react/jsx-runtime": await import("react/jsx-runtime"),
  "react-dom": await import("react-dom"), "react-dom/client": await import("react-dom/client") };
const mod = { exports: {} };
new Function("require","module","exports","globalThis", bundle.outputFiles[0].text)(
  (id) => shared[id].default?.createElement ? shared[id].default : shared[id],
  mod, mod.exports, globalThis);
const VehiclesPage = mod.exports.default;

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const $ = (s) => document.querySelector(s);
const all = (s) => [...document.querySelectorAll(s)];
const btn = (scope, text) => [...scope.querySelectorAll("button")]
  .find((b) => b.textContent.trim() === text);
const settle = async (ms = 350) => { await act(async () => {
  await new Promise((r) => setTimeout(r, ms)); }); };
const click = async (el) => { await act(async () => {
  el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); }); await settle(60); };
const setVal = async (el, v) => { await act(async () => {
  const proto = el.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype
    : el.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype
    : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  if (el.tagName === "SELECT") el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
}); };
const fieldByLabel = (label) => all(".vh-modal .vh-fld").find((l) =>
  l.querySelector("span")?.textContent.replace(/\s*\*$/, "").trim() === label)
  ?.querySelector("input,select,textarea");

const root = createRoot(document.getElementById("root"));
await act(async () => { root.render(React.createElement(VehiclesPage)); });
await settle();

// 1. The fleet lists.
const rows = () => all("tr.vh-row");
if (rows().length !== 3) fail(`expected 3 vehicles, got ${rows().length}`);
if (!$(".vh-count")?.textContent.includes("(3)")) fail("record count wrong");

// 2. Expiry urgency: one lapsed, one warning, one clear.
const badges = all(".vh-badge");
for (const level of ["expired", "warn", "ok"]) {
  if (!badges.some((b) => b.classList.contains(level)))
    fail(`no ${level} expiry badge — sample data or urgency broken`);
}
const expired = badges.find((b) => b.classList.contains("expired"));
if (!/\d+d ago/.test(expired.textContent)) fail("expired badge does not say how long ago");

// 3. Search narrows and reports.
await setVal($(".vh-search"), "caddy");
await settle(50);
if (rows().length !== 1) fail(`search returned ${rows().length}`);
if (!$(".vh-count").textContent.includes("1 of 3")) fail("count did not show the subset");
await setVal($(".vh-search"), "");
await settle(50);

// 4. Sorting flips.
const regCell = () => $("tr.vh-row .vh-reg-cell").textContent.trim();
const firstAsc = regCell();
await click(all(".vh-sort")[0]);
if (regCell() === firstAsc) fail("sorting by registration did not reorder");
await click(all(".vh-sort")[0]);
if (regCell() !== firstAsc) fail("sorting did not toggle back");

// 5. Expanding shows all five histories with counts.
await click($(".vh-toggle"));
const cards = all(".vh-card");
if (cards.length !== 5) fail(`expected 5 history sections, got ${cards.length}`);
const titles = cards.map((c) => c.querySelector(".vh-card-title").textContent);
for (const t of ["Insurance", "MOT", "Services", "Maintenance", "Mileage"]) {
  if (!titles.some((x) => x.includes(t))) fail(`no ${t} section`);
}
if (!titles.join(" ").includes("(none yet)") && !titles.join(" ").includes("("))
  fail("sections do not show counts");

// 6. A required field is actually enforced — the bug the original had.
const mileageCard = cards.find((c) =>
  c.querySelector(".vh-card-title").textContent.includes("Mileage"));
await click(btn(mileageCard, "+ Record reading"));
if (!$(".vh-modal")) fail("record-reading modal did not open");
else {
  const mileage = fieldByLabel("Mileage");
  await setVal(mileage, "");                       // blank the required field
  await click(btn($(".vh-modal"), "Save"));
  if (!$(".vh-modal")) fail("modal closed on a missing required field");
  if (!/Mileage is required/i.test(document.body.textContent))
    fail("required field was not enforced (the original's bug)");

  // 7. A good reading saves and mirrors onto the vehicle's mileage.
  await setVal(fieldByLabel("Reading date"), "2099-01-01");
  await setVal(fieldByLabel("Mileage"), "99999");
  await click(btn($(".vh-modal"), "Save"));
  await settle();
  if ($(".vh-modal")) fail("modal stayed open after a good save");
  const mileageCell = $("tr.vh-row.on td.num")?.textContent.trim();
  if (mileageCell !== "99,999")
    fail(`vehicle mileage shows "${mileageCell}", not the new reading`);
}

// 8. Adding a vehicle requires a registration.
await click(btn($(".vh-head-actions"), "+ Add vehicle"));
await click(btn($(".vh-modal"), "Add vehicle"));
if (!/Registration is required/i.test(document.body.textContent))
  fail("a vehicle saved without a registration");
await setVal(fieldByLabel("Registration"), "zz99 aaa");
await click(btn($(".vh-modal"), "Add vehicle"));
await settle();
if (rows().length !== 4) fail(`adding a vehicle left ${rows().length} rows`);
if (!document.body.textContent.includes("ZZ99 AAA"))
  fail("registration was not upper-cased on save");

// 9. Deleting warns about the histories going too.
const del = [...all("tr.vh-row")].at(-1).querySelector(".btn.delete");
await click(del);
await settle();
if (!confirms.some((m) => /insurance, MOT, service, maintenance and mileage/i.test(m)))
  fail("delete did not warn that the histories go too");
if (rows().length !== 3) fail(`delete left ${rows().length} rows`);

console.log(bad ? `\n${bad} problem(s)` : "Vehicles behaves.");
process.exit(bad ? 1 : 0);
