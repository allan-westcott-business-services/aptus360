/* A document attached to an enquiry.

   A `file` question asked for a drawing and the portal had nowhere to
   put one, so it said so and the document came later by email. It
   takes them now, and the path a file travels is where the mistakes
   would be.

   Three things this holds hardest:

     1. THE FILE DOES NOT TRAVEL IN THE ENQUIRY. It goes straight to
        storage on a signed slot and the answer keeps the path. A
        browser cannot hold a file across a reload, and an enquiry
        with five drawings in its body would not arrive.
     2. A PATH IS ONLY YOURS IF IT WAS ISSUED TO YOU. The upload
        happens before the submission exists, so the client hands the
        path back at the end — and a path from a caller is a path
        somebody can point at another company's folder.
     3. ANSWERED MEANS LANDED. A file chosen is not a file uploaded,
        and a required question satisfied by a choice would file an
        enquiry pointing at nothing. */
import { readFileSync } from "node:fs";
import { missingAnswers } from "./src/features/portal/enquiryFlow.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const portal = readFileSync("./netlify/functions/portal.js", "utf8");
const ui = readFileSync("./src/features/portal/DeveloperPortal.jsx", "utf8");
const admin = readFileSync("./src/features/admin/EnquiriesAdmin.jsx", "utf8");
const staff = readFileSync("./netlify/functions/enquiries.js", "utf8");

// 1. Answered means landed.
{
  const sheet = [{
    Enquiry_Question_ID: 1, Question: "Send us your site plan",
    Kind: "file", Is_Required: true, Sort_Order: 1,
  }];

  if (!missingAnswers(sheet, {}).length) {
    fail("a required document question with nothing against it is not missing");
  }

  /* Chosen, still going up. The answer holds a name and no path. */
  const going = { 1: { fileName: "plan.pdf", path: null } };
  if (!missingAnswers(sheet, going).length) {
    fail("a document still uploading counts as answered, so an enquiry can "
      + "be sent whose answer points at a file that never arrived");
  }

  const landed = { 1: { fileName: "plan.pdf", path: "enquiry/branch-7/x/plan.pdf" } };
  if (missingAnswers(sheet, landed).length) {
    fail("a document that has landed does not count as answered");
  }

  /* And the question in front of somebody obeys the same rule, or
     Next walks past a required document mid-upload. */
  if (!/if \(current\.Kind === "file"\) return !!a\.path;/.test(ui)) {
    fail("Next does not wait for the upload, so a required document question "
      + "can be passed over while the file is still going up");
  }
}

