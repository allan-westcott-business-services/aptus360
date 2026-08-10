/* Smoke test for the HR port.
 *
 * The build only proves the module parses. This proves it runs: mounts
 * the pane, renders pages, draws icons, opens a modal and tears down —
 * with fetch stubbed, so nothing here touches Supabase.
 *
 * Run: node hrsmoke.mjs
 */
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { readFileSync, rmSync } from "fs";

const PAGES = [
  "dashboard", "people", "roles", "pay", "skills", "recruitment",
  "interactions", "leavers", "onboarding", "contractors", "performance",
  "leave", "compliance", "benefits", "reports", "admin",
];

// ── 1. Bundle the module the way Vite would ──────────────────────────
await build({
  entryPoints: ["src/features/hr/hrPortal.js"],
  bundle: true,
  format: "esm",
  outfile: "/tmp/hrbundle.mjs",
  define: {
    "import.meta.env.VITE_HR_SUPABASE_URL": '"https://example.test"',
    "import.meta.env.VITE_HR_SUPABASE_ANON_KEY": '"test-key"',
    /* The portal now goes through the application's own API layer,
       which reads import.meta.env itself. Defining the whole object
       rather than the two keys above, so anything it adds later is
       covered without this file needing to know about it. */
    "import.meta.env": JSON.stringify({
      VITE_HR_SUPABASE_URL: "https://example.test",
      VITE_HR_SUPABASE_ANON_KEY: "test-key",
      /* Not mocks: the harness stubs fetch and returns empty tables, which
         is what an empty database looks like. Mock mode would answer
         from fixtures that have no HR tables in them at all. */
      VITE_USE_MOCKS: "false",
      MODE: "test",
      DEV: false,
    }),
  },
  logLevel: "error",
});

// ── 2. A document to draw into ───────────────────────────────────────
const dom = new JSDOM(
  `<!doctype html><html><body>
     <div id="hr-root" class="hr-root">
       <div id="hr-page-content"></div>
       <div id="hr-modal-root"></div>
     </div>
   </body></html>`,
  /* An origin is required or jsdom refuses localStorage, which the
     dashboard reads for its card preferences. */
  { pretendToBeVisual: true, url: "https://aptus360.test/" }
);

for (const k of ["window", "document", "navigator", "HTMLElement", "Node",
                 "Element", "SVGElement", "getComputedStyle", "localStorage",
                 "requestAnimationFrame", "cancelAnimationFrame", "CustomEvent",
                 "Event", "MouseEvent", "DOMParser", "Image", "Blob", "FileReader"]) {
  if (dom.window[k] === undefined) continue;
  try { globalThis[k] = dom.window[k]; } catch { /* Node owns it (navigator) */ }
}

// Chart.js needs a canvas it cannot have here. A stub keeps the page
// render honest: everything around the chart still has to work.
dom.window.HTMLCanvasElement.prototype.getContext = () => null;

// ── 3. Every table comes back empty, so pages render their empty state ─
const seen = new Set();
let fetchCount = 0;
globalThis.fetch = async (url) => {
  fetchCount++;
  seen.add(String(url).split("?")[0].replace("https://example.test/rest/v1/", ""));
  return {
    ok: true, status: 200,
    json: async () => [],
    text: async () => "[]",
  };
};

const errors = [];
dom.window.addEventListener("error", (e) => errors.push(e.message));
const realError = console.error;
console.error = (...a) => { errors.push(a.map(String).join(" ")); };

const hr = await import("/tmp/hrbundle.mjs");

// ── 4. Mount, then walk every page in the sidebar ─────────────────────
const navigated = [];
hr.mount("dashboard", (id) => navigated.push(id));

const settle = () => new Promise((r) => setTimeout(r, 120));
await settle();

const pc = dom.window.document.getElementById("hr-page-content");
const results = [];
let bad = 0;

