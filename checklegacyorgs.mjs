/* Stage 1 of the migration: the original app's Customers become
   Organisations.

   ── What was asked for ──

   "Can we first focus on getting the Organisation data migrated? I want
   to do this stage by stage."

   509 customers and 623 branches, against 419 organisations already
   here. 496 are new; 13 are the same company under the same name.

   ── Why this stage is first ──

   Because the contract import resolves its customer through these rows,
   and measured after running the real import on the real exports:

     1,036 contracts land on a SPECIFIC branch by its old key
       516 get the organisation only
       374 still have no key to match on

   1,552 of 1,926 on exact primary keys. None of it works until the
   organisations exist.

   ── The things that must not go wrong ──

   1. Touching an organisation somebody maintains. 13 rows match
      something already here, and the import must claim them without
      rewriting a name or an address. A merge in the wrong direction
      loses maintained data and looks like nothing happened. Section 2.

   2. Matching the wrong company. An exact name match is allowed here
      and nowhere else in the chain, because it was MEASURED safe: zero
      duplicate names among the 509. Section 3.

   3. Losing a field silently. Payment_Terms_Days and Letter_Grace_Days
      are 30 and 15 on every one of the 623 - a constant, so dropping
      them costs nothing, and the file has to say that rather than just
      omitting them. County has no column on a branch and must land on
      the organisation. Section 4.

   4. Writing a column the endpoint does not select - recurring fault 4,
      which has bitten this project four times. Section 5.

   5. Running twice. Section 6.

   Run: node checklegacyorgs.mjs */

import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const src = (p) => readFileSync(p, "utf8");

/* Comments out first. Both files argue at length and NAME every field
   they deliberately do not carry, so a test for Payment_Terms_Days
   against the raw text passes on the paragraph explaining why it is
   dropped. That is the weak assertion this project keeps producing. */
const code = (p) => src(p)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--.*$/gm, " ");

const mig = code("./supabase/migrations/0253_legacy_organisation_import.sql");
const sqlRaw = src("./import_legacy_organisations.sql");
const sql = code("./import_legacy_organisations.sql");
const orgApi = src("./netlify/functions/organisations.js");

/* One INSERT statement at a time, so a guard elsewhere in the file
   cannot stand in for a guard on the statement that writes. */
const stmt = (table) => {
  const i = sql.indexOf(`INSERT INTO "${table}"`);
  if (i < 0) return "";
  const end = sql.indexOf(";", i);
  return sql.slice(i, end < 0 ? sql.length : end);
};
const orgIns = stmt("Organisation");
const roleIns = stmt("Organisation_Role");
const branchIns = stmt("Organisation_Branch");
const contactIns = stmt("Organisation_Contact");
const colsOf = (s) => s.slice(0, s.indexOf(")") + 1);

// ─── 1. The staging tables take the files as they stand ───
{
  const CUST = ["Customer_ID", "Customer_Name", "Customer_Ref", "Customer_Contact"];
  const BRANCH = ["Branch_ID", "Customer_ID", "Branch_Name", "Head_Office",
    "Address1", "Address2", "Address3", "Address4", "County", "Postcode",
    "Branch_Ref", "Payment_Terms_Days", "Letter_Grace_Days"];
  for (const [t, cols] of [["Legacy_Customer_Import", CUST],
    ["Legacy_Branch_Import", BRANCH]]) {
    const i = mig.indexOf(`CREATE TABLE IF NOT EXISTS "${t}"`);
    if (i < 0) { fail(`${t} is not created`); continue; }
    const body = mig.slice(i, mig.indexOf(");", i));
    for (const c of cols) {
      if (!new RegExp(`"${c}"`).test(body)) {
        fail(`${t} has no ${c} column, so the CSV load stops on it`);
      }
    }
    /* Typed columns are what make a half-loaded file hard to reason
       about. The identity key is the exception. */
    if (/\b(date|numeric|integer|boolean|timestamptz)\b/
      .test(body.replace(/_Import_ID[^,]*,/, ""))) {
      fail(`${t} has a typed column, so the file has to be clean before it loads`);
    }
  }
}

