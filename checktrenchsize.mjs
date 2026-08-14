/* Trench width and depth from what is laid in it.

   The figures are NJUG Volume 1 for the ordinary case: a footway, a
   straight run, no obstruction. They are a starting point rather than a
   substitute for the guidance, and this checks the arithmetic around
   them rather than the guidance itself — that a trench is sized from
   its contents, that the rules compose the way they should, and that
   the degenerate cases do something sensible. */
import {
  trenchSize, coverFor, separationFor,
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
//    length, so a line covering part of a section is the next run of
//    the same pipe rather than something laid beside it. Summing the
//    list regardless added a diameter and another 0.25m of separation
//    for every run, and got worse as the design matured, because each
//    rebuild splits the network into more runs along the same trench.
{
  const beside = trenchSize([
    { utility: "gas", outsideDiameterMM: 180, fromM: 0, toM: 100 },
    { utility: "gas", outsideDiameterMM: 180, fromM: 0, toM: 100 },
  ], { trenchM: 100 });
  const endToEnd = trenchSize([
    { utility: "gas", outsideDiameterMM: 180, fromM: 0, toM: 50 },
    { utility: "gas", outsideDiameterMM: 180, fromM: 50, toM: 100 },
  ], { trenchM: 100 });

  if (endToEnd.items !== 1) {
    fail(`two runs end to end were sized as ${endToEnd.items} pipes side by side`);
  }
  if (!(beside.widthM > endToEnd.widthM)) {
    fail("two mains laid side by side were no wider than the same two end to end");
  }
  if (endToEnd.runs !== 2) fail("the runs along the trench were not reported");
  if (endToEnd.consecutive !== 1) fail("the consecutive run was not reported as such");

  /* The busiest point decides, wherever it falls. A single run down the
     whole length beside two consecutive ones is two pipes wide
     throughout, not three at one end. */
  const mixed = trenchSize([
    { utility: "electric", fromM: 0, toM: 100 },
    { utility: "gas", outsideDiameterMM: 180, fromM: 0, toM: 50 },
    { utility: "gas", outsideDiameterMM: 180, fromM: 50, toM: 100 },
  ], { trenchM: 100 });
  if (mixed.items !== 2) fail(`the busiest cross-section held ${mixed.items}, wanted 2`);
}

// 9. Depth still comes from everything in it, not from the busiest
//    cross-section.
//
//    A trench is dug to one depth in one pass, so a deeper run further
//    along still sets it. The width may vary along a section; the depth
//    may not.
{
  const r = trenchSize([
    { utility: "electric", fromM: 0, toM: 50 },
    { utility: "water", outsideDiameterMM: 180, fromM: 50, toM: 100 },
  ], { trenchM: 100 });
  if (r.items !== 1) fail("two consecutive runs were sized as two side by side");
  if (r.deepest !== "water") {
    fail(`depth taken from ${r.deepest} — a deeper run further along did not set it`);
  }
}

// 10. Items with no extent are treated as running the whole length.
//
//     The cautious reading, and what every caller that knows what is in
//     a trench but not where should get. Existing callers pass no
//     extents at all and must be unaffected.
{
  const r = trenchSize([
    { utility: "gas", outsideDiameterMM: 180 },
    { utility: "electric" },
  ]);
  if (r.items !== 2) fail("items with no extent were dropped from the cross-section");
  if (r.consecutive !== 0) fail("items with no extent were called consecutive");
}

// 11. Separation is symmetric: the gap between gas and electric does not
//    depend on which was listed first.
if (separationFor("gas", "electric") !== separationFor("electric", "gas")) {
  fail("the separation between two utilities depends on their order");
}

console.log(bad ? `\n${bad} problem(s)`
  : `Trench sizing behaves (${EDGE_MARGIN_M * 2}m working room, `
    + `${MIN_WIDTH_M}m minimum width).`);
process.exit(bad ? 1 : 0);
