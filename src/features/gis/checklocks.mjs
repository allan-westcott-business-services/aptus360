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
import { lockReason, toggleClassLock, isLocked } from "./src/features/gis/locking.js";
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

console.log(bad ? `\n${bad} problem(s)`
  : "Locking behaves (labels resolved, line types listed and unlockable).");
process.exit(bad ? 1 : 0);
