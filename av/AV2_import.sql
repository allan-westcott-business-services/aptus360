-- ════════════════════════════════════════════════════════════════════
--  AV2 — import the asset value agreements
-- ════════════════════════════════════════════════════════════════════
--
-- Run after AV1 and load_av.psql. Safe to run twice: the unique index
-- 0067 added — one agreement per type per project — is what makes the
-- second run a no-op rather than a doubling.
--
-- ── What is carried, and what is not ──
--
-- Carried: the agreement type, the operator as an organisation, the
-- operator's own reference, the value, the initial fee and its
-- percentage, the estimated plot value, the date agreed.
--
-- NOT carried, each for a reason:
--
--   Utility_ID        Written by 0067's trigger from the agreement
--                     type. Supplying it as well would be a second
--                     writer of one fact, and if the two ever
--                     disagreed the screen would show one and the
--                     invoice use the other. Omitting it also means
--                     that if that trigger is ever dropped this fails
--                     loudly on NOT NULL instead of quietly writing
--                     the wrong utility.
--
--   IDNO_ID           The legacy operator id, which points at the old
--                     IDNO table. Operators are organisations with a
--                     role now, so the operator goes in
--                     IDNO_Organisation_ID and this is left alone —
--                     the same decision the connections import made.
--
--   Contract_Path     The export's Attachment_Path points into the
--                     original app's storage, and nothing copied those
--                     files here. The agreement table shows a literal
--                     "Attached" badge whenever this column is set, so
--                     writing it would put that badge on 107
--                     agreements whose file cannot be opened. The
--                     filename goes into Notes instead: the fact is
--                     kept, nothing claims a file is there.
--
--   Tender_ID         Empty on all 6,205 rows.
--
-- ── The agreement type is matched on the name ──
--
-- Not on the id, and this is the row where that stopped being a
-- principle and started mattering. The two systems' ids:
--
--   legacy 1 Gas              -> here 6 Gas
--   legacy 2 Electric         -> here 5 Electric
--   legacy 3 Water NAV Clean  -> here 8 Water NAV Clean
--   legacy 4 Water NAV Waste  -> here 7 Water NAV Waste
--   legacy 7 Water            -> here 9 Water
--
-- Had this copied the ids across, legacy 1-4 would have landed on
-- Adoption Agreement, Asset Purchase, Deed of Grant and Connection
-- Agreement — none of which carries a utility, so all 4,934 of those
-- would have failed on Utility_ID NOT NULL and the failure would at
-- least have been loud.
--
-- Legacy 7 "Water" is the dangerous one. Id 7 here is "Water NAV
-- Waste", also water, so the utility would have been right and the
-- insert would have succeeded. 1,270 water agreements would have been
-- filed under the wrong scheme, correctly totalled, and wrong — and
-- nothing would have failed to say so.
--
-- ── What is left out, and reported rather than guessed ──
--
--   Legacy type 8, "NA - Self Lay Provider". One row: agreement 2204,
--   contract 277, no operator, no reference, value 0.00. It has no
--   counterpart here and no utility to derive, so it is skipped. It is
--   an empty placeholder, not a loss.
--
--   Six operators the 0258 map does not cover — 183 agreements. The
--   register holds nothing that is actually them: the loose name search
--   turned up Hartlepool Borough Council for Hartlepool Water,
--   Scottish Borders Council for Scottish and Southern, and Saint
--   Flooring Limited for Flo Gas. The one exact hit, "National Grid",
--   is the customer of that name, and all 33 of its agreements are gas
--   — so it is not National Grid Electricity Distribution either, which
--   is the guess 0258 declined to make and was right to.
--
--   Those 183 come in with no operator and are named in the report.
--   An agreement with the operator still to be set is a real state;
--   an agreement pointing at the wrong company is a wrong number in
--   a system that raises invoices.
-- ════════════════════════════════════════════════════════════════════

-- ── The import ───────────────────────────────────────────────────────

INSERT INTO "AV_Agreement" (
  "Project_ID", "AV_Agreement_Type_ID", "IDNO_Organisation_ID",
  "IDNO_Reference", "AV_Value", "Initial_AV_Fee_Percent",
  "Initial_AV_Fee", "Estimated_Plot_AV_Value", "Agreement_Date", "Notes")
