/* A block's flats read as a block.

   A flat's meter is assumed onto its MSDB. Listed among the drawn
   meters in plot order, a board of eight of them reads as eight
   unrelated plots — but on the drawing they are one object in one
   riser, and the figure or the fault that matters is nearly always
   the board's rather than any one flat's.

   So the circuit's table shows the drawn meters, then each board's
   flats under a heading of the board's own name.

   `boardSections` decides that shape and nothing else. It is pure
   because the alternative — the same loop written inline in the JSX —
   can only be grepped, and this session has already shipped one fault
   that a grep-of-the-call happily approved. */
import { readFileSync } from "node:fs";
import { boardSections, circuitReport } from "./src/features/gis/electric.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const row = (plot, msdbId = null, msdbName = null) =>
  ({ id: plot, plot: String(plot), msdbId, msdbName });

const shape = (items) => items
  .map((i) => (i.kind === "board" ? `[${i.g.name}]` : i.m.plot))
  .join(" ");

// 1. Drawn meters first, then each board's flats under its name.
{
  const items = boardSections([
    row(12), row(13),
    row(19, 51, "MSDB 2"), row(17, 50, "MSDB 1"),
    row(20, 51, "MSDB 2"), row(18, 50, "MSDB 1"),
  ]);
  if (shape(items) !== "12 13 [MSDB 1] 17 18 [MSDB 2] 19 20") {
    fail(`the table is not grouped by board: ${shape(items)}`);
  }
  /* The flats are marked, so the row can be indented under its
     heading. Without it a board's line and its flats read as one
     block of colour with no shape to it. */
  const flats = items.filter((i) => i.kind === "row" && i.onBoard);
  if (flats.length !== 4) fail(`${flats.length} flats marked as on a board, not 4`);
  if (items.some((i) => i.kind === "row" && i.m.msdbId == null && i.onBoard)) {
    fail("a drawn meter is marked as though it were on a board");
  }
}

// 2. Nothing on a board: the table is the plain list it always was.
{
  const items = boardSections([row(1), row(2), row(3)]);
  if (shape(items) !== "1 2 3") fail(`a circuit with no boards changed: ${shape(items)}`);
  if (items.some((i) => i.kind === "board")) {
    fail("a heading is drawn for a circuit that has no boards");
  }
}

// 3. Only boards: the flats-only circuit, which is the commonest
//    reason for a board to be on a circuit at all.
{
  const items = boardSections([row(5, 60, "MSDB A"), row(6, 60, "MSDB A")]);
  if (shape(items) !== "[MSDB A] 5 6") {
    fail(`a flats-only circuit is not grouped: ${shape(items)}`);
  }
}

// 4. The order of the sections does not depend on the order the rows
//    arrive in. A row ticked or a filter typed re-sorts the rows, and
//    sections that jump about under the pointer are unusable.
{
  const a = shape(boardSections([row(9, 51, "MSDB 2"), row(8, 50, "MSDB 1")]));
  const b = shape(boardSections([row(8, 50, "MSDB 1"), row(9, 51, "MSDB 2")]));
  if (a !== b) fail(`the sections reshuffle with the row order: "${a}" then "${b}"`);
}

// 5. Numbered, not lexicographic: MSDB 10 goes after MSDB 2.
{
  const items = boardSections([
    row(1, 1, "MSDB 10"), row(2, 2, "MSDB 2"), row(3, 3, "MSDB 1"),
  ]);
  if (shape(items) !== "[MSDB 1] 3 [MSDB 2] 2 [MSDB 10] 1") {
    fail(`the boards are ordered as text rather than by number: ${shape(items)}`);
  }
}

// 6. A board with no name still gets a heading, named by what is
//    known. A blank heading is worse than a plain list.
{
  const items = boardSections([row(4, 77, null)]);
  if (!/\[MSDB 77\]/.test(shape(items))) {
    fail(`a board with no label gets no usable heading: ${shape(items)}`);
  }
}

// 7. The row carries the board, from the drawing through to the table.
{
  const sub = { Feature_ID: 1, Feature_Role: "substation", Layer_Key: "electric",
    Label: "Substation 1", Geometry: [[0, 0]], Attributes: {} };
  const dig = { Feature_ID: 2, Feature_Type: "line", Layer_Key: "trench",
    Geometry: [[0, 0], [80, 0]], Attributes: { Line_Type: "trench_main" } };
  const board = { Feature_ID: 50, Feature_Role: "msdb", Layer_Key: "electric",
    Label: "MSDB 1", Geometry: [[40, 0]], Attributes: { Circuit_ID: 1 } };
  const flat = { Feature_ID: 217, Feature_Role: "meter", Layer_Key: "electric",
    Label: "Flat 17", Geometry: [[40, 0]],
    Attributes: { Assumed: true, MSDB_ID: 50, Circuit_ID: 1,
      Assumed_kVA: 1.5, Meter_Utility: "electric" } };

  const r = circuitReport([sub, dig, board, flat], { plotById: () => null });
  if (r.error) fail(`the report refuses the drawing: ${r.error}`);
  else {
    const m = r.circuits.find((c) => Number(c.id) === 1)?.meters?.[0];
    if (!m) fail("the flat does not appear on its circuit at all");
    else {
      if (Number(m.msdbId) !== 50) {
        fail(`the row does not say which board the flat is on: ${m.msdbId}`);
      }
      /* The board's LABEL, not its id: the heading is read against a
         drawing where the board is called MSDB 1. */
      if (m.msdbName !== "MSDB 1") {
        fail(`the row names the board as "${m.msdbName}"`);
      }
    }
  }
}

