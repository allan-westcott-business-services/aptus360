/* The Customer column on the projects list.

   It read `Customer_Name` off the old `Customer` table — "Anwyl
   Homes", the same on every Anwyl scheme in the country. Which
   OFFICE the work belongs to is what anybody scanning the column
   wants, and that is the branch: "Anwyl Homes (Lancashire)".

   ── And the old table is empty ──

   `Customer` and `Customer_Branch` were emptied and their rows
   deleted on 26 Aug, every project and developer repointed at the
   matching `Organisation_Branch` first. So `Customer_ID` is null on
   everything made since, and the column was going blank on new work
   while still looking correct on old.

   That is the shape worth remembering: a column reading a retired
   table does not fail, it fades \u2014 right on the rows that predate the
   change and empty on the ones that matter. */
import { readFileSync } from "node:fs";
import { branchLabelOf } from "./src/features/stakeholders/developerBranch.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const list = readFileSync("./src/features/projects/ProjectsList.jsx", "utf8");

// 1. The label reads "Organisation (Branch)".
{
  const cases = [
    [{ Branch_Name: "Lancashire", Branch_Dropdown: null }, "Anwyl Homes",
      "Anwyl Homes (Lancashire)"],
    /* A branch with a dropdown form of its own already carries the
       organisation. Prefixing gave "Anwyl Homes \u2014 Anwyl Homes
       (Lancashire)". */
    [{ Branch_Dropdown: "Anwyl Homes (Lancashire)" }, "Anwyl Homes",
      "Anwyl Homes (Lancashire)"],
    /* Nothing to say is null, not "(undefined)". */
    [{ Branch_Name: null, Branch_Dropdown: null }, "Anwyl Homes", null],
  ];
  for (const [b, org, want] of cases) {
    const got = branchLabelOf(b, org);
    if (got !== want) fail(`branchLabelOf gave "${got}", wanted "${want}"`);
  }
}

// 2. The column reads the branch, not the retired table.
{
  const at = list.indexOf('key: "cust"');
  const col = at < 0 ? "" : list.slice(at, list.indexOf("},", at));
  if (!col) fail("there is no Customer column");
  else {
    if (/src: "customers"/.test(col) || /Customer_ID/.test(col)) {
      fail("the Customer column still reads the Customer table, which was "
        + "emptied on 26 Aug \u2014 the cell is blank on every project made since");
    }
    if (!/src: "developerBranches"/.test(col)) {
      fail("the Customer column does not read the branch list");
    }
    /* Matched on the branch, however it is reached — case 3 holds it
       to reading the Stakeholder tab first and the cache second. */
    if (!/Organisation_Branch_ID/.test(col)) {
      fail("the column filters on something other than the project's branch");
    }
    if (!/labelOf: \(b\) => branchLabelOf\(b, b\.Organisation_Name\)/.test(col)) {
      fail("the column does not compose its text, so it shows a branch name "
        + "with no organisation in front of it");
    }
  }
}

// 3. It reads the Stakeholder tab, not the project's cache.
{
  /* `Project.Organisation_Branch_ID` is a cached copy of the main
     developer kept by a trigger, and it drifts: project 25 read
     Anwyl Homes (Lancashire) with Taylor Wimpey (North West) on its
     Stakeholder tab. A cached copy that nothing checks is the same
     fault as the calc sheet's stored meter count and the link box's
     stored load \u2014 three in one week.

     The cache stays as the FALLBACK, for rows that predate the
     developer records. Where the two disagree the Stakeholder tab
     wins, because that is where somebody typed it. */
  const at = list.indexOf('key: "cust"');
  const col = at < 0 ? "" : list.slice(at, list.indexOf("},", at + 200));
  if (!/mainDeveloper\?\.Organisation_Branch_ID/.test(col)) {
    fail("the Customer column reads the project's cached branch rather than "
      + "the developer on the Stakeholder tab, so a drifted cache names the "
      + "wrong company");
  }
  if (!/\?\? p\.Organisation_Branch_ID/.test(col)) {
    fail("the cache is not kept as a fallback, so a project with no "
      + "developer record shows nothing at all");
  }

  const api = readFileSync("./netlify/functions/projects.js", "utf8");
  if (!/Project_Developer\(Project_Developer_ID,Organisation_Branch_ID,Branch_ID,Is_Main\)/.test(api)) {
    fail("the list does not fetch the developers, so there is nothing for "
      + "the column to read");
  }
  if (!/devs\.find\(\(d\) => d\.Is_Main\) \?\? null/.test(api)) {
    fail("the main developer is not picked by Is_Main \u2014 falling back to the "
      + "first would name a company nobody chose on a project with three");
  }
}

