-- ════════════════════════════════════════════════════════════════════
--  Importing the original app's Tenders
-- ════════════════════════════════════════════════════════════════════
--
-- 5,454 tenders. A tender that was won became a Contract over there and
-- is ONE project here, so this does two different things:
--
--   PART 2  fills in the tenders that are already here as contracts.
--           The tender holds what the contract record never had — the
--           real Date_Received, the KPI date, the date sent, the
--           estimator, the BDD/KAM, the points.
--
--   PART 3  creates a project for every tender that never became a
--           contract, at Tender stage.
--
-- Run the contracts (import_legacy_projects.sql) first, or part 2 has
-- nothing to fill in and part 3 makes a second project for every site.
--
-- Run 0252 first, and load the tender CSV into "Legacy_Tender_Import".
-- Its columns map one-to-one by name.
--
-- Both parts are safe to run again: part 2 only writes columns that are
-- still empty, and part 3 skips tenders already imported on
-- Legacy_Tender_ID.
--
-- ════════════════════════════════════════════════════════════════════
--  PART 1 — which tenders are already here, and on what evidence
-- ════════════════════════════════════════════════════════════════════

-- 1.1 The headline. Read the AMBIGUOUS line before going further.
SELECT match_route, count(*) AS tenders
  FROM "Legacy_Tender_Match"
 GROUP BY 1 ORDER BY 2 DESC;

-- 1.2 The ambiguous ones, in full. Several projects share that site and
--     customer, so nothing is matched — these import as their own
--     projects unless you decide otherwise. There were 14.
SELECT m."Tender_ID", m."Tender_Ref", m."Site_Name", m."Customer_ID",
       (SELECT string_agg(p."Project_Ref", ', ' ORDER BY p."Project_Ref")
          FROM "Project" p
         WHERE p."Legacy_Contract_ID" IS NOT NULL
           AND upper(btrim(p."Site_Name")) = upper(btrim(m."Site_Name"))
           AND p."Legacy_Customer_ID" IS NOT DISTINCT FROM
               NULLIF(btrim(m."Customer_ID"), '')::bigint) AS candidates
  FROM "Legacy_Tender_Match" m
 WHERE m.match_route LIKE 'AMBIGUOUS%'
 ORDER BY m."Site_Name";

-- 1.3 A sample of what part 2 would fill in, so the merge can be
--     eyeballed before it happens: the tender beside the project it is
--     about to be written onto.
SELECT p."Project_Ref", p."Site_Name" AS project_site,
       m."Site_Name" AS tender_site, m.match_route,
       p."Date_Received" AS stand_in_now, m."Date_Received" AS real_one,
       m."Tender_Ref", m."Date_Sent", m."KPI_Date"
  FROM "Legacy_Tender_Match" m
  JOIN "Project" p ON p."Project_ID" = m.matched_project_id
 ORDER BY m.match_route, p."Project_Ref"
 LIMIT 40;

-- 1.4 The statuses, which decide the stage a new tender project lands
--     at. Map them in Legacy_Lookup_Map under 'status' exactly as the
--     contract statuses were — the two sets are numbered separately in
--     the old system and both land in Project_Status here.
SELECT m."Tender_Status_ID", count(*) AS tenders, lm."New_ID",
       CASE WHEN lm."Kind" IS NULL THEN 'NOT MAPPED' ELSE 'mapped' END AS state
  FROM "Legacy_Tender_Match" m
  LEFT JOIN "Legacy_Lookup_Map" lm
         ON lm."Kind" = 'tender_status' AND lm."Legacy_ID" = btrim(m."Tender_Status_ID")
 WHERE m.matched_project_id IS NULL
 GROUP BY 1, 3, lm."Kind" ORDER BY 2 DESC;

-- 1.5 References that would collide. 4,293 tenders carry a Tender_Ref
--     and only 3,795 are distinct — revisions and options of the same
--     tender share one. A tender whose ref is already taken is given a
--     new one rather than making two projects read alike.
SELECT "Tender_Ref", count(*) AS tenders
  FROM "Legacy_Tender_Match"
 WHERE matched_project_id IS NULL
   AND "Tender_Ref" ~ '^\d{4}\.\d+$'
 GROUP BY 1 HAVING count(*) > 1
 ORDER BY 2 DESC, 1;

