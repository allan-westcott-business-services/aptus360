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
  /* To the end of the gather, not a fixed 900 characters: adding one
     field to the leg pushed `wayFuse` outside the window and reported
     it missing. Fault 33 again \u2014 a bound that depends on something
     unrelated staying the same size. */
  const at = canvas.indexOf("legs: parts.flatMap(");
  const ends = canvas.indexOf("\n      })),", at);
  const gather = at < 0 ? "" : canvas.slice(at, ends > at ? ends : at + 3000);
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
  /* ── Read as a map of way to rating ──

     `Way_Fuse_A` is keyed by way number and the A means AMPS, not a way
     letter. Building a key from the way number — `Way_Fuse_` plus a
     letter — hands output 1 the whole map, and the heading rendered
     "[object Object] A" to a designer. The Circuit Report has always
     read it correctly; the fault was inventing a second way to. */
  if (/Way_Fuse_\$\{String\.fromCharCode/.test(canvas)) {
    fail("the fuse is read by building a key from the way number, which "
      + "yields the whole map and prints as [object Object]");
  }
  if (!/Way_Fuse_A\?\.\[String\(p\.way\)\]/.test(canvas)) {
    fail("the fuse is not read as a map of way number to rating");
  }
  /* Number()'d, or a rating stored as text prints as a string that
     happens to look like a figure. */
  if (!/Number\(p\.box\.Attributes\?\.Way_Fuse_A/.test(canvas)) {
    fail("the fuse is not coerced to a number");
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

/* ── Sorted by output, and coloured like the drawing ──

   A boxed circuit is several independent runs sharing a sheet, and node
   order interleaves them: C2, C3, C6, C7 reads down the page as one run
   when it is two. "Which of these belong to output 2" is the question
   somebody asks when one output fails.

   And the outputs are coloured on the DRAWING while the sheet listing
   them was uniformly white, so matching a row to the run it describes
   meant reading the heading above it and remembering. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  /* Three orders, cycled, and the label says which is on. */
  /* Radios now, not a cycling button: three orders behind one button
     meant pressing it twice to see what the third was. */
  if (!/\["output", "By output"\]/.test(canvas)) {
    fail("there is no way to group the report by link box output");
  }
  if (!/name="gt-ord"/.test(canvas)) {
    fail("the orders are not offered as exclusive choices");
  }
  if (!/const partRank = \(l\) =>/.test(canvas)) {
    fail("nothing orders the parts, so an output sort has no order to use");
  }
  /* The trunk before the outputs: everything hangs off it. */
  if (!/l\?\.part === "trunk" \? -1/.test(canvas)) {
    fail("the trunk is not put before the outputs it feeds");
  }
  /* Node order INSIDE a part, or grouping by output loses the order
     within each one. */
  if (!/if \(pa !== pb\) return pa - pb;\n\s*\}\n\s*return byNode\(a, b\);/.test(canvas)) {
    fail("grouping by output abandons node order within each output");
  }

  /* The tint comes from the box's own Way_Colours, so the drawing and
     the table cannot disagree. */
  const at = canvas.indexOf("const wayTint = useCallback");
  const fn = at < 0 ? "" : canvas.slice(at, canvas.indexOf("}, [features]);", at));
  if (!fn) fail("the report's rows carry no colour from their output");
  else {
    if (!/Way_Colours\?\.\[String\(leg\.way\)\]/.test(fn)) {
      fail("the tint is not read from the box's own output colours");
    }
    /* Pastel: a row is a background behind black text, not a marker. */
    if (!/alpha\(c, 14\)/.test(fn)) {
      fail("the row takes the output colour at full strength, which is "
        + "picked to stand out on a plan and is unreadable behind text");
    }
    /* The trunk has no output and takes no colour. */
    if (!/leg\.part === "trunk" \|\| leg\.part === "origin"/.test(fn)) {
      fail("the trunk is tinted as though it were an output");
    }
    /* By id, not by name: two boxes can share a label, and a colour
       from the wrong box is worse than none. */
    if (!/leg\.boxId != null/.test(fn)) {
      fail("the box is found by name, so two boxes sharing a label give "
        + "one of them the other's colours");
    }
  }
  if (!/boxId: p\.box\?\.Feature_ID \?\? null,/.test(canvas)) {
    fail("a leg does not carry its box's id, so the tint cannot be keyed "
      + "on the box");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Levels grouping behaves (a section per cable, and none where there is "
  + "only one).");
process.exit(bad ? 1 : 0);
