/* Trench width and depth from what is laid in it.

   The figures are NJUG Volume 1 for the ordinary case: a footway, a
   straight run, no obstruction. They are a starting point rather than a
   substitute for the guidance, and this checks the arithmetic around
   them rather than the guidance itself — that a trench is sized from
   its contents, that the rules compose the way they should, and that
   the degenerate cases do something sensible. */
import {
  trenchSize, concurrentCount, coverFor, separationFor,
  NJUG_COVER_M, MIN_WIDTH_M, EDGE_MARGIN_M,
} from "./src/features/gis/trenchSize.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

// 1. Depth follows the deepest thing in the trench, not the first.
{
  const eg = trenchSize([
    { utility: "electric" },
    { utility: "gas", outsideDiameterMM: 180 },
  ]);
  if (eg.deepest !== "gas") fail(`depth taken from ${eg.deepest}, wanted gas`);

  const egw = trenchSize([
    { utility: "electric" },
    { utility: "gas", outsideDiameterMM: 180 },
    { utility: "water", outsideDiameterMM: 180 },
  ]);
  if (egw.deepest !== "water") fail(`depth taken from ${egw.deepest}, wanted water`);
  if (!(egw.depthM > eg.depthM)) fail("adding a deeper utility did not deepen the trench");
}

// 2. Width grows with what is in it, and with the gaps between.
{
  const one = trenchSize([{ utility: "gas", outsideDiameterMM: 180 }]);
  const two = trenchSize([
    { utility: "gas", outsideDiameterMM: 180 },
    { utility: "electric" },
  ]);
  if (!(two.widthM > one.widthM)) fail("a second utility did not widen the trench");
  /* One gap between two things, two between three — not one per item,
     which would leave a separation against nothing at the end. */
  if (two.gaps.length !== 1) fail(`two items produced ${two.gaps.length} gaps, wanted 1`);
  const three = trenchSize([
    { utility: "gas", outsideDiameterMM: 180 },
    { utility: "electric" },
    { utility: "water", outsideDiameterMM: 180 },
  ]);
  if (three.gaps.length !== 2) fail(`three items produced ${three.gaps.length} gaps, wanted 2`);
}

// 3. Two of the same utility still need separating from each other.
{
  const twoGas = trenchSize([
    { utility: "gas", outsideDiameterMM: 180 },
    { utility: "gas", outsideDiameterMM: 63 },
  ]);
  if (twoGas.gaps.length !== 1) fail("two gas mains were laid touching");
}

// 4. The working adds up to the answer, or the explanation on screen is
//    not an explanation.
{
  const r = trenchSize([
    { utility: "electric" },
    { utility: "gas", outsideDiameterMM: 180 },
  ]);
  const sum = r.contentWidthM + r.separationWidthM + r.marginWidthM;
  if (Math.abs(sum - r.widthM) > 0.011) {
    fail(`the working comes to ${sum.toFixed(2)}m but the width is ${r.widthM}m`);
  }
}

// 5. Nothing is ever narrower than a spade's width.
//
//    The floor cannot currently bind — two working margins come to
//    0.30m on their own — so this checks the guarantee rather than the
//    branch: whatever is in the trench, it stays diggable. If the
//    margin is ever reduced, this is what catches a 0.1m trench.
{
  for (const items of [
    [{ utility: "telecoms", outsideDiameterMM: 20 }],
    [{ utility: "telecoms", outsideDiameterMM: 1 }],
  ]) {
    const r = trenchSize(items);
    if (r.widthM < MIN_WIDTH_M) fail(`a single duct gave a ${r.widthM}m trench`);
  }
}

// 6. Nothing in it is nothing, not a default trench.
{
  const empty = trenchSize([]);
  if (empty.widthM || empty.depthM) fail("an empty trench was given dimensions");
  if (!empty.note) fail("an empty trench did not say why it has none");
}

// 7. An unknown utility takes the deepest cover, not the shallowest.
//    A trench dug too deep is money; too shallow is a strike.
{
  const known = Math.max(...Object.entries(NJUG_COVER_M)
    .filter(([k]) => k !== "other").map(([, v]) => v));
  if (coverFor("something-new") < known) {
    fail("an unrecognised utility was given less cover than the deepest known one");
  }
}