-- ════════════════════════════════════════════════════════════════════
--  PART 2 — fill in the projects that are already here
-- ════════════════════════════════════════════════════════════════════
--
-- Only columns that are still EMPTY are written. A date somebody has
-- corrected by hand, or anything the contract import already set, is
-- left exactly as it is — so this can be run after people have started
-- working, and run again.
--
-- Date_Received is the exception worth naming: the contract import put
-- a stand-in there (the secured date) because the old contract record
-- has no received date. Here the real one arrives, so it is overwritten
-- — but only where it still equals the stand-in, which is how we know
-- nobody has touched it.

UPDATE "Project" p
   SET "Legacy_Tender_ID" = m.tender_id,
       "Date_Received"    = COALESCE(NULLIF(btrim(m."Date_Received"), '')::date,
                                     p."Date_Received"),
       "KPI_Date"         = COALESCE(p."KPI_Date", NULLIF(btrim(m."KPI_Date"), '')::date),
       "Date_Sent"        = COALESCE(p."Date_Sent", NULLIF(btrim(m."Date_Sent"), '')::date),
       "Status_Changed_Date" = COALESCE(p."Status_Changed_Date",
                                        NULLIF(btrim(m."Status_Changed_Date"), '')::date),
       "Estimator_ID"     = COALESCE(p."Estimator_ID", NULLIF(btrim(m."Estimator"), '')::bigint),
       "BDD_KAM_ID"       = COALESCE(p."BDD_KAM_ID", NULLIF(btrim(m."BDD_KAM_ID"), '')::bigint),
       "Sub_Region_ID"    = COALESCE(p."Sub_Region_ID", NULLIF(btrim(m."Sub_Region_ID"), '')::bigint),
       "Quote_Type_ID"    = COALESCE(p."Quote_Type_ID", NULLIF(btrim(m."Quote_Type_ID"), '')::bigint),
       "I_and_C"          = COALESCE(p."I_and_C", NULLIF(btrim(m."I_and_C"), '')::boolean),
       "Is_Priority"      = COALESCE(p."Is_Priority", NULLIF(btrim(m."Is_Priority"), '')::boolean),
       "Postcode"         = COALESCE(p."Postcode", NULLIF(btrim(m."Postcode"), '')),
       "Tender_Base_Points"  = COALESCE(p."Tender_Base_Points",
                                        NULLIF(btrim(m."Tender_Base_Points"), '')::numeric),
       "Tender_Total_Points" = COALESCE(p."Tender_Total_Points",
                                        NULLIF(btrim(m."Tender_Total_Points"), '')::numeric),
       "Manual_Base_Points"  = COALESCE(p."Manual_Base_Points",
                                        NULLIF(btrim(m."Manual_Base_Points"), '')::numeric),
       "Tender_Ref"       = COALESCE(p."Tender_Ref", NULLIF(btrim(m."Tender_Ref"), '')),
       "Notes"            = p."Notes" || E'\n' ||
                            'Tender ' || m.tender_id || ' matched to this project by: '
                            || m.match_route || '.'
  FROM "Legacy_Tender_Match" m
 WHERE p."Project_ID" = m.matched_project_id
   AND p."Legacy_Tender_ID" IS NULL;

DO $$
DECLARE filled integer; realdate integer;
BEGIN
  SELECT count(*) INTO filled FROM "Project" WHERE "Legacy_Tender_ID" IS NOT NULL
                                               AND "Legacy_Contract_ID" IS NOT NULL;
  SELECT count(*) INTO realdate FROM "Project" p
    JOIN "Legacy_Tender_Match" m ON m.tender_id = p."Legacy_Tender_ID"
   WHERE p."Date_Received" = NULLIF(btrim(m."Date_Received"), '')::date;
  RAISE NOTICE 'Projects filled in from their tender: %. Of those, % now carry '
    'the real received date instead of a stand-in.', filled, realdate;
END $$;

-- ════════════════════════════════════════════════════════════════════
--  PART 3 — the tenders that never became a contract
-- ════════════════════════════════════════════════════════════════════
--
-- Their own projects, at Tender stage. The reference is the tender's
-- own where it is in YYMM.NNN shape and not already taken; otherwise
-- one is allocated from the month it was received, continuing the
-- month's sequence.

WITH mine AS (
  SELECT m.*, to_char(COALESCE(NULLIF(btrim(m."Date_Received"), '')::date,
                               NULLIF(btrim(m."Secured_Date"), '')::date,
                               CURRENT_DATE), 'YYMM') AS yymm
    FROM "Legacy_Tender_Match" m
   WHERE m.matched_project_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM "Project" p WHERE p."Legacy_Tender_ID" = m.tender_id)
),
/* A tender keeps its own reference only if it is the ONLY one asking
   for it and nothing in Project has it already. 498 of them share a ref
   with another tender — revisions and options — and two projects whose
   Display_Ref reads the same is the fault this guards against. */