// 2. The file goes to storage, not through the enquiry.
{
  if (/Documents cannot be attached here yet/.test(ui)) {
    fail("the portal still refuses attachments");
  }
  if (!/http\.post\("\/portal\/enquiry-upload"/.test(ui)) {
    fail("nothing asks for an upload slot");
  }
  if (!/method: "PUT", body: file/.test(ui)) {
    fail("the file does not go straight to storage \u2014 in the enquiry's own "
      + "body a large drawing would not arrive at all");
  }
  /* A failed upload clears the answer. One that kept the name would
     look attached on the page and arrive empty. */
  const at = ui.indexOf("async function attachToAnswer");
  const block = at < 0 ? "" : ui.slice(at, ui.indexOf("async function submitEnquiry", at));
  if (!block) fail("there is no upload routine");
  else if (!/\[q\.Enquiry_Question_ID\]: null/.test(block)) {
    fail("a failed upload leaves the file name against the answer, so it "
      + "reads as attached and arrives with nothing");
  }
}

// 3. A path is only yours if it was issued to you.
{
  if (!/what === "enquiry-upload"/.test(portal)) {
    fail("the portal has no endpoint for an enquiry attachment");
  }
  const at = portal.indexOf('what === "enquiry-upload"');
  const block = at < 0 ? "" : portal.slice(at, at + 1200);
  if (!/access\.Branch_ID/.test(block)) {
    fail("the upload path is not keyed on the account's own branch, so one "
      + "company's enquiry could write into another's folder");
  }
  if (/body\?\.path|body\?\.folder/.test(block)) {
    fail("the upload path is taken from the caller");
  }
  /* Random per file, or two uploads of plan.pdf from one branch
     overwrite each other and the path is guessable. */
  if (!/Math\.random\(\)/.test(block)) {
    fail("the path has nothing unique in it, so a second plan.pdf replaces "
      + "the first and any path can be guessed from the branch");
  }

  if (!/function mineOrNull/.test(portal)) {
    fail("nothing checks that a path handed back belongs to the account");
  } else {
    const fn = portal.slice(portal.indexOf("function mineOrNull"),
      portal.indexOf("function mineOrNull") + 700);
    if (!/startsWith\(`enquiry\/branch-\$\{branch\}\/`\)/.test(fn)) {
      fail("the ownership test does not pin the path to the branch folder");
    }
  }
  if (!/Storage_Path: mineOrNull\(a\.filePath, access\)/.test(portal)) {
    fail("the submission stores whatever path it is given \u2014 an enquiry "
      + "could claim another company's document by naming its path");
  }
}

// 4. Staff can open it, and only through the row.
{
  if (!/what === "file"/.test(staff)) {
    fail("staff have no way to open a document somebody attached");
  }
  const at = staff.indexOf('what === "file"');
  const block = at < 0 ? "" : staff.slice(at, at + 1400);
  if (!/createSignedUrl/.test(block)) {
    fail("the document is served by a link that does not expire, and a link "
      + "that never expires is a link that gets forwarded");
  }
  if (!/from\("Enquiry_Answer"\)/.test(block) || !/select\("Storage_Path/.test(block)) {
    fail("the path is not read from the answer row \u2014 taken from the query, "
      + "any signed-in member of staff could mint a link to anything in the "
      + "bucket by typing a path");
  }
  if (!/searchParams\.get\("answer"\)/.test(block)) {
    fail("the endpoint is not addressed by the answer");
  }
  if (!/openFile\(a\)/.test(admin)) {
    fail("the enquiry panel shows no way to open an attachment");
  }
  if (!/a\.Storage_Path &&/.test(admin)) {
    fail("an Open button shows against answers that have no document");
  }
}

// 5. The answer still reads without opening anything.
{
  if (!/q\.Kind === "file" \? \(a\?\.fileName \?\? null\)/.test(ui)) {
    fail("a document answer is not stored as its file name, so an enquiry "
      + "reads as blank against that question until somebody opens the file");
  }
  /* And the list of what has been answered does not print an object. */
  if (!/answers\[q\.Enquiry_Question_ID\]\?\.fileName/.test(ui)) {
    fail("the answered-so-far list prints [object Object] for a document");
  }
}

// 6. The columns are added, additively.
{
  let sql = "";
  try {
    sql = readFileSync("./supabase/migrations/0230_enquiry_attachment.sql", "utf8");
  } catch { /* reported below */ }

  if (!sql) fail("0230 is missing, so there is nowhere to record the file");
  else {
    for (const col of ["Storage_Path", "File_Name"]) {
      if (!new RegExp(`ADD COLUMN IF NOT EXISTS "${col}"`).test(sql)) {
        fail(`0230 does not add ${col}`);
      }
    }
    /* Guarded and additive. Enquiry_Answer was built in the SQL
       editor and the only migration naming it describes the
       duplicate design that was written by mistake — so this one
       must assert nothing about what else is on the table. */
    if (/DROP COLUMN|CREATE TABLE "Enquiry_Answer"/.test(sql)) {
      fail("0230 does more than add two columns to a table whose shape the "
        + "migrations folder does not reliably record");
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "An enquiry takes a document: straight to storage, and only its own.");
process.exit(bad ? 1 : 0);
