-- ════════════════════════════════════════════════════════════════
-- 0067 — asset value agreements
--
-- The agreement type now names the utility and the scheme — Electric,
-- Gas, Water, Water NAV Clean, Water NAV Waste — so it, not the utility,
-- is what makes an agreement distinct. Three consequences.
--
-- The unique key has to move. UNIQUE (Project_ID, Utility_ID, IDNO_ID)
-- allowed one agreement per utility per operator, which means Water,
-- Water NAV Clean and Water NAV Waste with the same water operator
-- collide — and those three coexisting is the normal case, not an edge
-- one.
--
-- Utility_ID stays and stays NOT NULL: 0066's connection view and the AV
-- register both join on it. It is now derived from the agreement type by
-- trigger rather than asked for, so the two cannot disagree however the
-- row is written — including by hand in the SQL editor.
--
-- And the fields the original captures but this app never had: the
-- operator's own reference, the initial fee and its percentage, and the
-- signed contract.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "AV_Agreement"
  ADD COLUMN IF NOT EXISTS "IDNO_Reference"         text,
  -- Percentage and amount both stored. The amount is what gets invoiced,
  -- and recomputing it from a percentage that was later edited would
  -- change what an old agreement appears to have charged.
  ADD COLUMN IF NOT EXISTS "Initial_AV_Fee_Percent" numeric,
  ADD COLUMN IF NOT EXISTS "Initial_AV_Fee"         numeric,
  -- The signed contract, in Supabase storage. A path, not the bytes.
  ADD COLUMN IF NOT EXISTS "Contract_Path"          text;


-- ── Utility follows the agreement type ───────────────────────────
CREATE OR REPLACE FUNCTION av_agreement_utility() RETURNS trigger AS $$
BEGIN
  IF NEW."AV_Agreement_Type_ID" IS NOT NULL THEN
    SELECT COALESCE(t."Utility_ID", NEW."Utility_ID") INTO NEW."Utility_ID"
      FROM "AV_Agreement_Type" t
     WHERE t."AV_Agreement_Type_ID" = NEW."AV_Agreement_Type_ID";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS av_agreement_utility_trg ON "AV_Agreement";
CREATE TRIGGER av_agreement_utility_trg
  BEFORE INSERT OR UPDATE OF "AV_Agreement_Type_ID", "Utility_ID" ON "AV_Agreement"
  FOR EACH ROW EXECUTE FUNCTION av_agreement_utility();

-- Bring existing rows in line before the new key is applied, or a row
-- whose utility disagrees with its type could block the index.
UPDATE "AV_Agreement" a
   SET "Utility_ID" = t."Utility_ID"
  FROM "AV_Agreement_Type" t
 WHERE t."AV_Agreement_Type_ID" = a."AV_Agreement_Type_ID"
   AND t."Utility_ID" IS NOT NULL
   AND a."Utility_ID" IS DISTINCT FROM t."Utility_ID";


-- ── One agreement per type, per project ──────────────────────────
ALTER TABLE "AV_Agreement" DROP CONSTRAINT IF EXISTS "AV_Agreement_Project_ID_Utility_ID_IDNO_ID_key";

-- COALESCE because a type is optional on older rows, and NULL never
-- equals NULL — without it two typeless agreements would both be
-- allowed, which is the trap 0031 had to clean up after.
CREATE UNIQUE INDEX IF NOT EXISTS av_agreement_project_type_uniq
  ON "AV_Agreement" ("Project_ID", COALESCE("AV_Agreement_Type_ID", -1));


-- ── What each agreement has actually delivered ───────────────────
-- Invoiced value, plots on the project, and plots claimed under this
-- agreement. Derived rather than stored: every one of them changes when
-- an invoice is raised, and a stored copy would be wrong by the time
-- anyone looked.
CREATE OR REPLACE VIEW "AV_Agreement_Detail" AS
  SELECT
    a.*,
    t."AV_Agreement_Type" AS agreement_type,
    u."Utility"           AS utility_name,
    idno."IDNO_Name",
    COALESCE(inv.value_invoiced, 0) AS value_invoiced,
    COALESCE(plots.total_plots, 0)  AS total_plots,
    COALESCE(inv.plots_claimed, 0)  AS plots_claimed
  FROM "AV_Agreement" a
  LEFT JOIN "AV_Agreement_Type" t ON t."AV_Agreement_Type_ID" = a."AV_Agreement_Type_ID"
  LEFT JOIN "Utility" u           ON u."Utility_ID" = a."Utility_ID"
  LEFT JOIN "IDNO" idno           ON idno."IDNO_ID" = a."IDNO_ID"
  -- Matched on the agreement type, not the utility: three water
  -- agreements on one project must not all claim each other's invoices.
  -- A cancelled invoice is not a claim.
  LEFT JOIN LATERAL (
    SELECT SUM(i."Net_Value")                    AS value_invoiced,
           COUNT(DISTINCT l."Plot_ID")           AS plots_claimed
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
-- The agreements as the screen shows them:
--   SELECT agreement_type, "IDNO_Name", "IDNO_Reference", "AV_Value",
--          "Initial_AV_Fee_Percent", "Initial_AV_Fee",
--          value_invoiced, total_plots, plots_claimed
--     FROM "AV_Agreement_Detail" WHERE "Project_ID" = <project>
--    ORDER BY agreement_type;
--
-- Expect no rows: a utility that disagrees with its agreement type. The
-- trigger prevents new ones; this catches anything the backfill missed
-- because its type has no utility set.
--   SELECT a."AV_Agreement_ID", a."Utility_ID", t."Utility_ID" AS type_utility
--     FROM "AV_Agreement" a
--     JOIN "AV_Agreement_Type" t ON t."AV_Agreement_Type_ID" = a."AV_Agreement_Type_ID"
--    WHERE t."Utility_ID" IS NOT NULL AND a."Utility_ID" IS DISTINCT FROM t."Utility_ID";
--
-- Claimed more plots than the project has — a sign invoices are matching
-- across agreements:
--   SELECT * FROM "AV_Agreement_Detail" WHERE plots_claimed > total_plots;
