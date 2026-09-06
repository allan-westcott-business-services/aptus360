/* Two groups of plots from two substations.

   One drawing with two networks on it, and the circuit report is the
   sheet that says who is on which. It could not say: the export wrote
   `report.station` — the FIRST origin on the drawing — into the
   Substation column of every row, so a scheme served from two exported
   one name for all of it. The column was there and it was answering a
   question nobody had asked. */
import { readFileSync } from "node:fs";
import { circuitReport } from "./src/features/gis/electric.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const raw = JSON.parse(readFileSync("./fixtures/drawing-2202-043-msdb.json", "utf8"));
const rep = circuitReport(raw.features, { lineTypes: raw.lineTypes || [] });

// 1. Both stations are offered.
{
  if (!(rep.origins?.length > 1)) {
    fail("the drawing has two origins and the report offers fewer");
  }
  /* A substation counts as one, not only a POC: a scheme fed from a
     transformer and one fed from an existing network are the same
     question. */
  const kinds = raw.features.filter((f) => ["poc", "substation"]
    .includes(String(f.Feature_Role))).length;
  if (kinds < 2) fail("the fixture no longer has two origins to report on");
}

// 2. Each circuit names the one it is assigned to, by NAME as well as id.
//
//    Comparing what a meter was reached from against what its circuit
//    is assigned to needs both as the same kind of thing: an id against
//    a label compares nothing.
{
  for (const c of rep.circuits || []) {
    if (c.id === "unlinked") continue;
    if (c.originId != null && c.originLabel == null) {
      fail(`${c.name} names an origin by id and not by name`);
    }
    if (c.originLabel != null
      && !rep.origins.some((o) => o.label === c.originLabel)) {
      fail(`${c.name} is assigned to "${c.originLabel}", which is not one of `
        + "the origins on the drawing");
    }
  }
}

// 3. A meter says which station it is actually reached from.
{
  const rows = (rep.circuits || []).flatMap((c) => c.meters || []);
  if (!rows.some((m) => m.originLabel)) {
    fail("no meter says which station it is fed from, so a two-station "
      + "scheme reads as one");
  }

  /* ── And where that differs from the assignment, both are kept ──

     They differ when the assignment has been changed and not rebuilt:
     the routing moves on the next build, the report reads the drawing
     as it stands. On this fixture circuit 3 is assigned to POC 2 and
     every one of its meters is still reached from POC 1 — which is
     worth seeing rather than smoothing over. */
  const c3 = (rep.circuits || []).find((c) => Number(c.id) === 3);
  if (c3) {
    const differ = (c3.meters || [])
      .filter((m) => m.originLabel && c3.originLabel
        && m.originLabel !== c3.originLabel);
    if (!differ.length) {
      fail("the fixture no longer shows a circuit assigned to one station and "
        + "reached from another, so this case is untested");
    }
  }
}

// 4. The report and the export both carry it.
{
  const view = readFileSync("./src/features/gis/CircuitReport.jsx", "utf8");
  if (!/\["originLabel", "Fed from"\]/.test(view)) {
    fail("there is no Fed-from column on the meter table");
  }
  /* Only where there is a choice: one station and the column says the
     same thing on every row. */
  if (!/report\.origins\?\.length > 1\s*\n?\s*\? \[\["originLabel", "Fed from"\]\] : \[\]/
    .test(view)) {
    fail("the column is drawn on a one-station drawing, where it repeats "
      + "itself on every row");
  }
  if (/Substation: report\.station,/.test(view)) {
    fail("the export still writes the first origin on every row, so a "
      + "two-station scheme exports one name for all of it");
  }
  if (!/Substation: m\.originLabel \?\? c\.originLabel \?\? report\.station/.test(view)) {
    fail("the export does not say which station each meter is fed from");
  }
  if (!/Way: m\.linkWay != null/.test(view)) {
    fail("the export does not say which way a meter is on");
  }
  /* The mismatch is flagged, not hidden. */
  if (!/Assigned to \$\{c\.originLabel\}, reached from /.test(view)) {
    fail("a meter reached from a station other than the one its circuit is "
      + "assigned to is shown as though it agreed");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Two stations behave (each meter says which one feeds it, and which way).");
process.exit(bad ? 1 : 0);
