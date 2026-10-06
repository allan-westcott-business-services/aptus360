/* The bill of materials orders the length that was measured.

   Two different facts about a line, in two columns, for the reason
   lengths.js sets out: `Length_m` is written by `gis_length_trg` off
   the geometry on every change, and `Measured_Length_m` is written by
   a person and by nothing else. The drawing is flat and the run is
   not — a duct that rises and falls, a trench round an obstruction,
   slack — so the measurement is a statement about the world the
   drawing cannot make.

   Every consumer in the browser was moved to `runLength()` when the
   columns were split. The bill was not, and the note left behind in
   lengths.js said so without noticing:

       `Length_m` goes back to being the trigger's own mirror of the
       drawing (the bill of materials reads it in SQL and is
       unaffected).

   Unaffected was true and wrong. A 300 m trench measured at 330 m was
   ordered as 300 m, on cable, gas, water and trench alike, because
   they are one aggregation. 0257 is the fix.

   This check exists because that is the kind of fault that comes back:
   `gis_bom` is replaced wholesale every time any part of it changes,
   so each rewrite is a fresh chance to drop the measurement. It reads
   the NEWEST definition in the migrations folder — the one the
   database would have if the folder were replayed — rather than any
   particular file.

   It also holds the SQL and `runLength()` to the same rule. The sheet
   and the canvas disagreeing about how long a cable is would be worse
   than either being wrong on its own. */
import { readFileSync, readdirSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const dir = "./supabase/migrations";
const defining = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => readFileSync(`${dir}/${f}`, "utf8")
    .includes("CREATE OR REPLACE FUNCTION gis_bom"))
  .sort();

const newest = defining[defining.length - 1];
const sql = newest ? readFileSync(`${dir}/${newest}`, "utf8") : "";

if (!defining.length) fail("no migration defines gis_bom");
else {
  /* The quantity expression, which is the whole subject. Matched from
     the SUM to the alias so a mention of Measured_Length_m anywhere
     else in the file — a comment, the check queries at the foot —
     cannot stand in for the thing actually being summed. */
  const q = sql.match(/ROUND\(SUM\(([\s\S]*?)\),\s*2\)\s*(?:AS)?\s*quantity/i);
  if (!q) fail(`${newest} has no recognisable line quantity to read`);
  else {
    const expr = q[1];

    if (!expr.includes("Measured_Length_m")) {
      fail(`${newest} bills the DRAWN length — a line somebody measured `
        + "is ordered as whatever the plan happens to show");
    }

    /* The measurement has to be tried FIRST. An expression mentioning
       both but reaching Length_m first honours nothing. */
    const iM = expr.indexOf("Measured_Length_m");
    const iL = expr.indexOf("'Length_m'");
    if (iM >= 0 && iL >= 0 && iL < iM) {
      fail(`${newest} reads Length_m before Measured_Length_m — the `
        + "drawing wins and the measurement is never reached");
    }

    /* Zero is not a measurement. Without this a cleared box bills
       nothing at all rather than falling back to the drawing. */
    if (!/Measured_Length_m'\)::numeric\s*>\s*0/.test(expr)) {
      fail(`${newest} does not require a measured length above zero — a `
        + "cleared or zeroed entry bills nothing instead of the drawn length");
    }

    /* Tested as text before casting, never cast and then tested.
       jsonb holds whatever was written into it, and the planner is
       free to evaluate a cast before the guard meant to protect it —
       which is why the cable join has matched as text since 0117. One
       bad value must spoil one row, not the whole sheet. */
    for (const col of ["Measured_Length_m", "Length_m"]) {
      const guarded = new RegExp(`'${col}'\\s*~\\s*'\\^`).test(expr);
      if (!guarded) {
        fail(`${newest} casts ${col} out of jsonb with no text guard — one `
          + "feature carrying \"130m\" fails the entire bill rather than one row");
      }
    }
  }
}

/* ── The canvas and the sheet read the same rule ──

   runLength() is where the browser decides the same question. If the
   two drift, a cable is one length on the drawing and another on the
   order, and nothing says which is meant. */
const lengths = readFileSync("./src/features/gis/lengths.js", "utf8");
const run = lengths.match(/export function runLength[\s\S]*?\n}/);
if (!run) fail("lengths.js has no runLength() for the bill to agree with");
else {
  if (!/Measured_Length_m/.test(run[0])) {
    fail("runLength() no longer reads Measured_Length_m — the bill now "
      + "honours a measurement the canvas does not");
  }
  if (!/m\s*>\s*0\s*\?\s*m\s*:\s*drawnLength/.test(run[0])) {
    fail("runLength() no longer falls back to the drawn length above zero "
      + "— the SQL does, and the two have to answer the same question");
  }
}

/* The note that got this wrong, so nobody reinstates it.

   Whitespace-collapsed before testing. The note is wrapped across two
   comment lines in the file, and a pattern written as one line matched
   nothing and passed while the claim was still sitting there — a check
   that cannot fail is worse than no check, because it is believed. */
const flat = lengths.replace(/\s+/g, " ");
if (/bill of materials reads it in SQL and is unaffected/.test(flat)) {
  fail("lengths.js still says the bill of materials is unaffected by the "
    + "split — it was not, which is the fault 0257 fixes");
}

console.log(bad ? `checkbommeasured: ${bad} FAILED` : "checkbommeasured: all passed");
process.exit(bad ? 1 : 0);
