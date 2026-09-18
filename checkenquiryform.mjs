/* The enquiry sheet, and the two things about it that are hard to undo.

   1. A jump must not be able to loop. A form that can send somebody
      backwards can send them round, and a loop in a form somebody is
      filling in is a trap with no way out. Made impossible rather than
      detected: the list of places to jump to holds only what comes
      after.

   2. A version must be a COPY. Editing the live sheet in place would
      rewrite the questions an already-submitted enquiry was answered
      against, and "what did we ask them in March" would have no
      answer.

   Read statically: the editor is React over a generic CRUD endpoint,
   and standing it up would test the mock. The rules, though, are the
   part that matters and the part somebody will tidy away. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const screen = readFileSync(
  "./src/features/admin/EnquiryFormsAdmin.jsx", "utf8");
const sql25 = readFileSync("./supabase/migrations/0225_enquiry_form.sql", "utf8");
const sql26 = readFileSync(
  "./supabase/migrations/0226_enquiry_submission.sql", "utf8");

// 1. Every answer type asked for is offered.
{
  for (const t of ["text", "long_text", "number", "date", "document",
    "choice", "multi"]) {
    if (!new RegExp(`"${t}"`).test(screen)) {
      fail(`the editor cannot make a ${t} question`);
    }
    if (!new RegExp(`'${t}'`).test(sql25)) {
      fail(`the database refuses a ${t} question`);
    }
  }
}

// 2. A jump can only go forward, by construction.
{
  if (!/const laterThan =/.test(screen)) {
    fail("the jump list is not limited to later questions, so a form can be "
      + "made that sends somebody backwards \u2014 and round");
  }
  const at = screen.indexOf("const laterThan =");
  const fn = at >= 0 ? screen.slice(at, at + 400) : "";
  if (!/slice\(i \+ 1\)/.test(fn)) {
    fail("the jump list does not start after the question it belongs to");
  }
  /* And the dropdown uses it, rather than every question. */
  if (!/laterThan\(q\.Enquiry_Question_ID\)\.map/.test(screen)) {
    fail("the jump dropdown offers questions from anywhere in the sheet");
  }
  /* The jump is set on the OPTION: it is a property of the answer
     given, and every other arrangement re-derives which answer it was. */
  if (!/Next_Question_ID: e\.target\.value \|\| null/.test(screen)) {
    fail("a jump is not recorded against the answer that causes it");
  }
}

// 3. A new version copies; it does not move.
{
  const at = screen.indexOf("const newVersion =");
  const fn = at >= 0 ? screen.slice(at, screen.indexOf("const addSection", at)) : "";
  if (!fn) {
    fail("the version copy cannot be found where it was");
  } else {
    if (/adminUpdate\("Enquiry_Section"/.test(fn)
      || /adminUpdate\("Enquiry_Question"/.test(fn)) {
      fail("making a version MOVES the existing questions, so an enquiry "
        + "already submitted loses the wording it was answered against");
    }
    /* Jumps last, and remapped: a copied jump pointing at the original
       would send somebody from the new sheet into the old one. */
    if (!/qMap\.get\(String\(o\.Next_Question_ID\)\)/.test(fn)) {
      fail("copied jumps still point at the questions of the sheet they "
        + "were copied from");
    }
  }
}

// 4. One live sheet per utility, and publishing stands the others down.
{
  if (!/enquiry_form_current_idx/.test(sql25)) {
    fail("two sheets can be live for one utility, so which one a developer "
      + "gets is decided by whichever row is read first");
  }
  const at = screen.indexOf("const publish =");
  const fn = at >= 0 ? screen.slice(at, at + 900) : "";
  if (!/Is_Current: false/.test(fn)) {
    fail("publishing does not stand down the sheet it replaces");
  }
}

// 5. Answers outlive the questions, and nothing becomes a project by
//    itself.
{
  if (!/CREATE TABLE IF NOT EXISTS "Enquiry_Answer"/.test(sql26)) {
    fail("there is nowhere to keep what somebody answered");
  }
  if (!/"Chosen"\s+bigint\[\]/.test(sql26)) {
    fail("a chosen option is not recorded by id, so rewording an option "
      + "rewrites what somebody said");
  }
  if (!/'draft', 'submitted', 'accepted', 'declined'/.test(sql26)) {
    fail("an enquiry cannot wait to be accepted");
  }
  if (!/"Organisation_Branch_ID"/.test(sql26)) {
    fail("an enquiry does not belong to a branch, so it leaves with the "
      + "person who sent it");
  }
}

// 6. Wired into the admin menu and the endpoint.
{
  const tables = readFileSync("./src/lib/adminTables.js", "utf8");
  if (!/special: "enquiryforms"/.test(tables)) {
    fail("there is no Enquiry Sheets screen in the admin menu");
  }
  const fn = readFileSync("./netlify/functions/admin.js", "utf8");
  for (const t of ["Enquiry_Form", "Enquiry_Section", "Enquiry_Question",
    "Enquiry_Option"]) {
    if (!new RegExp(`${t}:`).test(fn)) {
      fail(`the admin endpoint refuses ${t}, so the screen cannot save`);
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Enquiry sheets: every answer type, forward-only jumps, versions copied.");
process.exit(bad ? 1 : 0);
