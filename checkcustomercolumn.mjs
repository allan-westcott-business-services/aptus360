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
  /* ── And NOT as a fallback ──

     It was kept as one until the live data was counted: on 26
     projects the two disagree on 19, and eleven carry cached branch
     17 — seven of those with a real developer on a different branch.
     A wrong company that looks right is worse than a blank, because
     a blank is a question somebody answers and 17 is Anwyl Homes on
     somebody else's site with nothing on screen to doubt. */
  if (/\?\? p\.Organisation_Branch_ID/.test(col)) {
    fail("the project's cached branch is used when no developer is recorded "
      + "\u2014 on live data that cache is wrong on nineteen projects out of "
      + "twenty-six, so it shows a plausible wrong company instead of a "
      + "blank somebody would fix");
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
  if (!/mainDeveloper\?\.Organisation_Branch_ID/.test(code)) {
    fail("the customer projects page groups on the project's cached branch "
      + "rather than the developer on the Stakeholder tab");
  }
  if (/\?\? p\.Organisation_Branch_ID/.test(code)) {
    fail("the customer projects page falls back to the cached branch, which "
      + "is wrong on nineteen live projects");
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

// 7. Every column sorts by what the reader can see.
{
  /* The comparator tested `typeof === "number"` before it tested
     for a lookup column, and a foreign key is a number — so every
     `multi` column sorted by id and never reached the branch that
     sorts by what the cell says.

     It passed for years because ids were handed out in roughly the
     order names were added. Branches broke the illusion: Customer
     ascending gave Seddon, SJ Roberts, Castle Green, Gleeson —
     413, 414, 415, 416, which is an order and not one anybody can
     see. Reported from use, off a screenshot.

     Asserted by POSITION, because both branches are still there and
     which comes first is the whole fault. */
  const multiAt = list.indexOf('if (col?.type === "multi" || col?.type === "designs")');
  const numAt = list.indexOf('typeof va === "number" && typeof vb === "number"');
  if (multiAt < 0 || numAt < 0) {
    fail("the sort comparator has moved; re-anchor this case rather than "
      + "deleting it");
  } else if (numAt < multiAt) {
    fail("the numeric shortcut is tested before the lookup branch, so a "
      + "column showing names sorts by the ids behind them — which is an "
      + "order the reader cannot see");
  }
  if (!/display\[col\.key\]\?\.\(a\) \?\? ""/.test(list)) {
    fail("a row with nothing in a lookup column throws the comparator, or "
      + "sorts as the text \"undefined\"");
  }

  /* ── And every other kind sorts by what it shows too ──

     Asked for across the whole table, not just Customer.

     `designs` sorted by HOW MANY outline designs a project had,
     which is a number the cell does not contain. The comment
     defending it said an order across a list of statuses would mean
     nothing \u2014 true of the statuses, and beside the point: the cell
     shows words, so the words are what to sort.

     Dates and numbers keep their own order, and that is the same
     rule rather than an exception: their display is a faithful
     rendering of the value. Sorting the rendered text would put
     01/09 before 12/08 and 10 before 2. */
  if (!/col\?\.type === "multi" \|\| col\?\.type === "designs"/.test(list)) {
    fail("the outline design column still sorts by how many there are, "
      + "which is a number the cell does not show");
  }
  const dateSorted = /typeof va === "number" && typeof vb === "number"/.test(list);
  if (!dateSorted) {
    fail("numbers no longer sort numerically, so 10 comes before 2");
  }
  if (/case "date"[\s\S]{0,120}display/.test(list)) {
    fail("a date sorts by its rendered text, so 01/09 comes before 12/08");
  }
}

// 8. Nothing asks Project for a column it no longer has.
{
  /* `Customer_ID` and `Branch_ID` were dropped from `Project` on
     20 Sept. PostgREST refuses a whole select over one missing
     column, so a list naming them does not come back short — it
     does not come back. The projects list and the developer
     portal's project list were both doing it.

     `PROJECT_COLUMNS` is this repo's stand-in for the schema and has
     to follow the table, or `checkportal` blesses a query that
     cannot run. */
  const api = readFileSync("./netlify/functions/projects.js", "utf8");
  const declared = (api.match(/const PROJECT_COLUMNS = \[([\s\S]*?)\]/) || ["", ""])[1]
    .replace(/\/\*[\s\S]*?\*\//g, "");
  for (const dead of ["Customer_ID", "Branch_ID"]) {
    if (new RegExp(`"${dead}"`).test(declared)) {
      fail(`PROJECT_COLUMNS still declares ${dead}, which is not on the `
        + "table — the projects list fails outright, and checkportal reads "
        + "this list to decide whether a column is real");
    }
  }

  const portal = readFileSync("./netlify/functions/portal.js", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  if (/from\("Project"\)[\s\S]{0,200}"Customer_ID"/.test(portal)) {
    fail("the portal still asks Project for Customer_ID — and that is the "
      + "function deciding who may see which sites, so it does not degrade, "
      + "it throws");
  }
  /* The developer record still carries it, and that is where the
     scope belonged anyway. */
  if (!/from\("Project_Developer"\)[\s\S]{0,120}eq\("Customer_ID"/.test(portal)) {
    fail("an account recorded against the old Customer table can no longer "
      + "find its sites at all");
  }
}

// 9. The trigger that keeps the cache knows the column in use.
{
  /* `sync_project_main_developer()` read `Customer_ID` and
     `Branch_ID` off the main developer row. Both are Customer_Branch
     columns, emptied on 26 Aug, so since that day it selected two
     nulls, found nothing to write and did nothing \u2014 which is the
     whole of the drift. It was not decaying; it stopped.

     And the worse half: it CLEARED `Organisation_Branch_ID`
     whenever the main developer had a legacy `Branch_ID`. Sound when
     a project named one branch or the other; with one branch table
     it wipes the only column anything reads, the next time somebody
     saves a Stakeholder tab. */
  let sql = "";
  try {
    sql = readFileSync("./supabase/migrations/0231_main_developer_sync.sql", "utf8");
  } catch { /* reported below */ }

  if (!sql) {
    fail("0231 is missing, so the cache is still written by a function that "
      + "has never heard of Organisation_Branch_ID");
  } else {
    /* The statements, not the explanation above them. The first run
       of this case failed on its own comment quoting the old CASE —
       twice this week, once in JSX and once here. */
    const body = sql.replace(/--[^\n]*/g, "");
    /* The developer's branch, and only that. An earlier draft read
       `Customer_ID` and `Branch_ID` too, to keep the project's
       copies in step — and they are already off `Project`, which is
       how the history trigger fault was found. */
    if (!/SELECT d\."Organisation_Branch_ID"/.test(body)) {
      fail("the replacement function does not read the developer's "
        + "Organisation_Branch_ID, which is the only branch column in use");
    }
    if (/SET[\s\S]{0,80}"Customer_ID"|SET[\s\S]{0,80}p\."Branch_ID"/.test(body)) {
      fail("the function writes a column that is no longer on Project");
    }
    /* The clearing CASE must be gone. Matched on the shape rather
       than the whole statement, because what matters is that no
       branch is set to NULL on the strength of another column. */
    if (/WHEN main\."Branch_ID" IS NOT NULL THEN NULL/.test(body)) {
      fail("the replacement still clears Organisation_Branch_ID when the "
        + "developer carries a legacy Branch_ID \u2014 that is the landmine, not "
        + "the drift");
    }
    /* Nothing is ever cleared: a developer that names no branch
       leaves what is there alone, and no main developer returns
       early. A save on the Stakeholder tab has never been meant to
       empty a project's customer. */
    if (!/IF branch IS NULL THEN\s*\n\s*RETURN NULL;/.test(body)) {
      fail("a developer that names no branch empties the project's, where it "
        + "should leave what is there alone");
    }
    /* ── The repair runs with history suspended, and puts it back ──

       `log_project_changes()` names a dropped column, so every
       update to a project fails and the backfill cannot run at all.
       Suspended for that one statement: a backfill is not a change
       anybody made, and a history row with no person behind it is
       noise in the table people go to for who did what.

       Enabled again in the same file. A trigger left off is a table
       that quietly stops recording, and nothing about the next
       change would say so \u2014 which is a worse fault than the one
       being worked around. */
    if (/DISABLE TRIGGER/.test(body) && !/ENABLE TRIGGER/.test(body)) {
      fail("the history trigger is disabled and never put back \u2014 the table "
        + "stops recording and nothing says so");
    }

    /* And the live rows brought into line, or the fix only applies
       to projects somebody edits from now on. */
    if (!/UPDATE "Project" p\s*\n\s*SET "Organisation_Branch_ID" = d\."Organisation_Branch_ID"/.test(body)) {
      fail("0231 does not backfill, so nineteen projects stay wrong until "
        + "each one is touched by hand");
    }
    /* Not dropping the columns: the portal's legacy scope still
       reads Project.Customer_ID and that decides who sees what. */
    if (/DROP COLUMN IF EXISTS "Customer_ID"/.test(body)) {
      fail("0231 drops Customer_ID while the portal still scopes on it");
    }
  }
}

// 10. The history trigger names no columns.
{
  /* `log_project_changes()` watched a fixed list of columns in a
     dynamic query and broke the day one was dropped — every save on
     every project, then creating one at all. Its body was never in
     the folder. The replacement turns OLD and NEW into JSON and
     compares every key, so it cannot name a column that is not
     there, and a column added tomorrow is recorded without anybody
     listing it. */
  let sql = "";
  try { sql = readFileSync("./supabase/migrations/0233_project_history_trigger.sql", "utf8"); }
  catch { /* reported below */ }
  if (!sql) fail("0233 is missing, so every project save still fails on the "
    + "dropped column");
  else {
    const body = sql.replace(/--[^\n]*/g, "");
    if (!/o := to_jsonb\(OLD\);/.test(body) || !/n := to_jsonb\(NEW\);/.test(body)) {
      fail("the history trigger does not compare the rows as JSON, so it has "
        + "to name columns and will break on the next drop");
    }
    if (/"Customer_ID"|"Branch_ID"/.test(body)) {
      fail("the history trigger still names a dropped column");
    }
    if (!/\(o -> k\) IS DISTINCT FROM \(n -> k\)/.test(body)) {
      fail("null against null is recorded as a change, or null against a value "
        + "is not");
    }
    if (!/IF TG_OP <> 'UPDATE' THEN\s*\n\s*RETURN NEW;/.test(body)) {
      fail("the trigger runs its comparison on INSERT, where there is no OLD "
        + "to compare against");
    }
    if (!/'Updated_At'/.test(body)) {
      fail("Updated_At is recorded as a change on every save, which is a row "
        + "of noise per edit");
    }
  }

  /* And the activity tab can name what the new trigger records. */
  const tab = readFileSync("./src/features/activity/ActivityTab.jsx", "utf8");
  if (!/Organisation_Branch_ID: "Customer branch"/.test(tab)) {
    fail("a change of branch shows in the activity tab as a raw id");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The Customer column names the branch, not the company.");
process.exit(bad ? 1 : 0);
