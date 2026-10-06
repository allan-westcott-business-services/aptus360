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
import { readFileSync, readdirSync } from "node:fs";
import { siteLabel } from "./src/features/admin/siteLabel.js";

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

/* ── Columns a project does not have ──

   `Project_Name` and `Project_Number` were invented early and neither
   exists. A project is known by its SITE NAME and by Display_Ref.

   It has now bitten twice, in two different ways, which is why this is
   a check rather than another comment:

     READ, it is silent. `project?.Project_Name ?? ""` is undefined, the
     fallback takes over, and the Aptus Calc Sheet went out with an
     empty scheme title on every sheet without anybody noticing.

     SELECTED, it takes the whole call down. PostgREST refuses a select
     over one unknown column, so portal-orgs.js answered "column
     Project.Project_Name does not exist" and Portal Accounts lost both
     dropdowns — organisations included, which have nothing to do with
     projects and came back from the same call.

   Comments are stripped first, so the files explaining the fault do not
   trip it. */
{
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(full); }
      else if (/\.(js|jsx)$/.test(e.name)) files.push(full);
    }
  };
  walk("./src");
  walk("./netlify");
  for (const f of files) {
    const body = strip(readFileSync(f, "utf8"));
    for (const dead of ["Project_Name", "Project_Number"]) {
      if (new RegExp(`\\b${dead}\\b`).test(body)) {
        fail(`${f} uses Project.${dead}, which is not a column \u2014 `
          + "read it goes silently undefined, selected it refuses the whole call");
      }
    }
  }
}

/* And a site always reads as something somebody can pick between. */
{
  const L = (o) => siteLabel(o);
  if (L({ Display_Ref: "2607.014", Site_Name: "Cedar Trees" })
    !== "2607.014 \u2014 Cedar Trees") {
    fail("a site with both a ref and a name does not show both, so two "
      + "schemes of the same name are one line twice");
  }
  if (L({ Project_Ref: "2607.014", Site_Name: "Cedar Trees" })
    !== "2607.014 \u2014 Cedar Trees") {
    fail("Project_Ref is not used where Display_Ref has not been generated");
  }
  if (L({ Display_Ref: "2607.014" }) !== "2607.014") fail("a ref alone does not show");
  if (L({ Site_Name: "Cedar Trees" }) !== "Cedar Trees") fail("a name alone does not show");
  /* The one that matters: never a blank option. This picker decides
     what somebody outside the business may see, and two blank lines
     are a choice made by guessing. */
  if (L({ Project_ID: 34 }) !== "Project 34") {
    fail("a site with neither a ref nor a name renders a blank option");
  }
  if (!L({}).trim()) fail("an empty row renders a blank option");
}

console.log(bad ? `\n${bad} problem(s)`
  : "What the create form asks for, the project can change afterwards.");
process.exit(bad ? 1 : 0);
