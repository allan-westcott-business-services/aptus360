-- ════════════════════════════════════════════════════════════════
-- 0069 — operators and the utilities they work in
--
-- An IDNO or DNO operates in one or more utilities, and that decides
-- which asset value agreements it can be a partner to. A water operator
-- can be behind Water, Water NAV Clean and Water NAV Waste — all three
-- resolve to the water utility — and cannot be behind Electric.
--
-- Offering every operator on every agreement type is how ESP Water ends
-- up on the gas agreement. Nothing rejects it, and it is only noticed
-- when an invoice goes to the wrong company.
--
-- Stored against the organisation rather than the role: a company works
-- in water whether you are dealing with it as an IDNO or a DNO, and
-- duplicating that per role means two places to correct.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "Organisation_Utility" (
  "Organisation_ID" bigint NOT NULL REFERENCES "Organisation" ON DELETE CASCADE,
  "Utility_ID"      bigint NOT NULL REFERENCES "Utility",
  PRIMARY KEY ("Organisation_ID", "Utility_ID")
);
ALTER TABLE "Organisation_Utility" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS org_utility_org_idx ON "Organisation_Utility" ("Organisation_ID");

-- Deliberately unseeded. Guessing from a company's name — Water in
-- "ESP Water Ltd" — would be right often enough to be trusted and wrong
-- often enough to matter.


-- ── Operators, with the utilities they cover ─────────────────────
-- One row per organisation holding an IDNO or DNO role, with its
-- utilities as an array. An array rather than a row per utility, because
-- a picker wants one entry per operator, not three.
CREATE OR REPLACE VIEW "Operator_Utility" AS
  SELECT
    o."Organisation_ID",
    o."Name",
    o."Code",
    o."VAT_Registered",
    o."VAT_Rate",
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT ou."Utility_ID"), NULL) AS utility_ids,
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT t."Type_Key"), NULL)    AS role_keys
  FROM "Organisation" o
  JOIN "Organisation_Role" r ON r."Organisation_ID" = o."Organisation_ID" AND r."Is_Active"
  JOIN "Organisation_Type" t ON t."Organisation_Type_ID" = r."Organisation_Type_ID"
   AND t."Type_Key" IN ('idno', 'dno')
  LEFT JOIN "Organisation_Utility" ou ON ou."Organisation_ID" = o."Organisation_ID"
  WHERE o."Is_Active"
  GROUP BY o."Organisation_ID", o."Name", o."Code", o."VAT_Registered", o."VAT_Rate";


-- ── The legacy IDNO list, carrying the same utilities ────────────
-- AV_Agreement still points at the IDNO table, so the picker there needs
-- the utilities reachable from an IDNO row. Follows Organisation_ID,
-- which 0047 added and backfilled.
--
-- An IDNO with no organisation, or an organisation with no utilities
-- assigned, comes back with an empty array — and an empty array means
-- "not restricted" to the picker rather than "matches nothing", so an
-- unconfigured operator stays usable instead of vanishing.
CREATE OR REPLACE VIEW "IDNO_With_Utilities" AS
  SELECT
    i."IDNO_ID",
    i."IDNO_Name",
    i."Organisation_ID",
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT ou."Utility_ID"), NULL) AS utility_ids
  FROM "IDNO" i
  LEFT JOIN "Organisation_Utility" ou ON ou."Organisation_ID" = i."Organisation_ID"
  GROUP BY i."IDNO_ID", i."IDNO_Name", i."Organisation_ID";


-- ── Check ───────────────────────────────────────────────────────
-- Operators and what they cover. Anything with an empty utility_ids is
-- unassigned and will be offered on every agreement type:
--   SELECT "Name", role_keys, utility_ids FROM "Operator_Utility" ORDER BY "Name";
--
-- The same, named rather than by id:
--   SELECT o."Name", u."Utility"
--     FROM "Organisation_Utility" ou
--     JOIN "Organisation" o ON o."Organisation_ID" = ou."Organisation_ID"
--     JOIN "Utility" u ON u."Utility_ID" = ou."Utility_ID"
--    ORDER BY o."Name", u."Utility";
--
-- Agreements whose operator does not cover the agreement's utility.
-- These predate the rule and are worth reviewing — the picker will not
-- allow new ones:
--   SELECT a."Project_ID", t."AV_Agreement_Type", i."IDNO_Name"
--     FROM "AV_Agreement" a
--     JOIN "AV_Agreement_Type" t ON t."AV_Agreement_Type_ID" = a."AV_Agreement_Type_ID"
--     JOIN "IDNO_With_Utilities" i ON i."IDNO_ID" = a."IDNO_ID"
--    WHERE CARDINALITY(i.utility_ids) > 0
--      AND t."Utility_ID" IS NOT NULL
--      AND NOT (t."Utility_ID" = ANY (i.utility_ids));
