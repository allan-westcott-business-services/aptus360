/* The original app's Tenders.

   ── What the job actually is ──

   5,454 tenders. A tender that was won became a separate Contract
   record over there and is ONE project here, so the work is not loading
   them — it is deciding, per tender, whether it is already in this
   system under its contract. Get that wrong one way and the same site
   exists twice; get it wrong the other way and a tender is merged into
   somebody else's project.

   ── What the old data gives us, measured ──

     tender reference on the contract   112 (exact)
     a plot naming both                  20 pairs (exact)
     same site AND same customer      1,540, 13 of them ambiguous

   The third is a name match, which this import refuses everywhere else.
   Agreed before building, and for a stated reason: attaching a project
   to the wrong CUSTOMER shows one developer another developer's work
   and nobody sees it; merging a tender into the wrong project of the
   SAME customer at a site of the same name is smaller, visible on the
   project, and contract site names are nearly unique — 15 repeats in
   1,910.

   ── The things that must not go wrong ──

   1. Matching on less than that. Site name alone, or a customer that
      does not match, or a pair that names several projects. Section 2.

   2. A merge that overwrites work. Part 2 runs over projects people may
      already be using. Section 3.

   3. Two projects reading as the same project. 4,293 tenders carry a
      reference and only 3,795 are distinct — revisions share one — and
      Display_Ref is built from it. Section 4.

   4. A tender that ends up nowhere. Every one of the 5,454 is either
      merged into a project or becomes one. Section 5.

   Run: node checklegacytenders.mjs */

import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const src = (p) => readFileSync(p, "utf8");

const view = src("./supabase/migrations/0252_legacy_tender_import.sql");
const sql = src("./import_legacy_tenders.sql");
const plots = src("./import_legacy_plots.sql");
const api = src("./netlify/functions/projects.js");

// ─── 1. The staging table takes the file as it is ───
{
  const CSV = ["Tender_ID", "Date_Received", "Customer_ID", "Region_ID",
    "Tender_Status_ID", "Quote_Type_ID", "BDD_KAM_ID", "Estimator", "Auto_Base_Points",
    "I_and_C", "Revision", "Good_To_Go", "Branch_ID", "Is_Priority", "Site_Name",
    "Site_Address", "Tender_Quote_Value", "Secured_Date", "Linked_Plot_Count",
    "Tender_Ref", "Notes", "Phase_Type_ID", "Postcode", "Sub_Region_ID", "KPI_Date",
    "Date_Sent", "Quote_Value_To_Client", "Quote_Value_To_Aptus", "Status_Changed_Date",
    "Manual_Base_Points", "Option_Letter", "Tender_Base_Points", "Tender_Total_Points",
    "Tender_Manual_Total_Points", "Heat_Pump_Model_ID", "Tender_Notes", "PV_Input_Level"];
  const t = view.slice(view.indexOf('CREATE TABLE IF NOT EXISTS "Legacy_Tender_Import" ('),
    view.indexOf('COMMENT ON TABLE "Legacy_Tender_Import"'));
  for (const c of CSV) {
    if (!new RegExp(`"${c}"`).test(t)) {
      fail(`the staging table has no ${c} column, so the CSV load stops on it`);
    }
  }
  if (/\b(date|numeric|integer|boolean)\b/.test(t.replace(/_Import_ID[^,]*,/, ""))) {
    fail("a staging column is typed, so the file has to be clean before it loads");
  }
}

// ─── 2. A merge needs more than a name ───
{
  for (const [re, what] of [
    [/btrim\(p\."Tender_Ref"\) = btrim\(t\."Tender_Ref"\)/, "the tender reference route is gone"],
    [/WHERE COALESCE\(btrim\(lp\."Tender_ID"\), ''\) <> ''\s*\n\s*AND COALESCE\(btrim\(lp\."Contract_ID"\), ''\) <> ''/,
      "the shared-plot route no longer requires a plot naming BOTH, so it "
      + "matches on nothing"],
  ]) {
    if (!re.test(view)) fail(what);
  }
  /* The site route takes the CUSTOMER as well. Without it, two builders
     on a site of the same name become one project. */
  if (!/sp\.customer_id IS NOT DISTINCT FROM t\.customer_id/.test(view)) {
    fail("the site-name route does not also require the same customer");
  }
  /* And only where that pair names exactly one project. */
  if (!/WHEN sp\.how_many = 1\s+THEN sp\.project_id/.test(view)) {
    fail("an ambiguous site and customer pair is still matched, so a tender is "
      + "merged into whichever project happened to sort first");
  }
  if (!/AMBIGUOUS/.test(view)) fail("the ambiguous case is not named, so it cannot be listed");
  /* Nothing looser than that anywhere. */
  if (/ILIKE\s*'%/.test(view) || /similarity\(/.test(view)) {
    fail("the tender match is fuzzy somewhere");
  }
  /* And the site key is the site NAME. A mutation that renamed it and
     left an empty string behind went through: the customer check was
     still there, the ambiguity check was still there, and every tender
     silently matched the first project with no site name. */
  if (!/upper\(btrim\(COALESCE\(i\."Site_Name", ''\)\)\)\s+AS site_key/.test(view)) {
    fail("the site key is not the site name, so the site route compares "
      + "something else entirely");
  }
  /* The route is reported, or a merge cannot be argued with. */
  if (!/AS match_route/.test(view)) fail("the match does not say which route decided it");
}