// 8. Consecutive runs of one main are one pipe wide, not several.
//
//    This is the fault that produced a three-metre trench from a single
//    gas, water and LV. Nothing joins a trench part way along its
//    length, so several runs of one size are one pipe cut at the
//    junctions. Summing them added a diameter and another 0.25m of
//    separation for every run, and got worse as the design matured,
//    because each rebuild splits the network further.
{
  const endToEnd = trenchSize([
    { utility: "gas", outsideDiameterMM: 125, withinM: 50 },
    { utility: "gas", outsideDiameterMM: 125, withinM: 51.8 },
  ], { trenchM: 101.8 });
  const beside = trenchSize([
    { utility: "gas", outsideDiameterMM: 125, withinM: 101.8 },
    { utility: "gas", outsideDiameterMM: 125, withinM: 101.8 },
  ], { trenchM: 101.8 });

  if (endToEnd.items !== 1) {
    fail(`two runs end to end were sized as ${endToEnd.items} pipes side by side`);
  }
  if (beside.items !== 2) fail("two mains laid the whole length were sized as one");
  if (!(beside.widthM > endToEnd.widthM)) {
    fail("two mains side by side were no wider than the same two end to end");
  }
  if (endToEnd.runs !== 2) fail("the runs along the trench were not reported");
  if (endToEnd.consecutive !== 1) fail("the consecutive run was not reported as such");
}

// 9. Counted by coverage, not by where the joins fall.
//
//    Extents were the obvious way to do this and were not reliable: a
//    run counts as being in the trench anywhere within a metre and a
//    half of it, so two meeting at a bend each sit inside the other's
//    territory for a few metres and read as overlapping when they are
//    end to end. That put "2 x 125mm PE" against a single pipe. Lengths
//    do not have the problem — a metre counted for one run is a metre
//    not counted for the other.
{
  /* Three runs tiling a 101.8m trench, cut unevenly, as a build leaves
     them. Whatever the cuts, it is one pipe. */
  for (const cuts of [[34, 34, 33.8], [5, 90, 6.8], [50, 1.8, 50]]) {
    const r = trenchSize(
      cuts.map((m) => ({ utility: "gas", outsideDiameterMM: 125, withinM: m })),
      { trenchM: 101.8 },
    );
    if (r.items !== 1) fail(`runs cut at ${cuts.join("/")} counted as ${r.items} pipes`);
  }
  /* And a group covering only part of the trench is still one pipe,
     not a fraction of one. */
  const part = trenchSize([{ utility: "gas", outsideDiameterMM: 125, withinM: 20 }],
    { trenchM: 101.8 });
  if (part.items !== 1) fail("a main covering part of the trench was not counted");
}

// 10. Sizes are kept apart, and the trench is dug for the wider.
//
//     A main stepping from 180mm down to 90mm along a trench is one
//     pipe across it, but the hole has to take the 180mm.
{
  const stepped = trenchSize([
    { utility: "gas", outsideDiameterMM: 180, withinM: 60 },
    { utility: "gas", outsideDiameterMM: 90, withinM: 41.8 },
  ], { trenchM: 101.8 });
  if (stepped.items !== 2) {
    fail(`a main stepping size counted as ${stepped.items}, wanted both sizes kept`);
  }
}

// 11. Items with no coverage are treated as running the whole length.
//
//     The cautious reading, and what every caller that knows what is in
//     a trench but not how much of it should get. Existing callers pass
//     no lengths at all and must be unaffected.
{
  const r = trenchSize([
    { utility: "gas", outsideDiameterMM: 180 },
    { utility: "electric" },
  ]);
  if (r.items !== 2) fail("items with no coverage were dropped from the cross-section");
  if (r.consecutive !== 0) fail("items with no coverage were called consecutive");

  if (concurrentCount([{}, {}], 100) !== 2) fail("items with no coverage were not counted");
  if (concurrentCount([{ withinM: 50 }], 50) !== 1) fail("a single run counted as none");
  if (concurrentCount([], 50) !== 0) fail("nothing counted as something");
}

// 12. Separation is symmetric: the gap between gas and electric does not
//    depend on which was listed first.
if (separationFor("gas", "electric") !== separationFor("electric", "gas")) {
  fail("the separation between two utilities depends on their order");
}

console.log(bad ? `\n${bad} problem(s)`
  : `Trench sizing behaves (${EDGE_MARGIN_M * 2}m working room, `
    + `${MIN_WIDTH_M}m minimum width).`);
process.exit(bad ? 1 : 0);
