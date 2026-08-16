-- ════════════════════════════════════════════════════════════════
-- 0172 — the operator list knows about gas and water operators
--
-- The Gas DNO picker on a project offered nothing, with "No DNO is
-- marked as working in this utility". Cadent is set up correctly, as a
-- gas transporter covering gas.
--
-- ── What was wrong ──
--
-- Operator_Utility (0069) admits two roles:
--
--   AND t."Type_Key" IN ('idno', 'dno')
--
-- That was the whole world when it was written. The register now holds
-- six operator roles:
--
--   dno    distribution network operator      electric
--   idno   independent DNO                    electric
--   gt     gas transporter                    gas
--   igt    independent gas transporter        gas
--   wu     water undertaker                   water
--   iwu    independent water undertaker       water
--
-- Four of them were invisible to every picker built on this view.
--
-- ── Water was wrong too, and more quietly ──
--
-- The gas picker showed an empty list and said so. The water picker
-- showed GTC and Leep Networks — because those two hold an idno role —
-- and said nothing. So it looked like it was working while offering two
-- electricity companies and omitting United Utilities, Severn Trent,
-- Yorkshire Water and every other undertaker on the register.
--
-- An empty list gets reported the same day. A short one that looks
-- plausible does not.
--
-- ── The fix ──
--
-- Admit every operator role. Customers and fire authorities stay out:
-- they are organisations, not operators, and a picker offering Barratt
-- Homes as a distribution operator would be worse than one offering
-- nobody.
--
-- role_keys already comes back with each row, so a screen that wants
-- only the gas transporters can filter on it. Nothing has to guess from
-- the name.
-- ════════════════════════════════════════════════════════════════

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
   -- Every role that operates a network. Listed rather than derived,
   -- because "is this an operator" is a judgement about the trade and
   -- not something the shape of the table can answer — a role added
   -- later wants adding here deliberately.
   AND t."Type_Key" IN ('dno', 'idno', 'gt', 'igt', 'wu', 'iwu')
  LEFT JOIN "Organisation_Utility" ou ON ou."Organisation_ID" = o."Organisation_ID"
  WHERE o."Is_Active"
  GROUP BY o."Organisation_ID", o."Name", o."Code", o."VAT_Registered", o."VAT_Rate";


-- ── Check ───────────────────────────────────────────────────────
--
-- Every operator, with what it does and where. Expect gas and water
-- companies to appear for the first time:
--
--   SELECT "Name", role_keys, utility_ids FROM "Operator_Utility"
--    ORDER BY "Name";
--
-- What each utility's picker will now offer. The Utility_IDs are
-- whatever your Utility table uses — read them first:
--
--   SELECT "Utility_ID", "Utility" FROM "Utility" ORDER BY "Sort_Order";
--
--   SELECT u."Utility", ou."Name", ou.role_keys
--     FROM "Operator_Utility" ou
--     CROSS JOIN LATERAL unnest(ou.utility_ids) AS uid
--     JOIN "Utility" u ON u."Utility_ID" = uid
--    ORDER BY u."Utility", ou."Name";
--
-- ** An operator with no utilities against it. ** These appear in the
-- list and are offered by nothing, because a picker matches on utility.
-- Set them in Admin › Organisations:
--
--   SELECT "Name", role_keys FROM "Operator_Utility"
--    WHERE cardinality(utility_ids) = 0 ORDER BY "Name";
--
-- Nobody who is not an operator has crept in — no customers, no
-- authorities:
--
--   SELECT "Name", role_keys FROM "Operator_Utility"
--    WHERE NOT (role_keys && ARRAY['dno','idno','gt','igt','wu','iwu']);