for (const page of PAGES) {
  hr.showPage(page);
  await settle();
  const html = pc.innerHTML;
  const placeholders = pc.querySelectorAll("i[data-lucide]").length;
  const svgs = pc.querySelectorAll("svg").length;
  results.push({
    page,
    chars: html.length,
    svgs,
    undrawn: placeholders,
    blank: html.trim().length < 200,
  });
}

// ── 5. Report ────────────────────────────────────────────────────────
console.error = realError;

console.log("page            bytes   icons  undrawn  status");
console.log("─".repeat(52));
for (const r of results) {
  const status = r.blank ? "BLANK" : r.undrawn ? "ICONS NOT DRAWN" : "ok";
  if (status !== "ok") bad++;
  console.log(
    `${r.page.padEnd(15)} ${String(r.chars).padStart(6)}  ${String(r.svgs).padStart(5)}  ${String(r.undrawn).padStart(7)}  ${status}`
  );
}

console.log(`\nTables queried: ${seen.size}`);
console.log(`Sidebar told about navigation: ${navigated.length ? navigated.join(", ") : "(none — expected, nothing navigated internally)"}`);

// ── 6. The navigation bridge ─────────────────────────────────────────
// The riskiest new code in the port: an internal navigation has to move
// the app's sidebar, and the sidebar echoing the same page back must not
// cause a second render.
hr.showPage("dashboard");
await settle();

const before = navigated.length;
const tile = pc.querySelector('[data-nav="people"]');
if (!tile) {
  console.log("\nNav bridge: NO TILE FOUND to click");
  bad++;
} else {
  const fetchesBefore = fetchCount;
  tile.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await settle();

  const told = navigated.slice(before);
  console.log(`\nNav bridge: tile click -> shell told ${JSON.stringify(told)}`);
  if (told.length !== 1 || told[0] !== "people") {
    console.log("  EXPECTED exactly ['people']");
    bad++;
  }

  // Now the echo: the shell re-renders and hands the same page back.
  const fetchesAfterNav = fetchCount;
  hr.showPage("people");
  await settle();
  const echoed = fetchCount - fetchesAfterNav;
  console.log(
    `  shell echoing 'people' back -> ${echoed} further request(s)` +
      ` (${echoed === 0 ? "guard holds" : "DOUBLE RENDER"})`
  );
  if (echoed !== 0) bad++;
  console.log(`  (the navigation itself cost ${fetchesAfterNav - fetchesBefore} requests)`);
}

// ── 7. A modal opens and closes ──────────────────────────────────────
hr.showPage("admin");
await settle();
const addBtn = pc.querySelector("#admin-add") || pc.querySelector("[data-add]");
const modalRootEl = dom.window.document.getElementById("hr-modal-root");
if (addBtn) {
  addBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await settle();
  const opened = modalRootEl.querySelector(".modal") !== null;
  const undrawnInModal = modalRootEl.querySelectorAll("i[data-lucide]").length;
  console.log(
    `\nModal: ${opened ? "opens" : "DID NOT OPEN"}` +
      `, icons ${undrawnInModal === 0 ? "drawn" : "NOT DRAWN"}` +
      `, mounted in #hr-modal-root`
  );
  if (!opened || undrawnInModal) bad++;
} else {
  console.log("\nModal: no add button found on admin page");
}

// Teardown must not throw and must clear the modal mount.
hr.unmount();
const modalRoot = dom.window.document.getElementById("hr-modal-root");
console.log(`Modal root after unmount: ${modalRoot.innerHTML === "" ? "clear" : "STILL POPULATED"}`);

const realErrors = errors.filter(
  (e) => !/canvas|getContext|Not implemented|jsdom/i.test(e)
);
if (realErrors.length) {
  console.log(`\n${realErrors.length} runtime error(s):`);
  realErrors.slice(0, 12).forEach((e) => console.log("  " + e.slice(0, 220)));
  bad += realErrors.length;
}

rmSync("/tmp/hrbundle.mjs", { force: true });
console.log(bad ? `\nFAILED (${bad})` : "\nAll 16 HR pages render.");
process.exit(bad ? 1 : 0);
