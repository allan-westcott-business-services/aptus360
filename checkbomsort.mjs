/* Sizes in a bill read in the order they are ordered in.

   "125mm" sorts before "63mm" as text, so the bill read 125, 180, 63,
   90 — an order nothing is ever ordered in, and one that makes a reader
   check whether a size is missing rather than read down the column.

   The number comes from the item text because that is where it is: by
   the time a row reaches the bill it is a name and a quantity, and the
   catalogue row that produced "63mm" is long gone. */
import { sizeIn, byItemSize } from "./src/features/gis/bomSort.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

// 1. The case that was wrong.
{
  const got = ["Gas Main — 125mm", "Gas Main — 63mm", "Gas Main — 180mm",
    "Gas Main — 90mm"].sort(byItemSize);
  const want = ["Gas Main — 63mm", "Gas Main — 90mm",
    "Gas Main — 125mm", "Gas Main — 180mm"];
  if (got.join("|") !== want.join("|")) {
    fail(`sizes came out as ${got.map((x) => sizeIn(x)).join(", ")}`);
  }
}

// 2. First number wins. "3 x 300mm" is a three-core cable and belongs
//    with the small ones, not between 185 and 300.
if (sizeIn("3 x 300mm") !== 3) fail("a multi-core cable sorted on its core size");
if (sizeIn("185mm\u00b2 WF") !== 185) fail("a cable size was not read");
if (sizeIn("63mm") !== 63) fail("a plain size was not read");

// 3. Decimals, since not every size is whole.
if (sizeIn("2.5mm\u00b2") !== 2.5) fail("a decimal size was truncated");

// 4. Things with no size keep their names in order and sit last.
//    "Excavation" is not a size and has no place in a numeric run.
{
  const got = ["Reinstatement", "Gas Main — 90mm", "Excavation",
    "Gas Main — 63mm"].sort(byItemSize);
  if (got[0] !== "Gas Main \u2014 63mm" || got[1] !== "Gas Main \u2014 90mm") {
    fail("sized items did not come first");
  }
  if (got[2] !== "Excavation" || got[3] !== "Reinstatement") {
    fail("unsized items are not in name order after the sized ones");
  }
}

// 5. Nothing silly on nothing.
for (const x of [null, undefined, ""]) {
  if (sizeIn(x) !== null) fail(`${JSON.stringify(x)} produced a size`);
}
if (byItemSize(null, null) !== 0) fail("two empty items did not compare equal");

// 6. Equal sizes fall back to the name, so the order is stable rather
//    than whatever the query happened to return.
{
  const got = ["Water Main — 63mm", "Gas Main — 63mm"].sort(byItemSize);
  if (got[0] !== "Gas Main \u2014 63mm") fail("equal sizes are not ordered by name");
}

console.log(bad ? `\n${bad} problem(s)`
  : "Bill sorting behaves (63, 90, 125, 180 \u2014 not 125, 180, 63, 90).");
process.exit(bad ? 1 : 0);