// ─── 2. Claiming an existing organisation changes nothing else ───
{
  const i = sql.indexOf('UPDATE "Organisation" o');
  const upd = i < 0 ? "" : sql.slice(i, sql.indexOf(";", i));
  if (!upd) {
    fail("nothing claims the organisations that are already here, so the 13 "
      + "get duplicated under the same name");
  } else {
    /* SET must touch Legacy_Customer_ID and nothing else. */
    const setPart = upd.slice(upd.indexOf("SET"), upd.indexOf("FROM"));
    const assigned = [...setPart.matchAll(/"([A-Za-z_]+)"\s*=/g)].map((m) => m[1]);
    for (const c of assigned) {
      if (c !== "Legacy_Customer_ID") {
        fail(`claiming an existing organisation also writes ${c}, overwriting `
          + `something somebody has been maintaining`);
      }
    }
    if (!/"Legacy_Customer_ID" IS NULL/.test(upd)) {
      fail("the claim does not skip organisations already claimed");
    }
  }
  /* And the undo must not delete them. */
  const undo = sqlRaw.slice(sqlRaw.indexOf("PART 4"));
  if (!/UPDATE "Organisation" SET "Legacy_Customer_ID" = NULL/.test(undo)) {
    fail("the undo does not un-claim the organisations that were already here - "
      + "it would have to delete them, and they were here first");
  }
}