// 4. The customer projects page groups by the same branch.
{
  /* It grouped on `Project.Branch_ID` and listed `lookups.branches`,
     which are Customer_Branch rows. Both retired on 26 Aug, so every
     project made since fell into "No branch set" under a list of
     branches that no longer exist — the same fade as the Customer
     column, on the page whose whole job is grouping by customer.

     Two screens disagreeing about whose project it is would be worse
     than either being wrong, so it reads in the same order: the
     Stakeholder tab first, the project's cache second. */
  const page = readFileSync("./src/features/customers/CustomerProjectsPage.jsx", "utf8");
  /* In code, not in the comment that explains why it was taken out
     — the first run of this case failed on its own explanation. */
  const code = page.replace(/\/\*[\s\S]*?\*\//g, "");
  if (/lookups\.branches/.test(code)) {
    fail("the customer projects page still lists Customer_Branch rows, which "
      + "were deleted on 26 Aug");
  }
  if (!/lookups\.developerBranches/.test(code)) {
    fail("the customer projects page does not list organisation branches");
  }
  if (!/mainDeveloper\?\.Organisation_Branch_ID/.test(page)) {
    fail("the customer projects page groups on the project's cached branch "
      + "rather than the developer on the Stakeholder tab");
  }
  if (!/branchLabelOf\(b, b\.Organisation_Name\)/.test(page)) {
    fail("the page names a branch differently from the projects list");
  }
}

// 5. The filter list says what the cells say.
{
  /* A dropdown offering "Lancashire" against cells reading "Anwyl
     Homes (Lancashire)" is two names for one thing on one screen. */
  if (!/if \(c\.labelOf\) \{/.test(list)) {
    fail("the filter list does not compose its labels");
  }
  /* Both places the filter reads a label: the row in the list and
     the summary on the button when one is chosen. Testing that the
     fallback appears SOMEWHERE passed with one of the two still
     reading `col.labelKey` and rendering nothing. */
  const reads = (list.match(/col\.labelKey \?\? "__label"/g) || []).length;
  if (reads < 2) {
    fail(`${reads} of the filter's two label reads fall back to the composed `
      + "one \u2014 the other renders nothing for a column that has no labelKey");
  }
  /* Sorted by what is shown, not by the order the branches came back
     in: a list of offices is scanned alphabetically. */
  if (!/localeCompare/.test(list)) {
    fail("the branch filter list is unsorted");
  }
}

// 6. And the display path uses it.
{
  if (!/c\.labelOf\s*\n?\s*\? labelFrom\(c, c\.raw\(p\)\)/.test(list)) {
    fail("the cell falls back to the plain lookup, so the composed label "
      + "never reaches the table");
  }
  /* Matched loosely on the id: a lookup list and a project row do not
     always agree about number against string, and a strict compare
     empties the column for a reason nobody can see. */
  if (!/String\(x\[c\.idKey\]\) === String\(id\)/.test(list)) {
    fail("the branch is matched strictly, so a number against a string "
      + "empties the column");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The Customer column names the branch, not the company.");
process.exit(bad ? 1 : 0);
