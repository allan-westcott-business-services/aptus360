/* The original app's non-compliance reports, imported.

   ── What was asked for ──

   "I need to migrate these files into the new Aptus360", with three
   exports: 1,797 NCRs, 4 statuses and 98 attachment rows.

   ── Why this import is different from the others ──

   0248 and 0251 could join on exact keys: a plot names a Contract_ID,
   and Project."Legacy_Contract_ID" is that same number. Nothing had to
   be matched on a name.

   This one cannot, because the two systems number the same things
   differently and the numbers overlap:

     old Region 1 is Midlands,       here Region 1 is North West
     old Person 23 is Laura Cassidy, here Person 23 is Ben Mckay
     old DNO 1 is Cadent (gas),      here DNO 1 is Northern Powergrid

   Every one of those imports silently and shows the wrong name on
   screen. There is no error, no empty cell, nothing to notice — 442
   reports simply belong to the wrong person. So the thing this check
   is really about is that nothing resolves on an id.

   ── The things that must not go wrong ──

   1. A column the import writes that the app does not read. The site
      address is the case in point: 1,608 reports carry one, 66 of them
      have no project, and for those it is the only record of where it
      happened. Section 1.

   2. A lookup resolved on an id where the two systems disagree.
      Section 2.

   3. The ids not kept, or the sequence left behind them. 98 attachment
      rows refer to the original NCR_IDs, and an identity sequence left
      at 1 makes the next report raised in the app collide with an
      imported one. Section 3.

   4. The duplicate reference imported quietly. NCR11444 is used twice
      in the export, for two different sites. Section 4.

   5. The staging left in place. The descriptions name members of
      staff, and the staging tables have row level security off so the
      CSV button can write to them. Section 5.

   6. The attachment rows imported before their files. A row whose file
      was never copied is a broken link, which is worse than no row.
      Section 6.
*/

import { readFileSync, existsSync } from "node:fs";

let bad = 0;
const fail = (m) => { bad += 1; console.log(`  FAIL ${m}`); };
const src = (p) => {
  if (!existsSync(p)) { fail(`${p} is missing`); return ""; }
  return readFileSync(p, "utf8");
};

const mig0261 = src("./supabase/migrations/0261_ncr_import_schema.sql");
const mig0262 = src("./supabase/migrations/0262_legacy_ncr_import.sql");
const run = src("./import_legacy_ncrs.sql");
const list = src("./src/features/hsqe/NcrListPage.jsx");
const modal = src("./src/features/hsqe/NcrModal.jsx");
const rules = src("./src/features/hsqe/ncr.js");

/* Comments stripped before asserting on code. A phrase that appears in
   the prose above a statement is not the statement — checknav lost a
   sabotage to exactly that. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*--.*$/gm, " ")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");

const runCode = code(run);
const m61 = code(mig0261);
const m62 = code(mig0262);

/* ─── 1. Every column the import writes, the app reads ───

   The import writes fourteen columns. Four of them are new or newly
   meaningful, and each is checked for somewhere that displays it. The
   other ten were already on the screens before the import existed.

   This section is the one that catches the quiet failure: a column
   that loads perfectly and appears nowhere. */
{
  const writes = runCode.match(/INSERT INTO "NCR" \(([\s\S]*?)\)\s*OVERRIDING/);
  if (!writes) {
    fail("the run script has no INSERT INTO \"NCR\" ... OVERRIDING, so "
      + "nothing can be said about what it writes");
  } else {
    const cols = [...writes[1].matchAll(/"([A-Za-z_]+)"/g)].map((m) => m[1]);
    const shownSomewhere = { ...{} };
    const screens = list + modal + rules;
    for (const col of ["Address_Raw", "Auditor_Organisation_ID", "Auditor_Type",
      "Business_Unit_ID"]) {
      if (!cols.includes(col)) {
        fail(`the import does not write ${col}`);
        continue;
      }
      if (!screens.includes(col)) {
        fail(`the import writes ${col} and no screen reads it, so it loads `
          + "and appears nowhere");
      }
      shownSomewhere[col] = true;
    }
  }

  /* The site address specifically. 66 reports have no project, and the
     register's Site Name column reads off the project — so without a
     fallback those rows read as having happened nowhere, and the one
     thing that says where is invisible. */
  if (!/case "site":[^;]*Address_Raw/.test(code(list))) {
    fail("the register's Site Name column does not fall back to "
      + "Address_Raw, so the 66 imported reports with no project show "
      + "no location at all");
  }
  if (!/Address_Raw/.test(code(modal))) {
    fail("the report form never shows Address_Raw, so the address "
      + "written down on the day cannot be read anywhere");
  }
  /* Read-only. It is evidence about the report, not an address to
     maintain — the project is where a current one lives. An editable
     copy is a second address to disagree with the first. */
  if (/Address_Raw/.test(code(modal))
    && !/Address_Raw[\s\S]{0,120}readOnly|readOnly[\s\S]{0,120}Address_Raw/
      .test(code(modal))) {
    fail("the report form offers Address_Raw as an editable field, "
      + "which makes a second address to disagree with the project's");
  }
}

