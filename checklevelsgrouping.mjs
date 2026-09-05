/* A boxed circuit's levels, read as the cables it is made of.

   A circuit with a link box is not one cable. The trunk runs from the
   POC to the box; each output leaves the box as its own cable, fused on
   its own, serving its own plots. Where two outputs share a trench they
   produce two legs over the same stretch — genuinely two cables, and on
   a flat table two rows that look like the same row twice.

   So the panel breaks into a section per part, and the sheet carries
   the same fact as a column, since a spreadsheet cannot hold a heading.
   A circuit with NO box gets neither: one part, no headings, exactly
   the table it always was. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

/* Each leg knows which part laid it. */
{
  const at = canvas.indexOf("legs: parts.flatMap(");
  const gather = at < 0 ? "" : canvas.slice(at, at + 900);
  if (!gather) fail("legs are no longer gathered from the parts");
  else {
    for (const field of ["part:", "way:", "boxLabel:", "wayFuse:"]) {
      if (!gather.includes(field)) {
        fail(`a leg does not carry ${field.replace(":", "")}, so the sheet `
          + "cannot say which cable it belongs to");
      }
    }
  }
}

/* The panel heads each section, and only where there is one to head. */
{
  if (!/l\.part && l\.part !== "origin"/.test(canvas)) {
    fail("sections are drawn for a circuit with no link box, which has only "
      + "one length of cable and needs no headings");
  }
  if (!/l\.part !== \(tracePlan\[at - 1\]\?\.leg\?\.part\)/.test(canvas)) {
    fail("a heading is drawn on every row rather than at each change");
  }
  if (!/Input to \$\{l\.boxLabel/.test(canvas)) fail("the trunk section is not named");
  if (!/output \$\{l\.way\}/.test(canvas)) fail("an output section is not named");
  /* The fuse, because an output's rating is the first thing anybody
     checks a leg against. */
  if (!/l\.wayFuse \? ` \\u00b7 \$\{l\.wayFuse\} A`/.test(canvas)) {
    fail("an output's fuse is not on its heading");
  }
}

/* And the export carries the same fact, since a sheet has no headings. */
{
  const at = canvas.indexOf("const rows = tracePlan.map(");
  const rows = at < 0 ? "" : canvas.slice(at, at + 900);
  if (!/Part: l\.part === "trunk"/.test(rows)) {
    fail("the export does not say which cable each row belongs to");
  }
  if (!/: "",/.test(rows)) {
    fail("the Part column is filled in on a circuit with no link box, where "
      + "there is only one answer and the column is noise");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Levels grouping behaves (a section per cable, and none where there is "
  + "only one).");
process.exit(bad ? 1 : 0);