SELECT
  prj."Project_ID",
  nt."AV_Agreement_Type_ID",
  map."New_ID",
  NULLIF(btrim(s."IDNO_Reference"), ''),
  CASE WHEN btrim(s."Asset_Value")             ~ '^-?[0-9]+(\.[0-9]+)?$'
       THEN btrim(s."Asset_Value")::numeric END,
  CASE WHEN btrim(s."Initial_AV_Fee_Percentage") ~ '^-?[0-9]+(\.[0-9]+)?$'
       THEN btrim(s."Initial_AV_Fee_Percentage")::numeric END,
  CASE WHEN btrim(s."Initial_AV_Fee")          ~ '^-?[0-9]+(\.[0-9]+)?$'
       THEN btrim(s."Initial_AV_Fee")::numeric END,
  CASE WHEN btrim(s."Estimated_Plot_AV_Value") ~ '^-?[0-9]+(\.[0-9]+)?$'
       THEN btrim(s."Estimated_Plot_AV_Value")::numeric END,
  CASE WHEN btrim(s."Date_Agreed") ~ '^\d{4}-\d{2}-\d{2}'
       THEN substring(btrim(s."Date_Agreed"), 1, 10)::date END,
  'Imported from legacy AV_Agreement ' || btrim(s."AV_Agreement_ID")
    || CASE WHEN NULLIF(btrim(s."Attachment_Name"), '') IS NOT NULL
            THEN '. Signed contract in the original app: '
                 || btrim(s."Attachment_Name")
                 || ' (not copied across).' ELSE '.' END
    || CASE WHEN NULLIF(btrim(s."IDNO_ID"), '') IS NOT NULL
             AND map."New_ID" IS NULL
            THEN ' Operator was legacy IDNO ' || btrim(s."IDNO_ID")
                 || ', which has no organisation in the register yet.'
            ELSE '' END
  FROM "Legacy_AV_Agreement_Import" s

  -- The contract. An agreement whose contract never became a project
  -- is counted and reported, not invented.
  JOIN "Project" prj
    ON prj."Legacy_Contract_ID" = NULLIF(btrim(s."Contract_ID"), '')::bigint

  -- The agreement type, by name. The legacy id is only used to look
  -- up the legacy NAME; the name is what joins.
  JOIN (VALUES ('1','Gas'), ('2','Electric'), ('3','Water NAV Clean'),
               ('4','Water NAV Waste'), ('7','Water'))
         AS lt(legacy_id, legacy_name)
    ON lt.legacy_id = btrim(s."AV_Agreement_Type_ID")
  JOIN "AV_Agreement_Type" nt
    ON upper(btrim(nt."AV_Agreement_Type")) = upper(lt.legacy_name)

  -- The operator. LEFT, because 324 agreements name none and 183 name
  -- one the register cannot resolve, and all 507 are still agreements.
  LEFT JOIN "Legacy_Lookup_Map" map
    ON map."Kind" = 'idno'
   AND map."Legacy_ID" = NULLIF(btrim(s."IDNO_ID"), '')

ON CONFLICT ("Project_ID", COALESCE("AV_Agreement_Type_ID", ('-1'::integer)::bigint))
  DO NOTHING;



-- ── Record that it ran ───────────────────────────────────────────────

INSERT INTO "Legacy_Migration_Log" ("Step", "State", "Detail")
SELECT 'AV2 asset value import', 'ok',
       count(*)::text || ' agreements imported, '
       || count(*) FILTER (WHERE "IDNO_Organisation_ID" IS NULL)::text
       || ' of them with the operator still to be set.'
  FROM "AV_Agreement"
 WHERE "Notes" LIKE 'Imported from legacy AV_Agreement %'
ON CONFLICT ("Step") DO UPDATE
  SET "State" = EXCLUDED."State", "Detail" = EXCLUDED."Detail";


-- ════════════════════════════════════════════════════════════════════
--  The report
-- ════════════════════════════════════════════════════════════════════
--
-- One statement, because the editor only shows the last result set.
--
-- Every figure is counted from the imported rows themselves, not from
-- a running total kept while inserting. A counter can be right about
-- how many rows it wrote and wrong about what is in them; the
-- connections import found 283 duplicates where a count through a join
-- had reported 2.
--
-- Row 4 is the one that matters most. It puts the legacy water counts
-- beside the imported ones per scheme. If the type had been matched on
-- the id, Water and Water NAV Waste would have swapped and every total
-- here would still look plausible — so this compares them scheme by
-- scheme rather than as one water figure.