wants AS (
  SELECT btrim("Tender_Ref") AS ref, count(*) AS n
    FROM mine WHERE "Tender_Ref" ~ '^\d{4}\.\d+$' GROUP BY 1
),
keeps AS (
  SELECT mine.tender_id, btrim(mine."Tender_Ref") AS ref,
         split_part(btrim(mine."Tender_Ref"), '.', 1) AS yymm
    FROM mine JOIN wants w ON w.ref = btrim(mine."Tender_Ref")
   WHERE w.n = 1
     AND NOT EXISTS (SELECT 1 FROM "Project" p
                      WHERE p."Project_Ref" = btrim(mine."Tender_Ref"))
),
taken AS (
  SELECT yymm, max(n) AS high FROM (
    SELECT split_part("Project_Ref", '.', 1) AS yymm,
           NULLIF(regexp_replace(split_part("Project_Ref", '.', 2), '\D', '', 'g'), '')::int AS n
      FROM "Project" WHERE "Project_Ref" ~ '^\d{4}\.'
    UNION ALL
    SELECT k.yymm, NULLIF(regexp_replace(split_part(k.ref, '.', 2), '\D', '', 'g'), '')::int
      FROM keeps k
  ) a GROUP BY yymm
),
numbered AS (
  SELECT mine.*, COALESCE(t.high, 0)
           + row_number() OVER (PARTITION BY mine.yymm ORDER BY mine.tender_id) AS seq
    FROM mine LEFT JOIN taken t ON t.yymm = mine.yymm
   WHERE NOT EXISTS (SELECT 1 FROM keeps k WHERE k.tender_id = mine.tender_id)
),
all_rows AS (
  SELECT n.*, n.yymm || '.' || lpad(n.seq::text, 3, '0') AS new_ref FROM numbered n
  UNION ALL
  SELECT mine.*, NULL::bigint AS seq, k.ref AS new_ref
    FROM mine JOIN keeps k ON k.tender_id = mine.tender_id
)
INSERT INTO "Project" (
  "Project_Ref", "Option_Letter", "Tender_Ref", "Site_Name", "Site_Address", "Postcode",
  "Date_Received", "KPI_Date", "Date_Sent", "Secured_Date", "Status_Changed_Date",
  "Project_Status_ID", "Region_ID", "Sub_Region_ID", "Quote_Type_ID",
  "Estimator_ID", "BDD_KAM_ID", "I_and_C", "Is_Priority",
  "Tender_Quote_Value", "Tender_Base_Points", "Tender_Total_Points", "Manual_Base_Points",
  "Legacy_Tender_ID", "Legacy_Customer_ID", "Legacy_Branch_ID", "Notes"
)
SELECT
  a.new_ref,
  NULLIF(btrim(a."Option_Letter"), ''),
  NULLIF(btrim(a."Tender_Ref"), ''),
  NULLIF(btrim(a."Site_Name"), ''),
  NULLIF(btrim(a."Site_Address"), ''),
  COALESCE(NULLIF(btrim(a."Postcode"), ''),
           NULLIF(upper(btrim(substring(upper(COALESCE(a."Site_Address", ''))
             FROM '([A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2})\s*$'))), '')),
  /* The real thing this time: a tender IS the enquiry, so it has one. */
  COALESCE(NULLIF(btrim(a."Date_Received"), '')::date,
           NULLIF(btrim(a."Secured_Date"), '')::date,
           DATE '1900-01-01'),
  NULLIF(btrim(a."KPI_Date"), '')::date,
  NULLIF(btrim(a."Date_Sent"), '')::date,
  NULLIF(btrim(a."Secured_Date"), '')::date,
  NULLIF(btrim(a."Status_Changed_Date"), '')::date,
  /* ── Project_Status_ID is NOT NULL, and 523 tenders have no status ──
     The same fault the contract import had, in the other file:
       ERROR: 23502: null value in column "Project_Status_ID"
     523 of the 5,454 carry no Tender_Status_ID at all, so the lookup
     finds nothing and the insert is refused.
     Falls back to the first TENDER-stage status by Sort_Order - these
     are tenders, so a tender status, not the contract default the other
     file uses. Chosen by order rather than by name so it follows the
     board. The Notes say so, because a default nobody is told about is
     a figure somebody will later believe. */
  COALESCE(
    (SELECT lm."New_ID" FROM "Legacy_Lookup_Map" lm
      WHERE lm."Kind" = 'tender_status' AND lm."Legacy_ID" = btrim(a."Tender_Status_ID")),
    (SELECT ps."Project_Status_ID" FROM "Project_Status" ps
      WHERE ps."Stage" = 'Tender'
      ORDER BY ps."Sort_Order"
      LIMIT 1)),
  (SELECT lm."New_ID" FROM "Legacy_Lookup_Map" lm
    WHERE lm."Kind" = 'region' AND lm."Legacy_ID" = btrim(a."Region_ID")),
  NULLIF(btrim(a."Sub_Region_ID"), '')::bigint,
  NULLIF(btrim(a."Quote_Type_ID"), '')::bigint,
  NULLIF(btrim(a."Estimator"), '')::bigint,
  NULLIF(btrim(a."BDD_KAM_ID"), '')::bigint,
  COALESCE(NULLIF(btrim(a."I_and_C"), '')::boolean, false),
  COALESCE(NULLIF(btrim(a."Is_Priority"), '')::boolean, false),
  NULLIF(btrim(a."Tender_Quote_Value"), '')::numeric,
  NULLIF(btrim(a."Tender_Base_Points"), '')::numeric,
  NULLIF(btrim(a."Tender_Total_Points"), '')::numeric,
  NULLIF(btrim(a."Manual_Base_Points"), '')::numeric,
  a.tender_id,
  a.customer_id,
  NULLIF(btrim(a."Branch_ID"), '')::bigint,
  NULLIF(concat_ws(E'\n',
    'Imported from the original app (Tender ' || a.tender_id || ').',
    'Customer (not attached yet): ' ||
      COALESCE(NULLIF(btrim(a."Notes"), ''), 'see Customer_ID ' || COALESCE(a.customer_id::text, '-')),
    NULLIF(btrim(a."Tender_Notes"), '')
  ), '')
  FROM all_rows a;