/* ─── 2. Nothing resolves on an id ───

   Four lookups, four maps, and the view joins each on a NAME. The
   assertions are on the join, not on the presence of the word "name"
   — a map table that carried names and was still joined by id would
   pass a careless eye and import 442 reports to the wrong person. */
{
  for (const [table, what] of [
    ["legacy_ncr_map_region", "regions"],
    ["legacy_ncr_map_auditor", "auditors"],
    ["legacy_ncr_map_person", "people"],
  ]) {
    if (!m62.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) {
      fail(`0262 does not create ${table}, so the ${what} have no map `
        + "from the old numbering to a name");
    }
  }

  /* Each join, as a restriction on the name column. Written as the
     actual SQL rather than as "does it mention Region", because
     "Region" appears in the prose and in the column list too. */
  const joins = [
    [/LEFT JOIN "Region" r\s+ON upper\(btrim\(r\."Region"\)\) = upper\(btrim\(mr\.new_name\)\)/,
      "the region by name"],
    [/LEFT JOIN "Person" pe\s+ON upper\(btrim\(pe\."Person_Name"\)\) = upper\(btrim\(mp\.person_name\)\)/,
      "the owner by name"],
    [/LEFT JOIN "NCR_Status" st ON upper\(btrim\(st\."NCR_Status"\)\) = upper\(btrim\(ms\.name\)\)/,
      "the status by name"],
    [/upper\(btrim\(o\."Name"\)\) = upper\(btrim\(ma\.organisation_name\)\)/,
      "the auditor by name"],
    [/LEFT JOIN "Business_Unit" bu ON upper\(btrim\(bu\."Business_Unit"\)\) = 'OPERATIONS'/,
      "the business unit by name"],
  ];
  for (const [re, what] of joins) {
    if (!re.test(m62)) fail(`0262 does not resolve ${what}`);
  }

  /* And the id is NOT carried across. A view that selected the staged
     Region_ID straight into region_id would make every join above
     decoration. */
  if (/\bAS region_id\b/.test(m62)
    && !/r\."Region_ID" AS region_id/.test(m62)) {
    fail("0262's region_id does not come from the Region table, so the "
      + "region map is decoration");
  }
  if (/\bAS owner_person_id\b/.test(m62)
    && !/pe\."Person_ID" AS owner_person_id/.test(m62)) {
    fail("0262's owner_person_id does not come from the Person table");
  }
  if (/\bAS ncr_status_id\b/.test(m62)
    && !/st\."NCR_Status_ID" AS ncr_status_id/.test(m62)) {
    fail("0262's ncr_status_id does not come from the NCR_Status table");
  }

  /* The auditor restricted by role. "United Utilities" is also a
     customer record in this database; without the restriction the
     auditor could resolve to it. Same guard 0251 uses for the adopter. */
  if (!/"Type_Key" IN \('dno', 'idno', 'gt', 'igt', 'wu', 'iwu'\)/.test(m62)) {
    fail("0262 does not restrict the auditor to organisations that "
      + "operate a network, so a customer of the same name can win");
  }

  /* The old person ids must not be reused as the new ones. */
  if (/INSERT INTO "Person" \([^)]*"Person_ID"/.test(runCode)) {
    fail("part 2 writes Person_ID, which would reuse the old system's "
      + "numbering — old 23 is Laura Cassidy, this database's 23 is "
      + "already somebody else");
  }

  /* The contract is the one exact key, and it is the right one. */
  if (!/p\."Legacy_Contract_ID" = s\.old_contract_id/.test(m62)) {
    fail("0262 does not join the project on Legacy_Contract_ID, which "
      + "is the one exact key this import has");
  }
}

