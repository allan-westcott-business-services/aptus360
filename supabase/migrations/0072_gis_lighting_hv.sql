-- ════════════════════════════════════════════════════════════════
-- 0072 — street lighting, HV, link boxes
--
-- The GIS menus name things the drawing cannot hold yet. A menu entry
-- that toggles a class with no members is worse than no entry: it looks
-- broken rather than unbuilt. So the classes come first.
--
--   Street lighting is a layer in its own right. It is already a utility
--   — three of them, in fact, since Section 38, Section 278 and private
--   lighting are separate scopes — but the drawing has never had
--   anywhere to put a column or a lighting cable.
--
--   HV is a second electric class. An HV cable and an LV cable are not
--   the same drawing object: different colour, different width, and the
--   HV route from the POC to the substation is a distinct run again.
--
--   Link boxes and lighting columns are point roles.
-- ════════════════════════════════════════════════════════════════

INSERT INTO "GIS_Layer" ("Layer_Key","Label","Colour","Sort_Order") VALUES
  ('lighting', 'Street lighting', '#eab308', 55)
ON CONFLICT ("Layer_Key") DO NOTHING;

-- Tie it to the private lighting utility where one exists, so the bill
-- of materials groups it rather than filing it under "None".
UPDATE "GIS_Layer" l
   SET "Utility_ID" = u."Utility_ID"
  FROM "Utility" u
 WHERE l."Layer_Key" = 'lighting'
   AND l."Utility_ID" IS NULL
   AND u."Utility" = 'Private Street Lighting';


INSERT INTO "GIS_Line_Type" ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order") VALUES
  -- HV is drawn heavier than LV and in a deeper colour, because mistaking
  -- one for the other on a drawing is a safety matter rather than a
  -- tidiness one.
  ('elec_hv',       'HV cable',            'electric', '#b91c1c', 4.5, false, 12),
  ('elec_hv_route', 'HV route POC to sub', 'electric', '#b91c1c', 4.5, true,  14),
  ('light_main',    'Lighting cable',      'lighting', '#eab308', 2.2, false, 56),
  ('light_service', 'Lighting service',    'lighting', '#eab308', 1.4, false, 58)
ON CONFLICT ("Type_Key") DO NOTHING;


-- ── Point roles ──────────────────────────────────────────────────
-- Widened again rather than replaced with a lookup table: the set is
-- small, it is checked in one place, and a constraint that lists its
-- values is easier to read than a join.
ALTER TABLE "GIS_Feature" DROP CONSTRAINT IF EXISTS "GIS_Feature_Feature_Role_check";

ALTER TABLE "GIS_Feature"
  ADD CONSTRAINT "GIS_Feature_Feature_Role_check"
  CHECK ("Feature_Role" IN
    ('shape','plot','meter','poc','substation','joint','source','spannode',
     'linkbox','column'));


INSERT INTO "GIS_Style"
  ("Style_Name","Feature_Role","Symbol","Symbol_Size_Px","Colour","Sort_Order","Notes")
VALUES
  ('Link box',          'linkbox', 'square',  7, '#b91c1c', 190,
   'LV link box. Sits on the network between substation and circuits.'),
  ('Lighting column',   'column',  'circle',  5, '#eab308', 200,
   'Street lighting column.')
ON CONFLICT DO NOTHING;


-- ── Check ───────────────────────────────────────────────────────
-- Expect lighting present, with a utility:
--   SELECT l."Layer_Key", l."Label", u."Utility"
--     FROM "GIS_Layer" l LEFT JOIN "Utility" u ON u."Utility_ID" = l."Utility_ID"
--    ORDER BY l."Sort_Order";
--
-- Expect the four new line types, each on a layer that exists:
--   SELECT t."Type_Key", t."Label", t."Layer_Key",
--          (l."Layer_Key" IS NOT NULL) AS layer_exists
--     FROM "GIS_Line_Type" t
--     LEFT JOIN "GIS_Layer" l ON l."Layer_Key" = t."Layer_Key"
--    WHERE t."Type_Key" IN ('elec_hv','elec_hv_route','light_main','light_service');
--
-- Expect ten roles:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'GIS_Feature_Feature_Role_check';
