-- ════════════════════════════════════════════════════════════════
-- 0151 — what a craft is actually for
--
-- Task_Type holds one Craft_ID, so the model could say "Excavation &
-- Lay is done by craft X" and no more. Ours is done by three:
--
--   Multi Utility Mains     - Excavation & Lay
--   Multi Utility Service   - Excavation & Lay
--   Electric Only           - Excavation & Lay
--
-- Which one applies depends on two things the task type does not know:
-- whether the call-off is mains or service, and which utilities are on
-- it. So the craft was left unset, and with nothing to match on, every
-- team appeared in the dropdown and every drag was allowed.
--
-- A craft now carries the three facts its name already encodes.
--
-- ── Scope ──
--
-- 'mains', 'service', or null for either. Jointing is service work;
-- reinstatement is neither, it follows whatever was dug.
--
-- ── Utilities ──
--
-- No rows means "any" — a reinstatement gang puts the ground back
-- whatever went in it, and listing all three against it would be three
-- rows saying nothing. Rows mean "only these": Electric Only covers
-- electric and is refused a booking that includes gas.
--
-- That gives the rule asked for. A mains call-off covering gas and
-- water cannot go to an Electric Only team, but that team can take the
-- electric booking once the phase is split by utility — which is
-- exactly what Split by utility already produces.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Craft"
  ADD COLUMN IF NOT EXISTS "Task_Type_ID" bigint REFERENCES "Task_Type" ("Task_Type_ID"),
  ADD COLUMN IF NOT EXISTS "Scope" text;

ALTER TABLE "Craft" DROP CONSTRAINT IF EXISTS craft_scope_known;
ALTER TABLE "Craft" ADD CONSTRAINT craft_scope_known
  CHECK ("Scope" IS NULL OR "Scope" IN ('mains', 'service'));

COMMENT ON COLUMN "Craft"."Scope" IS
  'mains, service, or null for either. Null is not unknown, it is both.';

CREATE TABLE IF NOT EXISTS "Craft_Utility" (
  "Craft_Utility_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Craft_ID"         bigint NOT NULL REFERENCES "Craft" ("Craft_ID") ON DELETE CASCADE,
  "Utility_ID"       bigint NOT NULL REFERENCES "Utility" ("Utility_ID")
);

CREATE UNIQUE INDEX IF NOT EXISTS craft_utility_once
  ON "Craft_Utility" ("Craft_ID", "Utility_ID");

ALTER TABLE "Craft_Utility" ENABLE ROW LEVEL SECURITY;


-- ── Seeding from the names we already use ────────────────────────
-- The names encode all of it, so the existing crafts are mapped rather
-- than left for somebody to do by hand. Only where the column is still
-- empty: a craft somebody has already set is not overwritten.

UPDATE "Craft" c SET "Task_Type_ID" = t."Task_Type_ID"
  FROM "Task_Type" t
 WHERE c."Task_Type_ID" IS NULL
   AND ((c."Craft_Name" ILIKE '%excavation%' AND t."Task_Type_Name" ILIKE '%excavat%')
     OR (c."Craft_Name" ILIKE '%jointing%'   AND t."Task_Type_Name" ILIKE 'joint%')
     OR (c."Craft_Name" ILIKE '%reinstat%'   AND t."Task_Type_Name" ILIKE 'reinstat%'));

UPDATE "Craft" SET "Scope" = 'mains'
 WHERE "Scope" IS NULL AND "Craft_Name" ILIKE '%mains%';

UPDATE "Craft" SET "Scope" = 'service'
 WHERE "Scope" IS NULL
   AND ("Craft_Name" ILIKE '%service%' OR "Craft_Name" ILIKE '%jointing%');

-- Electric Only covers electric and nothing else. Everything else is
-- left with no rows, which means any utility.
INSERT INTO "Craft_Utility" ("Craft_ID", "Utility_ID")
SELECT c."Craft_ID", u."Utility_ID"
  FROM "Craft" c, "Utility" u
 WHERE c."Craft_Name" ILIKE '%electric only%'
   AND u."Utility" = 'Electric'
ON CONFLICT DO NOTHING;


-- ── Check ───────────────────────────────────────────────────────
--   SELECT c."Craft_Name", t."Task_Type_Name", c."Scope",
--          COALESCE(string_agg(u."Utility", ', '), 'any') AS utilities
--     FROM "Craft" c
--     LEFT JOIN "Task_Type" t USING ("Task_Type_ID")
--     LEFT JOIN "Craft_Utility" cu ON cu."Craft_ID" = c."Craft_ID"
--     LEFT JOIN "Utility" u USING ("Utility_ID")
--    GROUP BY c."Craft_Name", t."Task_Type_Name", c."Scope"
--    ORDER BY c."Craft_Name";
--
-- Crafts still unmapped — Street Lighting, Water Chlorination and Gas
-- Engineer will be among them, since their names say nothing about a
-- phase. Until they carry one they match nothing, so a team holding
-- only those will not be offered ordinary work:
--   SELECT "Craft_Name" FROM "Craft" WHERE "Task_Type_ID" IS NULL;
