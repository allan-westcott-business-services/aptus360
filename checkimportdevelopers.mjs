/* The imported projects get a developer RECORD, not just the cache.

   ── What went wrong ──

   The import sets "Project"."Organisation_Branch_ID" and creates no
   "Project_Developer" row. That column is a cache; the row is the
   record. Three readers go to the record and ignore the cache on
   purpose, because the cache had drifted on 19 of 26 live projects:

     - the projects list (projects.js embeds Project_Developer)
     - the developer portal (portal.js: "the record rather than the
       cached column on Project", and "a scheme with no developer
       recorded yields nothing")
     - the Stakeholder tab, where the record is edited

   So 1,531 projects whose customer matched perfectly would have come in
   blank in the list, empty on the Stakeholder tab, and invisible in the
   developer's own portal. Nothing would have errored. That is recurring
   fault 4: a value stored and never read looks exactly like a value
   nobody set.

   ── The things that must not go wrong ──

   1. Reaching a real project. The Legacy_ guard is the whole safety of
      attach_developers.sql. 0231 counted six live projects holding a
      cached branch with no record - those want a person on the
      Stakeholder tab, not a script guessing from a stale cache.
      Section 2.

   2. Writing the dead columns. Customer_ID and Branch_ID are still on
      Project_Developer and point at tables emptied on 26 Aug. Before
      0231 a Branch_ID here would null out the branch on the next
      Stakeholder save. Section 3.

   3. Running twice. Section 4.

   4. Writing a column the endpoint does not select, which is fault 4
      again from the other side. Section 5.

   5. The 0233 pre-flight going missing. Without 0233 the import cannot
      insert a project at all. Section 6.

   Run: node checkimportdevelopers.mjs */

import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const src = (p) => readFileSync(p, "utf8");

/* Comments out before anything is asserted. Both these files argue for
   themselves at length and name every column they deliberately do NOT
   write - so a test for "Branch_ID" against the raw text passes on the
   paragraph explaining why Branch_ID is left alone. That is the weak
   assertion this codebase keeps producing. */
const sqlCode = (p) => src(p)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--.*$/gm, " ");

const attach = sqlCode("./attach_developers.sql");
/* The undo is deliberately commented out so nobody runs it by accident -
   the same pattern as the other import files - so it is only visible in
   the raw text. Asserted there, and only the undo. */
const attachRaw = src("./attach_developers.sql");
const wai = sqlCode("./where_am_i.sql");
const devApi = src("./netlify/functions/developers.js");
const projApi = src("./netlify/functions/projects.js");
const portalApi = src("./netlify/functions/portal.js");

/* The INSERT alone, so a guard somewhere else in the file cannot stand
   in for a guard on the statement that writes. */
const insertStmt = (() => {
  const i = attach.indexOf('INSERT INTO "Project_Developer"');
  if (i < 0) return "";
  const end = attach.indexOf(";", i);
  return attach.slice(i, end < 0 ? attach.length : end);
})();

// ─── 1. It writes the record at all ───
{
  if (!insertStmt) {
    fail("attach_developers.sql does not insert into Project_Developer, so the "
      + "imported projects have no developer the app will read");
  }
}

// ─── 2. Only imported projects ───
{
  if (!/Legacy_Contract_ID"\s+IS NOT NULL\s+OR\s+p?\.?"?Legacy_Tender_ID"\s+IS NOT NULL/s
    .test(insertStmt)) {
    fail("the insert is not restricted to imported projects - it can reach the "
      + "real ones, and 0231 counted six holding a cache with no record");
  }
  /* And the undo, which deletes. An undo without the same guard is
     worse than the insert without it. */
  const undo = attachRaw.slice(attachRaw.indexOf("DELETE FROM"));
  if (!undo || !/Legacy_Contract_ID/.test(undo)) {
    fail("the undo is not restricted to imported projects");
  }
}

// ─── 3. The dead columns stay empty ───
{
  const cols = insertStmt.slice(0, insertStmt.indexOf(")") + 1);
  for (const dead of ["Customer_ID", "Branch_ID"]) {
    /* Organisation_Branch_ID legitimately contains "Branch_ID", so the
       match is anchored on the quote that opens the column name. */
    if (new RegExp(`"${dead}"`).test(cols)) {
      fail(`the insert writes ${dead}, a dead column pointing at a table `
        + `emptied on 26 Aug - and before 0231 it would null out the branch`);
    }
  }
  if (!/"Is_Main"/.test(cols)) {
    fail("the insert does not set Is_Main, and every reader looks for the row "
      + "marked main - projects.js, portal.js and the Stakeholder tab alike");
  }
}

// ─── 4. Twice is the same as once ───
{
  /* On the PROJECT, not on the (project, branch) pair: a project that
     already has any developer is left alone, so this cannot argue with
     somebody who has done the Stakeholder tab by hand. */
  if (!/NOT EXISTS\s*\(\s*SELECT 1 FROM "Project_Developer" d\s+WHERE d\."Project_ID" = p\."Project_ID"\s*\)/s
    .test(insertStmt)) {
    fail("the insert does not skip projects that already have a developer, so "
      + "a second run adds a duplicate and two rows fight over Is_Main");
  }
  if (!/DELETE FROM "Project_Developer"/.test(attachRaw)) {
    fail("attach_developers.sql does not say how to undo itself");
  }
}

// ─── 5. Nothing written that the endpoint cannot read (fault 4) ───
{
  const D = (devApi.match(/const D = "([^"]+)"/) || [])[1] || "";
  const allowed = new Set(D.split(","));
  if (!allowed.size) {
    fail("could not read developers.js's column list, so the insert cannot be "
      + "checked against it");
  } else {
    for (const m of insertStmt.slice(0, insertStmt.indexOf(")") + 1)
      .matchAll(/"([A-Za-z_]+)"/g)) {
      if (m[1] !== "Project_Developer" && !allowed.has(m[1])) {
        fail(`the insert writes ${m[1]}, which developers.js does not select - `
          + `a column absent from the select list is neither saved nor returned`);
      }
    }
  }
  /* And that the readers this is FOR really do read the record. If
     either ever goes back to the cache, this whole file is pointless
     and should be deleted rather than left running. */
  if (!/from\("Project_Developer"\)/.test(portalApi)) {
    fail("portal.js no longer reads Project_Developer - attach_developers.sql "
      + "may no longer be needed");
  }
  if (!/Project_Developer\(/.test(projApi)) {
    fail("the projects list no longer embeds Project_Developer - "
      + "attach_developers.sql may no longer be needed");
  }
}

// ─── 6. The 0233 pre-flight ───
{
  /* Asserted as a test on the function's SOURCE, not as the string
     0233 or Customer_ID appearing - both are all over the prose in
     both files. */
  const preflight = /proname = 'log_project_changes'[\s\S]{0,120}prosrc ILIKE '%Customer_ID%'/;
  if (!preflight.test(wai)) {
    fail("where_am_i.sql does not check whether log_project_changes still "
      + "names the dropped column - without 0233 the import cannot insert a "
      + "single project");
  }
  if (!preflight.test(attach)) {
    fail("attach_developers.sql does not check it either, and it is run on its "
      + "own after the import");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The imported projects get a developer record the app actually reads, only "
    + "the imported ones, the dead columns stay empty, running it twice changes "
    + "nothing, and both files refuse to let 0233 go unnoticed.");
process.exit(bad ? 1 : 0);
