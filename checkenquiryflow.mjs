/* Which question comes next, and when the sheet is done.

   The branching is the part of an enquiry sheet that goes wrong
   quietly: somebody answers Yes, the form asks question 4 anyway, and
   nobody notices until a developer complains about being asked
   something that could not apply to them.

   These are functional: a sheet is built, answers are given, and the
   path is compared against what should have been asked. No browser and
   no database, because the rule has nothing to do with either. */
import { readFileSync } from "node:fs";
import {
  sheetOf, pathOf, currentQuestion, nextFrom, missingAnswers, isComplete,
} from "./src/features/portal/enquiryFlow.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const q = (id, extra = {}) => ({
  Enquiry_Question_ID: id, Enquiry_Form_ID: 1, Question: `Q${id}`,
  Kind: "text", Sort_Order: id * 10, Is_Active: true, ...extra,
});
const opt = (id, qid, label, extra = {}) => ({
  Enquiry_Option_ID: id, Enquiry_Question_ID: qid, Label: label,
  Sort_Order: id, Is_Active: true, ...extra,
});

const asked = (sheet, answers) =>
  pathOf(sheet, answers).map((x) => x.Enquiry_Question_ID);

// 1. With no branching, the sheet is its own order.
{
  const sheet = sheetOf([q(1), q(2), q(3)], [], 1);
  if (asked(sheet, { 1: "a", 2: "b", 3: "c" }).join() !== "1,2,3") {
    fail("a plain sheet is not walked in order");
  }
  /* And it stops at the first unanswered question, which is the one to
     put in front of somebody. */
  if (currentQuestion(sheet, { 1: "a" })?.Enquiry_Question_ID !== 2) {
    fail("the question to answer next is not the first unanswered one");
  }
}

// 2. The asked-for case: "if Yes, skip 4 and go to 5".
{
  const questions = [q(1), q(2, { Kind: "choice_one" }), q(3), q(4), q(5)];
  const options = [opt(10, 2, "Yes", { Next_Question_ID: 5 }), opt(11, 2, "No")];
  const sheet = sheetOf(questions, options, 1);

  const yes = asked(sheet, { 1: "x", 2: 10, 5: "done" });
  if (yes.join() !== "1,2,5") {
    fail(`answering Yes walks ${yes.join()} \u2014 3 and 4 should have been `
      + "jumped over");
  }
  const no = asked(sheet, { 1: "x", 2: 11, 3: "a", 4: "b", 5: "c" });
  if (no.join() !== "1,2,3,4,5") {
    fail(`answering No walks ${no.join()} \u2014 the other answer must not `
      + "jump");
  }
}

// 3. An answer can finish the sheet.
{
  const questions = [q(1, { Kind: "choice_one" }), q(2), q(3)];
  const options = [opt(10, 1, "We have no site yet", { Ends_Form: true }),
    opt(11, 1, "Yes")];
  const sheet = sheetOf(questions, options, 1);

  if (asked(sheet, { 1: 10 }).join() !== "1") {
    fail("an answer that ends the form does not end it");
  }
  if (currentQuestion(sheet, { 1: 10 }) !== null) {
    fail("the form asks another question after an answer that ended it");
  }
  if (!isComplete(sheet, { 1: 10 })) {
    fail("a form ended by an answer cannot be submitted");
  }
}

// 4. A question can carry its own onward pointer, and the option beats
//    it: the answer is more specific than the question.
{
  const questions = [q(1, { Kind: "choice_one", Next_Question_ID: 3 }),
    q(2), q(3), q(4)];
  const options = [opt(10, 1, "A", { Next_Question_ID: 4 }), opt(11, 1, "B")];
  const sheet = sheetOf(questions, options, 1);

  if (nextFrom(sheet[0], { 1: 10 }) !== 4) {
    fail("the option's jump does not beat the question's own");
  }
  if (nextFrom(sheet[0], { 1: 11 }) !== 3) {
    fail("an answer with no jump of its own does not follow the "
      + "question's");
  }
}

