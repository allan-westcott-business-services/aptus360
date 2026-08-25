-- ════════════════════════════════════════════════════════════════
-- 0194 — non-residential supplies on the drawing
--
-- A non-residential supply is placed and connected exactly as a meter
-- is, and carries Feature_Role 'meter' so that it IS one to everything
-- that already works: it attaches to the network, takes a service, is
-- counted in the joints and the BOM, appears in the circuit report and
-- in the levels check. Fifty places in the code ask whether something
-- is a meter, and a separate role would have needed every one of them
-- auditing — with anything missed showing up later as a quietly wrong
-- number rather than as an error.
--
-- What sets it apart is two attributes on the feature:
--
--   NRS_ID       which Non_Residential_Supply record it is. Its load is
--                that record's Requested_kVA, since there is no plot to
--                hold one.
--   Supply_Type  'nrs'. Styling only — see below.
--
-- ── Why a new match column rather than a new role ──
--
-- Style rules match on Layer_Key, Line_Type, Feature_Role, Site and
-- Utility_ID. With the role kept as 'meter' there was nothing to hang a
-- different symbol on, so Supply_Type is added alongside them.
--
-- It sits ABOVE Feature_Role in specificity, so a rule about the kind
-- of supply beats the general one for meters, and BELOW Site, which is
-- about consent and cost and should still read at a glance.
--
-- Existing rows are null here and so match everything exactly as
-- before — a style that said nothing about supply type still says
-- nothing about it.
-- ════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE "GIS_Style"
  ADD COLUMN IF NOT EXISTS "Supply_Type" text;

COMMENT ON COLUMN "GIS_Style"."Supply_Type" IS
  'Matches GIS_Feature.Attributes.Supply_Type. Lets a point be drawn '
  'differently without changing what it IS to the rest of the app — a '
  'non-residential supply is a meter that happens not to be a house.';

-- A black triangle, against the plot seed's house.
--
-- Filled rather than outlined: triangle is not in STROKE_ONLY, and a
-- solid mark reads at site scale where an outline closes up. A point
-- larger than the meter's 8 px because these are the supplies somebody
-- is looking for.
INSERT INTO "GIS_Style"
  ("Style_Name","Feature_Role","Supply_Type","Symbol","Symbol_Size_Px","Colour","Sort_Order")
VALUES
  ('Non-residential supply', 'meter', 'nrs', 'triangle', 10, '#000000', 205)
ON CONFLICT DO NOTHING;

COMMIT;


-- ── Checks ──────────────────────────────────────────────────────
-- The rule is there and beats the plain meter rule.
--   SELECT "Style_Name","Feature_Role","Supply_Type","Symbol","Colour"
--     FROM "GIS_Style" WHERE "Feature_Role" = 'meter' ORDER BY "Sort_Order";
--
-- Supplies placed so far, and whether each resolves to a record with a
-- load on it. A null Requested_kVA contributes nothing to the volt drop
-- while still counting as a customer for the unbalanced correction, so
-- it is worth seeing.
--   SELECT f."Feature_ID", f."Label",
--          f."Attributes" ->> 'NRS_ID'      AS nrs_id,
--          f."Attributes" ->> 'Circuit_ID'  AS circuit,
--          n."Supply_Ref", n."Description", n."Requested_kVA"
--     FROM "GIS_Feature" f
--     LEFT JOIN "Non_Residential_Supply" n
--            ON n."NRS_ID" = (f."Attributes" ->> 'NRS_ID')::bigint
--    WHERE f."Feature_Role" = 'meter'
--      AND f."Attributes" ->> 'NRS_ID' IS NOT NULL
--    ORDER BY f."Project_ID", f."Feature_ID";
--
-- Records created in the Project but not yet placed on any drawing.
--   SELECT n."NRS_ID", n."Supply_Ref", n."Description", n."Requested_kVA"
--     FROM "Non_Residential_Supply" n
--    WHERE NOT EXISTS (
--            SELECT 1 FROM "GIS_Feature" f
--             WHERE f."Feature_Role" = 'meter'
--               AND (f."Attributes" ->> 'NRS_ID')::bigint = n."NRS_ID")
--    ORDER BY n."Project_ID", n."NRS_ID";
