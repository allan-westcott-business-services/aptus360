/* Lazy pages that survive a deploy.

   Vite hashes every chunk name and Netlify removes the previous build's
   files, so a tab left open across a deploy holds an index pointing at
   chunks that are gone. The first click on a lazy page 404s and React
   reports "Failed to fetch dynamically imported module". Nothing is
   wrong with the page — the tab is older than the site — and the fix
   has always been a hard refresh, which is not something a user should
   have to know.

   lazyPage reloads once on that error and lets everything else through.
   Both halves matter and they fail in opposite directions: no reload
   and the screen is broken until somebody thinks to refresh; a reload
   on any error and a tab thrashes forever against a network that is
   simply down.

   ── Rendered, not read ──

   This drives the real lazyPage through a real React tree rather than
   grepping the source. The behaviour under test is entirely about what
   React does with a rejected lazy factory — whether the fallback stays
   up, whether the error reaches a boundary — and no amount of reading
   the file establishes that.

   ── Why the window is a proxy ──

   The one observable effect is `window.location.reload()`, and jsdom's
   Location marks `reload` non-configurable, so it cannot be stubbed in
   place. The global `window` is therefore a proxy over jsdom's that
   answers `location` with a plain object carrying a counter. Everything
   else falls through to the real one.

   The location object is plain rather than a proxy over jsdom's for the
   same reason: a proxy may not report a different value for a
   non-configurable, non-writable property of its target, and returning
   the stub throws a TypeError from the proxy itself. */
import { JSDOM } from "jsdom";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>",
  { url: "http://localhost/", pretendToBeVisual: true });
const real = dom.window;

let reloads = 0;
const fakeLocation = {
  href: String(real.location.href), origin: real.location.origin,
  pathname: real.location.pathname, search: "", hash: "",
  reload: () => { reloads += 1; },
};
const win = new Proxy(real, {
  get: (t, p) => (p === "location" ? fakeLocation : Reflect.get(t, p)),
});

/* defineProperty rather than assignment: several of these are
   getter-only on the Node global and a plain `=` throws. */
const put = (k, v) =>
  Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true });

for (const k of ["document", "HTMLElement", "Element", "Node", "Event", "MouseEvent",
  "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame",
  "sessionStorage", "localStorage"]) put(k, real[k]);
put("window", win);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = React;
const { lazyPage } = await import(`${process.cwd()}/src/lib/lazyPage.js`);

const h = React.createElement;
const root = createRoot(real.document.getElementById("root"));
const text = () => real.document.body.textContent;
const flagOf = (name) => real.sessionStorage.getItem(`aptus.chunkretry.${name}`);

/* Catches what lazyPage rethrows, so a page that is meant to fail shows
   "boom" rather than tearing the root down and failing every case after
   it. */
class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { hit: false }; }
  static getDerivedStateFromError() { return { hit: true }; }
  render() { return this.state.hit ? h("b", null, "boom") : this.props.children; }
}

/* React logs a caught render error through console.error whatever the
   boundary does with it. Silenced around the renders that are supposed
   to throw, so a passing run says so and nothing else. */
async function show(Page, { quiet = false } = {}) {
  const err = console.error;
  if (quiet) console.error = () => {};
  try {
    await act(async () => {
      root.render(h(Boundary, { key: Math.random() },
        h(React.Suspense, { fallback: h("i", null, "wait") }, h(Page))));
    });
  } finally { console.error = err; }
}

const staleError = (msg) => async () => { throw new Error(msg); };
const page = (label) => ({ default: () => h("p", null, label) });

// 1. An ordinary page renders.
{
  await show(lazyPage("Fine", async () => page("shown")));
  if (text() !== "shown") fail(`a working page rendered as "${text()}"`);
  if (reloads) fail(`a working page reloaded the tab ${reloads} time(s)`);
}

// 2. A stale chunk reloads the tab, once, and keeps the fallback up.
//
//    Not an error screen: the page is on its way out, and resolving
//    with anything would flash a screen about to be replaced. So the
//    promise never settles and the fallback is what stays on screen.
{
  const before = reloads;
  await show(lazyPage("Stale",
    staleError("Failed to fetch dynamically imported module: /assets/x-BSeqkqPX.js")));
  if (reloads !== before + 1) fail(`a stale chunk reloaded ${reloads - before} time(s), not once`);
  if (text() === "boom") fail("a stale chunk reached the error boundary instead of reloading");
  if (text() !== "wait") fail(`the fallback did not stay up — showed "${text()}"`);
  if (flagOf("Stale") !== "1") fail("the retry was not recorded, so it could happen again");
}

