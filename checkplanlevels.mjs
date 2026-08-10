/* The planning board's view levels.

   The rule that decides which orders are allowed is a single rank
   comparison, and the check that matters is that it produces exactly
   the hierarchies asked for and refuses the ones that are not views of
   anything. A rule that quietly permits Team then Region gives a board
   where every team row holds one region row saying nothing. */
import {
  LEVELS, allowedNext, isValidHierarchy, pruneHierarchy, describeHierarchy,
} from "./src/features/planning/levels.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const eq = (g, w, what) => {
  if (JSON.stringify(g) !== JSON.stringify(w))
    fail(`${what}: got ${JSON.stringify(g)}, wanted ${JSON.stringify(w)}`);
};

// 1. Every hierarchy that was asked for is allowed.
const WANTED = [
  ["region", "subregion"],
  ["region", "team"],
  ["region", "subregion", "pm"],
  ["pm", "team"],
  ["worktype", "region"],
  ["worktype", "team"],
];
for (const h of WANTED) {
  if (!isValidHierarchy(h)) fail(`${describeHierarchy(h)} should be allowed`);
}

// 2. And each level of each one is offered by the picker, or somebody
//    could not build it in the first place.
for (const h of WANTED) {
  for (let i = 1; i < h.length; i++) {
    const offered = allowedNext(h.slice(0, i)).map((l) => l.id);
    if (!offered.includes(h[i])) {
      fail(`after ${describeHierarchy(h.slice(0, i))}, ${h[i]} is not offered`);
    }
  }
}

// 3. The one explicitly ruled out, and its relatives.
for (const h of [
  ["team", "region"],
  ["team", "subregion"],
  ["subregion", "region"],
  ["pm", "region"],
  ["team", "worktype"],
]) {
  if (isValidHierarchy(h)) fail(`${describeHierarchy(h)} should be refused`);
}

// 4. A level cannot appear twice: Region inside Region is one row per
//    region containing itself.
if (isValidHierarchy(["region", "region"])) fail("a level repeated was allowed");
if (allowedNext(["region"]).some((l) => l.id === "region"))
  fail("a level already used was offered again");

// 5. Single levels are all valid — that is the board as it was.
for (const l of LEVELS) {
  if (!isValidHierarchy([l.id])) fail(`${l.id} alone should be valid`);
}
if (isValidHierarchy([])) fail("an empty hierarchy was called valid");

// 6. Pruning keeps the longest valid start rather than emptying it.
//    Choosing Team at the top has to drop a Region below it, but must
//    not throw away the Team the person just chose.
eq(pruneHierarchy(["team", "region"]), ["team"], "prune Team > Region");
eq(pruneHierarchy(["region", "subregion", "pm"]), ["region", "subregion", "pm"],
  "a valid hierarchy is left alone");
eq(pruneHierarchy(["region", "team", "subregion"]), ["region", "team"],
  "prune drops only from the first bad level");
eq(pruneHierarchy(["worktype", "region", "subregion", "pm", "team", "ref"]),
  ["worktype", "region", "subregion", "pm", "team", "ref"],
  "every level, broadest to narrowest");

// 7. Ranks are unique and ordered, since the whole rule rests on them.
const ranks = LEVELS.map((l) => l.rank);
eq(ranks, [...ranks].sort((a, b) => a - b), "levels are listed broadest first");
eq(new Set(ranks).size, LEVELS.length, "distinct ranks");

console.log(bad ? `\n${bad} problem(s)`
  : `Planning view levels behave (${LEVELS.length} levels, `
    + `${WANTED.length} hierarchies checked).`);
process.exit(bad ? 1 : 0);