/* ── A flat's house type is a house type ──

   The column read "Flat on MSDB" on a flat's row. That is the column
   answering a different question from the one it asks: every other
   row gives the three-letter code, and a reader scanning for 2BF
   against 3BF found a sentence in the middle of it. WHERE the flat
   hangs is already said by the board's heading above its row, once
   for the whole block. */
{
  const sub = { Feature_ID: 1, Feature_Role: "substation", Layer_Key: "electric",
    Label: "Substation 1", Geometry: [[0, 0]], Attributes: {} };
  const dig = { Feature_ID: 2, Feature_Type: "line", Layer_Key: "trench",
    Geometry: [[0, 0], [80, 0]], Attributes: { Line_Type: "trench_main" } };
  const board = { Feature_ID: 50, Feature_Role: "msdb", Layer_Key: "electric",
    Label: "MSDB 1", Geometry: [[40, 0]], Attributes: { Circuit_ID: 1 } };
  const flat = { Feature_ID: 217, Feature_Role: "meter", Layer_Key: "electric",
    Label: "Flat 17", Plot_ID: 17, Geometry: [[40, 0]],
    Attributes: { Assumed: true, MSDB_ID: 50, Circuit_ID: 1,
      Assumed_kVA: 1.5, Meter_Utility: "electric" } };

  const r = circuitReport([sub, dig, board, flat], {
    plotById: (id) => ({ plot_number: String(id), config_code: "2BF", kva_load: 1.5 }),
  });
  const m = r.circuits?.find((c) => Number(c.id) === 1)?.meters?.[0];
  if (!m) fail("the flat is missing from its circuit");
  else {
    if (m.houseType !== "2BF") {
      fail(`a flat's house type reads "${m.houseType}" rather than its code`);
    }
    if (/MSDB/i.test(String(m.houseType))) {
      fail("the house type column says where the flat hangs, which the "
        + "board's heading above it already says");
    }
  }
  /* A flat whose plot row is missing gets a dash, as every other row
     does \u2014 not an invented description. */
  const none = circuitReport([sub, dig, board, flat], { plotById: () => null });
  const m2 = none.circuits?.find((c) => Number(c.id) === 1)?.meters?.[0];
  if (m2 && m2.houseType !== "\u2014") {
    fail(`a flat with no plot row reads "${m2.houseType}", not a dash`);
  }
}

// 8. Wired into the table.
{
  const report = readFileSync("src/features/gis/CircuitReport.jsx", "utf8");
  if (!/const items = boardSections\(rows\)/.test(report)) {
    fail("the table does not use the grouping, so the flats are still listed "
      + "among the drawn meters");
  }
  if (!/className="cr-board"/.test(report)) {
    fail("the board heading has no row of its own");
  }
  /* ── The heading spans the table, exactly ──

     A colSpan wider than the table has columns leaves the browser
     distributing width over columns that are not there, and the whole
     table shrinks away from the one above it. Reported as the columns
     getting much narrower wherever a board section appeared.

     Counted from the same two conditions the header row uses, and
     declared after `boxesHere` because it reads it \u2014 above it, the
     report threw "cannot access before initialization" on open. */
  if (/colSpan=\{\d+\}/.test(report)) {
    fail("a board heading spans a guessed number of columns rather than the "
      + "table's own count, which narrows the whole table");
  }
  if (!/const colCount = 6[\s\S]{0,160}boxesHere\.length > 0 \? 1 : 0\)/.test(report)) {
    fail("the column count does not follow the same conditions as the header "
      + "row, so the heading and the columns can disagree");
  }
  const boxesAt = report.indexOf("const boxesHere");
  const countAt = report.indexOf("const colCount");
  if (boxesAt < 0 || countAt < 0 || countAt < boxesAt) {
    fail("the column count is declared before the link boxes it reads, which "
      + "throws the moment a report is opened");
  }
  /* Grouped AFTER filtering and sorting: a search for a house type has
     to narrow the sections with everything else, not be undone by the
     grouping. */
  if (!/const rows = sortRows\(match\(c\.meters\)\)[\s\S]{0,400}boardSections\(rows\)/.test(report)) {
    fail("the grouping runs before the filters, so filtering a circuit would "
      + "not narrow what is under each board");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "A circuit's flats are grouped under their board (and a circuit with none is unchanged).");
process.exit(bad ? 1 : 0);