// 3. Every message the browsers actually produce counts as staleness.
//
//    Chrome, Firefox and Safari word this differently and only one of
//    them says "dynamically imported module".
{
  for (const [browser, msg] of [
    ["Chrome", "Failed to fetch dynamically imported module: /assets/a-1.js"],
    ["Firefox", "error loading dynamically imported module"],
    ["Safari", "Importing a module script failed."],
    ["offline", "Failed to fetch"],
  ]) {
    const before = reloads;
    await show(lazyPage(`Stale_${browser}`, staleError(msg)));
    if (reloads !== before + 1) fail(`${browser}'s wording is not treated as a stale chunk`);
  }
}

// 4. The flag is per page.
//
//    One shared key and the first stale page spends the only retry
//    there is, leaving every other page to throw on a tab that would
//    have recovered.
{
  if (flagOf("Stale_Chrome") !== "1") fail("the Chrome page recorded no retry");
  if (flagOf("Stale_Safari") !== "1") fail("the Safari page recorded no retry");
  if (flagOf("NeverSeen") !== null) fail("a page that never failed carries a retry flag");
}

// 5. A second failure throws rather than reloading again.
//
//    A reload loop is worse than the error it replaces. If the fresh
//    index still cannot fetch the chunk the fault is not staleness —
//    the network is down, or the file really is missing — and the
//    boundary should say so rather than the tab thrashing.
{
  const before = reloads;
  await show(lazyPage("Twice", staleError("Failed to fetch dynamically imported module: /a.js")));
  if (reloads !== before + 1) fail("the first failure did not reload");

  /* A second lazyPage under the same name, which is what a reloaded tab
     produces: fresh module, same key, flag still in storage. */
  await show(lazyPage("Twice", staleError("Failed to fetch dynamically imported module: /a.js")),
    { quiet: true });
  if (reloads !== before + 1) fail(`the tab reloaded ${reloads - before} times — this is the loop`);
  if (text() !== "boom") fail(`a repeated failure showed "${text()}" rather than reaching the boundary`);
}

// 6. Anything that is not staleness throws at once.
//
//    A page whose own code throws on import is not fixed by a reload,
//    and reloading hides the fault behind a screen that redraws itself.
{
  const before = reloads;
  await show(lazyPage("Broken", staleError("x is not a function")), { quiet: true });
  if (reloads !== before) fail("a genuine error reloaded the tab");
  if (text() !== "boom") fail(`a genuine error showed "${text()}" rather than reaching the boundary`);
  if (flagOf("Broken") !== null) fail("a genuine error spent the retry");
}

// 7. A successful load clears the flag, so a later deploy gets its own
//    retry.
//
//    Without this the flag is permanent for the session: the tab
//    recovers from the first deploy and is defenceless against the
//    second, which on a day with two deploys is most of the afternoon.
{
  real.sessionStorage.setItem("aptus.chunkretry.Recovers", "1");
  await show(lazyPage("Recovers", async () => page("back")));
  if (text() !== "back") fail(`the page did not render after recovery — showed "${text()}"`);
  if (flagOf("Recovers") !== null) fail("a successful load left the retry spent");
}

// 8. Storage that throws does not stop the page rendering.
//
//    sessionStorage is unavailable in private windows and locked-down
//    browsers and throws on access rather than returning null. Failing
//    to remember beats failing to render.
{
  const good = real.sessionStorage;
  const throwing = {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("denied"); },
    removeItem() { throw new Error("denied"); },
  };
  put("sessionStorage", throwing);
  try {
    await show(lazyPage("NoStorage", async () => page("still here")));
    if (text() !== "still here") {
      fail(`a page did not render where storage throws — showed "${text()}"`);
    }
    /* And a stale chunk there still reloads: it cannot remember that it
       did, which is the trade, but one reload beats a broken screen. */
    const before = reloads;
    await show(lazyPage("NoStorageStale",
      staleError("Failed to fetch dynamically imported module: /a.js")), { quiet: true });
    if (reloads !== before + 1) fail("a stale chunk did not reload where storage throws");
  } finally {
    put("sessionStorage", good);
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : `Lazy pages recover from a deploy (${reloads} reload(s), once each, `
    + "and never for an error a reload cannot fix).");
process.exit(bad ? 1 : 0);