// ─── 3. The name match is exact ───
{
  const view = mig.slice(mig.indexOf('CREATE VIEW "Legacy_Organisation_Resolved"'));
  if (!/upper\(btrim\(o\."Name"\)\) = upper\(btrim/.test(view)) {
    fail("the organisation name match is not an exact trimmed comparison");
  }
  if (/o\."Name"\s+I?LIKE|similarity\(|levenshtein\(|%\s*\|\|/.test(view)) {
    fail("the name match is fuzzy, which attaches a site to the wrong builder");
  }
  /* The legacy key must be tried BEFORE the name, or a re-run matches
     on a name somebody has since edited instead of on the key. */
  const byKey = view.indexOf('"Legacy_Customer_ID" = NULLIF');
  const byName = view.indexOf('upper(btrim(o."Name"))');
  if (byKey < 0 || byName < 0 || byKey > byName) {
    fail("the view matches on the name before the legacy key, so a renamed "
      + "organisation stops being recognised as already imported");
  }
}

// ─── 4. Nothing is lost quietly ───
{
  /* The two constants are staged and never carried further. */
  for (const dead of ["Payment_Terms_Days", "Letter_Grace_Days"]) {
    for (const [name, s] of [["Organisation", orgIns], ["branch", branchIns]]) {
      if (new RegExp(`"${dead}"`).test(s)) {
        fail(`the ${name} insert carries ${dead}, which is the same value on `
          + `every one of the 623 rows and has no column here`);
      }
    }
    /* And the file has to SAY so, in the raw text, rather than just
       omitting it - a field dropped in silence is the fault. */
    if (!new RegExp(dead).test(sqlRaw) && !new RegExp(dead).test(src(
      "./supabase/migrations/0253_legacy_organisation_import.sql"))) {
      fail(`neither file explains what happened to ${dead}`);
    }
  }
  /* County has no column on a branch, so it must reach the
     organisation or it is gone. */
  if (!/"County"/.test(colsOf(orgIns))) {
    fail("the organisation insert does not carry County, and Organisation_Branch "
      + "has no County column - so 364 branch counties would be lost");
  }
  /* The address rule: the town is the LAST line, and only where there
     are two or more. */
  const bview = mig.slice(mig.indexOf('CREATE VIEW "Legacy_Branch_Resolved"'));
  if (!/array_length\(c\.lines, 1\)[^>]{0,12}>= 2[\s\S]{0,120}lines\[array_length\(c\.lines, 1\)\]/
    .test(bview)) {
    fail("the town is not taken as the last address line only where there are "
      + "two or more - with one line a street becomes a town");
  }
}

// ─── 5. Nothing written that the endpoint cannot read (fault 4) ───
{
  const listOf = (name) => {
    const m = orgApi.match(new RegExp(`const ${name} = "([^"]+)"`));
    return new Set(m ? m[1].split(",") : []);
  };
  const allowed = {
    Organisation: listOf("ORG"),
    Organisation_Branch: listOf("BRANCH"),
    Organisation_Role: listOf("ROLE"),
    Organisation_Contact: listOf("CONTACT"),
  };
  const inserts = {
    Organisation: orgIns, Organisation_Branch: branchIns,
    Organisation_Role: roleIns, Organisation_Contact: contactIns,
  };
  /* A table the endpoint reads with select("*") cannot suffer fault 4 on
     the way out - every column comes back whether anybody listed it or
     not. Organisation_Role is read that way (organisations.js:58), and
     its narrow ROLE list is only the update path. So the list is
     checked only for tables read by an explicit column list; asserting
     against ROLE here failed on Organisation_ID, which is plainly
     returned. */
  const readsStar = (table) =>
    new RegExp(`from\\("${table}"\\)\\s*\\.select\\("\\*"\\)`).test(orgApi);

  for (const [table, ins] of Object.entries(inserts)) {
    if (!ins) { fail(`nothing inserts into ${table}`); continue; }
    if (readsStar(table)) continue;
    const set = allowed[table];
    if (!set.size) { fail(`could not read the column list for ${table}`); continue; }
    for (const m of colsOf(ins).matchAll(/"([A-Za-z_]+)"/g)) {
      const c = m[1];
      if (c === table) continue;
      /* The legacy keys are 0249's and are deliberately not on the
         endpoint's list - they are an import's business, not a
         screen's. Everything else must be readable. */
      if (c === "Legacy_Customer_ID" || c === "Legacy_Branch_ID") continue;
      if (!set.has(c)) {
        fail(`the ${table} insert writes ${c}, which organisations.js does not `
          + `select - a column absent from the select list is neither saved nor `
          + `returned`);
      }
    }
  }
  /* Branch_Dropdown is maintained by org_branch_dropdown_trg. */
  if (/"Branch_Dropdown"/.test(colsOf(branchIns))) {
    fail("the branch insert writes Branch_Dropdown, which a trigger maintains");
  }
}

// ─── 6. The role is found by its key, and carries the code ───
{
  /* Counted, not merely present: the statement names Type_Key twice -
     once to choose the type and once in its own re-run guard - and an
     assertion that only asks "does it appear" passes when one of them
     is swapped for a hardcoded id. Found by mutation. */
  const byKey = (roleIns.match(/"Type_Key" = 'customer'/g) || []).length;
  if (byKey < 2) {
    fail(`the customer role is looked up by Type_Key ${byKey} time(s) where the `
      + `statement needs it twice - a hardcoded type id is a fact about one `
      + `database rather than about the trade`);
  }
  if (/"Organisation_Type_ID"\s*=\s*\d/.test(roleIns)) {
    fail("the role insert hardcodes a numeric Organisation_Type_ID");
  }
  /* Reference is what 0249's resolution falls back to. An empty one
     costs those contracts their match. */
  if (!/"Customer_Ref"/.test(roleIns)) {
    fail("the role's Reference is not set from Customer_Ref, so the Audacia "
      + "code fallback in 0249 has nothing to read");
  }
}

// ─── 7. Twice is the same as once ───
{
  for (const [what, ins, guard] of [
    ["Organisation", orgIns, /NOT EXISTS \(SELECT 1 FROM "Organisation" o\s+WHERE o\."Legacy_Customer_ID" = r\.legacy_id\)/s],
    ["Organisation_Role", roleIns, /NOT EXISTS \(\s*SELECT 1 FROM "Organisation_Role" ro/s],
    ["Organisation_Branch", branchIns, /existing_branch_id IS NULL/],
    ["Organisation_Contact", contactIns, /NOT EXISTS \(\s*SELECT 1 FROM "Organisation_Contact" oc/s],
  ]) {
    if (!guard.test(ins)) {
      fail(`the ${what} insert has no guard against a second run, so running it `
        + `twice duplicates every row`);
    }
  }
  /* Matched on the Notes this import writes rather than on
     Legacy_Customer_ID: deleting every organisation carrying a legacy
     key would take the 13 that were already here with it, and they
     were here first. */
  if (!/DELETE FROM "Organisation" WHERE "Notes" LIKE 'Imported from the original app%'/
    .test(sqlRaw)) {
    fail("the file does not say how to undo itself, or its undo deletes "
      + "organisations it did not create");
  }
}

// ─── 8. The ten-customer trial, and the two faults it found ───
//
// Asked for before the full import: "can a small import of just 10
// records be done first". It earned its keep twice over - both of the
// following were real faults in the FULL import that only showed up
// when ten rows were small enough to read.
{
  const trialRaw = src("./trial_import_10_customers.sql");
  const trial = code("./trial_import_10_customers.sql");

  /* The ten are named once, in a view, so changing them changes the
     whole trial rather than four statements out of five. */
  if (!/CREATE OR REPLACE VIEW "Trial_Ten_Customers"/.test(trial)) {
    fail("the trial does not name its ten customers in one view, so the list "
      + "has to be kept in step by hand across every statement");
  }
  const ids = (trial.match(/'\d+'/g) || []).length;
  if (ids < 10) {
    fail(`the trial's view names ${ids} ids where it should name ten`);
  }

  /* Fault 1: a claimed organisation got no address. 2.1 refuses to
     overwrite, and theirs were empty, so nothing arrived either. */
  for (const [file, s] of [["the import", sql], ["the trial", trial]]) {
    if (!/"Town"\s*=\s*COALESCE\(o\."Town"/.test(s)) {
      fail(`${file} does not fill in a claimed organisation's missing address, `
        + `so the three that match come out with no town or county`);
    }
    /* And the fill must only fire when there is something to put in,
       or a second run reports a change that did not happen. */
    /* All four columns, counted. Asking whether the shape appears at
       all is satisfied by one survivor - mutating only the Town line
       left address_1, county and postcode matching, and the test passed
       a fill that would fire on an empty source for Town. The same
       weakness as the Type_Key assertion above, found the same way. */
    const guarded = ["address_1", "town", "county", "postcode"]
      .filter((c) => new RegExp(`IS NULL AND h\\.${c}\\s+IS NOT NULL`).test(s));
    if (guarded.length < 4) {
      fail(`${file}'s address fill is guarded on ${guarded.length} of 4 columns `
        + `(${guarded.join(", ") || "none"}) - an unguarded one fires when the `
        + `source is empty, so a second run reports rows updated when nothing `
        + `changed`);
    }
    /* Fault 2: an existing customer role kept an empty Reference, which
       is what 0249's code fallback reads. */
    if (!/UPDATE "Organisation_Role"[\s\S]{0,600}"Reference" = /.test(s)) {
      fail(`${file} does not give an existing customer role its Audacia code, `
        + `so a claimed organisation resolves nothing by code`);
    }
  }

  /* The undo's NULL trap. NULL NOT LIKE 'x' is NULL, not true, so an
     un-claim written without COALESCE matches none of the very rows it
     exists for - it reported UPDATE 0 and left Legacy_Customer_ID set,
     which would make a later full import skip them as already done. */
  for (const [file, s] of [["the import", sqlRaw], ["the trial", trialRaw]]) {
    const unclaim = s.slice(s.indexOf('UPDATE "Organisation" SET "Legacy_Customer_ID" = NULL'));
    if (!unclaim) { fail(`${file} has no un-claim in its undo`); continue; }
    const stmtEnd = unclaim.indexOf(";");
    const body = stmtEnd < 0 ? unclaim : unclaim.slice(0, stmtEnd);
    if (!/COALESCE\("Notes", ''\)/.test(body)) {
      fail(`${file}'s undo tests Notes without COALESCE - NULL NOT LIKE is NULL, `
        + `so it un-claims none of the rows that have no Notes`);
    }
  }

  /* And it has to be reversible at all, in the right order: contacts
     before branches before roles before organisations. */
  const order = ["Organisation_Contact", "Organisation_Branch",
    "Organisation_Role", 'Organisation" WHERE'];
  let at = -1;
  for (const t of order) {
    const i = trialRaw.indexOf(`DELETE FROM "${t}`, Math.max(at, trialRaw.indexOf("PART 4")));
    if (i < 0) { fail(`the trial's undo does not delete from ${t}`); break; }
    if (i < at) {
      fail(`the trial's undo deletes ${t} out of order - a parent before its `
        + `children leaves rows pointing at nothing`);
      break;
    }
    at = i;
  }
}

// ─── 9. The unique constraint on (Organisation_ID, Branch_Name) ───
//
// Reported from use, part way through the trial:
//
//   ERROR: 23505: duplicate key value violates unique constraint
//   "Organisation_Branch_Organisation_ID_Branch_Name_key"
//
// My test schema was built from the endpoint's column list, which does
// not show constraints, so the stub had the columns and none of the
// rules. One pair in the whole export collides - Bellway Homes has two
// branches both called "West Midlands, Staffordshire" - and one is
// enough to abort the insert for all 623.
{
  const bview = mig.slice(mig.indexOf('CREATE VIEW "Legacy_Branch_Resolved"'));
  const trial = code("./trial_import_10_customers.sql");

  /* The name must be made unique in the view, so both files get the
     same answer and neither can drift. */
  if (!/row_number\(\) OVER \(\s*PARTITION BY c\.legacy_customer_id/.test(bview)) {
    fail("the branch name is not made unique within the organisation, so one "
      + "repeated name aborts the insert for every branch");
  }
  /* And the discriminator has to end at something that cannot repeat.
     Bellway's two have neither town nor postcode, so without the id as
     the last resort they would still collide. */
  if (!/legacy_branch_id::text\s*\)/.test(bview)) {
    fail("the de-duplicated branch name does not fall back to the legacy "
      + "Branch_ID, so two branches with no town and no postcode still clash");
  }
  /* Both inserts must use it rather than computing their own. */
  for (const [file, ins] of [["the import", branchIns],
    ["the trial", trial.slice(trial.indexOf('INSERT INTO "Organisation_Branch"'),
      trial.indexOf(";", trial.indexOf('INSERT INTO "Organisation_Branch"')))]]) {
    /* In the SELECT LIST, not merely somewhere in the statement: the
       re-run guard below also says b.branch_name, so testing the whole
       statement passed when the inserted column was swapped back to the
       raw Branch_Name. Fourth time this shape of assertion has let a
       mutation through. */
    const selectList = ins.slice(ins.indexOf("SELECT"), ins.indexOf("FROM"));
    if (!/b\.branch_name/.test(selectList)) {
      fail(`${file}'s branch insert builds its own name instead of using the `
        + `view's, so the two can disagree about what is unique`);
    }
    /* And skip a name already on that organisation, which is what makes
       a run that stopped half way resumable rather than stuck. */
    if (!/NOT EXISTS \(SELECT 1 FROM "Organisation_Branch" x[\s\S]{0,200}"Branch_Name" = b\.branch_name\)/
      .test(ins)) {
      fail(`${file}'s branch insert does not skip a name already on that `
        + `organisation, so a part-finished run cannot be re-run`);
    }
  }

  /* 0253 has to be re-runnable AFTER the trial, which is exactly when
     it is wanted - the trial shows something that needs changing. The
     trial's view is built on 0253's, so a plain DROP fails:
       ERROR: cannot drop view "Legacy_Organisation_Resolved" because
              other objects depend on it */
  for (const v of ["Legacy_Organisation_Resolved", "Legacy_Branch_Resolved"]) {
    if (!new RegExp(`DROP VIEW IF EXISTS "${v}" CASCADE`).test(mig)) {
      fail(`0253 drops ${v} without CASCADE, so it cannot be re-run once the `
        + `trial has built a view on top of it`);
    }
  }
}

// ─── 10. The triggers on Organisation and Organisation_Branch ───
//
// Read off pg_trigger in the live database after the trial failed twice.
// Neither was in the test schema, because that was built from the
// endpoint's column lists - which say what is READ and nothing about
// what the table DOES. A constraint and a trigger are both invisible
// from JavaScript, and that is now twice this has cost a round trip.
//
//   organisation_default_branch  AFTER INSERT ON "Organisation",
//     inserts a bare 'Head Office' branch. 411 of the 623 old branches
//     are themselves called 'Head Office', so without 2.4a the trigger
//     wins the name and the REAL branch is dropped in silence - and
//     with it the key 1,036 contracts resolve through.
//
//   org_branch_keep_one  BEFORE DELETE, refuses to remove an
//     organisation's last branch. Right for a person, wrong for an
//     undo.
{
  const trialRaw = src("./trial_import_10_customers.sql");

  for (const [file, s] of [["the import", sql], ["the trial", code("./trial_import_10_customers.sql")]]) {
    /* Adopt the placeholder rather than collide with it. */
    const adopt = /UPDATE "Organisation_Branch" x[\s\S]{0,900}?"Legacy_Branch_ID" = b\.legacy_branch_id/;
    if (!adopt.test(s)) {
      fail(`${file} does not adopt the branch organisation_default_branch `
        + `creates, so every old branch called 'Head Office' - 411 of 623 - is `
        + `dropped without a word`);
    }
    /* Only an unclaimed one, so a branch a person made is never taken. */
    if (!/x\."Legacy_Branch_ID" IS NULL/.test(s)) {
      fail(`${file}'s adoption does not check the branch is unclaimed, so it `
        + `can take over one an earlier run or a person already owns`);
    }
    /* The placeholder cleanup must not reach an organisation that was
       already here - Project, Project_Developer and Enquiry_Submission
       all point at a branch. */
    const del = s.slice(s.indexOf('DELETE FROM "Organisation_Branch" x'));
    if (del) {
      const stmt = del.slice(0, del.indexOf(";") + 1);
      if (!/"Notes" LIKE 'Imported from the original app%'/.test(stmt)) {
        fail(`${file} deletes the placeholder without restricting to `
          + `organisations this import created - one on an organisation that `
          + `was already here may be referenced by a project`);
      }
      if (!/EXISTS \(SELECT 1 FROM "Organisation_Branch" y/.test(stmt)) {
        fail(`${file} deletes the placeholder without checking another branch `
          + `remains, which org_branch_keep_one refuses`);
      }
    }
  }

  /* The undo has to suspend keep-one, and put it back. */
  for (const [file, s] of [["the import", sqlRaw], ["the trial", trialRaw]]) {
    const undo = s.slice(s.indexOf("PART 4"));
    const off = /DISABLE TRIGGER org_branch_keep_one/.test(undo);
    const on = /ENABLE TRIGGER org_branch_keep_one/.test(undo);
    if (!off) {
      fail(`${file}'s undo does not suspend org_branch_keep_one, so deleting an `
        + `organisation's last branch raises and the undo stops half way`);
    }
    if (off && !on) {
      fail(`${file}'s undo turns org_branch_keep_one off and never back on`);
    }
    /* And restore the placeholder, or a claimed organisation ends up
       with fewer branches than it started with. */
    if (!/INSERT INTO "Organisation_Branch" \("Organisation_ID", "Branch_Name"\)/.test(undo)) {
      fail(`${file}'s undo does not put back the placeholder on an organisation `
        + `left with none - measured 418 branches back where 419 began`);
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The customers become organisations with a customer role, their branches "
    + "and their contacts; the 13 already here are claimed without being "
    + "rewritten; the name match is exact and tried after the legacy key; "
    + "nothing is dropped without saying so; and running it twice changes "
    + "nothing.");
process.exit(bad ? 1 : 0);
