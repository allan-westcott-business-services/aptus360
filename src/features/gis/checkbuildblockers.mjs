/* Build LV Network refuses a drawing it cannot build from.

   Two things it cannot invent, and neither of which it used to mention:

   A meter with no `Circuit_ID` belongs to no circuit, so no walk reaches
   it and no cable is run toward it. A meter with no service trench has
   nothing for its tail to run along.

   The build said nothing about either — the plot was simply not there
   as far as it was concerned. That is how "why is there no cable
   between node 2 and node 5" came to be a question: three plots past
   node 5 had no circuit, and the trench joining them was fine. */
import { readFileSync } from "node:fs";
import { buildBlockers } from "./src/features/gis/msdb.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const raw = JSON.parse(readFileSync("./fixtures/drawing-6-build-blockers.json", "utf8"));
const f = raw.features;

// 1. The reported drawing, exactly.
{
  const r = buildBlockers(f);
  const noCirc = r.noCircuit.map((x) => Number(x.plot)).sort((a, b) => a - b);
  if (String(noCirc) !== String([49, 50, 51, 57])) {
    fail(`plots with no circuit came out as ${noCirc} — 49, 50, 51 and 57 have none`);
  }
  const noSvc = r.noService.map((x) => Number(x.plot)).sort((a, b) => a - b);
  if (String(noSvc) !== String([62])) {
    fail(`plots with no service came out as ${noSvc} — only 62 is unserved`);
  }
  if (r.ok) fail("a drawing with four unassigned plots reports nothing to fix");
}

// 2. A flat on a board is not asked for a service trench.
//
//    A flat is fed from its board's tails, recorded in the board's own
//    table and never drawn as a trench. Asking for one would be asking
//    somebody to draw a thing that does not exist.
{
  const onBoards = new Set();
  for (const b of f) {
    if (b.Feature_Role !== "msdb") continue;
    for (const id of b.Attributes?.MSDB_Plot_IDs || []) onBoards.add(Number(id));
  }
  if (!onBoards.size) fail("the fixture has no board, so this case is untested");
  const r = buildBlockers(f);
  const wrongly = r.noService.filter((x) => onBoards.has(Number(x.plot)));
  if (wrongly.length) {
    fail(`${wrongly.length} flat(s) on a board were asked for a service trench`);
  }
}

// 3. The stamp where there is one, the ground where there is not.
//
//    A trench dug by Auto Lay Service names the seed it was dug for,
//    which is exact. A trench somebody DREW carries no stamp, and
//    neither does a meter placed some other way — on this drawing not
//    one meter had a `Seed_Feature_ID`. A rule built on the stamp alone
//    flagged every plot on the site, including ten with a service
//    trench plainly running to them.
{
  const src = readFileSync("./src/features/gis/msdb.js", "utf8");
  if (!/const served = seed != null\s*\n?\s*\? servedSeeds\.has\(Number\(seed\)\)\s*\n?\s*: nearAService/
    .test(src)) {
    fail("the service check does not fall back to the ground where a meter "
      + "carries no seed stamp, so it flags plots that are plainly served");
  }
  /* A blocker that cries wolf is the one everybody learns to click
     past: on this drawing the stamp-only rule would have flagged ten. */
  const stamped = f.filter((m) => m.Feature_Role === "meter"
    && m.Attributes?.Seed_Feature_ID != null).length;
  if (stamped) {
    fail("the fixture now has seed stamps, so it no longer exercises the "
      + "fallback this was written for");
  }
}

// 4. The build refuses rather than warns.
//
//    A build that runs on a drawing that is not ready produces a
//    network somebody then has to un-believe, and the drawing looks
//    finished either way.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/const blockers = buildBlockers\(features, \{/.test(canvas)) {
    fail("the build does not check before it runs");
  }
  if (!/if \(!blockers\.ok && !opts\.anyway\) \{/.test(canvas)) {
    fail("the build carries on regardless of what the check found");
  }
  /* Named, not counted: "4 plots not on a circuit" sends somebody
     hunting; "57, 49, 50, 51" sends them to the plots. */
  if (!/const say = \(list\) => list\.map\(\(x\) => x\.label\)\.join\(", "\);/.test(canvas)) {
    fail("the message counts the plots without naming them");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The build refuses a drawing it cannot build from (and says which plots).");
process.exit(bad ? 1 : 0);
