/* What the create form asks for, a project can change afterwards.

   BDD / KAM, Estimator and KPI date are all asked for when a project
   is made \u2014 the first two are required \u2014 and none of them appeared
   anywhere once it existed. A project created with the wrong
   estimator could not be corrected without the database.

   Asked for: the two people in a new "Aptus Resources" section on the
   Stakeholder tab, beside the other people on the job; the KPI date in
   the Quote section of the Details tab, to the left of Date sent,
   which is the date it is measured against.

   The broader rule this holds: every field the create form writes has
   somewhere it can be edited. Checked against the create form's own
   REQUIRED list, so a field added there and forgotten here is caught. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const create = readFileSync("./src/features/projects/AddProjectForm.jsx", "utf8");
const details = readFileSync("./src/features/projects/ProjectDetailsForm.jsx", "utf8");
const stake = readFileSync("./src/features/stakeholders/StakeholderTab.jsx", "utf8");
const api = readFileSync("./netlify/functions/projects.js", "utf8");

// 1. KPI date sits in the Quote section, left of Date sent.
{
  const quote = details.indexOf('<Section title="Quote">');
  const end = details.indexOf("</Section>", quote);
  const block = quote < 0 ? "" : details.slice(quote, end);
  if (!block) fail("the details form has no Quote section");
  else {
    const kpi = block.indexOf('label="KPI date"');
    const sent = block.indexOf('label="Date sent"');
    if (kpi < 0) fail("the KPI date cannot be changed after the project is made");
    else if (sent >= 0 && kpi > sent) {
      fail("the KPI date is to the right of Date sent \u2014 asked for on the left, "
        + "where it reads as the date the quote was due");
    }
    if (!/set\("KPI_Date"\)/.test(block)) fail("the KPI date field does not write KPI_Date");
  }
}

// 2. BDD / KAM and Estimator in Aptus Resources on the Stakeholder tab.
{
  const at = stake.indexOf('title="Aptus Resources"');
  if (at < 0) fail("there is no Aptus Resources section on the Stakeholder tab");
  else {
    const block = stake.slice(at, stake.indexOf("</Section>", at));
    for (const [col, role] of [["BDD_KAM_ID", "BDD_KAM"], ["Estimator_ID", "ESTIMATOR"]]) {
      if (!new RegExp(`staff\\.${col}`).test(block)) {
        fail(`${col} is not shown in Aptus Resources`);
      }
      /* The same people the create form offers, by role. A picker
         listing everybody would let a project be given an estimator
         who is not one. */
      if (!new RegExp(`peopleWithRole\\(lookups\\?\\.people, ROLE\\.${role}\\)`).test(block)) {
        fail(`${col} is not limited to people with the ${role} role`);
      }
    }
  }
  /* Saved on its own button, so saving the people does not also save
     half-typed authorities, and the reverse. */
  if (!/async function saveStaff/.test(stake)) fail("Aptus Resources has no save of its own");
  const save = stake.slice(stake.indexOf("async function saveStaff"), stake.indexOf("async function saveAuthorities"));
  if (!/BDD_KAM_ID: staff\.BDD_KAM_ID \|\| null/.test(save)
    || !/Estimator_ID: staff\.Estimator_ID \|\| null/.test(save)) {
    fail("saving Aptus Resources does not write both people");
  }
  if (/Fire_Service_ID/.test(save)) {
    fail("saving Aptus Resources also writes the authorities");
  }
}

// 3. Every field the create form requires is editable somewhere afterwards.
{
  const required = [...(create.match(/const REQUIRED = \[([\s\S]*?)\];/) || ["", ""])[1]
    .matchAll(/\["([A-Za-z_]+)"/g)].map((m) => m[1])
    /* The branch is chosen as Branch_Choice and lands on the
       developer record, which the Stakeholder tab's developers
       section edits. */
    .filter((k) => k !== "Branch_Choice");
  const editable = details + stake;
  for (const k of required) {
    if (!new RegExp(`["'.]${k}\\b|${k}:`).test(editable)) {
      fail(`${k} is required when a project is made and cannot be changed afterwards`);
    }
  }
  /* And the columns are loaded, or the fields open empty and saving
     writes the empty value back. */
  for (const k of ["KPI_Date", "BDD_KAM_ID", "Estimator_ID"]) {
    if (!new RegExp(`"${k}"`).test(api)) fail(`${k} is not loaded with the project`);
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "What the create form asks for, the project can change afterwards.");
process.exit(bad ? 1 : 0);
