/* Date Received, on the project's Details tab.

   It is set when a project is added and was then invisible: a date
   typed wrongly on the way in could never be corrected. That matters
   more than most fields, because it is the date the KPI clock runs
   from — the project's own record of when the work arrived.

   Held here because a field that exists on the Add form and nowhere
   else is an easy thing to reintroduce: somebody tidying the top of
   the Details form has three references to arrange and no reason to
   know that one of them is load-bearing. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const form = readFileSync(
  "./src/features/projects/ProjectDetailsForm.jsx", "utf8");

// 1. The field is there, and is editable.
{
  if (!/set\("Date_Received"\)/.test(form)) {
    fail("the Details tab cannot set Date Received, so a date typed wrongly "
      + "when the project was added can never be corrected");
  }
  if (!/<span>Date Received<\/span>/.test(form)) {
    fail("the field has no label a reader would recognise");
  }
  /* A date input, like every other date in this form. A free-text date
     is a date somebody types as 03/04 and nobody can order. */
  const at = form.indexOf('<span>Date Received</span>');
  const field = at >= 0 ? form.slice(at, at + 300) : "";
  if (!/type="date"/.test(field)) {
    fail("Date Received is not a date input");
  }
  /* And an empty string rather than null: a date input given null
     warns, and then refuses to be typed into. */
  if (!/value=\{f\.Date_Received \|\| ""\}/.test(field)) {
    fail("the value can be null, which makes the input read-only in every "
      + "browser and warns in the console");
  }
}

// 2. To the LEFT of the AP number, at the top.
//
//    First of the three because it is the first thing that happened:
//    an enquiry arrives, and the references follow when they are
//    issued.
{
  const row = (() => {
    const at = form.indexOf('<div className="ref-row">');
    return at >= 0 ? form.slice(at, form.indexOf("</div>", at)) : "";
  })();
  if (!row) {
    fail("the reference row cannot be found where it was \u2014 this check "
      + "needs re-anchoring, not deleting");
  } else {
    const d = row.indexOf("Date Received");
    const ap = row.indexOf("AP Number");
    if (d < 0) fail("Date Received is not in the reference row at the top");
    else if (ap >= 0 && d > ap) {
      fail("Date Received is drawn after the AP number rather than to its "
        + "left");
    }
  }
}

// 3. And the server will actually store it.
{
  const fn = readFileSync("./netlify/functions/projects.js", "utf8");
  if (!/"Date_Received"/.test(fn)) {
    fail("Date_Received is not writable by the projects endpoint, so the "
      + "field saves silently and changes nothing");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Date Received sits left of the AP number, and saves.");
process.exit(bad ? 1 : 0);
