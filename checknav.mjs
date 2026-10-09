/* Checks the navigation model holds together: every built view the shell
   renders is reachable, no view is in two areas, and area entry points
   land somewhere real. */
import { readFileSync } from "node:fs";

const src = readFileSync("src/lib/navigation.js", "utf8");
const mod = await import(process.cwd() + "/src/lib/navigation.js");
const { AREAS, ALL_VIEWS, findArea, firstViewOf, HOME_VIEW } = mod;

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

// 1. Areas the brief asked for, in order.
/* Eight, as the brief asked for. Human Resources is here as a square
   with nothing behind it — its implementation went with the GIS canvas
   and the section is marked toBeDeveloped, which is what makes the
   landing page draw it shut and say so. Still listed, because the
   eight are the shape of the business and this check is what holds
   that shape. */
const want = ["Business Development","Tendering & Design","Operations","Commercial",
  "Human Resources","HSQE","Finance","Admin"];
const got = AREAS.map((a) => a.label);
if (JSON.stringify(want) !== JSON.stringify(got))
  fail(`areas are ${got.join(", ")}`);

// 2. Every area has a distinct outline colour.
const cols = AREAS.map((a) => a.colour);
if (new Set(cols).size !== cols.length) fail("two areas share a colour");
cols.forEach((c) => { if (!/^#[0-9a-f]{6}$/i.test(c)) fail(`bad colour ${c}`); });

// 3. No view lives in two areas — the sidebar would flip between them.
const seen = new Map();
AREAS.forEach((a) => a.items.forEach((i) => {
  if (seen.has(i.view)) fail(`${i.view} is in both ${seen.get(i.view)} and ${a.id}`);
  seen.set(i.view, a.id);
}));

// 4. Every view the shell can render is in some area, or it is unreachable.
const app = readFileSync("src/App.jsx", "utf8");
const rendered = [...app.matchAll(/view === "([a-z0-9-]+)"/g)].map((m) => m[1])
  .filter((v) => v !== HOME_VIEW);
rendered.forEach((v) => {
  if (!findArea(v)) fail(`${v} is rendered by App but sits in no area — unreachable`);
});

// 5. Entry point of each area exists and is built where anything is.
AREAS.forEach((a) => {
  const v = firstViewOf(a);
  if (!a.items.some((i) => i.view === v)) fail(`${a.id} opens on unknown view ${v}`);
  const anyBuilt = a.items.some((i) => i.built);
  const opensBuilt = a.items.find((i) => i.view === v)?.built;
  if (anyBuilt && !opensBuilt) fail(`${a.id} opens on a placeholder`);
});

// 6. Home is restorable, and is not itself an area item.
if (!ALL_VIEWS.includes(HOME_VIEW)) fail("home is not a restorable view");
if (findArea(HOME_VIEW)) fail("home belongs to an area");

// 7. Sidebar must not render on home.
const shell = readFileSync("src/components/Sidebar.jsx", "utf8");
if (!/if \(!area\) return null/.test(shell)) fail("sidebar does not guard a null area");

// 8. Anything the sidebar's style block used to provide app-wide must
//    now be in styles.css, since the landing page has no sidebar.
const css = readFileSync("src/styles.css", "utf8");
["@font-face", ".lazy-wait", ".topbar", ".boot"].forEach((sel) => {
  if (!css.includes(sel)) fail(`${sel} missing from styles.css`);
});

/* ── A section marked "To Be Developed" must be exactly that ──

   Two ways for the label to become a lie, and they fail in opposite
   directions.

   Somebody builds the section and forgets the flag: the square stays
   shut over working screens, and nobody finds out, because a disabled
   button reports nothing. So an area carrying the flag must have no
   built item in it.

   Or the flag goes on a section that is live: the square shuts and
   takes working screens off the landing page. Caught by the same rule
   from the other side.

   And the flag has to actually DO something. HomePage decides what
   opens, so this reads that file and insists it consults the flag —
   a flag nothing reads is a comment with a colon in it. */
for (const a of AREAS) {
  const built = a.items.filter((i) => i.built).length;
  if (a.toBeDeveloped === true && built > 0) {
    fail(`${a.label} is marked "To Be Developed" and has ${built} built `
      + "screen(s) behind it — the square is shut over working screens");
  }
}
{
  /* Comments stripped first. Both strings below are also DISCUSSED in
     that file's comments, so searching the raw text lets a comment
     satisfy a check about what the page renders — which is how the
     fourth sabotage of this block walked straight through it. */
  const home = readFileSync("src/features/home/HomePage.jsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  if (!/toBeDeveloped/.test(home)) {
    fail("the landing page does not read toBeDeveloped, so marking a "
      + "section unbuilt would change nothing on screen");
  }
  if (!/To Be Developed/.test(home)) {
    fail("the landing page never says \"To Be Developed\", so an unbuilt "
      + "section is indistinguishable from one somebody lacks access to");
  }
}

const live = AREAS.reduce((n, a) => n + a.items.filter((i) => i.built).length, 0);
console.log(`${AREAS.length} areas, ${seen.size} views, ${live} live`);
AREAS.forEach((a) => console.log(
  `  ${a.colour}  ${a.label.padEnd(22)} ${String(a.items.filter(i=>i.built).length)}/${a.items.length} live  -> ${firstViewOf(a)}`));
console.log(bad ? `\n${bad} problem(s)` : "\nNavigation model is consistent.");
process.exit(bad ? 1 : 0);
