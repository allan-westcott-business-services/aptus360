/* The enquiry queue — what a developer sent, and the decision on it.

   Three properties worth holding, each of which fails quietly:

     1. It is a STAFF endpoint. A portal account reaching it would see
        every developer's enquiries, which is the whole business's
        pipeline.
     2. An enquiry is decided ONCE. Deciding a decided one overwrites a
        colleague's answer and the date they gave it, and nobody would
        know.
     3. An answer is read with the question AS IT WAS WORDED. Joining
        back to the live questions would show today's wording against
        last spring's answers — a quietly wrong account of what
        somebody actually said. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const fn = readFileSync("./netlify/functions/enquiries.js", "utf8");
const ui = readFileSync("./src/features/admin/EnquiriesAdmin.jsx", "utf8");
const code = fn.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// 1. Staff only.
{
  if (!/export default withAuth\(/.test(code)) {
    fail("the enquiry endpoint is not behind withAuth, so anybody signed "
      + "in to the portal can read the whole pipeline");
  }
  /* And the decider is the signed-in user, taken from the argument
     withAuth actually passes. Read off the context it is undefined,
     and every decision records nobody. */
  if (!/function handler\(req, context, user\)/.test(code)) {
    fail("the handler does not take the user withAuth passes");
  }
  if (!/Decided_By: user\?\.email/.test(code)) {
    fail("the decision does not record who made it");
  }
  if (/context\?\.user/.test(code)) {
    fail("the user is read off the context, where withAuth does not put "
      + "it \u2014 every decision would be recorded against nobody");
  }
}

// 2. Decided once.
{
  if (!/sub\.Status === "accepted" \|\| sub\.Status === "declined"/.test(code)) {
    fail("an enquiry already decided can be decided again, overwriting a "
      + "colleague's answer and the date they gave it");
  }
  if (!/409/.test(code)) {
    fail("a second decision is not refused with a conflict, so the screen "
      + "cannot tell the difference from a failure");
  }
  /* Only the two words are decisions. */
  if (!/decision !== "accepted" && decision !== "declined"/.test(code)) {
    fail("any word can be written as a decision, including one the status "
      + "constraint would refuse");
  }
}

// 3. Answers are read as they were answered.
{
  if (/from\("Enquiry_Question"\)/.test(code)) {
    fail("the queue joins back to the live questions, so an old enquiry is "
      + "shown against today's wording rather than what was asked");
  }
  if (!/Question_Text/.test(code) || !/Question_Text/.test(ui)) {
    fail("the question as it was worded is not carried through to the "
      + "screen");
  }
}

// 4. Accepting LINKS a project; it does not invent one.
//
//    Making one needs a reference, a customer and a branch decided by
//    rules this endpoint does not know, and a wrong project is worse
//    than a missing link.
{
  if (/from\("Project"\)[\s\S]{0,80}insert/.test(code)) {
    fail("accepting an enquiry creates a project, guessing at fields it "
      + "has no business deciding");
  }
  if (!/patch\.Project_ID = Number\(body\.projectId\)/.test(code)) {
    fail("an accepted enquiry cannot be linked to the project it became");
  }
}

// 5. The screen exists, is registered, and carries its own styling.
{
  /* ── In Business Development, not Admin ──

     An enquiry is work not yet won, which is what that section is
     for. Admin sets up the SHEET \u2014 the questions asked \u2014 and that is
     a different job done by different people. */
  const nav = readFileSync("./src/lib/navigation.js", "utf8");
  if (!/\{ view: "enquiries", label: "Enquiries", built: true \}/.test(nav)) {
    fail("Enquiries is not a built item in Business Development, so a "
      + "submitted enquiry is visible only in the database");
  }
  const app = readFileSync("./src/App.jsx", "utf8");
  if (!/view === "enquiries"/.test(app)) {
    fail("nothing renders the enquiries view");
  }
  const tables = readFileSync("./src/lib/adminTables.js", "utf8");
  if (/special: "enquiries"/.test(tables)) {
    fail("the queue is in the admin menu as well, so there are two places "
      + "to look for the same work");
  }
  /* Its own CSS: a class from another admin screen's injected
     stylesheet does not exist unless that screen is mounted, which has
     caught this codebase four times. */
  if (!/const CSS = `/.test(ui)) {
    fail("the screen has no stylesheet of its own");
  }
  if (/className="gs-grid"/.test(ui)) {
    fail("the screen borrows the GIS Styles admin's grid, which is not "
      + "there unless that screen is");
  }
  /* Waiting work sorts first: the queue is for working, and the
     archive is for looking things up. */
  if (!/submitted: 0/.test(code)) {
    fail("decided enquiries are not sorted after the waiting ones");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The queue is staff-only, decided once, and read as it was answered.");
process.exit(bad ? 1 : 0);