/* ─── 3. The ids are kept, and the sequence moved past them ───

   NCR_ID is GENERATED ALWAYS AS IDENTITY. Without OVERRIDING SYSTEM
   VALUE Postgres ignores the id in the insert and assigns its own,
   which breaks all 98 attachment rows. And with it, the sequence stays
   where it started unless setval is called — so the next report raised
   in the app collides with an imported one, and it reads as the app
   being broken. */
{
  if (!/INSERT INTO "NCR" \([\s\S]*?\)\s*OVERRIDING SYSTEM VALUE/.test(runCode)) {
    fail("part 3 inserts into NCR without OVERRIDING SYSTEM VALUE, so "
      + "the original ids are discarded and the 98 attachment rows "
      + "point at nothing");
  }
  const setvalAt = runCode.search(/setval\(pg_get_serial_sequence\('"NCR"', 'NCR_ID'\)/);
  const insertAt = runCode.search(/INSERT INTO "NCR" \(/);
  if (setvalAt < 0) {
    fail("part 3 never moves the NCR_ID sequence past the imported ids, "
      + "so the next report raised in the app collides with one of them");
  } else if (insertAt >= 0 && setvalAt < insertAt) {
    fail("part 3 calls setval before the insert, which sets the sequence "
      + "from an empty table");
  }

  /* 0261 must have dropped the two columns the import no longer fills,
     and retired their vocabulary with them. A column that cannot be
     filled correctly is one somebody will fill incorrectly. */
  for (const col of ["Auditor_DNO_ID", "Auditor_IDNO_ID"]) {
    if (!m61.includes(`DROP COLUMN IF EXISTS "${col}"`)) {
      fail(`0261 does not drop ${col}, so the old pair survives beside `
        + "the organisation and the two can disagree");
    }
  }
  if (!/CHECK \("Auditor_Type" = ANY \(ARRAY\['Operator'::text, 'Aptus'::text\]\)\)/.test(m61)) {
    fail("0261 does not restrict Auditor_Type to Operator and Aptus, so "
      + "'DNO' and 'IDNO' can still be written");
  }
  /* The pairing. An operator with nobody named reads on screen as
     "audited by —", which is the fault this constraint exists for. */
  if (!/"Auditor_Type" = 'Operator' AND "Auditor_Organisation_ID" IS NOT NULL/.test(m61)) {
    fail("0261 does not require an organisation when the auditor is an "
      + "operator, so a report can claim one and name nobody");
  }
  if (!/"Auditor_Type" = 'Aptus'\s+AND "Auditor_Organisation_ID" IS NULL/.test(m61)) {
    fail("0261 lets an Aptus finding name an outside organisation, which "
      + "contradicts itself");
  }

  /* The four foreign keys. They are what stops a bad map writing a
     wrong id in silence, and NCR being empty is the only moment they
     cost nothing to add. */
  for (const [name, target] of [
    ["ncr_region_fk", "Region"], ["ncr_sub_region_fk", "Sub_Region"],
    ["ncr_project_fk", "Project"], ["ncr_owner_person_fk", "Person"],
  ]) {
    if (!new RegExp(`ADD CONSTRAINT ${name}[\\s\\S]{0,160}REFERENCES "${target}"`)
      .test(m61)) {
      fail(`0261 does not add ${name}, so a wrong ${target} id from the `
        + "import lands without complaint");
    }
  }
}

/* ─── 4. The duplicate reference stops the import ───

   NCR_Reference is unique and the export uses NCR11444 for two
   different reports on two different sites. Postgres would refuse the
   second row, but the useful thing is refusing BEFORE anything is
   written and saying which two rows they are — a half-finished import
   is worse than one that would not start. */
{
  if (!runCode.includes("RAISE EXCEPTION")) {
    fail("part 3 has no guard at all, so it starts writing and stops "
      + "halfway when the duplicate reference is reached");
  }
  if (!/GROUP BY ncr_reference HAVING count\(\*\) > 1/.test(runCode)) {
    fail("part 3 does not look for a repeated NCR_Reference before "
      + "inserting");
  }
  if (!/state <> 'ok'/.test(runCode)) {
    fail("part 3 does not refuse to run when a staged row fails to "
      + "resolve, so rows land with pieces missing");
  }
  /* The guard has to come first. One that runs after the insert is a
     report, not a guard. */
  const guardAt = runCode.search(/RAISE\s+EXCEPTION/);
  const insertAt = runCode.search(/INSERT INTO "NCR" \(/);
  if (guardAt >= 0 && insertAt >= 0 && guardAt > insertAt) {
    fail("part 3's guard runs after the insert, which makes it a report "
      + "rather than a guard");
  }
  /* And it must name both rows. "There is a duplicate" is not enough
     to act on; the user has to decide which site keeps the reference. */
  if (!/1341/.test(run) || !/1342/.test(run)) {
    fail("the run script does not say which two reports share NCR11444, "
      + "so there is nothing to decide between");
  }
}

/* ─── 5. The staging does not stay ───

   The NCR descriptions name members of staff — whose competency
   passport lapsed, who left the PAT labels off. The staging tables
   have row level security switched off, because the Table Editor's
   CSV import goes through PostgREST as the signed-in user and a table
   with RLS on and no policy refuses the insert. So they have to go. */
{
  for (const t of ["legacy_ncr_import", "legacy_ncr_attachment_import",
    "legacy_ncr_map_region", "legacy_ncr_map_auditor", "legacy_ncr_map_person"]) {
    if (!run.includes(`DROP TABLE IF EXISTS ${t}`)) {
      fail(`the run script never drops ${t}`);
    }
  }
  if (!run.includes('DROP VIEW  IF EXISTS "Legacy_NCR_Resolved"')
    && !run.includes('DROP VIEW IF EXISTS "Legacy_NCR_Resolved"')) {
    fail("the run script never drops the Legacy_NCR_Resolved view, which "
      + "reads the staging tables");
  }
  /* The staging tables are named in lower case so the Table Editor's
     CSV button can find them. 0255 learned this the hard way: the
     button builds the name unquoted, Postgres folds it to lower case,
     and a mixed-case table cannot be found. */
  for (const t of ["legacy_ncr_import", "legacy_ncr_attachment_import"]) {
    if (t !== t.toLowerCase()) fail(`${t} is not lower case`);
    if (!m62.includes(`CREATE TABLE IF NOT EXISTS ${t}`)) {
      fail(`0262 does not create ${t} under that exact lower-case name, `
        + "so the CSV import button cannot find it");
    }
  }
  /* The column names, by contrast, must stay quoted and mixed-case:
     the importer maps them by header, and the exports have
     mixed-case headers. */
  if (!/"NCR_Reference"\s+text/.test(m62)) {
    fail("0262's staging columns are not quoted mixed-case names "
      + "matching the export headers");
  }
  /* And why. A bare DROP with no reason is one somebody postpones. */
  if (!/name.{0,40}(members of staff|staff)/i.test(mig0262 + run)) {
    fail("neither 0262 nor the run script says why the staging has to "
      + "be dropped, which is what makes it look optional");
  }
}

/* ─── 6. The attachment rows wait for their files ───

   98 rows, each naming a path inside a storage bucket. The files are
   still in the original system. A row whose file was never copied is a
   broken link in the application: the attachment appears, and clicking
   it fails. No row at all is the honest state until the files are
   across. */
{
  if (!m61.includes('CREATE TABLE IF NOT EXISTS "NCR_Attachment"')) {
    fail("0261 does not create NCR_Attachment, so the 98 rows have "
      + "nowhere to go at all");
  }
  /* Unique path: two rows pointing at one file means deleting one
     attachment breaks the other, and nothing on screen would say why. */
  if (!/"Storage_Path"\s+text\s+NOT NULL UNIQUE/.test(m61)) {
    fail("NCR_Attachment.Storage_Path is not unique, so two rows can "
      + "point at one file and deleting one breaks the other");
  }
  /* The insert must be present but not live. Present, because the SQL
     is the thing that was tested; not live, because the files are not
     there. */
  if (!/INSERT INTO "NCR_Attachment"/.test(run)) {
    fail("the run script has no attachment insert at all, so the 98 "
      + "rows have no route in when the files arrive");
  }
  if (/^(?!\s*--)[\s\S]*?INSERT INTO "NCR_Attachment"/m.test(runCode)) {
    fail("the attachment insert is live, and the files have not been "
      + "copied into storage — every one of the 98 would be a broken "
      + "link");
  }
  if (!/files/i.test(run.slice(run.indexOf("PART 4")))) {
    fail("part 4 does not say that the files are what it is waiting on");
  }
}

/* ─── 7. The three maps are the size they should be ───

   Not a style point. The export names 5 regions, 13 operators and 35
   people; a map short of one of those silently leaves rows unresolved,
   and part 3 then refuses to run with a message about a count rather
   than about what is missing. 0262 asserts the same three counts at
   the end of itself, which is what makes a short map fail loudly. */
{
  const rows = (table) => {
    const at = m62.indexOf(`INSERT INTO ${table}`);
    if (at < 0) return -1;
    const stmt = m62.slice(at, m62.indexOf(";", at));
    return (stmt.match(/^\s*\(/gm) || []).length;
  };
  for (const [table, want, what] of [
    ["legacy_ncr_map_region", 5, "regions the export uses"],
    ["legacy_ncr_map_auditor", 13, "operators that raised a report"],
    ["legacy_ncr_map_person", 35, "people that own one"],
  ]) {
    const got = rows(table);
    if (got !== want) {
      fail(`${table} seeds ${got} rows, and the export names ${want} `
        + `${what}`);
    }
  }
  for (const want of [5, 13, 35]) {
    if (!new RegExp(`<> ${want} THEN`).test(m62)) {
      fail(`0262 does not assert its own map of ${want} rows, so a short `
        + "map is only noticed as an unresolved-row count later");
    }
  }
}

/* ─── 8. The auditor's name is fetched from somewhere that serves it ───

   Found by reading admin.js rather than by running anything, which is
   why it is a section: the auditor column resolves an Organisation_ID
   to a name, and `adminList("Organisation")` cannot do it. That
   endpoint serves a list of 158 named tables and Organisation is not
   among them — organisations have their own endpoint, because writing
   one touches roles, branches and contacts.

   The failure is silent. Both screens wrap the lookup in a catch that
   returns no rows, so a refused request leaves the names map empty and
   every imported report reads as the bare word "Operator". Nothing
   errors, nothing is blank, and 1,640 auditors are simply not shown. */
{
  const admin = src("./netlify/functions/admin.js");
  const servedByAdmin = /^\s*Organisation\s*:/m.test(code(admin));

  for (const [file, name] of [[list, "the register"], [code(src(
    "./src/features/hsqe/HsqeDashboardPage.jsx")), "the HSQE dashboard"]]) {
    const f = code(file);
    if (!/Auditor_Organisation_ID|operatorName|operator:/.test(f)) continue;

    if (/adminList\("Organisation"\)|soft\("Organisation"\)/.test(f)
      && !servedByAdmin) {
      fail(`${name} asks adminList for "Organisation", and the admin `
        + "endpoint does not serve that table — the request is refused, "
        + "the catch swallows it, and every imported auditor reads as "
        + "the word \"Operator\"");
    }
    if (!/listOrganisations\(\)/.test(f) && !servedByAdmin) {
      fail(`${name} has no route to an organisation's name, so the `
        + "auditor column cannot show one");
    }
  }

  /* Operator_Utility, by contrast, IS in the admin list — and must
     stay there, because that is where the modal's picker comes from. */
  if (!/^\s*Operator_Utility\s*:/m.test(code(admin))) {
    fail("admin.js no longer serves Operator_Utility, so the report "
      + "form has no operators to offer");
  }

  /* And the mock has to answer too. A mock list that comes back empty
     makes the auditor column read as "Operator" for every row, which
     is the same silent failure with nothing to catch it. */
  const orgApi = code(src("./src/api/organisations.js"));
  if (/USE_MOCKS.*return \{ rows: \[\] \}/.test(orgApi)) {
    fail("the mock organisations list is empty, so with mocks on every "
      + "auditor reads as \"Operator\" and the screen looks broken");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The NCR import resolves every lookup by name, keeps the original "
    + "ids and moves the sequence past them, refuses to start on the "
    + "duplicate reference, writes nothing the screens cannot show, "
    + "holds the attachment rows back until their files are across, and "
    + "drops its own staging.");
process.exit(bad ? 1 : 0);
