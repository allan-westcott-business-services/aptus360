-- ── Retiring "Separate Trench" ───────────────────────────────────────
--
-- Asked for: "Separate Trench can be removed as I'm not sure what this
-- is." Nor is anybody else — it is trench_sep, seeded in 0050 alongside
-- trench_joint and superseded the same day by Mains Trench and Service
-- Trench, which are what people actually draw.
--
-- 0050 already shipped this, guarded by NOT EXISTS, with a note saying
-- "check first, then run it if the count is zero". If trench_sep is
-- still on the picker then 0050's deactivation either never ran or ran
-- while something was using the type. This does it again, on the same
-- guard, and then SAYS which of those it was — because a migration that
-- silently does nothing is indistinguishable from one that worked.
--
-- Deactivating is not deleting. It hides the type from the drawing
-- picker and from GIS Styles. Anything already drawn as trench_sep
-- keeps rendering: the canvas falls back to the layer colour for a type
-- it cannot find, so those lengths stay on the drawing, in brown,
-- without their own weight and dash. Nothing is lost and nothing moves.
--
-- To bring it back:
--   UPDATE "GIS_Line_Type" SET "Is_Active" = true WHERE "Type_Key" = 'trench_sep';

DO $$
DECLARE
  n_type   integer;
  n_drawn  integer;
  n_styles integer;
BEGIN
  SELECT count(*) INTO n_type
    FROM "GIS_Line_Type" WHERE "Type_Key" = 'trench_sep';

  IF n_type = 0 THEN
    RAISE NOTICE 'trench_sep is not in GIS_Line_Type — nothing to retire.';
    RETURN;
  END IF;

  SELECT count(*) INTO n_drawn
    FROM "GIS_Feature"
   WHERE "Attributes" ->> 'Line_Type' = 'trench_sep';

  IF n_drawn > 0 THEN
    -- Left alone, deliberately. Hiding a type that is in use takes the
    -- weight and dash off lengths somebody drew on purpose, and the
    -- request was to remove something nobody recognised — not to
    -- restyle work that exists.
    RAISE NOTICE 'trench_sep is used by % feature(s) and has been LEFT ACTIVE. '
      'To see where: SELECT "Project_ID", count(*) FROM "GIS_Feature" '
      'WHERE "Attributes" ->> ''Line_Type'' = ''trench_sep'' GROUP BY 1;', n_drawn;
    RETURN;
  END IF;

  UPDATE "GIS_Line_Type"
     SET "Is_Active" = false
   WHERE "Type_Key" = 'trench_sep'
     AND "Is_Active" IS DISTINCT FROM false;

  -- Its style rules go too, or GIS Styles keeps a line for a type that
  -- can no longer be drawn. Only rules that name it and nothing else:
  -- a rule scoping trench_sep AND an operator is somebody's decision
  -- and is not this migration's to throw away.
  DELETE FROM "GIS_Style"
   WHERE "Line_Type" = 'trench_sep'
     AND "Feature_Role" IS NULL
     AND "Site" IS NULL
     AND "Supply_Type" IS NULL
     AND "Organisation_ID" IS NULL;
  GET DIAGNOSTICS n_styles = ROW_COUNT;

  RAISE NOTICE 'trench_sep retired: nothing had been drawn with it, % style rule(s) removed.',
    n_styles;
END $$;