SELECT item AS "What", detail AS "Detail"
  FROM (

  SELECT 1::numeric AS step, '1 imported' AS item,
         count(*)::text || ' agreements, on '
         || count(DISTINCT "Project_ID")::text || ' projects, totalling '
         || to_char(COALESCE(sum("AV_Value"), 0), 'FM999,999,999.00')
         || ' of agreed asset value' AS detail
    FROM "AV_Agreement" WHERE "Notes" LIKE 'Imported from legacy AV_Agreement %'

  -- ── 2. What the export had and where each row went ────────────────
  UNION ALL
  SELECT 2, '2 export accounted for',
         count(*)::text || ' rows in the staging table: '
         || count(*) FILTER (WHERE prj."Project_ID" IS NOT NULL
                               AND btrim(s."AV_Agreement_Type_ID") IN ('1','2','3','4','7'))::text
         || ' importable, '
         || count(*) FILTER (WHERE prj."Project_ID" IS NULL)::text
         || ' whose contract is not a project here, '
         || count(*) FILTER (WHERE btrim(s."AV_Agreement_Type_ID") NOT IN ('1','2','3','4','7'))::text
         || ' of a type with no counterpart (the Self Lay Provider placeholder)'
    FROM "Legacy_AV_Agreement_Import" s
    LEFT JOIN "Project" prj
      ON prj."Legacy_Contract_ID" = NULLIF(btrim(s."Contract_ID"), '')::bigint

  -- ── 2.1 Importable but not imported ───────────────────────────────
  --
  -- The gap between "importable" above and "imported" in row 1. Every
  -- one of these is a project that already had an agreement of that
  -- type, so the unique index kept the existing row and dropped the
  -- incoming one. On a first run this should be 0: the pre-flight found
  -- no existing agreement on a project that came from a legacy
  -- contract.
  --
  -- It reads the same on a second run, because rows this import already
  -- wrote count as imported — so the figure stays put rather than
  -- jumping to the size of the whole import. Running this twice adds
  -- nothing and changes no number here.
  UNION ALL
  SELECT 2.1, '2.1 importable but skipped',
         (count(*) FILTER (WHERE prj."Project_ID" IS NOT NULL
                             AND btrim(s."AV_Agreement_Type_ID") IN ('1','2','3','4','7'))
          - (SELECT count(*) FROM "AV_Agreement"
              WHERE "Notes" LIKE 'Imported from legacy AV_Agreement %'))::text
         || ' — a project already had an agreement of that type, so the '
         || 'existing row was kept and the incoming one dropped'
    FROM "Legacy_AV_Agreement_Import" s
    LEFT JOIN "Project" prj
      ON prj."Legacy_Contract_ID" = NULLIF(btrim(s."Contract_ID"), '')::bigint

  -- ── 3. By agreement type, named ───────────────────────────────────
  UNION ALL
  SELECT 3 + row_number() OVER (ORDER BY t."AV_Agreement_Type") / 100.0,
         '3 type ' || t."AV_Agreement_Type",
         count(*)::text || ' agreements, utility ' || COALESCE(u."Utility", 'NONE — WRONG')
         || ', value ' || to_char(COALESCE(sum(a."AV_Value"), 0), 'FM999,999,999.00')
    FROM "AV_Agreement" a
    JOIN "AV_Agreement_Type" t ON t."AV_Agreement_Type_ID" = a."AV_Agreement_Type_ID"
    LEFT JOIN "Utility" u ON u."Utility_ID" = a."Utility_ID"
   WHERE a."Notes" LIKE 'Imported from legacy AV_Agreement %'
   GROUP BY t."AV_Agreement_Type", u."Utility"

  -- ── 4. The water schemes, legacy against imported ─────────────────
  UNION ALL
  SELECT 4 + v.ord / 100.0,
         '4 ' || v.nm,
         'legacy type ' || v.legacy_id || ' had '
         || (SELECT count(*) FROM "Legacy_AV_Agreement_Import" s
              WHERE btrim(s."AV_Agreement_Type_ID") = v.legacy_id)::text
         || '; imported as ' || v.nm || ': '
         || (SELECT count(*) FROM "AV_Agreement" a
              JOIN "AV_Agreement_Type" t ON t."AV_Agreement_Type_ID" = a."AV_Agreement_Type_ID"
             WHERE a."Notes" LIKE 'Imported from legacy AV_Agreement %'
               AND t."AV_Agreement_Type" = v.nm)::text
         || '. These two must differ only by agreements whose contract is '
         || 'not a project here.'
    FROM (VALUES (1,'1','Gas'), (2,'2','Electric'),
                 (3,'3','Water NAV Clean'), (4,'4','Water NAV Waste'),
                 (5,'7','Water')) AS v(ord, legacy_id, nm)

  -- ── 5. The operator ───────────────────────────────────────────────
  UNION ALL
  SELECT 5, '5 operator resolved',
         count(*) FILTER (WHERE "IDNO_Organisation_ID" IS NOT NULL)::text
         || ' of ' || count(*)::text || ' point at an organisation. '
         || count(*) FILTER (WHERE "IDNO_Organisation_ID" IS NULL)::text
         || ' do not and are listed below — none of them is wrong, each '
         || 'is simply not set.'
    FROM "AV_Agreement" WHERE "Notes" LIKE 'Imported from legacy AV_Agreement %'

  UNION ALL
  SELECT 5.1, '5.1 no operator named in the export',
         count(*)::text || ' agreements. The original holds no operator '
         || 'for these, so there is nothing to map.'
    FROM "AV_Agreement" a
   WHERE a."Notes" LIKE 'Imported from legacy AV_Agreement %'
     AND a."IDNO_Organisation_ID" IS NULL
     AND a."Notes" NOT LIKE '%no organisation in the register yet%'

  UNION ALL
  SELECT 5 + 0.2 + v.ord / 1000.0,
         '5.2 IDNO ' || v.id || ' ' || v.nm,
         (SELECT count(*) FROM "AV_Agreement" a
           WHERE a."Notes" LIKE '%legacy IDNO ' || v.id || ',%')::text
         || ' agreements waiting on an organisation. ' || v.why
    FROM (VALUES
      (1, '14', 'Hartlepool Water',
          'The register has only Hartlepool Borough Council, which is a council.'),
      (2, '35', 'National Grid',
          'The register''s National Grid is a customer, and all of these are gas, so it is not National Grid Electricity Distribution either.'),
      (3, '26', 'Scottish and Southern',
          'The register has only Scottish Borders Council.'),
      (4, '29', 'Indigo Networks', 'Nothing in the register matches.'),
      (5, '17', 'Fulcrum',         'Nothing in the register matches.'),
      (6, '39', 'Flo Gas',
          'The only near match was Saint Flooring Limited.')
    ) AS v(ord, id, nm, why)

  -- ── 6. The utility, which nothing here wrote ──────────────────────
  UNION ALL
  SELECT 6, '6 utility set by the trigger',
         COALESCE(string_agg(u."Utility" || ' ' || c.n::text, ', ' ORDER BY u."Utility"),
                  'NOTHING — the trigger did not run')
    FROM (SELECT "Utility_ID", count(*) n FROM "AV_Agreement"
           WHERE "Notes" LIKE 'Imported from legacy AV_Agreement %'
           GROUP BY 1) c
    JOIN "Utility" u ON u."Utility_ID" = c."Utility_ID"

  -- Expect none. A utility disagreeing with its type means the trigger
  -- is not doing its job and the invoices will go out on the wrong one.
  UNION ALL
  SELECT 6.1, '6.1 utility disagreeing with its type',
         CASE WHEN count(*) = 0 THEN 'none'
              ELSE 'STOPS IT: ' || count(*)::text || ' rows' END
    FROM "AV_Agreement" a
    JOIN "AV_Agreement_Type" t ON t."AV_Agreement_Type_ID" = a."AV_Agreement_Type_ID"
   WHERE a."Notes" LIKE 'Imported from legacy AV_Agreement %'
     AND t."Utility_ID" IS DISTINCT FROM a."Utility_ID"

  -- ── 7. The agreements that were already here ──────────────────────
  UNION ALL
  SELECT 7, '7 agreements that were already here',
         count(*)::text || ' rows, untouched. Section 4 of the pre-flight '
         || 'said 10 on 5 projects, none from a legacy contract.'
    FROM "AV_Agreement"
   WHERE "Notes" IS NULL OR "Notes" NOT LIKE 'Imported from legacy AV_Agreement %'

  ) z ORDER BY step, item;
