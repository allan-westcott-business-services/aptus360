/* Mounts the shell in jsdom and drives it the way a user would: land on
   the squares, press one, check the sidebar scopes itself to that area,
   and come back. Renders for real rather than reading the source, so a
   temporal dead zone or a missing useState shows up as a blank screen
   here instead of in production. */
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const bundle = await build({
  entryPoints: ["src/App.jsx"],
  bundle: true, write: false, format: "cjs",
  jsx: "automatic", platform: "browser", logLevel: "silent",
  /* Shared rather than bundled. Two copies of React means the hooks the
     components call and the renderer driving them are different modules,
     and every useState throws on a null dispatcher. */
  external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
  loader: { ".png": "empty", ".css": "empty" },
  /* `?url` is a Vite instruction, not a path esbuild knows. The worker
     it points at is never started in this test, so a string stands in
     for it and the bundle resolves. */
  plugins: [{
    name: "vite-url-suffix",
    setup(b) {
      b.onResolve({ filter: /\?url$/ }, (a) => ({ path: a.path, namespace: "viteurl" }));
      b.onLoad({ filter: /.*/, namespace: "viteurl" },
        () => ({ contents: 'export default "";', loader: "js" }));
    },
  }],
  /* The whole object, not key by key: HR reads its own VITE_HR_* pair
     and anything missed here surfaces as a screen that throws rather
     than a screen that fails the check. */
  define: {
    "import.meta.env": JSON.stringify({
      VITE_USE_MOCKS: "true", VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "",
      VITE_HR_SUPABASE_URL: "https://example.invalid",
      VITE_HR_SUPABASE_ANON_KEY: "test", MODE: "test", DEV: false, PROD: false,
    }),
    "process.env.NODE_ENV": '"development"',
  },
});

const nav = await import(process.cwd() + "/src/lib/navigation.js");

const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>",
  { url: "http://localhost/", pretendToBeVisual: true, runScripts: "outside-only" });
const { window } = dom;
for (const k of ["window","document","navigator","HTMLElement","Element","Node","Event",
  "MouseEvent","CustomEvent","getComputedStyle","requestAnimationFrame",
  "cancelAnimationFrame","sessionStorage","localStorage","matchMedia"]) {
  if (globalThis[k] === undefined) globalThis[k] = window[k];
}
globalThis.matchMedia ??= () => ({ matches:false, addListener(){}, removeListener(){},
  addEventListener(){}, removeEventListener(){} });
window.matchMedia ??= globalThis.matchMedia;
globalThis.fetch = async () => ({ ok:true, status:200, json: async () => ([]), text: async () => "" });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const code = bundle.outputFiles[0].text;
const React = (await import("react")).default;
const ReactNS = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react");

// Evaluate the bundle inside this realm so it shares our React/DOM globals.
const shared = {
  "react": React,
  "react-dom": await import("react-dom"),
  "react-dom/client": await import("react-dom/client"),
  "react/jsx-runtime": await import("react/jsx-runtime"),
};
const shim = (id) => {
  const m = shared[id];
  if (!m) throw new Error("unexpected external: " + id);
  return m.default && m.default.createElement ? m.default : m;
};
const factory = new Function("require", "module", "exports", "globalThis", code);
const mod = { exports: {} };
factory(shim, mod, mod.exports, globalThis);
const App = mod.exports.default;

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const root = createRoot(document.getElementById("root"));
const txt = () => document.body.textContent;
const squares = () => [...document.querySelectorAll(".area-sq")];
const navItems = () => [...document.querySelectorAll(".nav-item")];
const click = async (el) => { await act(async () => {
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }); };

await act(async () => { root.render(React.createElement(App)); });

// 1. Lands on the squares, not a screen.
if (squares().length !== nav.AREAS.length)
  fail(`expected ${nav.AREAS.length} squares, got ${squares().length}`);
if (document.querySelector("#app-sidebar")) fail("sidebar rendered on the landing page");

// 2. Every square is outlined in its own colour.
const outlines = squares().map((s) => s.style.getPropertyValue("--sq").trim());
if (new Set(outlines).size !== outlines.length) fail("squares share an outline colour");
nav.AREAS.forEach((a, i) => {
  if (outlines[i] !== a.colour) fail(`${a.label} outline ${outlines[i]} != ${a.colour}`);
  if (!squares()[i].textContent.includes(a.label)) fail(`square ${i} is not ${a.label}`);
});

// 3. Pressing a square opens that area and scopes the menu to it.
for (const [i, area] of nav.AREAS.entries()) {
  await click(squares()[i]);
  const side = document.querySelector("#app-sidebar");
  if (!side) { fail(`no sidebar after opening ${area.label}`); break; }
  const labels = navItems().map((b) => b.textContent.replace(/live$/, "").trim());
  const want = area.items.map((it) => it.label);
  if (JSON.stringify(labels) !== JSON.stringify(want))
    fail(`${area.label} menu is [${labels}] not [${want}]`);
  if (!side.textContent.includes(area.label)) fail(`${area.label} header missing`);
  const active = document.querySelectorAll(".nav-item.active");
  if (active.length !== 1) fail(`${area.label} has ${active.length} active items`);
  // back to the squares for the next one
  await click(document.querySelector(".sb-back"));
  if (!squares().length) fail(`no way back from ${area.label}`);
}

// 4. Within an area, moving between screens keeps the menu scoped.
await click(squares()[2]);                       // Operations
await click(navItems()[1]);                      // Planning
if (navItems().length !== nav.AREAS[2].items.length) fail("menu changed size within an area");
if (!document.querySelector(".nav-item.active").textContent.includes("Planning"))
  fail("selection did not follow the click");

// 5. The brand plate is the way home.
await click(document.querySelector(".brand-plate"));
if (!squares().length) fail("logo does not return to the landing page");

// 6. Where the user was survives a reload.
await click(squares()[2]);
await click(navItems()[1]);
const before = window.sessionStorage.getItem("aptus.where.view");
if (before !== '"planning"') fail(`remembered ${before} not "planning"`);
await act(async () => { root.unmount(); });
const root2 = createRoot(document.getElementById("root"));
await act(async () => { root2.render(React.createElement(App)); });
if (squares().length) fail("reload dropped the user back to the landing page");
if (!document.querySelector(".nav-item.active")?.textContent.includes("Planning"))
  fail("reload did not restore Planning");

// 7. A view from an older build must not blank the shell.
await act(async () => { root2.unmount(); });
window.sessionStorage.setItem("aptus.where.view", '"street-lighting"');
const root3 = createRoot(document.getElementById("root"));
await act(async () => { root3.render(React.createElement(App)); });
if (!squares().length) fail("a retired view did not fall back to the landing page");

if (!txt().trim()) fail("shell rendered nothing");
console.log(bad ? `\n${bad} problem(s)` : "Landing page and area menus behave.");
process.exit(bad ? 1 : 0);
