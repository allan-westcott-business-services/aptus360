/* Placing a breech joint on a cable.

   Three things asked for together:

     1. It is placed by CLICKING a point of a cable — an end, a
        corner, or the midpoint of a run — not dropped in the middle of
        the view and snapped to whatever feeder is nearest.
     2. At placement, whether it breaks the cable there is asked, not
        assumed. A breech where a run ENDS and others begin is two
        cables; a breech let into a run that carries on is one. Both
        are ordinary and the drawing cannot tell which was meant.
     3. Dragging it afterwards rubber-bands the cables with it.

   The third falls out of the second if the second is done properly.
   "Leave the cable whole" cannot mean "drop a symbol on a line": the
   follow machinery moves VERTICES, so a fitting with no vertex under
   it slides off its own cable the first time it is dragged. Leaving
   the cable whole therefore INSERTS a vertex at the point, and the
   existing rule carries it from there. */
import { readFileSync } from "node:fs";
import {
  insertVertexAt, splitPolylineAt, canBreakAt,
} from "./src/features/gis/snapping.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("src/features/gis/GISCanvasPage.jsx", "utf8");

// ── 1. A vertex under the fitting, which is what makes it hold ──
{
  const g = [[0, 0], [10, 0], [10, 10]];

  const mid = insertVertexAt(g, [5, 0]);
  if (!mid || !mid.added) fail("no vertex is inserted mid-segment");
  else if (String(mid.geometry) !== String([[0, 0], [5, 0], [10, 0], [10, 10]])) {
    fail(`the vertex went in the wrong place: ${JSON.stringify(mid.geometry)}`);
  }

  /* An existing corner and an end need no insertion. Stacking a second
     vertex on the first would leave a zero-length segment, and every
     length in the drawing is measured off these. */
  for (const [what, at] of [["a corner", [10, 0]], ["an end", [0, 0]]]) {
    const r = insertVertexAt(g, at);
    if (!r) fail(`clicking ${what} is refused`);
    else if (r.added) fail(`clicking ${what} stacks a second vertex on it`);
    else if (r.geometry.length !== g.length) fail(`clicking ${what} changed the geometry`);
  }

  /* Off the line entirely is null, not a guess. */
  if (insertVertexAt(g, [5, 50]) !== null) {
    fail("a point nowhere near the cable is inserted anyway");
  }
  if (insertVertexAt([[0, 0]], [0, 0]) !== null) {
    fail("a one-point line is treated as a cable");
  }

  /* The original is not mutated: the caller writes the returned
     geometry, and a drag that had already read the old one would
     otherwise see it change underneath. */
  const before = JSON.stringify(g);
  insertVertexAt(g, [5, 0]);
  if (JSON.stringify(g) !== before) fail("the cable's own geometry was mutated");

  /* A cable doubling back passes the same point twice; the nearer
     passing is the one under the pointer. */
  const hairpin = [[0, 0], [10, 0], [10, 1], [0, 1]];
  const h = insertVertexAt(hairpin, [5, 0.1]);
  if (!h || h.index !== 1) {
    fail(`on a hairpin the vertex landed at index ${h && h.index}, not the nearer pass`);
  }
}

// ── 2. Breaking still breaks ──
{
  /* The two are the two halves of one question, and they must not
     disagree about where the point is: one splits, the other bends. */
  const g = [[0, 0], [10, 0]];
  const parts = splitPolylineAt(g, [4, 0]);
  if (!parts) fail("the break rule stopped working");
  else if (String(parts[0][parts[0].length - 1]) !== String([4, 0])
    || String(parts[1][0]) !== String([4, 0])) {
    fail("the halves do not meet at the point the joint was placed at");
  }
}

// ── 3. Placed by clicking a point of a cable ──
{
  if (!/setJointFor\(jointFor === "breech" \? null : "breech"\)/.test(canvas)) {
    fail("the breech is not armed for a click, so it is still dropped in "
      + "the middle of the view and snapped to the nearest feeder");
  }
  if (!/snapTargets\(\[chosen\.line\], \{ includeMidpoints: true \}\)/.test(canvas)) {
    fail("the click does not snap to the cable's ends, corners and midpoints");
  }
  /* Its own armed state. With two kinds armed the same way, `!!jointFor`
     lit the straight joint while the breech was the thing waiting. */
  if (/active=\{!!jointFor\}/.test(canvas)) {
    fail("a joint menu item still lights up for any armed kind, so the "
      + "menu says the wrong one is waiting for a click");
  }
}