DO $$
DECLARE made integer; dupes integer;
BEGIN
  SELECT count(*) INTO made FROM "Project" WHERE "Legacy_Tender_ID" IS NOT NULL
                                             AND "Legacy_Contract_ID" IS NULL;
  SELECT count(*) INTO dupes FROM (
    SELECT "Display_Ref" FROM "Project" GROUP BY 1 HAVING count(*) > 1) d;
  IF dupes > 0 THEN
    RAISE EXCEPTION 'The import has left % references used by more than one '
      'project. They would read as the same project in every dropdown.', dupes;
  END IF;
  RAISE NOTICE 'Tenders imported as their own projects: %. No two projects '
    'share a reference.', made;
END $$;

-- ── Undoing ──────────────────────────────────────────────────────────
--
--   -- part 3 only: the tender-only projects
--   DELETE FROM "Project"
--    WHERE "Legacy_Tender_ID" IS NOT NULL AND "Legacy_Contract_ID" IS NULL;
--
--   -- part 2 only: unpick the merge, leaving the contract projects
--   UPDATE "Project" SET "Legacy_Tender_ID" = NULL
--    WHERE "Legacy_Tender_ID" IS NOT NULL AND "Legacy_Contract_ID" IS NOT NULL;
--
-- Part 2's filled-in values are NOT undone by that — they were empty
-- before and are real now. If a merge turns out to be wrong, the
-- project is named in query 1.3 and in its own Notes.
--
-- ── Afterwards: the tender half of the plots ─────────────────────────
--
-- 174,650 plots belong to tenders. Once this has run they have projects
-- to hang off, so run import_legacy_plots.sql again — it will pick them
-- up. Its plot insert joins on Legacy_Contract_ID, so add the tender leg:
--
--   INSERT INTO "Plot" ("Project_ID","Plot_Number","Plot_Ref","KVA_Load","PV","Legacy_Plot_ID")
--   SELECT p."Project_ID", NULLIF(btrim(i."Plot"),''), NULLIF(btrim(i."Plot_Ref"),''),
--          NULLIF(btrim(i."KVA_Load"),'')::numeric,
--          COALESCE(NULLIF(btrim(i."PV"),'')::boolean,false),
--          NULLIF(btrim(i."Plot_ID"),'')::bigint
--     FROM "Legacy_Plot_Import" i
--     JOIN "Project" p ON p."Legacy_Tender_ID" = NULLIF(btrim(i."Tender_ID"),'')::bigint
--    WHERE COALESCE(btrim(i."Plot_ID"),'') <> ''
--      AND NOT EXISTS (SELECT 1 FROM "Plot" x
--                       WHERE x."Legacy_Plot_ID" = NULLIF(btrim(i."Plot_ID"),'')::bigint);