// ─── 3. A merge does not overwrite anybody's work ───
{
  /* The section heading, not the word. "PART 3" also appears in the
     contents at the top of the file, which is BEFORE part 2 — so
     slicing to it gave an empty string and the check reported part 2
     missing when it was there all along. */
  const PART3 = "--  PART 3 \u2014 the tenders";
  const part2 = sql.slice(sql.indexOf("UPDATE \"Project\" p"), sql.indexOf(PART3));
  if (!part2) { fail("part 2 is missing"); }
  else {
    /* Every column but Date_Received and the legacy key is written only
       where it is still empty. Checked by counting: a COALESCE that
       starts with the project's own value is what leaves it alone. */
    const sets = [...part2.matchAll(/"(\w+)"\s*=\s*COALESCE\(p\."\1"/g)].map((m) => m[1]);
    for (const c of ["KPI_Date", "Date_Sent", "Estimator_ID", "BDD_KAM_ID",
      "Quote_Type_ID", "I_and_C", "Is_Priority", "Postcode"]) {
      if (!sets.includes(c)) {
        fail(`part 2 writes ${c} without checking it is empty — it would overwrite `
          + "whatever somebody has set by hand");
      }
    }
    /* Date_Received is the deliberate exception and has to stay one. */
    if (!/"Date_Received"\s*=\s*COALESCE\(NULLIF\(btrim\(m\."Date_Received"\)/.test(part2)) {
      fail("part 2 does not replace the stand-in received date, which is the "
        + "main thing a tender is worth");
    }
    /* And it only touches a project once. */
    if (!/AND p\."Legacy_Tender_ID" IS NULL/.test(part2)) {
      fail("part 2 can run over a project it has already merged a tender into");
    }
  }
}

// ─── 4. No two projects can read as the same project ───
{
  /* A tender keeps its own reference only when it is the only one
     asking for it AND nothing in Project already has it. */
  if (!/WHERE w\.n = 1/.test(sql)) {
    fail("a reference wanted by two tenders is given to both");
  }
  if (!/NOT EXISTS \(SELECT 1 FROM "Project" p\s*\n\s*WHERE p\."Project_Ref" = btrim/.test(sql)) {
    fail("a tender can take a reference a project already has");
  }
  /* And the import refuses to finish if any slipped through. */
  if (!/RAISE EXCEPTION 'The import has left % references used by more than one/.test(sql)) {
    fail("the import does not check for duplicate references before it finishes");
  }
}

// ─── 5. Every tender ends up somewhere ───
{
  /* In PART 3, not anywhere in the file — the part 1 reports mention it
     too, so testing the whole file passed on a part 3 that took every
     tender and made a second project for every contract. */
  if (!/WHERE m\.matched_project_id IS NULL/
    .test(sql.slice(sql.indexOf("--  PART 3 \u2014 the tenders")))) {
    fail("part 3 does not limit itself to the unmatched tenders, so every "
      + "merged tender also becomes a second project");
  }
  if (!/p\."Legacy_Tender_ID" = m\.tender_id/.test(sql)
    && !/NOT EXISTS \(SELECT 1 FROM "Project" p WHERE p\."Legacy_Tender_ID" = m\.tender_id\)/.test(sql)) {
    fail("part 3 does not skip tenders it has already imported");
  }
  /* The tender-stage projects carry what a tender is FOR: the dates and
     the people the contract record never had. */
  const part3 = sql.slice(sql.indexOf("--  PART 3 \u2014 the tenders"));
  for (const c of ["Date_Received", "KPI_Date", "Date_Sent", "Estimator_ID",
    "BDD_KAM_ID", "Tender_Quote_Value", "Legacy_Tender_ID"]) {
    if (!new RegExp(`"${c}"`).test(part3)) fail(`part 3 does not write ${c}`);
  }
  /* And the received date is the TENDER'S. Naming the column is not
     enough: a tender is the enquiry, so this is the one record in the
     whole import that genuinely has one, and writing a constant there
     would lose the only real copy. */
  if (!/COALESCE\(NULLIF\(btrim\(a\."Date_Received"\), ''\)::date/.test(part3)) {
    fail("part 3 does not take the received date from the tender — the only "
      + "place in the old system that has one");
  }
  /* And the columns it writes are ones the app reads. */
  const known = (() => {
    const i = api.indexOf("const PROJECT_COLUMNS = [");
    return [...api.slice(i, api.indexOf("].join(\",\")", i)).matchAll(/"([A-Za-z_]+)"/g)]
      .map((m) => m[1]);
  })();
  const i = part3.indexOf('INSERT INTO "Project" (');
  const cols = [...part3.slice(i, part3.indexOf(")\nSELECT", i)).matchAll(/"([A-Za-z_]+)"/g)]
    .map((m) => m[1]).filter((c) => c !== "Project");
  for (const c of cols) {
    if (!known.includes(c)) {
      fail(`part 3 writes Project.${c}, which the app does not read`);
    }
  }
}

// ─── 6. The tender plots follow, and the revisions do not ───
{
  /* 174,650 plots belong to tenders and land once those projects exist,
     which is why the plot import has a tender leg rather than a comment
     telling somebody to write one. */
  if (!/p\."Legacy_Tender_ID" = NULLIF\(btrim\(i\."Tender_ID"\), ''\)::bigint/.test(plots)) {
    fail("the plot import has no tender leg, so 174,650 plots never land");
  }
  /* And query 1.7 explains the ones that deliberately do not: a project
     records one Legacy_Tender_ID, so the revisions that lost carry plots
     for a site already imported under its contract. Importing those
     would put two plot 1s on one project. */
  if (!/a revision of a tender already merged into its contract - skipped on purpose/.test(plots)) {
    fail("the plots that are deliberately skipped are not explained, so 6,546 "
      + "of them look like a fault");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Tenders merge into the contract they became only on evidence, fill in what "
    + "the contract record never had without overwriting anybody, and the rest "
    + "become their own projects without two ever reading alike.");
process.exit(bad ? 1 : 0);