// ── 4. The choice is asked, and carried ──
{
  if (!/const breakLine = opts\.breakLine !== false && canBreak;/.test(canvas)) {
    fail("placing a joint cannot be told whether to break the cable, or "
      + "does not check first whether a break is possible there");
  }
  if (!/Break the cable here\?/.test(canvas)) {
    fail("nothing asks whether to break the cable");
  }
  if (!/breakLine: true/.test(canvas) || !/breakLine: false/.test(canvas)) {
    fail("the dialog does not offer both answers");
  }
  /* Recorded on the joint: a breech on an unbroken cable and a breech
     where two cables meet look identical afterwards. */
  if (!/Breaks_Cable: breakLine/.test(canvas)) {
    fail("which was chosen is not recorded, so nothing can say afterwards "
      + "what was asked for");
  }
  /* Both routes to the question. Where several cables lie under the
     pointer the cable is asked first, and that path must reach the
     break question too rather than quietly breaking. */
  if (!/pick\.kind === "breech"/.test(canvas)) {
    fail("choosing between overlapping cables skips the break question");
  }
  /* The default is unchanged for every other kind: nothing that worked
     yesterday now stops to ask. */
  if (/placeJointOnCable\(kind, chosen\.line, at, \{/.test(canvas)) {
    fail("the non-breech kinds have been given an option they did not have");
  }
}

// ── 5. It must never claim a break it did not make ──
//
//    Reported: asked to break the cable, and it did not. At the END of
//    a cable `splitPolylineAt` returns null — there is no length on one
//    side to cut — and a breech is most naturally placed exactly there,
//    at the end of the run it terminates. `breakLineAt` set an error
//    and returned nothing, and the placement carried on and wrote
//    `Breaks_Cable: true` about a cable it had not touched.
{
  const g = [[0, 0], [20, 0], [20, 20]];
  const tol = 1;
  if (canBreakAt(g, [0, 0], tol)) fail("the start of a cable reads as breakable");
  if (canBreakAt(g, [20, 20], tol)) fail("the end of a cable reads as breakable");
  if (!canBreakAt(g, [20, 0], tol)) fail("a corner reads as unbreakable");
  if (!canBreakAt(g, [10, 0], tol)) fail("a midpoint reads as unbreakable");
  /* And it agrees with the act, because it IS the act: one rule asked
     twice cannot disagree with itself. */
  for (const at of [[0, 0], [20, 0], [10, 0], [20, 20], [5, 5]]) {
    if (canBreakAt(g, at, tol) !== (splitPolylineAt(g, at, tol) != null)) {
      fail(`the button and the act disagree about ${JSON.stringify(at)}`);
    }
  }

  /* The placement asks before it acts, and the answer decides both
     what happens and what is written down. */
  if (!/const canBreak = canBreakAt\(line\.Geometry \|\| \[\], at, CONNECT_M \* 4\)/.test(canvas)) {
    fail("the placement does not ask whether a break is possible, so at a "
      + "cable end it records one that never happened");
  }
  /* A break that fails for another reason \u2014 a locked cable \u2014 aborts.
     Placing the joint anyway leaves a fitting claiming a break the
     drawing does not have. */
  if (!/if \(!halves\) return;/.test(canvas)) {
    fail("a refused break still places the joint");
  }
  /* And the dialog does not offer what cannot be honoured. */
  if (!/breakAsk\.canBreak && \(/.test(canvas)) {
    fail("the break button is offered at a cable end, where there is "
      + "nothing to cut");
  }

  /* ── The two halves are named ──

     `breakLineAt` returned nothing at all, including on success, so
     the joint's `Joint_Cables` always fell back to the ORIGINAL
     cable's id and never the far half's. The half beyond the joint was
     held by nothing, which shows up as it not following when the joint
     is dragged. */
  const bl = canvas.slice(canvas.indexOf("async function breakLineAt"));
  const blEnd = bl.indexOf("\n  /* Deleting a category");
  const blBody = blEnd > 0 ? bl.slice(0, blEnd) : bl.slice(0, 4000);
  if (!/return \{ headId: Number\(f\.Feature_ID\), tailId: Number\(made\?\.Feature_ID\)/.test(blBody)) {
    fail("breaking a line does not say which two cables came out of it, so "
      + "the joint records only one of the two it holds");
  }
}

// ── 6. The rubber-band, by the rule that carries it ──
{
  /* Leaving the cable whole inserts the vertex — without it there is
     nothing for the drag to move and the fitting slides off its own
     cable. */
  /* To the END of the function, not a fixed window. The first version
     of this sliced 4,000 characters and went red the moment a comment
     was added to the function — fault 33, which this session has now
     seen in three separate checks. A window sized to a guess tests the
     guess. */
  const at = canvas.indexOf("async function placeJointOnCable");
  const after = canvas.indexOf("\n  async function", at + 30);
  const body = canvas.slice(at, after > at ? after : canvas.length);
  if (!/insertVertexAt\(line\.Geometry \|\| \[\], at/.test(body)) {
    fail("leaving the cable whole does not put a vertex under the joint, "
      + "so dragging it later moves the symbol off the cable");
  }
  if (!/Joint_Cables: halves[\s\S]{0,400}\[Number\(line\.Feature_ID\)\]/.test(body)) {
    fail("an unbroken cable is not recorded as the joint's, so the drag "
      + "does not know which line to carry");
  }
  /* The record is what makes every vertex of that cable a candidate —
     `told` — and the breech must not be narrowed out of it by the
     ends-only rule that applies to a straight joint. */
  if (!/\(isJoint && told\.has\(Number\(line\.Feature_ID\)\)\)/.test(canvas)) {
    fail("a cable the joint NAMES no longer offers all its vertices to the "
      + "drag, so an interior vertex under a breech stops following it");
  }
  if (!/joinsEnds && isFeeder\s*\n\s*&& String\(pt\.Attributes\?\.Joint_Type \?\? ""\)\.toLowerCase\(\) === "straight"/.test(canvas)) {
    fail("the two-cables-only narrowing is no longer limited to straight "
      + "joints, so a breech's cables get cut to two arbitrary ones");
  }
  /* And the vertex is pushed into the drag's rubber list, which is the
     thing that actually moves it. */
  if (!/drag\.current\.rubber\.push\(\{ id: line\.Feature_ID, index: idx \}\)/.test(canvas)) {
    fail("nothing adds the held vertices to the drag, so no cable follows "
      + "any fitting");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "A breech is placed on a point of a cable, breaking it or not, and the cable follows it.");
process.exit(bad ? 1 : 0);
