/* A project's developer, and the two branch tables behind it.

   Customer and Customer_Branch are superseded by the Organisation
   model. Nothing is migrated — 0154 and 0198 are additive — so both
   tables are live at once: everything recorded before them names a
   Customer_Branch, everything since names an Organisation_Branch, and a
   record uses one or the other.

   That is the shape this file exists for. A reader that knows about
   only one table does not fail; it shows an em dash where a name goes,
   or offers a list with the new ones missing from it, and both look
   like data somebody has not filled in. Three screens read this and all
   three read the old table only, which is how a developer added under
   an Organisation came to be invisible on the tab that manages
   developers. */

import { readFileSync } from "node:fs";
import { developerBranchName, branchChoiceOf, branchColumnsFor }
  from "./src/features/stakeholders/developerBranch.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const lookups = {
  branches: [
    { Branch_ID: 4, Branch_Name: "Warrington", Branch_Dropdown: "Barratt \u2014 Warrington", Customer_ID: 2 },
  ],
  /* Branch_Dropdown as the database actually composes it: the company
     and the branch together, in one string, so every screen says it the
     same way. The fixture used to hold a bare "Chester", which is what
     Branch_NAME looks like \u2014 and testing against a shape the data does
     not have is how a check comes to defend the wrong behaviour.

     Branch 7 has no dropdown form on purpose. That is the case the
     organisation prefix exists for, and the only one. */
  orgBranches: [
    { Organisation_Branch_ID: 4, Organisation_ID: 90, Branch_Name: "Chester",
      Branch_Dropdown: "Redrow Homes (Chester)" },
    { Organisation_Branch_ID: 7, Organisation_ID: 91, Branch_Name: "Leeds" },
  ],
  developerBranches: [
    { Organisation_Branch_ID: 4, Organisation_ID: 90, Branch_Name: "Chester",
      Branch_Dropdown: "Redrow Homes (Chester)", Organisation_Name: "Redrow Homes" },
    { Organisation_Branch_ID: 7, Organisation_ID: 91, Branch_Name: "Leeds",
      Organisation_Name: "Storey Homes" },
  ],
};

/* 1. The ids collide, and that is the point.

   Customer_Branch 4 and Organisation_Branch 4 are different companies.
   A reader that takes the number without the table names the wrong
   one — silently, and on a document that goes to a customer. */
{
  const onOrg = { Project_Developer_ID: 1, Organisation_Branch_ID: 4 };
  const onCust = { Project_Developer_ID: 2, Branch_ID: 4 };

  const a = developerBranchName(onOrg, lookups);
  const b = developerBranchName(onCust, lookups);
  if (a === b) fail("branch 4 in each table resolves to the same name");
  if (!/Redrow/.test(a || "")) fail(`an organisation branch resolved to "${a}"`);
  if (!/Barratt/.test(b || "")) fail(`a customer branch resolved to "${b}"`);
}

/* 2. A developer on an organisation branch has a name.

   It showed as an em dash: the row was there, its plots were counted,
   and the thing it was called was blank. */
{
  const d = { Organisation_Branch_ID: 7 };
  const name = developerBranchName(d, lookups);
  if (!name) fail("a developer on an organisation branch has no name");
  /* No dropdown form on this one, so the organisation is prefixed \u2014
     "Leeds" alone names no company. */
  else if (name !== "Storey Homes (Leeds)") {
    fail(`expected "Storey Homes (Leeds)", got "${name}"`);
  }
}

/* 2b. And the company is never said twice.

   Branch_Dropdown already reads "Redrow Homes (Chester)". Three screens
   prefixed the organisation in front of it and produced "Redrow Homes
   \u2014 Redrow Homes (Chester)".

   The prefix was written for the other case, where the branch has only
   a bare name, and applied to both. */
{
  const name = developerBranchName({ Organisation_Branch_ID: 4 }, lookups);
  if (name !== "Redrow Homes (Chester)") {
    fail(`a branch with a dropdown form resolved to "${name}"`);
  }
  const twice = (name.match(/Redrow Homes/g) || []).length;
  if (twice > 1) fail(`the company is named ${twice} times in "${name}"`);

  /* And the composition is written once. Three screens each built this
     string their own way, which is how they came to be wrong together
     and would be how they came to be fixed apart. */
  for (const f of [
    "src/features/stakeholders/DevelopersSection.jsx",
    "src/features/projects/AddProjectForm.jsx",
  ]) {
    const src = readFileSync(f, "utf8");
    if (/\$\{b\.Organisation_Name\} \\u2014/.test(src) || /\$\{b\.Organisation_Name\} —/.test(src)) {
      fail(`${f} still composes the branch label itself`);
    }
    if (!/branchLabelOf\(b, b\.Organisation_Name\)/.test(src)) {
      fail(`${f} does not use the shared branch label`);
    }
  }
}

