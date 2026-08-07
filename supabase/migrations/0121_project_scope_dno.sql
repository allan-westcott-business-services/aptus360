-- ════════════════════════════════════════════════════════════════
-- 0121 — the DNO for each utility on a project
--
-- A scheme has a distribution operator per utility, and they are three
-- different companies: the electric DNO, the gas one, the water one.
-- Nothing recorded them. The IDNO was on Project_Scope already —
-- "Adopting operator" on the outline design — and the DNO belongs
-- beside it.
--
-- ── Why on the scope and not on the project ──
--
-- Three columns on Project — Electric_DNO_ID, Gas_DNO_ID, Water_DNO_ID —
-- is the shape the request describes, and it is the shape that has to be
-- altered the day somebody adds a fourth utility. Project_Scope is
-- already one row per project per utility, so a single column there says
-- the same thing and keeps saying it: a scheme doing electric and water
-- has two scope rows and therefore two DNOs, and a heat network added
-- next year needs no migration at all.
--
-- The screen still reads as three fields, because the outline designs
-- are listed one per utility.
--
-- ── An organisation, not a DNO row ──
--
-- The "DNO" table is half a migration behind: 0047 moved operators onto
-- Organisation with a role, 0062 said new work should read that, and a
-- DNO set up since then has no row in "DNO" at all. 0120 made the same
-- correction for water pipe size rules and this follows it, so the two
-- name operators the same way.
--
-- Which utilities a company works in is Organisation_Utility, so the
-- picker can offer the water DNOs on the water design and nothing else.
-- That is the whole reason this is an organisation: the legacy table
-- cannot answer the question.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Project_Scope"
  ADD COLUMN IF NOT EXISTS "DNO_Organisation_ID" bigint REFERENCES "Organisation";

CREATE INDEX IF NOT EXISTS project_scope_dno_idx
  ON "Project_Scope" ("DNO_Organisation_ID");

COMMENT ON COLUMN "Project_Scope"."DNO_Organisation_ID" IS
  'The distribution operator for this utility on this project. An '
  'Organisation holding the dno role — see 0069 for the utilities it covers.';


-- ── Check ───────────────────────────────────────────────────────
-- A project's operators, one line per utility — the three fields the
-- request describes, as they are actually stored:
--   SELECT u."Utility", i."IDNO_Name" AS adopting, d."Name" AS dno
--     FROM "Project_Scope" s
--     JOIN "Utility" u ON u."Utility_ID" = s."Utility_ID"
--     LEFT JOIN "IDNO" i        ON i."IDNO_ID" = s."IDNO_ID"
--     LEFT JOIN "Organisation" d ON d."Organisation_ID" = s."DNO_Organisation_ID"
--    WHERE s."Project_ID" = 1
--    ORDER BY u."Sort_Order";
--
-- What the water DNO picker should offer:
--   SELECT ou."Name"
--     FROM "Operator_Utility" ou
--     JOIN "Utility" u ON u."Utility_ID" = ANY (ou.utility_ids)
--    WHERE 'dno' = ANY (ou.role_keys)
--      AND lower(u."Utility") LIKE 'water%'
--    ORDER BY ou."Name";
--
-- Scopes whose DNO does not work in that utility. These can only come
-- from before this rule — the picker will not allow new ones:
--   SELECT s."Project_ID", u."Utility", o."Name"
--     FROM "Project_Scope" s
--     JOIN "Utility" u      ON u."Utility_ID" = s."Utility_ID"
--     JOIN "Organisation" o ON o."Organisation_ID" = s."DNO_Organisation_ID"
--     LEFT JOIN "Organisation_Utility" ou
--            ON ou."Organisation_ID" = o."Organisation_ID"
--           AND ou."Utility_ID" = s."Utility_ID"
--    WHERE ou."Organisation_ID" IS NULL;
