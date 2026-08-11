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

// 8. Separation is symmetric: the gap between gas and electric does not
//    depend on which was listed first.
if (separationFor("gas", "electric") !== separationFor("electric", "gas")) {
  fail("the separation between two utilities depends on their order");
}

console.log(bad ? `\n${bad} problem(s)`
  : `Trench sizing behaves (${EDGE_MARGIN_M * 2}m working room, `
    + `${MIN_WIDTH_M}m minimum width).`);
process.exit(bad ? 1 : 0);
