-- ════════════════════════════════════════════════════════════════
-- 0068 — the agreement decides the operator
--
-- An asset value invoice is raised under an agreement, and the agreement
-- already says who it is with. Asking again on the invoice form is a
-- chance to disagree with it — and an invoice raised against the wrong
-- operator is a credit note and an apology.
--
-- So the view now carries the agreement's operator as an organisation,
-- and that organisation's VAT position, which the invoice form reads
-- instead of asking.
--
-- The hop through IDNO is deliberate rather than tidy: AV_Agreement
-- still points at the legacy IDNO table, and 0047 gave that table an
-- Organisation_ID and backfilled it. Following the link is what lets the
-- invoice work in organisation terms while the agreement has not yet
-- been moved across — open item 1 in the handover.
-- ════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS "AV_Agreement_Detail";

CREATE VIEW "AV_Agreement_Detail" AS
  SELECT
    a.*,
    t."AV_Agreement_Type" AS agreement_type,
    u."Utility"           AS utility_name,
    idno."IDNO_Name",
    -- The operator as an organisation, followed through from the legacy
    -- IDNO row the agreement points at.
    idno."Organisation_ID" AS idno_organisation_id,
    org."Name"             AS idno_organisation_name,
    org."VAT_Registered"   AS idno_vat_registered,
    org."VAT_Rate"         AS idno_vat_rate,
    COALESCE(inv.value_invoiced, 0) AS value_invoiced,
    COALESCE(plots.total_plots, 0)  AS total_plots,
    COALESCE(inv.plots_claimed, 0)  AS plots_claimed
  FROM "AV_Agreement" a
  LEFT JOIN "AV_Agreement_Type" t ON t."AV_Agreement_Type_ID" = a."AV_Agreement_Type_ID"
  LEFT JOIN "Utility" u           ON u."Utility_ID" = a."Utility_ID"
  LEFT JOIN "IDNO" idno           ON idno."IDNO_ID" = a."IDNO_ID"
  LEFT JOIN "Organisation" org    ON org."Organisation_ID" = idno."Organisation_ID"
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
-- Agreements and the operator an invoice will be raised against:
--   SELECT agreement_type, "IDNO_Name", idno_organisation_name,
--          idno_vat_registered, idno_vat_rate
--     FROM "AV_Agreement_Detail" WHERE "Project_ID" = <project>
--    ORDER BY agreement_type;
--
-- Agreements whose IDNO never got an organisation. The invoice form
-- falls back to asking for one on these, so they are worth fixing:
--   SELECT DISTINCT i."IDNO_ID", i."IDNO_Name"
--     FROM "AV_Agreement" a
--     JOIN "IDNO" i ON i."IDNO_ID" = a."IDNO_ID"
--    WHERE i."Organisation_ID" IS NULL;
--
-- Operators with no VAT position recorded. They will invoice at the
-- standard rate, which may well be right — but by default rather than
-- by decision:
--   SELECT DISTINCT idno_organisation_name
--     FROM "AV_Agreement_Detail"
--    WHERE idno_organisation_id IS NOT NULL AND idno_vat_registered IS NOT TRUE;
