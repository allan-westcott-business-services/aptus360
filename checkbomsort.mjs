/* Sizes in a bill read in the order they are ordered in.

   "125mm" sorts before "63mm" as text, so the bill read 125, 180, 63,
   90 — an order nothing is ever ordered in, and one that makes a reader
   check whether a size is missing rather than read down the column.

   The number comes from the item text because that is where it is: by
   the time a row reaches the bill it is a name and a quantity, and the
   catalogue row that produced "63mm" is long gone. */
import {
  sizeIn, byItemSize, typeRank, byTypeThenSize,
} from "./src/features/gis/bomSort.js";

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

// Type before size.
//
//    Sorting on the number alone interleaved everything that had one: a
//    gas section read 63mm main, 90mm main, a 90/63 reducer, a 125mm
//    main, a 125/90 reducer, a 125mm tee. Sizes ascending and the types
//    shuffled through each other, so finding what a scheme needs in
//    tees meant picking them out of the run of pipe.
{
  const rows = [
    "Gas Main \u2014 125mm", "Meter", "Reducer \u2014 125/90mm",
    "Main Tee \u2014 180mm", "Gas Main \u2014 63mm", "POC", "Gas Governor",
    "Gas Service \u2014 32mm", "Reducer \u2014 90/63mm", "Gas Main \u2014 180mm",
    "Main Tee \u2014 125mm", "Gas Main \u2014 90mm",
  ];
  const got = rows.slice().sort(byTypeThenSize);

  const want = [
    "POC", "Gas Governor",
    "Gas Main \u2014 63mm", "Gas Main \u2014 90mm", "Gas Main \u2014 125mm",
    "Gas Main \u2014 180mm",
    "Main Tee \u2014 125mm", "Main Tee \u2014 180mm",
    "Reducer \u2014 90/63mm", "Reducer \u2014 125/90mm",
    "Gas Service \u2014 32mm", "Meter",
  ];
  if (got.join(" | ") !== want.join(" | ")) {
    fail(`the gas section reads:\n   ${got.join("\n   ")}`);
  }
}

// A tee is not a length of pipe.
//
//    The patterns are tried most specific first, so "Main Tee" has to
//    be tested before "Main" or every tee sorts in with the mains.
{
  if (typeRank("Main Tee \u2014 125mm") === typeRank("Gas Main \u2014 125mm")) {
    fail("a main tee sorts as a length of main");
  }
  if (typeRank("Service Valve") === typeRank("Gas Service \u2014 32mm")) {
    fail("a service valve sorts as a length of service");
  }
  if (typeRank("High Volume Top Tee \u2014 63mm") === typeRank("Main Tee \u2014 63mm")) {
    fail("the two tees sort as one type");
  }
}

// Within one type nothing changes.
//
//    A section holding one kind of thing sorted correctly before and
//    has to sort the same way now, or this has fixed the gas section by
//    breaking every other one.
{
  const mains = ["Gas Main \u2014 180mm", "Gas Main \u2014 63mm", "Gas Main \u2014 125mm"];
  if (mains.slice().sort(byTypeThenSize).join("|")
      !== mains.slice().sort(byItemSize).join("|")) {
    fail("one type sorts differently from before");
  }
}

// An unrecognised row goes last, not first.
//
//    Better at the foot of its section than wedged between the mains
//    and their total, where it would read as a kind of pipe.
{
  const got = ["Something new \u2014 50mm", "Gas Main \u2014 63mm", "Meter"]
    .sort(byTypeThenSize);
  if (got[got.length - 1] !== "Something new \u2014 50mm") {
    fail(`an unknown row sorted to ${got.indexOf("Something new \u2014 50mm")}`);
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Bill sorting behaves (63, 90, 125, 180 \u2014 not 125, 180, 63, 90).");
process.exit(bad ? 1 : 0);
