-- ════════════════════════════════════════════════════════════════════
--  The three things the pre-flight found, in detail
-- ════════════════════════════════════════════════════════════════════
--
-- Read-only. Creates nothing, changes nothing. One result set.
--
-- The pre-flight answered the utility question and the duplicate
-- question. Three things it could only count, and I need to see:
--
--   1. pu_pack_trg — a trigger that fires on every insert into
--      Plot_Utility. It is not in the repository and it is not in my
--      test copy, which is exactly the gap that broke the plot import
--      three times. I am not running an insert of 33,367 rows through
--      a trigger I have not read.
--
--   2. Pack statuses — 22,378 of them do not match a name. The new
--      Pack_Status table may simply be missing those states, and
--      unlike the visit outcome there is no text column to fall back
--      on, so an unmatched status is lost rather than degraded.
--
--   3. Adopters — 12,414 do not match an organisation, and I need to
--      see whether that is because the organisation is absent, or
--      present under a longer name, or present without the network
--      role the match requires.

SELECT section AS "Section", item AS "Item", num AS "Count", note AS "Detail"
  FROM (

  -- ── 1. The trigger, and what it actually does ─────────────────────
  SELECT 1::numeric AS section, t.tgname AS item, NULL::text AS num,
         pg_get_triggerdef(t.oid) AS note
    FROM pg_trigger t
   WHERE t.tgrelid = '"Plot_Utility"'::regclass AND NOT t.tgisinternal

  UNION ALL
  SELECT 1.1, p.proname, NULL,
         replace(replace(p.prosrc, E'\n', ' '), '  ', ' ')
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE t.tgrelid = '"Plot_Utility"'::regclass AND NOT t.tgisinternal

  -- ── 2. Pack statuses, both sides ──────────────────────────────────
  UNION ALL
  SELECT 2, 'NEW: ' || s."Pack_Status", s."Pack_Status_ID"::text,
         'already in the Pack_Status table'
    FROM "Pack_Status" s

  UNION ALL
  SELECT 2.1, 'OLD: ' || g.nm, g.n::text,
         CASE WHEN EXISTS (SELECT 1 FROM "Pack_Status" s
                            WHERE upper(btrim(s."Pack_Status")) = upper(g.nm))
              THEN 'matches - these keep their status'
              ELSE 'NO MATCH - these lose their status unless it is added'
         END
    FROM (SELECT btrim(i."Status_Of_Pack") AS nm, count(*) AS n
            FROM "Legacy_Connection_Import" i
           WHERE COALESCE(btrim(i."Status_Of_Pack"), '') <> ''
           GROUP BY btrim(i."Status_Of_Pack")) g

  -- ── 3. The adopter names that match nothing ───────────────────────
  UNION ALL
  SELECT 3, 'ADOPTER: ' || btrim(r."Adopter"), count(*)::text,
         'no organisation of a network type is named this'
    FROM "Legacy_Connection_Resolved" r
   WHERE COALESCE(btrim(r."Adopter"), '') <> ''
     AND r.adopter_organisation_id IS NULL
   GROUP BY btrim(r."Adopter")

  -- ── 4. Every organisation the match is allowed to find ────────────
  --
  -- The view requires an ACTIVE role of type idno, dno, gt, wu, igt or
  -- iwu. These are the organisations that qualify. If an adopter above
  -- is in this list under a longer name, it is a naming problem.
  UNION ALL
  SELECT 4, 'CAN BE MATCHED: ' || o."Name", NULL,
         string_agg(DISTINCT t."Type_Key", ', ')
    FROM "Organisation" o
    JOIN "Organisation_Role" r ON r."Organisation_ID" = o."Organisation_ID"
    JOIN "Organisation_Type" t ON t."Organisation_Type_ID" = r."Organisation_Type_ID"
   WHERE t."Type_Key" IN ('idno', 'dno', 'gt', 'wu', 'igt', 'iwu')
     AND r."Is_Active"
   GROUP BY o."Name"

  -- ── 5. Organisations that look like utilities but cannot be matched ─
  --
  -- Present in the table, but with no active network role — so the
  -- match skips them. If an adopter above is in this list, it is a
  -- role problem, not a naming problem, and the fix is different.
  UNION ALL
  SELECT 5, 'HAS NO NETWORK ROLE: ' || o."Name", NULL,
         COALESCE((SELECT string_agg(DISTINCT t2."Type_Key" ||
                     CASE WHEN r2."Is_Active" THEN '' ELSE ' (inactive)' END, ', ')
                     FROM "Organisation_Role" r2
                     JOIN "Organisation_Type" t2
                       ON t2."Organisation_Type_ID" = r2."Organisation_Type_ID"
                    WHERE r2."Organisation_ID" = o."Organisation_ID"),
                  'no roles at all')
    FROM "Organisation" o
   WHERE (o."Name" ~* '(water|electric|gas|utilit|energy|network|power|GTC|ESP|MUA|IWNL|ENW|NWL|Leep|Lastmile|Cadent)')
     AND NOT EXISTS (
       SELECT 1 FROM "Organisation_Role" r3
         JOIN "Organisation_Type" t3
           ON t3."Organisation_Type_ID" = r3."Organisation_Type_ID"
        WHERE r3."Organisation_ID" = o."Organisation_ID"
          AND t3."Type_Key" IN ('idno', 'dno', 'gt', 'wu', 'igt', 'iwu')
          AND r3."Is_Active")

  ) z ORDER BY section, item;
