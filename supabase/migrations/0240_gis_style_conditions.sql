-- ── A style rule built out of conditions ─────────────────────────────
--
-- Asked for: "I need to be able to build a rule within the pane where
-- all the fields are. e.g. Build Status = Planned AND DNO Operator =
-- Electricity North West THEN set style of line/point."
--
-- The seven scope columns were already ANDed together, so the SHAPE was
-- right and the contents were the problem: Build Status was not one of
-- them, and neither was cable size or voltage rating, and each new one
-- would have been a migration like this one.
--
-- So: a list of {field, value} read off whatever the feature actually
-- carries in its Attributes, all of which must match. Adding a field to
-- key on stops being a schema change.
--
-- ── Why jsonb and not more columns ──
--
-- A column per question is what produced the question. The seven that
-- exist stay exactly as they are — they are what the existing rules are
-- written in, they carry their own weights in the cascade, and moving
-- them would put every drawing in the system at risk for tidiness.
-- This is additive: a rule with no conditions matches what it matched
-- and scores what it scored, which is the condition the work was
-- agreed under.
--
-- Shape, checked below so a malformed write fails at the database
-- rather than at a drawing:
--
--   [{"field": "Build_Status", "value": "planned"}, ...]

ALTER TABLE "GIS_Style"
  ADD COLUMN IF NOT EXISTS "Conditions" jsonb;

-- An array, or nothing. NULL is how every existing row reads and is the
-- same as [] to the cascade; both are "no conditions".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = '"GIS_Style"'::regclass
       AND conname = 'GIS_Style_Conditions_is_array'
  ) THEN
    ALTER TABLE "GIS_Style"
      ADD CONSTRAINT "GIS_Style_Conditions_is_array"
      CHECK ("Conditions" IS NULL OR jsonb_typeof("Conditions") = 'array');
  END IF;
END $$;

-- Every entry names a field. A condition with no field narrows nothing
-- and would be scored for while never matching, which is a rule that
-- silently outranks its neighbours and does nothing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = '"GIS_Style"'::regclass
       AND conname = 'GIS_Style_Conditions_have_fields'
  ) THEN
    ALTER TABLE "GIS_Style"
      ADD CONSTRAINT "GIS_Style_Conditions_have_fields"
      CHECK (
        "Conditions" IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements("Conditions") AS e
           WHERE jsonb_typeof(e) <> 'object'
              OR coalesce(e ->> 'field', '') = ''
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN "GIS_Style"."Conditions" IS
  'Extra scope, ANDed with the columns: [{"field","value"}] matched against '
  'GIS_Feature.Attributes. Each one adds CONDITION_WEIGHT to the rule''s '
  'specificity in gisStyle.js. NULL means none, and a rule with none behaves '
  'exactly as it did before 0240.';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM "GIS_Style" WHERE "Conditions" IS NOT NULL;
  RAISE NOTICE 'GIS_Style."Conditions" is ready. % existing rule(s) carry conditions; '
    'the rest are unchanged and draw exactly as they did.', n;
END $$;
