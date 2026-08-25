-- ════════════════════════════════════════════════════════════════
-- 0192 — default service cable, and the 25mm single phase figures
--
-- Two things, both data rather than code.
--
-- ── 1. Auto Lay Services draws 35mm CNE ──
--
-- The cable a laid service gets comes from defaultsFor() in
-- GISCanvasPage, which reads Project_Scope.Default_Service_Cable_Size_ID
-- for the electric utility. Null means no default, and a service is
-- drawn with no cable on it at all — which then reports "cable not set"
-- in the levels check rather than a figure.
--
-- Set to 51, Single Phase Service CNE 35mm Aluminium.
--
-- Per PROJECT, because that is how the column is scoped. There is no
-- system-wide default to set: a project created after this runs gets
-- null again unless whoever creates it picks one, or unless a scope
-- template is added to carry it. Worth knowing before this is treated
-- as settled.
--
-- Only where nothing has been chosen already. A project that has
-- deliberately been set to something else keeps it.
-- ════════════════════════════════════════════════════════════════

BEGIN;

UPDATE "Project_Scope" s
   SET "Default_Service_Cable_Size_ID" = 51
  FROM "Utility" u
 WHERE u."Utility_ID" = s."Utility_ID"
   AND LOWER(u."Utility") LIKE 'electric%'
   AND s."Default_Service_Cable_Size_ID" IS NULL
   AND EXISTS (SELECT 1 FROM "Electric_Cable_Size"
                WHERE "Cable_Size_ID" = 51);

COMMIT;


-- ════════════════════════════════════════════════════════════════
-- 2. The two highlighted cables
-- ════════════════════════════════════════════════════════════════
--
-- ── ID 51, Single Phase Service CNE 35mm Aluminium ──
-- Already carries its figures: 0191 set Rating 174 A, VD base 3094,
-- Loop Z 0.9785. All three come straight from the workbook
-- (impedances!E43/G43 and "Transformer ELI's"!J3:J4). Nothing to do.
--
-- ── ID 50, Single Phase Service CNE 25mm Aluminium ──
-- The workbook has NO single phase 25mm row. Its four service entries
-- are 3c25 CNE, 3c25 SCNE, 35 CNE and 35 SCNE-Cu — and the two "3c25"
-- rows are THREE PHASE, not single phase 25mm.
--
-- That is worth showing, because the naming invites the opposite
-- reading. A single phase circuit drops about 6x what a three phase one
-- does per kVA per metre, and 35mm is 0.815 the resistance of 25mm, so
-- a single phase 35 against a three phase 25 should read about
-- 6 x 0.815 = 4.9 times worse. Observed: 3094/697 = 4.4. Close enough
-- to settle which is which, and nowhere near the 1.4 that two
-- single phase cables differing only in size would show.
--
-- So only the loop impedance can be filled in from the workbook:
--
--   UPDATE "Electric_Cable_Size" SET "Loop_Impedance_Ohm" = 1.2
--    WHERE "Cable_Size_ID" = 50;
--
-- from "Transformer ELI's"!I3:I4, which is tabulated by size alone.
--
-- The volt drop base is NOT recorded anywhere in the workbook. Scaling
-- the 35mm figure by the ratio of the two loop impedances gives
--
--   3094 x 1.2 / 0.9785 = 3794
--
-- and the reasoning holds — both quantities are proportional to
-- conductor resistance, so they scale together within one cable family.
-- It is still a derived number and not a published one, and it is left
-- OUT rather than written in. A blank reports "cable not set" and stops
-- the check; a plausible wrong number does not.
--
-- The rating in amps is not derivable at all and has no workbook entry.
--
-- Get both from the manufacturer's data sheet or the adopting
-- authority's standard, then:
--
--   UPDATE "Electric_Cable_Size" SET
--     "Rating_Amps" = <A>, "Volt_Drop_Base" = <base>, "Loop_Impedance_Ohm" = 1.2
--    WHERE "Cable_Size_ID" = 50;
--
-- ── One thing 0191 may have got wrong ──
-- It put Loop_Impedance_Ohm 1.2 on ID 52, the THREE phase 25mm service,
-- from the same by-size table. If that table is single phase figures —
-- and the only service the workbook actually computes with is the
-- single phase 35 — then 1.2 belongs on ID 50 and ID 52 needs its own.
-- The table gives no phase, so this cannot be settled from the
-- workbook. Worth checking against the same data sheet.


-- ── Checks ──────────────────────────────────────────────────────
-- Which projects now draw services with what.
--   SELECT p."Project_ID", p."Project_Name",
--          t."Cable_Type", c."Size_Label", c."Material"
--     FROM "Project_Scope" s
--     JOIN "Utility" u ON u."Utility_ID" = s."Utility_ID"
--     JOIN "Project" p ON p."Project_ID" = s."Project_ID"
--     LEFT JOIN "Electric_Cable_Size" c
--            ON c."Cable_Size_ID" = s."Default_Service_Cable_Size_ID"
--     LEFT JOIN "Electric_Cable_Type" t ON t."Cable_Type_ID" = c."Cable_Type_ID"
--    WHERE LOWER(u."Utility") LIKE 'electric%'
--    ORDER BY 1;
--
-- Services already drawn keep the cable they were drawn with — this
-- changes what the NEXT run lays, not what is on the drawing. To see
-- which existing services have no cable on them:
--   SELECT f."Project_ID", count(*) AS services_without_a_cable
--     FROM "GIS_Feature" f
--    WHERE f."Feature_Type" = 'line' AND f."Layer_Key" = 'electric'
--      AND f."Attributes" ->> 'Line_Type' ILIKE '%service%'
--      AND f."Attributes" ->> 'VD_Cable_Size_ID' IS NULL
--    GROUP BY 1 ORDER BY 2 DESC;
