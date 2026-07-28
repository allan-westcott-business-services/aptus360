-- ════════════════════════════════════════════════════════════════
-- 0051 — GIS styling: zoom rules, and appearance per utility and
--        per operator
--
-- Until now a line's appearance came from GIS_Line_Type: one colour,
-- one pixel width, dashed or not, the same at every zoom and the same
-- whoever the scheme is for. Two things that doesn't cover:
--
--   Zoom. A pixel width is wrong at both ends. A 450mm trench drawn at
--   6px looks like a motorway at site level and disappears at 10%. What
--   is wanted is a real width that scales, clamped so it never vanishes
--   and never swamps the plan, and a zoom band outside which an object
--   isn't drawn at all — service connections are noise on a whole-site
--   view.
--
--   Whose standard. DNOs publish their own symbols and colours, and a
--   drawing produced for one is not a drawing produced for another.
--
-- One table does both, because both answer the same question: what does
-- this object look like right now. Rows are scoped by any combination of
-- layer, line type, feature role, utility and organisation. NULL means
-- "any", so a row scoped to nothing is the base style and a row naming
-- an organisation and a line type beats it.
--
-- Resolution is most-specific-wins, scored in src/lib/gisStyle.js so the
-- canvas can do it per frame without a round trip.
-- ════════════════════════════════════════════════════════════════

-- ── A layer needs to know its utility, so a style can be scoped by one ──
ALTER TABLE "GIS_Layer"
  ADD COLUMN IF NOT EXISTS "Utility_ID" bigint REFERENCES "Utility";

UPDATE "GIS_Layer" l
   SET "Utility_ID" = u."Utility_ID"
  FROM "Utility" u
 WHERE l."Utility_ID" IS NULL
   AND LOWER(u."Utility") = LOWER(l."Label");

-- Layer labels and utility names don't always agree; catch the obvious
-- pairs by key as well. Anything still null simply has no utility, which
-- is correct for boundary, trench and note.
UPDATE "GIS_Layer" l
   SET "Utility_ID" = u."Utility_ID"
  FROM "Utility" u
 WHERE l."Utility_ID" IS NULL
   AND LOWER(u."Utility") LIKE LOWER(l."Layer_Key") || '%';


CREATE TABLE IF NOT EXISTS "GIS_Style" (
  "GIS_Style_ID"    bigserial PRIMARY KEY,
  "Style_Name"      text NOT NULL,

  -- ── scope: every column NULL means "applies to anything" ──
  "Layer_Key"       text,
  "Line_Type"       text,
  "Feature_Role"    text,
  "Utility_ID"      bigint REFERENCES "Utility",
  -- The operator whose drawing standard this is. An organisation rather
  -- than a DNO table, so an IDNO standard uses the same mechanism.
  "Organisation_ID" bigint REFERENCES "Organisation",

  -- ── appearance ──
  "Colour"          text,
  "Dashed"          boolean NOT NULL DEFAULT false,
  -- "9,6" — on, off, in pixels. Free text so an unusual pattern needs no
  -- migration.
  "Dash_Pattern"    text,
  -- Points only: circle, square, triangle, diamond, cross, plus, hexagon
  "Symbol"          text,

  -- ── size ──
  -- Width_Px is the fixed width. Width_M is the real width of the thing
  -- on the ground; with Scale_Width it is drawn to scale and the clamps
  -- stop it disappearing or swallowing the plan.
  "Width_Px"        numeric,
  "Width_M"         numeric,
  "Scale_Width"     boolean NOT NULL DEFAULT false,
  "Min_Width_Px"    numeric,
  "Max_Width_Px"    numeric,
  "Symbol_Size_Px"  numeric,

  -- ── zoom ──
  -- Scale is canvas pixels per metre, the same number the zoom readout
  -- is derived from: 4 is the default view, 1 is well out, 20 is close
  -- in. NULL at either end means unbounded.
  "Min_Scale"       numeric,
  "Max_Scale"       numeric,
  -- Below this, the label is dropped but the object is still drawn
  "Label_Min_Scale" numeric,

  "Sort_Order"      integer NOT NULL DEFAULT 0,
  "Is_Active"       boolean NOT NULL DEFAULT true,
  "Notes"           text
);

CREATE INDEX IF NOT EXISTS gis_style_scope_idx
  ON "GIS_Style" ("Layer_Key", "Line_Type", "Organisation_ID");

-- One row per exact scope. COALESCE over the nullable columns because
-- NULL never equals NULL, so a plain unique index would let the same
-- scope be seeded twice — the trap 0031 had to clean up after.
CREATE UNIQUE INDEX IF NOT EXISTS gis_style_scope_uniq ON "GIS_Style" (
  COALESCE("Layer_Key", ''),
  COALESCE("Line_Type", ''),
  COALESCE("Feature_Role", ''),
  COALESCE("Utility_ID", -1),
  COALESCE("Organisation_ID", -1)
);

ALTER TABLE "GIS_Style" ENABLE ROW LEVEL SECURITY;


-- ── Seed from what is drawn today, so nothing changes appearance ──
-- One style per active line type, carrying its current colour, width and
-- dash. Anything added later inherits from these rather than starting
-- blank.
INSERT INTO "GIS_Style"
  ("Style_Name","Line_Type","Layer_Key","Colour","Width_Px","Dashed","Sort_Order")
SELECT t."Label", t."Type_Key", t."Layer_Key", t."Colour", t."Width_px", t."Dashed", t."Sort_Order"
  FROM "GIS_Line_Type" t
 WHERE t."Is_Active"
ON CONFLICT DO NOTHING;

-- A base row per layer, so a feature with no line type still resolves
INSERT INTO "GIS_Style" ("Style_Name","Layer_Key","Colour","Width_Px","Sort_Order")
SELECT l."Label" || ' (layer default)', l."Layer_Key", l."Colour", 2, l."Sort_Order"
  FROM "GIS_Layer" l
 WHERE l."Is_Active"
ON CONFLICT DO NOTHING;

-- Points: the roles the canvas already draws differently
INSERT INTO "GIS_Style"
  ("Style_Name","Feature_Role","Symbol","Symbol_Size_Px","Colour","Sort_Order")
VALUES
  ('Meter',  'meter', 'square', 8,  NULL, 200),
  ('Joint',  'joint', 'circle', 7,  NULL, 210)
ON CONFLICT DO NOTHING;

-- Service runs are noise on a whole-site view, so they come in at 2 px
-- per metre. Mains stay visible at every zoom.
UPDATE "GIS_Style"
   SET "Min_Scale" = 2
 WHERE "Line_Type" IN ('elec_service','gas_service','water_service','trench_service')
   AND "Min_Scale" IS NULL;

-- Trenches are the one thing with a real width worth drawing to scale
UPDATE "GIS_Style"
   SET "Width_M" = CASE "Line_Type" WHEN 'trench_main' THEN 0.60 ELSE 0.45 END,
       "Scale_Width" = true,
       "Min_Width_Px" = 2,
       "Max_Width_Px" = 40
 WHERE "Line_Type" IN ('trench_main','trench_service')
   AND "Width_M" IS NULL;


-- ── Check ───────────────────────────────────────────────────────
--   supabase/checks/0051_gis_styles.sql
