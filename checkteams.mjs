/* Renaming a team.

   Drives TeamsAdmin in jsdom against a stubbed admin API and asserts on
   the PATCH that actually leaves the screen — the name has to reach the
   endpoint trimmed, a blank one must never be sent (Team_Name is NOT
   NULL and the endpoint nulls empty strings), and an unchanged name
   must not write at all. */
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const calls = [];
const TEAMS = [
  { Team_ID: 1, Team_Name: "Gang 1", Supplier_ID: null, Rate: 450, Rate_Unit: "day", Active: true },
  { Team_ID: 2, Team_Name: "Gang 2", Supplier_ID: null, Rate: null, Rate_Unit: null, Active: true },
];

const stub = `
export const adminList = async (t) => ({ rows: t === "Team" ? ${JSON.stringify(TEAMS)} : [] });
export const adminCreate = async (t, row) => ({ ...row, [t + "_ID"]: 99 });
export const adminUpdate = async (t, id, row) => { globalThis.__CALLS.push([t, id, row]); return { ...row }; };
export const adminDelete = async () => ({ deleted: true });
`;

const bundle = await build({
  entryPoints: ["src/features/admin/TeamsAdmin.jsx"],
  bundle: true, write: false, format: "cjs", jsx: "automatic",
  platform: "browser", logLevel: "silent",
  external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
  define: { "import.meta.env": JSON.stringify({ VITE_USE_MOCKS: "true", MODE: "test", DEV: false }) },
  plugins: [{
    name: "stub-admin-api",
    setup(b) {
      b.onResolve({ filter: /api\/admin\.js$/ }, () => ({ path: "admin", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: stub, loader: "js" }));
    },
  }],
});

const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>",
  { url: "http://localhost/", pretendToBeVisual: true });
for (const k of ["window","document","navigator","HTMLElement","Element","Node","Event",
  "MouseEvent","KeyboardEvent","FocusEvent","getComputedStyle","requestAnimationFrame",
  "cancelAnimationFrame","sessionStorage"]) {
  if (globalThis[k] === undefined) globalThis[k] = dom.window[k];
}
globalThis.__CALLS = calls;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const shared = { "react": React, "react/jsx-runtime": await import("react/jsx-runtime"),
  "react-dom": await import("react-dom"), "react-dom/client": await import("react-dom/client") };
const mod = { exports: {} };
new Function("require","module","exports","globalThis", bundle.outputFiles[0].text)(
  (id) => shared[id].default?.createElement ? shared[id].default : shared[id],
  mod, mod.exports, globalThis);
const TeamsAdmin = mod.exports.default;

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const root = createRoot(document.getElementById("root"));
const $ = (s) => document.querySelector(s);
const all = (s) => [...document.querySelectorAll(s)];
const byText = (s, t) => all(s).find((e) => e.textContent.trim() === t);
const click = async (el) => { await act(async () => {
  el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); }); };
const type = async (el, v) => { await act(async () => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
  setter.call(el, v);
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true })); }); };
/* React maps onBlur to the bubbling focusout, not to blur — dispatching
   the latter fires nothing and makes a working field look broken. */
const blur = async (el) => { await act(async () => {
  el.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true })); }); };
const key = async (el, k) => { await act(async () => {
  el.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: k, bubbles: true })); }); };

await act(async () => { root.render(React.createElement(TeamsAdmin)); });
await act(async () => { await new Promise((r) => setTimeout(r, 250)); });

// Open Gang 1, go to Details.
const openDetails = async (teamName) => {
  await click(all(".tm-item").find((b) => b.textContent.includes(teamName)));
  await click(byText(".tm-tab", "Details"));
};
await openDetails("Gang 1");

const nameBox = () => $(".tm-fld-name input");
if (!nameBox()) { fail("no team name field on the Details tab"); }
else {
  if (nameBox().value !== "Gang 1") fail(`name box shows "${nameBox().value}"`);

  // 1. A rename reaches the endpoint, trimmed.
  await type(nameBox(), "  Gang One  ");
  await blur(nameBox());
  const last = calls.at(-1);
  if (!last || last[0] !== "Team" || Number(last[1]) !== 1)
    fail(`rename did not PATCH Team 1 (got ${JSON.stringify(last)})`);
  else if (last[2].Team_Name !== "Gang One")
    fail(`sent "${last[2].Team_Name}" rather than the trimmed name`);

  // 2. The heading and the list follow the rename.
  if (!$(".tm-detail-head h3").textContent.includes("Gang One")) fail("heading did not update");
  if (!all(".tm-item").some((b) => b.textContent.includes("Gang One"))) fail("list did not update");

  // 3. An unchanged name writes nothing.
  const n = calls.length;
  await blur(nameBox());
  if (calls.length !== n) fail("re-blurring an unchanged name wrote anyway");

  // 4. A blank name is refused, not sent — Team_Name is NOT NULL.
  await type(nameBox(), "   ");
  await blur(nameBox());
  if (calls.length !== n) fail("a blank name was sent to the endpoint");
  if (nameBox().value !== "Gang One") fail("blank name was not put back");
  if (!/needs a name/i.test(document.body.textContent)) fail("no message explaining the refusal");

  // 5. Escape abandons an edit.
  await type(nameBox(), "typo");
  await key(nameBox(), "Escape");
  if (nameBox().value !== "Gang One") fail("Escape did not restore the saved name");

  // 6. Duplicate names warn but are allowed.
  await type(nameBox(), "Gang 2");
  if (!/already called that/i.test(document.body.textContent)) fail("no duplicate-name warning");

  // 7. Switching teams shows the other team's name, not this draft.
  await openDetails("Gang 2");
  if (nameBox().value !== "Gang 2")
    fail(`switching teams left "${nameBox().value}" in the box`);
}

console.log(bad ? `\n${bad} problem(s)` : "Team rename behaves.");
process.exit(bad ? 1 : 0);
