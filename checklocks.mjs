/* Locking, and being able to say what is locked.

   A class lock stops a feature being dragged. Two things went wrong
   together and made one unrecoverable state:

     The message named the stored key — "lt:trench_main are locked" —
     which matches nothing a reader can see on screen.

     The Locked against moving menu listed layers only, so a locked line
     type could not be unlocked from anywhere. Line types are locked
     from the right-click menu, and once locked the feature refused
     every drag, so the menu that set it could no longer be reached
     through it.

   The second is markup and is checked in the page; this pins the
   first, and the toggling either way. */
import { lockReason, toggleClassLock, isLocked, isRouted, isImmovable }
  from "./src/features/gis/locking.js";
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const f = { Feature_ID: 1 };

// 1. A known label is used.
{
  const msg = lockReason(f, ["lt:trench_main"], ["lt:trench_main"],
    (k) => (k === "lt:trench_main" ? "Mains Trench" : k));
  if (!msg.includes("Mains Trench")) fail(`the label was not used: "${msg}"`);
}

// 2. And when it cannot be resolved — a class read from storage before
//    the line types have loaded — the key is made legible rather than
//    shown raw.
{
  const msg = lockReason(f, ["lt:trench_main"], ["lt:trench_main"], (k) => k);
  if (msg.includes("lt:")) fail(`the raw key reached the message: "${msg}"`);
  if (msg.includes("_")) fail(`an underscore reached the message: "${msg}"`);
  if (!msg.includes("trench main")) fail(`the key was not made legible: "${msg}"`);
}

// 3. Nothing locked says nothing.
if (lockReason(f, ["trench"], [], (k) => k) !== "") {
  fail("an unlocked feature was given a reason");
}

// 4. Toggling works for a line type as well as a layer, since the menu
//    now offers both.
for (const key of ["trench", "lt:trench_main"]) {
  const on = toggleClassLock([], key);
  if (!on.includes(key)) fail(`${key} could not be locked`);
  if (toggleClassLock(on, key).includes(key)) fail(`${key} could not be unlocked`);
}

// 5. And a locked line type actually locks its features, or the message
//    would be about nothing.
if (!isLocked({ Feature_ID: 2 }, ["trench", "lt:trench_main"], ["lt:trench_main"])) {
  fail("a locked line type did not lock a feature carrying it");
}

// 6. The menu lists locked line types, not just layers. Text matching,
//    because the alternative is rendering the page.
{
  const page = readFileSync("src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!page.includes("Locked line types")) {
    fail("the lock menu no longer lists locked line types");
  }
}

/* ── A cable or pipe is not shaped by hand ──

   It lies in a trench. Its route is the trench's route, drawn there by
   Auto Lay Services or carried there when the trench moves.

   Dragging one edits the drawing into a lie: the cable no longer
   follows the dig it is laid in, nothing says so at working zoom, and
   the next reshape of that trench carries it from wherever it was left
   rather than from where it should have been. The bill then measures a
   length nobody will dig.

   So the answer to "I want this cable to go round differently" is to
   re-route the trench. */
{
  const line = (layer) => ({ Feature_Type: "line", Layer_Key: layer, Attributes: {} });

  /* 1. Retired, on instruction: link boxes made hand-routed cables the
     ordinary work \u2014 fed in and out of a box, re-routed as design
     decisions \u2014 so no line is immovable for being one. The build still
     deletes and re-lays its own generated runs, which is where the
     trench-and-cable agreement now lives. */
  for (const layer of ["electric", "gas", "water", "lighting"]) {
    if (isRouted(line(layer))) fail(`a ${layer} line is still refused a move`);
    if (isImmovable(line(layer), [], [])) {
      fail(`a ${layer} cable or pipe cannot be re-routed by hand`);
    }
  }

  /* 2. And the things that ARE shaped by hand still are.

     The trench most of all: it is the thing somebody re-routes to move
     a cable, so locking it would leave no way to do either. */
  for (const layer of ["trench", "boundary", "survey"]) {
    if (isRouted(line(layer))) fail(`a ${layer} line is treated as routed`);
    if (isImmovable(line(layer), [], [])) fail(`a ${layer} line can no longer be reshaped`);
  }
  /* Points are placed, not routed: a meter, a seed, a joint. */
  if (isRouted({ Feature_Type: "point", Layer_Key: "electric", Attributes: {} })) {
    fail("a meter is treated as a routed line");
  }

  /* 3. With the routed rule retired, a cable's only refusal is a lock
     somebody set \u2014 and the message says so plainly. The old case here
     held the opposite: that a cable must answer "re-route the trench"
     before any lock. That answer went with the rule. */
  {
    const cable = { Feature_Type: "line", Layer_Key: "electric", Attributes: {} };
    if (lockReason(cable, [], []) !== "") {
      fail(`an unlocked cable now refuses with: "${lockReason(cable, [], [])}"`);
    }
    const lockedCable = {
      Feature_Type: "line", Layer_Key: "electric", Attributes: { Locked: true },
    };
    if (!/locked/i.test(lockReason(lockedCable, [], []))) {
      fail("a locked cable no longer reports its lock");
    }
  }

  /* 4. It is NOT folded into isLocked.

     isLocked governs two other things: whether a lasso delete takes a
     feature, and whether a trench carries it. Folding this in stopped
     the carry outright — the carry skips locked features, and every
     cable had just become one. */
  {
    if (isLocked(line("electric"), [], [])) {
      fail("a routed cable counts as locked, which stops its trench carrying it "
        + "and stops a lasso deleting it");
    }
  }
}

/* 5. And every path that reshapes asks the right question.

   The canvas has several: three drag guards, the multi-drag check, and
   the geometry write. A cable is refused at all of them or at none —
   one that lets it through is a cable somebody moves the way they
   always did, and the guard reads as intermittent.

   The carry and the lasso delete must NOT use it: a cable is carried by
   its trench and is deletable. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  const guards = (canvas.match(/immovable\(/g) || []).length;
  /* The declaration plus five call sites. */
  if (guards < 6) {
    fail(`only ${guards - 1} reshape path(s) refuse a cable \u2014 the rest still move it`);
  }
  if (!/const immovable = useCallback/.test(canvas)) {
    fail("the canvas has no single answer to whether a hand may reshape something");
  }

  /* The carry still uses the plain lock, or every cable is skipped and
     reshaping a trench leaves its contents behind. */
  const carry = canvas.slice(canvas.indexOf("function carriedBy("),
    canvas.indexOf("async function writeGeometry"));
  if (/immovable\(/.test(carry)) {
    fail("the carry skips routed cables, so a trench no longer takes its contents with it");
  }
  if (!/locked\(f\)/.test(carry)) {
    fail("the carry no longer skips locked features");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Locking behaves (labels resolved, line types listed and unlockable).");
process.exit(bad ? 1 : 0);