// 3. Nothing to name is null, not a guess and not a crash.
{
  for (const d of [null, {}, { Branch_ID: null, Organisation_Branch_ID: null }]) {
    if (developerBranchName(d, lookups) !== null) {
      fail("a developer naming no branch resolved to something");
    }
  }
  /* A branch that has been deactivated since. Null, so the caller shows
     its own dash — not the id, which reads as a name to nobody. */
  if (developerBranchName({ Organisation_Branch_ID: 999 }, lookups) !== null) {
    fail("a missing branch resolved to something");
  }
  if (developerBranchName({ Organisation_Branch_ID: 7 }, {}) !== null) {
    fail("an empty lookup set resolved to something");
  }
}

/* 4. A save always writes both columns.

   Writing only the chosen one leaves the other holding what it held
   before — on an edit that is the previous branch, in the other table,
   and the check constraint refuses the update. The refusal is the good
   case: without the constraint it would be a developer naming two
   branches, which is a question nobody can answer later. */
{
  const org = branchColumnsFor("o7");
  if (org.Organisation_Branch_ID !== 7) fail("an organisation choice did not write its id");
  if (!("Branch_ID" in org) || org.Branch_ID !== null) {
    fail("an organisation choice does not clear Branch_ID");
  }

  const cust = branchColumnsFor("c4");
  if (cust.Branch_ID !== 4) fail("a customer choice did not write its id");
  if (cust.Organisation_Branch_ID !== null) {
    fail("a customer choice does not clear Organisation_Branch_ID");
  }

  /* Empty is nothing chosen, not branch nought. Number("") is 0, and 0
     is a perfectly valid-looking id to write into a foreign key. */
  for (const empty of ["", null, undefined, "o", "nonsense"]) {
    const r = branchColumnsFor(empty);
    if (r.Branch_ID !== null || r.Organisation_Branch_ID !== null) {
      fail(`"${empty}" resolved to a branch id`);
    }
  }
}

// 5. And the round trip holds, so an edit reloads onto its own row.
{
  for (const d of [{ Organisation_Branch_ID: 7 }, { Branch_ID: 4 }]) {
    const back = branchColumnsFor(branchChoiceOf(d));
    if (Number(back.Organisation_Branch_ID ?? -1) !== Number(d.Organisation_Branch_ID ?? -1)
      || Number(back.Branch_ID ?? -1) !== Number(d.Branch_ID ?? -1)) {
      fail(`a ${d.Branch_ID ? "customer" : "organisation"} branch did not survive the round trip`);
    }
  }
  if (branchChoiceOf({}) !== "") fail("a developer with no branch has a choice value");
}

