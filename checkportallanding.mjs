/* The two landing pages look like one product.

   These are the two screens somebody sees before they are anywhere:
   one asks who you are, the other asks what you came to do. Styled
   apart they read as two different products; styled the same they read
   as one door with two questions behind it.

   The CSS is copied rather than shared, because the original keeps its
   own inside its component and lifting it out was a bigger change than
   this warranted. A copy drifts unless something watches it, so this
   watches it: the rules the two pages share must stay identical, and
   the ones that differ must differ for a reason named here.

   If a third page ever wants these squares, that is the moment to lift
   the CSS out — two copies is a coincidence, three is a pattern — and
   this check is what should be deleted then, not worked around. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const rulesOf = (src) => Object.fromEntries(
  [...src.matchAll(/\n(\.[a-z-]+(?::[a-z-]+)?(?: [a-z0-9]+)?)\s*\{([^}]*)\}/g)]
    .map((m) => [m[1], m[2].replace(/\s+/g, " ").trim()]),
);

const home = rulesOf(readFileSync("./src/features/home/HomePage.jsx", "utf8"));
const portal = rulesOf(
  readFileSync("./src/features/portal/AudienceLanding.jsx", "utf8"));

// 1. The rules that carry the look are the same rules.
{
  const shared = [".area-sq:hover", ".area-sq:active", ".area-sq:focus-visible",
    ".area-name", ".home-head", ".home-head h1", ".home-head p", ".home-logo"];
  for (const sel of shared) {
    if (!home[sel]) {
      fail(`${sel} is gone from the section landing page \u2014 this check needs `
        + "re-anchoring against whatever replaced it");
      continue;
    }
    if (!portal[sel]) {
      fail(`the audience landing page has no ${sel}, so the two pages no `
        + "longer look like one product");
      continue;
    }
    if (home[sel] !== portal[sel]) {
      fail(`${sel} has drifted between the two landing pages`);
    }
  }
}

// 2. The square itself: same but for the one deliberate difference.
//
//    The audience page stacks a name and a blurb, so it is a column
//    with a gap where the section page centres a single name. Every
//    other declaration — the 2px coloured border, the aspect ratio,
//    the shadow, the transition — must match.
{
  const strip = (css) => css.split(";").map((d) => d.trim())
    .filter((d) => d && !/^flex-direction/.test(d) && !/^gap/.test(d))
    .sort().join("; ");
  if (!home[".area-sq"] || !portal[".area-sq"]) {
    fail("one of the landing pages has no .area-sq");
  } else if (strip(home[".area-sq"]) !== strip(portal[".area-sq"])) {
    fail("the squares differ by more than the audience page's column "
      + "layout \u2014 the two pages are drifting apart");
  }
  if (!/aspect-ratio: 1/.test(portal[".area-sq"] || "")) {
    fail("the audience buttons are not square");
  }
  if (!/2px solid var\(--sq\)/.test(portal[".area-sq"] || "")) {
    fail("the audience buttons have lost the coloured outline that is the "
      + "identity of the thing they open");
  }
}

// 3. Four buttons in a SQUARE, not a row.
{
  const grid = portal[".home-grid"] || "";
  if (!/grid-template-columns: repeat\(2, 1fr\)/.test(grid)) {
    fail("the four audiences are not laid two across, so they read as a "
      + "row rather than one shape the eye takes in at once");
  }
  if (/auto-fit/.test(grid)) {
    fail("the grid still auto-fits, which puts all four in a row on a wide "
      + "screen");
  }
  /* And it still collapses on a phone, where a two-column square is two
     narrow boxes. */
  const src = readFileSync("./src/features/portal/AudienceLanding.jsx", "utf8");
  if (!/@media \(max-width: 560px\)[\s\S]{0,160}grid-template-columns: 1fr/
    .test(src)) {
    fail("the square does not collapse to one column on a narrow screen");
  }
}

// 4. Four audiences. The two-by-two only reads as a square while there
//    are four of them; a fifth makes an orphan on a second row.
{
  const src = readFileSync("./src/features/portal/AudienceLanding.jsx", "utf8");
  const n = (src.match(/^\s*id: "/gm) || []).length;
  if (n !== 4) {
    fail(`${n} audiences are offered, and the two-by-two square only reads `
      + "as one with four \u2014 the grid needs revisiting");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Both landing pages look like one product, and the audiences sit square.");
process.exit(bad ? 1 : 0);
