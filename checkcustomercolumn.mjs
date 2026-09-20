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
    if (!/raw: \(p\) => p\.Organisation_Branch_ID/.test(col)) {
      fail("the column filters on something other than the project's branch");
    }
    if (!/labelOf: \(b\) => branchLabelOf\(b, b\.Organisation_Name\)/.test(col)) {
      fail("the column does not compose its text, so it shows a branch name "
        + "with no organisation in front of it");
    }
  }
}

// 3. The filter list says what the cells say.
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

// 4. And the display path uses it.
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
