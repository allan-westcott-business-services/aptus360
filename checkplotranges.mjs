/* Entering plots as ranges and single numbers, a house type per row.

   Asked for off a mockup: a row per house type, a PLOTS field that takes
   "1-20", "23, 26, 31, 45" or a mix ("1-20, 24, 26, 31, 48-52"), and
   checks for overlaps — a plot covered twice in one row ("1-12, 11,
   16"), and one plot under two house types. */
import { readFileSync } from "node:fs";
import { parsePlotList, checkBatch, toRanges } from "./src/features/plots/plotRanges.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const plots = (t, p) => parsePlotList(t, p).plots;

// 1. The three ways of typing them.
{
  if (plots("1-20").length !== 20) fail("a range does not give every plot in it");
  if (plots("23, 26, 31, 45").join() !== "23,26,31,45") fail("single numbers are not read as typed");
  const mix = plots("1-20, 24, 26, 31, 48-52");
  if (mix.length !== 28) fail(`a mix of ranges and numbers gives ${mix.length} plots, wanted 28`);
  /* The mockup's own rows. */
  if (plots("1-10, 17, 20, 24, 31-40").length !== 23) fail("the mockup's first row does not count 23");
  if (plots("11-16, 18-19, 21-23, 41-50, 68-75").length !== 29) {
    fail("the mockup's second row does not count 29");
  }
}

// 2. What people actually type.
{
  /* An en dash is what Word and a phone put in "1\u201320". */
  if (plots("1\u201320").length !== 20) fail("a range written with an en dash is refused");
  if (plots(" 1 - 5 ,7,, 9 ").join() !== "1,2,3,4,5,7,9") {
    fail("spaces and a stray comma upset the reading");
  }
  /* Plot numbers are text: 43A and B1 are real. */
  if (plots("43A, B1").join() !== "43A,B1") fail("a plot number with a letter is refused");
  if (plots("1-3", "K").join() !== "K1,K2,K3") fail("the prefix is not put in front of each plot");
}

// 3. Mistakes are named, not dropped.
{
  const back = parsePlotList("20-1");
  if (back.plots.length || !/runs backwards.*1-20/.test(back.errors[0] || "")) {
    fail("a backwards range is not caught with the right way round suggested");
  }
  if (!parsePlotList("1-5000").errors.length) fail("a five-thousand-plot range is accepted");
  if (!parsePlotList("1-2-3").errors.length) fail("\"1-2-3\" is accepted");
  if (!parsePlotList("12!").errors.length) fail("a stray character is accepted");
}

// 4. The same plot twice in one row: 1-12, 11, 16.
{
  const r = parsePlotList("1-12, 11, 16");
  if (r.repeats.join() !== "11") fail(`"1-12, 11, 16" reports repeats ${r.repeats}, wanted 11`);
  const b = checkBatch([{ key: 1, name: "3 Bed Semi", text: "1-12, 11, 16" }]);
  if (b.ok) fail("a row covering 11 twice can be saved");
  if (!/11 is entered more than once in this row/.test(b.rows[0].problems.join())) {
    fail("the repeat is not named under its row");
  }
}

// 5. The same plot under two house types.
{
  const b = checkBatch([
    { key: 1, name: "3 Bed Semi-detached", text: "1-10, 17" },
    { key: 2, name: "4 Bed Detached", text: "10-16, 17" },
  ]);
  if (b.ok) fail("plot 10 under two house types can be saved");
  if (!/10, 17 are also under 4 Bed Detached/.test(b.rows[0].problems.join())) {
    fail("the clash is not named, with the other house type, under the first row");
  }
  if (!/10, 17 are also under 3 Bed Semi-detached/.test(b.rows[1].problems.join())) {
    fail("the clash is not named under the second row as well");
  }
  /* Counted once in the total, not twice. */
  if (b.total !== 17) fail(`the total counts a clashing plot twice: ${b.total}`);

  /* A prefix separates them: K10 and 10 are different plots. */
  const p = checkBatch([
    { key: 1, name: "A", text: "1-10", prefix: "K" },
    { key: 2, name: "B", text: "1-10" },
  ]);
  if (!p.ok) fail("K1-K10 and 1-10 are treated as the same plots");
}

// 6. Plots already on the project.
{
  const b = checkBatch([{ key: 1, name: "A", text: "1-5" }], ["3"]);
  if (b.ok || !/3 is already on this project/.test(b.rows[0].problems.join())) {
    fail("a plot already on the project is added again — two plots with one number");
  }
}

// 7. Messages read as ranges.
{
  if (toRanges(["1", "2", "3", "7", "K1", "K2", "43A"]) !== "1-3, 7, K1-K2, 43A") {
    fail(`plots in a message read as ${toRanges(["1", "2", "3", "7", "K1", "K2", "43A"])}`);
  }
}

// 8. The form.
{
  const f = readFileSync("./src/features/plots/AddPlotsForm.jsx", "utf8");
  if (!/Add house type/.test(f)) fail("there is no Add house type button");
  if (!/checkBatch\(/.test(f)) fail("the form does not check the rows against each other");
  if (!/const canSave = check\.ok && !unnamed\.length && !saving;/.test(f)) {
    fail("the form can save with problems outstanding, or plots with no house type");
  }
  /* The heat source and PV are the row's, not the project's. */
  if (!/Heat_Source_ID: r\.heatSourceId \? Number\(r\.heatSourceId\) : null/.test(f)) {
    fail("each row's heat source is not saved on its plots");
  }
  if (!/PV: !!r\.pv/.test(f)) fail("each row's PV is not saved on its plots");
}

console.log(bad ? `\n${bad} problem(s)`
  : "Plots go in as ranges and numbers, a house type per row, and nothing overlaps.");
process.exit(bad ? 1 : 0);
