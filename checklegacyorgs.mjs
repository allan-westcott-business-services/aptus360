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
  if (!/DELETE FROM "Organisation" WHERE "Legacy_Customer_ID" IS NOT NULL/.test(sqlRaw)) {
    fail("the file does not say how to undo itself");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The customers become organisations with a customer role, their branches "
    + "and their contacts; the 13 already here are claimed without being "
    + "rewritten; the name match is exact and tried after the legacy key; "
    + "nothing is dropped without saying so; and running it twice changes "
    + "nothing.");
process.exit(bad ? 1 : 0);
