-- ── The CAD team's own layer list, and two more things a rule can match ──
--
-- Three changes, all in service of one workflow: somebody sitting down
-- with the CAD team's schedule and entering it without having to
-- remember anything.
--
-- ── 1. A catalogue of THEIR layer names ──
--
-- The mapping rules name a CAD layer as free text, which is fine for
-- one rule and miserable for two hundred: every name is typed again,
-- and a typo produces a layer nobody notices until a drawing is
-- issued. So their layers are a table of their own — the name, and the
-- utility it belongs to — and a mapping rule picks from it.
--
-- Recorded here rather than derived from anything of ours, because it
-- is THEIR standard: we hold it, we do not own it.
CREATE TABLE IF NOT EXISTS "CAD_Layer" (
  "CAD_Layer_ID"     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  "Layer_Name"       text NOT NULL,
  -- Which of our utility classes this layer of theirs is for. Kept as
  -- the drawing's own layer key (water, gas, electric, trench,
  -- lighting, annotation) so a form can filter by it without a second
  -- vocabulary in between.
  "Layer_Key"        text,
  -- Line, Point or Polygon. A CAD schedule usually separates them, and
  -- the entry form asks for it second, so the list can be narrowed
  -- before anybody is shown two hundred names.
  "Geometry_Type"    text,

  "ACI_Colour"       integer,
  "Linetype"         text,
  "Organisation_ID"  bigint REFERENCES "Organisation",

  "Sort_Order"       integer NOT NULL DEFAULT 0,
  "Is_Active"        boolean NOT NULL DEFAULT true,
  "Notes"            text,

  CONSTRAINT cad_layer_geom CHECK ("Geometry_Type" IS NULL
    OR "Geometry_Type" IN ('Line','Point','Polygon')),
  CONSTRAINT cad_layer_name UNIQUE ("Layer_Name", "Organisation_ID")
);

ALTER TABLE "CAD_Layer" ENABLE ROW LEVEL SECURITY;

-- ── 2. Geometry type on a mapping rule ──
--
-- A schedule that separates lines from points needs a rule that can
-- say so: WATER-MAIN is a line, WATER-VALVE is a point, and a rule
-- matching only the utility cannot tell them apart.
ALTER TABLE "DXF_Layer_Map"
  ADD COLUMN IF NOT EXISTS "Geometry_Type" text,
  ADD COLUMN IF NOT EXISTS "CAD_Layer_ID" bigint REFERENCES "CAD_Layer";

-- ── 3. External or internal ──
--
-- A new fact about some apparatus: whether it is outside the building
-- or inside it. It matters to a CAD schedule because the two are drawn
-- on different layers, and it matters on site because they are
-- different jobs.
--
-- Wanted for MAINS FEEDER CABLES and METERS to begin with. Neither
-- needs a column: both are GIS_Feature rows and carry it in
-- Attributes.Siting, alongside every other thing a feature knows about
-- itself. This column is on the MAPPING, so a rule can match it.
--
-- 'External' or 'Internal', spelled as the user sees them, because a
-- schedule is checked by eye against the drawing.
ALTER TABLE "DXF_Layer_Map"
  ADD COLUMN IF NOT EXISTS "Siting" text;

COMMENT ON COLUMN "DXF_Layer_Map"."Siting" IS
  'External or Internal, matched against GIS_Feature.Attributes.Siting. '
  'Blank means any.';
COMMENT ON COLUMN "DXF_Layer_Map"."Geometry_Type" IS
  'Line, Point or Polygon. Blank means any.';

-- Checks worth running after this:
--
--   SELECT "Layer_Name","Layer_Key","Geometry_Type" FROM "CAD_Layer"
--    ORDER BY "Layer_Key","Sort_Order";
--
--   SELECT "CAD_Layer","Geometry_Type","Siting" FROM "DXF_Layer_Map"
--    WHERE "Siting" IS NOT NULL OR "Geometry_Type" IS NOT NULL;
