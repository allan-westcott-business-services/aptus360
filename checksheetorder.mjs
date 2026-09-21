/* Ordering an enquiry sheet by dragging.

   A question's place was a number typed into an Order box: to put a
   question third you worked out what the second and fourth were
   called and chose something between. Asked for as dragging instead,
   with each section on its own tab, sections and questions deletable,
   and a renamed section renaming its tab.

   ── What a drag does ──

   Moves one thing and renumbers everything. Sections are TEXT on
   their questions and appear in the order their first question does,
   so the sheet's order is fully described by walking sections then
   questions, and every drag is: rearrange the walk, renumber, write
   only what changed. The renumbering is pure and is what this holds. */
import { readFileSync } from "node:fs";
import {
  renumber, moveQuestion, moveSection, moveToSection,
} from "./src/features/admin/sheetOrder.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const q = (id, order, section) => ({ Enquiry_Question_ID: id, Sort_Order: order, Section: section, Question: `Q${id}` });
const sheet = () => [
  { title: "Site", questions: [q(1, 10, "Site"), q(2, 20, "Site"), q(3, 30, "Site")] },
  { title: "Supply", questions: [q(4, 40, "Supply"), q(5, 50, "Supply")] },
];
const orderOf = (groups) => groups.flatMap((g) => g.questions.map((x) => x.Enquiry_Question_ID));

// 1. A sheet already in order writes nothing.
{
  if (renumber(sheet()).length) fail("a sheet already in order is rewritten");
  /* Gaps are fine and left alone — 10, 20, 30 is the ordering and the
     numbers are not sacred. A sheet numbered 1, 2, 3 gets renumbered
     to tens, which is one-off and harmless. */
}

// 2. Dragging a question within its section.
{
  const { groups, writes } = moveQuestion(sheet(), 3, 1);
  if (orderOf(groups).join() !== "3,1,2,4,5") {
    fail(`dragging Q3 in front of Q1 gave ${orderOf(groups).join()}`);
  }
  /* Only the three that moved are written. Q4 and Q5 keep 40 and 50. */
  if (writes.length !== 3 || writes.some((w) => w.id === 4 || w.id === 5)) {
    fail(`${writes.length} writes for a move that touched three questions \u2014 `
      + "a whole-sheet rewrite for every drag");
  }
  const to = new Map(writes.map((w) => [w.id, w.Sort_Order]));
  if (to.get(3) !== 10 || to.get(1) !== 20 || to.get(2) !== 30) {
    fail("the moved questions are not renumbered to their new positions");
  }

  /* Dropped past the last: `before` null means the end. */
  const end = moveQuestion(sheet(), 1, null);
  if (orderOf(end.groups).join() !== "2,3,1,4,5") {
    fail(`dragging Q1 to the end gave ${orderOf(end.groups).join()}`);
  }

  /* Dropped where it already is: a drag that jiggles and lands where it
     started must not cost a save. */
  const same = moveQuestion(sheet(), 2, 3);
  if (same.writes.length) fail("dropping a question into its own slot writes rows");
}

// 3. Dragging a tab reorders the sections \u2014 which is every question renumbered.
{
  const { groups, writes } = moveSection(sheet(), "Supply", "Site");
  if (groups.map((g) => g.title).join() !== "Supply,Site") {
    fail("dragging the Supply tab in front of Site did not reorder the sections");
  }
  if (orderOf(groups).join() !== "4,5,1,2,3") {
    fail(`the questions do not follow the sections: ${orderOf(groups).join()}`);
  }
  /* Sections have no order of their own, so every question moves. */
  if (writes.length !== 5) {
    fail(`${writes.length} writes for a section move that changes every position`);
  }
}

// 4. Moving a question into another section.
{
  const { groups, writes } = moveToSection(sheet(), 2, "Supply");
  const supply = groups.find((g) => g.title === "Supply");
  if (!supply || supply.questions.map((x) => x.Enquiry_Question_ID).join() !== "4,5,2") {
    fail("a question moved to another section does not land at its end");
  }
  if (supply.questions[2].Section !== "Supply") {
    fail("the moved question does not carry its new section's name \u2014 and the "
      + "section IS the name");
  }
  /* A section emptied by the move disappears; it was only ever the
     text on the questions that were in it. */
  const lone = [{ title: "A", questions: [q(1, 10, "A")] }, { title: "B", questions: [q(2, 20, "B")] }];
  const emptied = moveToSection(lone, 1, "B");
  if (emptied.groups.some((g) => g.title === "A")) {
    fail("a section with no questions left in it is still a tab");
  }
  if (!writes.every((w) => Number.isInteger(w.Sort_Order))) fail("a non-integer order was written");
}

// 5. The editor uses it, and the Order box is gone.
{
  const ed = readFileSync("./src/features/admin/EnquiryFormsAdmin.jsx", "utf8");
  if (/htmlFor=\{`qo-\$\{q\.Enquiry_Question_ID\}`\}>Order</.test(ed)) {
    fail("the Order box is still there beside the drag handle, so there are two "
      + "ways to say one thing");
  }
  if (!/className="ef-handle"[\s\S]{0,80}draggable/.test(ed)) {
    fail("questions have no drag handle");
  }
  if (!/role="tablist"/.test(ed) || !/role="tab"/.test(ed)) {
    fail("sections are not tabs");
  }
  /* Only the handle drags, or selecting text in the question box
     starts a drag. */
  if (/className=\{"ef-question"[\s\S]{0,120}draggable/.test(ed)) {
    fail("the whole question row is draggable, so selecting text in it "
      + "starts a drag");
  }
  /* A rename moves the tab with it. */
  const rn = ed.indexOf("const renameSection");
  if (rn < 0 || !/setActiveTab\(title\)/.test(ed.slice(rn, rn + 600))) {
    fail("renaming a section leaves the tab pointing at the old name, so the "
      + "rename lands on no tab at all");
  }
  /* Deletion retires. An answer somebody has already given points at
     these rows, and a row deleted outright takes that answer's
     question text with it. */
  const ds = ed.indexOf("const deleteSection");
  const dq = ed.indexOf("const deleteQuestion");
  if (ds < 0 || dq < 0) fail("a section or a question cannot be deleted");
  else {
    if (/adminDelete\("Enquiry_Question"/.test(ed)) {
      fail("a question is deleted outright \u2014 submitted answers point at it");
    }
    if (!/window\.confirm/.test(ed.slice(ds, ds + 500))) {
      fail("a section is deleted without confirming how many questions go with it");
    }
  }
  /* Writes go one at a time. The admin endpoint takes one row, and
     forty in parallel against one sheet is a way to find out how the
     API queues. */
  if (!/for \(const w of writes\) \{\s*\n\s*await adminUpdate/.test(ed)) {
    fail("reorder writes are not applied one after another");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The sheet is ordered by dragging: one move, everything renumbered, only changes written.");
process.exit(bad ? 1 : 0);
