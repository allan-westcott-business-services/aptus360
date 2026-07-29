-- ════════════════════════════════════════════════════════════════
-- 0070 — the agreement's operator is an organisation
--
-- ESP Water is mapped to water and does not appear on a water agreement.
-- The reason is not the mapping: the picker reads the legacy IDNO table,
-- and nothing in it points at ESP Water. The organisation was created in
-- the Organisations screen, which is where operators are maintained now,
-- and no IDNO row was ever made for it.
--
-- So every operator added since the move to Organisations has been
-- invisible to this picker, and would have stayed invisible however many
-- utilities were ticked. The same is true of the five DNOs in the list:
-- they are organisations with electric, reached by no IDNO row, because
-- they are DNOs.
--
-- This is open item 1 in the handover — moving the pickers to
-- Organisation_ID — done for asset value agreements. 0062 did the same
-- for AV_Invoice.
--
-- IDNO_ID stays and is not dropped. Existing agreements point at it, and
-- the AV register still reads it; the new column is populated alongside
-- and preferred when present.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "AV_Agreement"
  ADD COLUMN IF NOT EXISTS "IDNO_Organisation_ID" bigint REFERENCES "Organisation";

CREATE INDEX IF NOT EXISTS av_agreement_org_idx
  ON "AV_Agreement" ("IDNO_Organisation_ID");

-- Existing agreements already name an operator through the legacy table,
-- which 0047 linked to an organisation. Follow it once, here, so nothing
-- has to follow it at read time from now on.
UPDATE "AV_Agreement" a
   SET "IDNO_Organisation_ID" = i."Organisation_ID"
  FROM "IDNO" i
 WHERE i."IDNO_ID" = a."IDNO_ID"
   AND a."IDNO_Organisation_ID" IS NULL
   AND i."Organisation_ID" IS NOT NULL;


-- ── The agreement, with its operator resolved ────────────────────
-- Prefers the organisation the agreement names. Falls back to the hop
-- through IDNO for rows written before this migration whose legacy row
-- was never linked — those are the ones check query 1 calls "not linked
-- to an organisation".
DROP VIEW IF EXISTS "AV_Agreement_Detail";

CREATE VIEW "AV_Agreement_Detail" AS
  SELECT
    a.*,
    t."AV_Agreement_Type" AS agreement_type,
    u."Utility"           AS utility_name,
    idno."IDNO_Name",
    COALESCE(a."IDNO_Organisation_ID", idno."Organisation_ID") AS idno_organisation_id,
    org."Name"           AS idno_organisation_name,
    org."VAT_Registered" AS idno_vat_registered,
    org."VAT_Rate"       AS idno_vat_rate,
    COALESCE(inv.value_invoiced, 0) AS value_invoiced,
    COALESCE(plots.total_plots, 0)  AS total_plots,
    COALESCE(inv.plots_claimed, 0)  AS plots_claimed
  FROM "AV_Agreement" a
  LEFT JOIN "AV_Agreement_Type" t ON t."AV_Agreement_Type_ID" = a."AV_Agreement_Type_ID"
  LEFT JOIN "Utility" u           ON u."Utility_ID" = a."Utility_ID"
  LEFT JOIN "IDNO" idno           ON idno."IDNO_ID" = a."IDNO_ID"
  LEFT JOIN "Organisation" org
    ON org."Organisation_ID" = COALESCE(a."IDNO_Organisation_ID", idno."Organisation_ID")
  LEFT JOIN LATERAL (
    SELECT SUM(i."Net_Value")          AS value_invoiced,
           COUNT(DISTINCT l."Plot_ID") AS plots_claimed
      FROM "AV_Invoice" i
      LEFT JOIN "AV_Invoice_Line" l ON l."AV_Invoice_ID" = i."AV_Invoice_ID"
     WHERE i."Project_ID" = a."Project_ID"
       AND i."AV_Agreement_Type_ID" = a."AV_Agreement_Type_ID"
       AND i."Status" <> 'Cancelled'
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total_plots FROM "Plot" p WHERE p."Project_ID" = a."Project_ID"
  ) plots ON true;


-- ── Check ───────────────────────────────────────────────────────
-- Every operator the picker will now offer, and what it covers. ESP
-- Water should be here; it never could be before:
--   SELECT "Name", role_keys, utility_ids FROM "Operator_Utility" ORDER BY "Name";
--
-- Water operators specifically — these are the ones offered on Water,
-- Water NAV Clean and Water NAV Waste:
--   SELECT o."Name"
--     FROM "Operator_Utility" o
--     JOIN "Utility" u ON u."Utility_ID" = ANY (o.utility_ids)
--    WHERE LOWER(u."Utility") = 'water'
--    ORDER BY o."Name";
--
-- Existing agreements that still have no organisation, after the
-- backfill. Their legacy IDNO row was never linked, so they need an
-- operator choosing again:
--   SELECT a."AV_Agreement_ID", a."Project_ID", i."IDNO_Name"
--     FROM "AV_Agreement" a
--     LEFT JOIN "IDNO" i ON i."IDNO_ID" = a."IDNO_ID"
--    WHERE a."IDNO_Organisation_ID" IS NULL;
