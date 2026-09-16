/* A label dragged to where somebody wants it STAYS there.

   Placements are held in metres on the feature — `Labels[i].off`, or
   `Label_Offset` for the automatic one, or the per-kind offsets a span
   node and a meter carry — and written on release. A drag that is not
   written looks completely fine until the page is reloaded, because
   the label moves on local state either way; then every label springs
   back and the work is done again. Which is exactly what happened:
   `d.moved` was set in a second `d.mode === "label"` branch that the
   return at the end of the first one made unreachable, so every label
   drag released as a CLICK — select the line, return, save nothing.

   Static, because the drag is pointer events against a canvas and the
   check for it would be a re-implementation of the browser. What it
   holds is the shape of the handler: the flag is set where it can be
   reached, the release writes when it is set, and no second branch
   exists to take the first one's place. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

/* The move handler's label branch, up to its return. */
const branch = (() => {
  const at = canvas.indexOf('    if (d.mode === "label") {\n      /* Moved');
  if (at < 0) return "";
  const end = canvas.indexOf("\n      return;\n    }", at);
  return end > at ? canvas.slice(at, end) : "";
})();

// 1. The flag is set inside the branch that handles the drag.
{
  if (!branch) {
    fail("the label branch of the move handler cannot be found where it "
      + "was \u2014 this check needs re-anchoring, not deleting");
  } else if (!/d\.moved = true/.test(branch)) {
    fail("a label drag is never marked as moved, so its release reads as "
      + "a click and the new position is never saved \u2014 it springs back "
      + "on the next refresh");
  }
}

// 2. And nothing sets it in a branch that cannot be reached. Two
//    `d.mode === "label"` blocks in one handler is the fault itself:
//    the first returns, so the second is dead code that looks like it
//    is doing the job.
{
  const moveAt = canvas.indexOf("d.mode === \"label\"");
  const upAt = canvas.indexOf("d?.mode === \"label\"");
  const moveHandler = moveAt >= 0 && upAt > moveAt
    ? canvas.slice(moveAt, upAt) : "";
  const blocks = (moveHandler.match(/if \(d\.mode === "label"\) \{/g) || []).length;
  if (blocks > 1) {
    fail(`${blocks} label branches in the move handler \u2014 the first returns, `
      + "so the rest are dead and whatever they do is not happening");
  }
}

// 3. The release writes the whole attributes object. A drag may have
//    written into Labels, Label_Offset, Pressure_Offset, Levels_Offset
//    or Cutout_Offset, and naming one key saves the wrong thing.
{
  const up = (() => {
    const at = canvas.indexOf('if (d?.mode === "label") {');
    return at >= 0 ? canvas.slice(at, at + 1600) : "";
  })();
  if (!up) {
    fail("the release handler's label branch cannot be found");
  } else {
    if (!/bulkUpdateFeatures/.test(up)) {
      fail("a moved label is never sent to the database");
    }
    if (!/Attributes: \{ \.\.\.f\.Attributes \}/.test(up)) {
      fail("the release saves named keys rather than the whole attributes "
        + "object, so a drag that wrote a different key saves nothing");
    }
    if (!/if \(!d\.moved\)/.test(up)) {
      fail("a click that did not move is written to the database, which "
        + "puts a row through every time somebody touches a label");
    }
  }
}

// 4. A shake is not a drag: the same threshold a pan uses.
{
  if (branch && !/DRAG_PX/.test(branch)) {
    fail("any pointer movement at all counts as a drag, so clicking a "
      + "label to see what it belongs to writes to the database");
  }
}

// 5. The grab starts from where the label was DRAWN.
//
//    A feature carrying only a legacy `Label_Offset` is rendered from
//    a synthesised placement, so the hit records index 0 while
//    `Labels` does not exist. A grab that looked the offset up by that
//    index found nothing, started from zero, and the label jumped back
//    to its unmoved position the moment it was touched a second time —
//    after the first drag had worked perfectly.
{
  /* The push that records a LINE label's hit — the one that carries an
     index into the placements, which is where the mismatch was. Found
     by that index rather than by being the first push in the file:
     points have their own, and matching the wrong one made this pass
     while the bug was in. */
  const hit = (() => {
    const at = canvas.indexOf("idx: placed ? idx : null");
    if (at < 0) return "";
    const from = canvas.lastIndexOf("labelHits.current.push({", at);
    const to = canvas.indexOf("});", at);
    return from >= 0 && to > from ? canvas.slice(from, to) : "";
  })();

  if (!hit) {
    fail("the line label's hit record cannot be found where it was");
  } else if (!/off: off \?\? null/.test(hit)) {
    fail("a label's hit does not carry the offset it was drawn at, so the "
      + "grab has to look it up again and can disagree with the screen");
  }

  if (!/startOffset: \(lab\.off/.test(canvas)) {
    fail("the drag does not start from the offset the label was drawn at "
      + "\u2014 a second grab jumps the label back to whatever the lookup "
      + "finds, or to zero when it finds nothing");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "A moved label is saved, and a click on one is not.");
process.exit(bad ? 1 : 0);
