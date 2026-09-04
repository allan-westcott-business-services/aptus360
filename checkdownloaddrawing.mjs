/* Getting a drawing out of the app.

   There was no way. To send a drawing for diagnosis you pasted a fetch
   into the browser console, and the instructions for doing that were
   wrong twice over: the route had moved since they were written, and a
   bare fetch carries no token, so it came back "Sign in to use this."
   Two people spent two rounds on it and neither got a drawing.

   A menu item goes through `src/api/gis.js`, which signs the request
   like every other call. What this holds:

   - the item is on the menu and reachable without a project loaded
     being assumed;
   - it reads through the API layer rather than calling `fetch` itself,
     which is the rule for the whole app and the exact thing that broke
     the console route;
   - it takes a fresh read rather than serialising what is in memory —
     `features` carries optimistic `tmp-` rows mid-edit, and a drawing
     sent for diagnosis has to be what the database holds. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

if (!/async function downloadDrawing\(\)/.test(canvas)) {
  fail("there is no Download Drawing \u2014 getting a drawing out means the "
    + "browser console again");
}
if (!/label=\{busy === "download" \? "Saving\\u2026" : "Download Drawing"\}/.test(canvas)) {
  fail("Download Drawing is not on the menu, or no longer says when it is working");
}

const body = (() => {
  const at = canvas.indexOf("async function downloadDrawing()");
  return at < 0 ? "" : canvas.slice(at, at + 1600);
})();

/* Through the API layer. `src/api/*` wraps every endpoint and components
   never call fetch directly — the house rule, and the one the console
   snippet broke by going straight to the URL with no token. */
if (!/await listGis\(projectId\)/.test(body)) {
  fail("the download does not read through listGis");
}
if (/fetch\(/.test(body)) {
  fail("the download calls fetch itself, which is how the console route "
    + "ended up unauthenticated");
}

/* A fresh read, not the drawing in hand. */
if (/JSON\.stringify\(features\)/.test(body)) {
  fail("it serialises the features in memory \u2014 optimistic rows and all");
}

/* And it says what it saved. A download that produces a file silently
   is indistinguishable from one that failed. */
if (!/setStatus\(/.test(body)) {
  fail("the download says nothing when it has worked");
}
if (!/catch \(e\) \{ setError\(e\.message\); \}/.test(body)) {
  fail("a refused download fails silently");
}

console.log(bad ? `\n${bad} problem(s)`
  : "Download Drawing behaves (on the menu, signed like every other call).");
process.exit(bad ? 1 : 0);