// 5. A multi-choice: the first CHOSEN option in the sheet's order that
//    carries a jump decides. A single answer cannot lead two ways, and
//    the order they were ticked in is not a rule anybody could rely on.
{
  const questions = [q(1, { Kind: "choice_many" }), q(2), q(3), q(4)];
  const options = [opt(10, 1, "One"), opt(11, 1, "Two", { Next_Question_ID: 3 }),
    opt(12, 1, "Three", { Next_Question_ID: 4 })];
  const sheet = sheetOf(questions, options, 1);

  if (nextFrom(sheet[0], { 1: [12, 11] }) !== 3) {
    fail("a multi-choice follows the order somebody ticked rather than the "
      + "sheet's own order");
  }
  if (nextFrom(sheet[0], { 1: [10] }) !== null) {
    fail("an answer with no jump on it invents one");
  }
}

// 6. Retired questions and options are not asked again.
{
  const sheet = sheetOf([q(1), q(2, { Is_Active: false }), q(3)], [], 1);
  if (asked(sheet, { 1: "a", 3: "c" }).join() !== "1,3") {
    fail("a retired question is still asked");
  }
}

// 7. Only what was ASKED can be missing.
//
//    A question the answers jumped over is not missing; it was not
//    asked. Judging completeness against every question in the sheet is
//    how a branching form becomes unsubmittable.
{
  const questions = [q(1, { Kind: "choice_one" }),
    q(2, { Is_Required: true }), q(3, { Is_Required: true })];
  const options = [opt(10, 1, "Skip it", { Next_Question_ID: 3 }),
    opt(11, 1, "Ask it")];
  const sheet = sheetOf(questions, options, 1);

  const skipped = missingAnswers(sheet, { 1: 10, 3: "done" });
  if (skipped.length) {
    fail(`${skipped.length} answers reported missing after they were jumped `
      + "over \u2014 the form could never be submitted");
  }
  if (!isComplete(sheet, { 1: 10, 3: "done" })) {
    fail("a form whose required questions were all answered is not "
      + "complete");
  }
  /* And a required question that WAS asked is still required. */
  if (!missingAnswers(sheet, { 1: 11, 3: "done" }).length) {
    fail("a required question that was asked can be left unanswered");
  }
}

// 8. A loop cannot hang the form.
//
//    The editor offers only later questions, so a loop cannot be built
//    there. A sheet edited in the database could still hold one, and a
//    form that hangs has no way out for the person in it.
{
  const questions = [q(1, { Next_Question_ID: 2 }), q(2, { Next_Question_ID: 1 })];
  const sheet = sheetOf(questions, [], 1);
  const path = pathOf(sheet, { 1: "a", 2: "b" });
  if (path.length > 2) {
    fail("a sheet that points backwards walks round for ever");
  }
}