/* 6. Creating a project creates its main developer.

   Project.Branch_ID and Customer_ID are a cached copy of the main
   developer, kept by sync_project_main_developer(). The form wrote the
   cache and nothing behind it, so a project came out naming a branch
   with no developer record — "Developers 0" on the Details tab of a
   project that plainly had one. */
{
  const fn = readFileSync("netlify/functions/projects.js", "utf8");
  const post = fn.slice(fn.indexOf('req.method === "POST"'), fn.indexOf('req.method === "PATCH"'));

  if (!/Project_Developer/.test(post)) {
    fail("creating a project does not create its developer");
  }
  if (!/Is_Main:\s*true/.test(post)) {
    fail("the developer created with a project is not marked as the main one");
  }
  /* The failure has to be reported. A project created without its
     developer is the state this exists to prevent, and swallowing the
     error leaves exactly that behind, quietly. */
  if (!/throw new Error\(`Project /.test(post)) {
    fail("a failed developer insert is swallowed rather than reported");
  }
  /* The code comes off the branch here too, not from whatever the form
     happened to send. Creating a project and adding the same developer
     on Stakeholders must produce the same code — two routes to one
     record that disagree is the shape of fault 13. */
  if (!/Developer_Code:\s*branch\?\.Developer_Code/.test(post)) {
    fail("the developer created with a project does not take the branch's code");
  }
  if (!/Organisation_ID:\s*branch\?\.Organisation_ID/.test(post)) {
    fail("the developer created with a project does not record its organisation");
  }

  /* Named on the column list, or it is neither saved nor returned —
     recurring fault 4. */
  const dev = readFileSync("netlify/functions/developers.js", "utf8");
  if (!/Organisation_Branch_ID/.test(dev)) {
    fail("the developers endpoint does not select Organisation_Branch_ID");
  }
}

/* 7. The pickers offer housing developers, and only their branches.

   Every branch in the register was offered before — an IDNO, a council
   and a fire authority are all in it, and none of them is whose site
   this is. */
{
  const form = readFileSync("src/features/projects/AddProjectForm.jsx", "utf8");
  if (!/developerBranches/.test(form)) {
    fail("the project form does not use the developer-scoped branch list");
  }
  if (/lookups\.branches\.map/.test(form)) {
    fail("the project form still offers every Customer_Branch");
  }
  const section = readFileSync("src/features/stakeholders/DevelopersSection.jsx", "utf8");
  if (!/developerBranches/.test(section)) {
    fail("the Stakeholders tab does not use the developer-scoped branch list");
  }
  if (!/developerBranchName/.test(section)) {
    fail("the Stakeholders tab still names branches from one table only");
  }
  const details = readFileSync("src/features/projects/ProjectDetailsForm.jsx", "utf8");
  if (!/developerBranchName/.test(details)) {
    fail("the Details tab still names developers from one table only");
  }
}

/* 8. The developer role, and saying when it is not there.

   'customer' — labelled "Customer (Housing Developer)". The key was
   matched on the label until the catalogue could be read, because
   Organisation_Type is seeded by one of the migrations run and never
   committed. The label match worked by accident and a rename in Admin
   would have emptied the dropdown silently.

   The catalogue is still consulted, and that is the part to protect: an
   empty dropdown has two causes — no such role, and no developer with a
   branch — which look identical and need different people to fix them.
   That is fault 22. */
{
  const lk = readFileSync("netlify/functions/lookups.js", "utf8");
  if (!/developerBranches/.test(lk)) fail("lookups does not serve developerBranches");
  if (!/developerBranches_error/.test(lk)) {
    fail("an absent developer role is not reported \u2014 it reads as no developers");
  }
  if (!/DEVELOPER_ROLE\s*=\s*"customer"/.test(lk)) {
    fail("the developer role key is not 'customer' \u2014 the one Organisation_Type holds");
  }
  if (!/organisationTypes/.test(lk)) {
    fail("lookups does not read the role catalogue, so a renamed role goes unnoticed");
  }
  /* The branch's own code travels with it, or the Stakeholders tab has
     nothing to default from. */
  if (!/Organisation_Branch"\)\.select\("[^"]*Developer_Code/.test(lk)) {
    fail("orgBranches does not select Developer_Code");
  }
}

/* 8b. The developer code comes off the branch.

   It was defaulted from the customer, so every branch of one
   housebuilder got the same code — Anwyl Lancashire and Anwyl Wales
   both came out AH, which is live in the data. The code prefixes plot
   numbers where a site has more than one developer, so two branches of
   one company on one site produced identical prefixes. */
{
  const section = readFileSync("src/features/stakeholders/DevelopersSection.jsx", "utf8");
  if (/Customer_Code/.test(section)) {
    fail("the developer code is still defaulted from the customer, not the branch");
  }
  if (!/b\?\.Developer_Code/.test(section)) {
    fail("the developer code is not defaulted from the chosen branch");
  }
  /* Only where nothing has been typed: a code entered for this project
     says something the branch does not know. */
  if (!/d\.Developer_Code \|\| b\?\.Developer_Code/.test(section)) {
    fail("the branch code overwrites a code already typed");
  }
}

// 9. The migration exists and is additive.
{
  const sql = readFileSync("supabase/migrations/0198_developer_organisation_branch.sql", "utf8");
  if (!/ADD COLUMN IF NOT EXISTS "Organisation_Branch_ID"/.test(sql)) {
    fail("0198 does not add the column");
  }
  if (!/CHECK \("Branch_ID" IS NULL OR "Organisation_Branch_ID" IS NULL\)/.test(sql)) {
    fail("0198 does not make one-or-the-other a rule");
  }
  if (/DROP COLUMN|ALTER COLUMN "Branch_ID"/.test(sql)) {
    fail("0198 touches Branch_ID \u2014 every developer already recorded points at it");
  }
}

/* ── The Developer column on the Plots tab ──

   It reads Project_Developer_ID, and so do the sort and the filter. A
   plot with none shows an em dash — including on a site with exactly
   one developer, where the answer is not in doubt: there is one, and
   every plot is theirs.

   So the sole developer is filled in as the plots load. Derived, not
   written: nobody chose it, and the moment a second developer is added
   on Stakeholders the question becomes real and each plot has to be
   assigned. */
{
  const tab = readFileSync("src/features/plots/PlotsTab.jsx", "utf8");

  // 10. The sole developer is inherited.
  if (!/devRows\.length === 1 \? devRows\[0\]\.Project_Developer_ID : null/.test(tab)) {
    fail("a project with one developer leaves every plot showing an em dash");
  }
  /* Into Project_Developer_ID itself, so the column, the sort and the
     filter cannot disagree with one another. Painting the cell alone
     would leave a plot that reads as assigned, sorts as unassigned and
     vanishes under its own filter. */
  if (!/Project_Developer_ID: only/.test(tab)) {
    fail("the inherited developer is not put where the sort and filter read it");
  }

  /* 11. And it is marked as inherited.

     A name that looks assigned and is not would be a plot nobody has
     thought about, dressed up as one somebody has. */
  if (!/_devInherited/.test(tab)) {
    fail("an inherited developer is indistinguishable from an assigned one");
  }
  if (!/dev-inherited/.test(tab)) {
    fail("the inherited developer has no style, so it reads as chosen");
  }

  /* 12. Assigning is offered wherever there is a developer at all.

     It was scoped to two or more, which left a contradiction: the
     Plots tab shows the sole developer against every plot, but that
     name is INHERITED and Project_Developer_ID is still null. The
     Stakeholders and Details tabs count plots from the database, so
     they read "0 plots" for a developer this tab showed against all of
     them.

     Two screens disagreeing about one fact — one reading what is
     stored, the other what is displayed. The dropdown is what lets
     somebody make the inherited answer real. */
  if (!/developers\.length > 0 && \(\s*<select value={bulkDev}/.test(tab)) {
    fail("a single-developer project cannot assign its plots, so the plot counts "
      + "on Stakeholders stay at zero while this tab shows the developer on every plot");
  }
  if (!/assignPlots\(projectId, selected/.test(tab)) {
    fail("the Plots tab cannot assign plots to a developer");
  }

  /* 13. And the plots nobody has assigned are counted, on those
     projects only. Inherited ones do not count: on a single-developer
     project every plot has an answer. */
  if (!/p\.Project_Developer_ID == null/.test(tab)) {
    fail("nothing counts the plots with no developer");
  }
  if (!/developers\.length > 1 && unassigned\.length > 0/.test(tab)) {
    fail("the unassigned notice is not scoped to projects with more than one developer");
  }

  /* 14. Names come from the Stakeholders record, either branch table.

     This page read lookups.branches, which was emptied on 26 Aug, so
     every developer name here had become an em dash. */
  if (!/developerBranchName\(d, lookups\)/.test(tab)) {
    fail("the Plots tab does not name developers the way the other tabs do");
  }
}

console.log(bad === 0
  ? "  ok  Project developers behave (either branch table named, main one created with the project)."
  : `\n${bad} problem(s)`);
process.exit(bad ? 1 : 0);
