/* The enquiry sheet editor, written against the schema that ALREADY
   EXISTED.

   Enquiry_Form / Enquiry_Question / Enquiry_Option / Enquiry_Answer
   were built outside the migrations folder, so nothing in the
   repository showed them. I wrote a second set for the same thing
   before finding out, and `CREATE TABLE IF NOT EXISTS` did the worst
   available thing: skipped what existed, created what did not, and
   left the schema half one design and half another.

   These cases pin the editor to the real columns, because that is what
   would silently rot: a screen written against `Answer_Type` when the
   column is `Kind` saves nothing and says nothing.

   Two rules are worth holding beyond the column names:

     1. A jump must not be able to loop — made impossible by offering
        only later questions, not detected afterwards.
     2. Nothing is deleted. A question or an option that an answer
        points at is retired with Is_Active, because an old answer
        still names it. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const screen = readFileSync(
  "./src/features/admin/EnquiryFormsAdmin.jsx", "utf8");

// 1. The real column names, and none of mine.
{
  for (const [wrong, right] of [
    ["Answer_Type", "Kind"],
    ["Is_Current", "Is_Live"],
    ["Enquiry_Section_ID", "Section"],
  ]) {
    if (new RegExp(wrong).test(screen)) {
      fail(`the editor uses ${wrong}, which does not exist — the column is `
        + `${right}, and writing to the wrong one saves nothing and says `
        + "nothing");
    }
  }
  for (const col of ["Kind", "Is_Live", "Section", "Ends_Form", "Is_Active"]) {
    if (!new RegExp(col).test(screen)) {
      fail(`the editor never touches ${col}, which the sheet needs`);
    }
  }
}

// 1b. The answer kinds are the ones the database accepts.
//
//     Its check constraint, as it stands:
//
//       CHECK ("Kind" = ANY (ARRAY['text','long_text','date','number',
//                                  'file','choice_one','choice_many']))
//
//     I guessed three of these wrong \u2014 document, choice and multi \u2014 and
//     a rejected value is not a visible failure in a dropdown: the save
//     fails, the list springs back, and it reads as a control that does
//     nothing. If a kind is added, it goes in the constraint and in the
//     editor, and this is what notices when only one of them happened.
{
  const KINDS = ["text", "long_text", "date", "number", "file",
    "choice_one", "choice_many"];
  for (const k of KINDS) {
    if (!new RegExp(`\\["${k}",`).test(screen)) {
      fail(`the editor does not offer "${k}", which the database accepts`);
    }
  }
  for (const wrong of ["document", "choice\"", "multi\""]) {
    if (new RegExp(`\\["${wrong}`).test(screen)) {
      fail(`the editor offers "${wrong}", which the constraint rejects \u2014 `
        + "the save fails and the dropdown springs back, saying nothing");
    }
  }
  /* And the option list is shown for the two kinds that have one. */
  if (!/t === "choice_one" \|\| t === "choice_many"/.test(screen)) {
    fail("the answers of a choice question are shown for the wrong kinds, "
      + "so a choice question cannot be given any answers");
  }
}

// 1c. A failed save is visible from wherever somebody is editing.
{
  if (!/className="banner error ef-error"/.test(screen)
    || !/\.ef-error \{ position: sticky/.test(screen)) {
    fail("an error is reported only at the top of the page, and somebody "
      + "editing the twentieth question never sees it");
  }
}

// 2. A jump can only go forward, by construction.
{
  if (!/const laterThan =/.test(screen)) {
    fail("the jump list is not limited to later questions, so a form can be "
      + "made that sends somebody backwards — and round");
  }
  const at = screen.indexOf("const laterThan =");
  const fn = at >= 0 ? screen.slice(at, at + 400) : "";
  if (!/slice\(i \+ 1\)/.test(fn)) {
    fail("the jump list does not start after the question it belongs to");
  }
  if ((screen.match(/laterThan\(q\.Enquiry_Question_ID\)/g) || []).length < 2) {
    fail("either the question's own jump or an answer's jump offers "
      + "questions from anywhere in the sheet");
  }
}

// 3. An answer can end the sheet.
{
  if (!/Ends_Form: true/.test(screen)) {
    fail("no answer can finish the form, so somebody who has no site yet is "
      + "walked through every question that cannot apply to them");
  }
}

// 4. Nothing is deleted.
{
  if (/adminDelete\("Enquiry_Question"/.test(screen)
    || /adminDelete\("Enquiry_Option"/.test(screen)) {
    fail("a question or option is DELETED, and an answer somebody has "
      + "already given points at it");
  }
  if (!/Is_Active: false/.test(screen)) {
    fail("there is no way to retire a question, so the only way to remove "
      + "one is to break an old answer");
  }
}

// 5. One live sheet per audience, and publishing stands the others down.
{
  const at = screen.indexOf("const publish =");
  const fn = at >= 0 ? screen.slice(at, at + 900) : "";
  if (!/Is_Live: false/.test(fn)) {
    fail("publishing does not stand down the sheet it replaces, so which "
      + "one a developer gets is whichever row is read first");
  }
}

// 6. And my duplicate migrations are gone, with a cleanup in their place.
{
  const cleanup = "./supabase/migrations/0225_enquiry_cleanup.sql";
  let sql = "";
  try { sql = readFileSync(cleanup, "utf8"); } catch { /* reported below */ }
  if (!sql) {
    fail("the duplicate enquiry migration is not cleaned up");
  } else {
    if (!/DROP TABLE IF EXISTS "Enquiry_Section"/.test(sql)) {
      fail("the section table created in error is left behind");
    }
    /* Only when empty. A table with rows in it is somebody's data until
       proven otherwise. */
    if (!/NOT EXISTS \(SELECT 1 FROM "Enquiry" LIMIT 1\)/.test(sql)) {
      fail("a table is dropped without checking it is empty");
    }
  }
}

// 7. Wired into the admin menu and the endpoint.
{
  const tables = readFileSync("./src/lib/adminTables.js", "utf8");
  if (!/special: "enquiryforms"/.test(tables)) {
    fail("there is no Enquiry Sheets screen in the admin menu");
  }
  const fn = readFileSync("./netlify/functions/admin.js", "utf8");
  for (const t of ["Enquiry_Form", "Enquiry_Question", "Enquiry_Option"]) {
    if (!new RegExp(`${t}:`).test(fn)) {
      fail(`the admin endpoint refuses ${t}, so the screen cannot save`);
    }
  }
  if (/Enquiry_Section:/.test(fn)) {
    fail("the endpoint still allows a table that does not exist");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The sheet editor writes the real columns, and jumps only go forward.");
process.exit(bad ? 1 : 0);