// 9. Wired: the portal serves the live sheet for the right audience,
//    and takes a submission the account cannot lie about.
{
  const portalFn = readFileSync("./netlify/functions/portal.js", "utf8");

  if (!/what === "enquiry-form"/.test(portalFn)) {
    fail("the portal cannot fetch the sheet");
  }
  /* Their audience's sheet, or one published for everybody \u2014 never
     another audience's. A developer asked a DNO's questions would
     answer them, and we would hold the wrong information in a form
     nobody can tell from the right one. */
  if (!/String\(f\.Audience \|\| ""\)\.toLowerCase\(\) === String\(access\.Audience/
    .test(portalFn)) {
    fail("the sheet is not matched to the account's audience");
  }
  /* The branch comes from the ACCOUNT. A caller who could name their
     own branch could file an enquiry against somebody else's office. */
  const at = portalFn.indexOf('what === "enquiry" && req.method === "POST"');
  const post = at >= 0 ? portalFn.slice(at, at + 2200) : "";
  if (!post) {
    fail("the portal cannot take a submission");
  } else {
    if (!/Organisation_Branch_ID: access\.Branch_ID/.test(post)) {
      fail("the submission's branch is not taken from the account, so a "
        + "caller could file against another office");
    }
    if (/body\?\.branch|body\.branchId/.test(post)) {
      fail("the submission reads a branch from the request body");
    }
    /* The question as it was worded, stored with the answer. */
    if (!/Question_Text:/.test(post)) {
      fail("an answer is stored without the question it answered, so "
        + "rewording the sheet rewrites history");
    }
  }

  const ui = readFileSync("./src/features/portal/DeveloperPortal.jsx", "utf8");
  /* Only what was asked is sent: an empty answer against a question
     somebody was never asked reads later as a refusal to answer. */
  if (!/asked\s*\n?\s*\.filter\(\(q\) => answers\[q\.Enquiry_Question_ID\] != null\)/
    .test(ui)) {
    fail("the portal sends answers for questions that were jumped over");
  }
  /* A choice is stored as its label, so the answer reads beside the
     question years later without the option having to survive. */
  if (!/\.map\(\(o\) => o\.Label\)\.join\(", "\)/.test(ui)) {
    fail("a chosen answer is sent as an id, which will not read on its own "
      + "once an option is reworded or retired");
  }
  /* ── Send is offered only at the END, and only when complete ──

     The form used to treat "has a value" as "answered", so the first
     letter typed advanced it mid-word. It now waits for Next, which
     means Send belongs to the state where there is no current question
     rather than being disabled while there is one. */
  if (!/\{current \? \(/.test(ui)) {
    fail("the footer does not distinguish answering a question from having "
      + "finished, so Send sits beside a question still being answered");
  }
  if (!/disabled=\{sending \|\| missing\.length > 0\}/.test(ui)) {
    fail("an enquiry can be sent with required questions unanswered");
  }
  /* And the form advances on a press, not on a keystroke. */
  if (!/onClick=\{nextQuestion\}/.test(ui)) {
    fail("there is no Next, so the form advances as somebody types");
  }
  if (!/const \[here, setHere\]/.test(ui)) {
    fail("the question in front of somebody is derived from which answers "
      + "exist, which makes the first keystroke an answer");
  }
  /* A required question cannot be walked past. */
  if (!/disabled=\{current\.Is_Required && !answeredHere\}/.test(ui)) {
    fail("a required question can be passed over with Next");
  }
  /* A file question says plainly that it cannot take one yet. */
  if (!/Documents cannot be attached here yet/.test(ui)) {
    fail("a document question shows a control that does nothing");
  }
}

// 10. Dates read dd-mmm-yy, and a choice has room between the button
//     and its words.
{
  const ui = readFileSync("./src/features/portal/DeveloperPortal.jsx", "utf8");

  /* From a fixed list, not the locale: en-GB's "short" month gives
     "Sept" for September \u2014 four letters where every other month has
     three, which breaks the alignment the format exists for. */
  if (!/const MONTHS = \["Jan", "Feb", "Mar"/.test(ui)) {
    fail("months come from the locale, and en-GB renders September as "
      + "\"Sept\" \u2014 four letters where the rest have three");
  }
  if (!/String\(t\.getDate\(\)\)\.padStart\(2, "0"\)/.test(ui)) {
    fail("the day is not padded, so a column of dates does not line up");
  }
  if (!/String\(t\.getFullYear\(\)\)\.slice\(-2\)/.test(ui)) {
    fail("the year is not two digits");
  }
  /* A date ANSWER is stored as it reads, because it is read beside its
     question by whoever picks the enquiry up. */
  if (!/q\.Kind === "date" \? dateText\(a\)/.test(ui)) {
    fail("a date answer is stored in a form nobody reads in a sentence");
  }

  /* The portal's own check class. `fe-check` is defined inside the
     feature editor's injected CSS, so here it was a label with no gap
     and the words sat against the button. */
  if (/className="fe-check"/.test(ui)) {
    fail("the portal borrows the feature editor's check class, which does "
      + "not exist unless that component is on screen");
  }
  if (!/\.pt-check \{[^}]*gap: 10px/.test(ui)) {
    fail("there is no space between a radio button and its words");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The sheet walks its answers: jumps, ends, and nothing asked twice.");
process.exit(bad ? 1 : 0);
