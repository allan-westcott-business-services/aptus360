-- ── What our geometry is called in somebody else's CAD ──
--
-- The DXF export names layers from the drawing's own vocabulary:
-- WATER-MAIN, WATER-WASHOUT, TRENCH. That is a reasonable default and
-- the wrong answer for a CAD team with their own layer schedule, split
-- by pipe size, cable size, fitting kind and more.
--
-- So the mapping becomes data. One row is one rule: what it matches,
-- and what the layer is called when it does.
--
-- ── House style first, customers after ──
--
-- A row with no Organisation_ID is the HOUSE style: our own standard,
-- the one every export uses unless something more specific applies. A
-- row WITH one belongs to that customer, and outranks the house row it
-- competes with. Same idea as GIS_Style's operator scoping, and
-- deliberately the same shape: one way of thinking about "whose rules
-- are these", not two.
--
-- ── Most specific wins ──
--
-- Blank means "any". A rule naming a line type beats one naming only a
-- layer; a rule naming a size band beats one that does not; a
-- customer's rule beats the house's. Scored in dxfLayerMap.js, beside
-- the code that reads it, so the ordering is one idea in one place.
--
-- ── Sizes carry a unit, because two utilities disagree ──
--
-- A pipe's size is a DIAMETER in millimetres; a cable's is an AREA in
-- square millimetres. "95 to 300" means different things on water and
-- on electric, and a schedule that does not say which will eventually
-- be read wrong. The unit is inferred from the layer the rule matches
-- and shown in the editor, so nobody types 185 meaning diameter.

CREATE TABLE IF NOT EXISTS "DXF_Layer_Map" (
  "DXF_Layer_Map_ID"  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- What it matches. All optional; blank is "any".
  "Layer_Key"         text,
  "Line_Type"         text,
  "Feature_Role"      text,
  "Build_Status"      text,
  "Size_From"         numeric,
  "Size_To"           numeric,

  -- Whose rule this is. NULL is the house style.
  "Organisation_ID"   bigint REFERENCES "Organisation",

  -- What it produces.
  "CAD_Layer"         text NOT NULL,
  "ACI_Colour"        integer,
  "Linetype"          text,
  "Text_Layer"        text,

  "Sort_Order"        integer NOT NULL DEFAULT 0,
  "Is_Active"         boolean NOT NULL DEFAULT true,
  "Notes"             text,

  CONSTRAINT dxf_size_order CHECK (
    "Size_To" IS NULL OR "Size_From" IS NULL OR "Size_To" >= "Size_From")
);

ALTER TABLE "DXF_Layer_Map" ENABLE ROW LEVEL SECURITY;

-- ── The house style ──
--
-- Seeded to reproduce exactly what the export does today, so applying
-- this migration changes nothing about an existing DXF. That is the
-- point of seeding it rather than starting empty: the mapping becomes
-- visible and editable without anybody's next export shifting under
-- them.
--
-- Colours follow the drawing's own: water green, gas yellow, electric
-- red, trench grey. Linetypes CONTINUOUS throughout, because a DXF
-- that names a linetype it does not define gets substituted anyway.
INSERT INTO "DXF_Layer_Map"
  ("Layer_Key","Line_Type","Feature_Role","CAD_Layer","ACI_Colour","Linetype","Text_Layer","Sort_Order","Notes")
VALUES
  ('water',    NULL, NULL, 'WATER',           3, 'CONTINUOUS', 'WATER-TEXT',    10, 'House style'),
  ('gas',      NULL, NULL, 'GAS',             2, 'CONTINUOUS', 'GAS-TEXT',      20, 'House style'),
  ('electric', NULL, NULL, 'ELECTRIC',        1, 'CONTINUOUS', 'ELECTRIC-TEXT', 30, 'House style'),
  ('trench',   NULL, NULL, 'TRENCH',          8, 'CONTINUOUS', 'TRENCH-TEXT',   40, 'House style'),
  ('lighting', NULL, NULL, 'LIGHTING',        2, 'CONTINUOUS', 'LIGHTING-TEXT', 50, 'House style'),
  ('annotation', NULL, NULL, 'ANNOTATION',    7, 'CONTINUOUS', 'ANNOTATION',    60, 'House style'),

  (NULL, 'water_main',    NULL, 'WATER-MAIN',        3, 'CONTINUOUS', 'WATER-MAIN-TEXT',    110, 'House style'),
  (NULL, 'water_service', NULL, 'WATER-SERVICE',     3, 'CONTINUOUS', 'WATER-SERVICE-TEXT', 120, 'House style'),
  (NULL, 'gas_main',      NULL, 'GAS-MAIN',          2, 'CONTINUOUS', 'GAS-MAIN-TEXT',      130, 'House style'),
  (NULL, 'gas_service',   NULL, 'GAS-SERVICE',       2, 'CONTINUOUS', 'GAS-SERVICE-TEXT',   140, 'House style'),

  ('water', NULL, 'washout',      'WATER-WASHOUT',    3, 'CONTINUOUS', NULL, 210, 'House style'),
  ('water', NULL, 'servicevalve', 'WATER-VALVE',      3, 'CONTINUOUS', NULL, 220, 'House style'),
  ('electric', NULL, 'joint',     'ELECTRIC-JOINT',   1, 'CONTINUOUS', NULL, 230, 'House style'),
  ('electric', NULL, 'substation','ELECTRIC-SUBSTATION', 1, 'CONTINUOUS', NULL, 240, 'House style'),
  (NULL, NULL, 'meter',           'METERS',           7, 'CONTINUOUS', 'METERS-TEXT', 250, 'House style'),
  (NULL, NULL, 'plot',            'PLOTS',            7, 'CONTINUOUS', 'PLOTS-TEXT',  260, 'House style'),
  ('annotation', NULL, 'sectionmark', 'ANNOTATION-SECTIONS', 7, 'CONTINUOUS', NULL, 270, 'House style')
ON CONFLICT DO NOTHING;

-- Checks worth running after this:
--
--   -- The house style is there and nothing is scoped to a customer yet:
--   SELECT "CAD_Layer","Layer_Key","Line_Type","Feature_Role","Organisation_ID"
--     FROM "DXF_Layer_Map" ORDER BY "Sort_Order";
