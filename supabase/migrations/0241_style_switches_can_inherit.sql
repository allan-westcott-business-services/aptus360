-- ── A style switch has three states, and the column allowed two ──────
--
-- Reported, saving a variation of an electric main:
--
--   null value in column "Scale_Width" of relation "GIS_Style"
--   violates not-null constraint
--
-- ── Why it is null ──
--
-- The cascade's whole contract is that a null field is INHERITED from
-- the style beneath it: `resolveStyle` writes a field only where the
-- rule says something, `if (s[k] != null)`. A variation exists to change
-- one thing and take the rest from its default, so every field it does
-- not set has to reach the database as null.
--
-- `Dashed`, `Scale_Width` and `Scale_Symbol` were `boolean NOT NULL
-- DEFAULT false`, so they could not. 0106 said so and meant it: "a
-- boolean that is neither true nor false is a third state nobody
-- wanted." That was written when every rule was a whole style and it
-- was right about that. With variations it is the opposite — false is a
-- DECISION and it overrides, so a dashed default could never survive a
-- variation over it: the variation said "solid" without anybody
-- choosing solid, and nothing on the screen said why.
--
-- `Marker_Rotate` was already nullable (0078) and `appearance` reads it
-- as `!== false`, which is the same idea arrived at earlier.
--
-- ── What this does not do ──
--
-- Nothing already stored changes. Every existing row keeps the true or
-- false it holds, and a rule that says false goes on meaning false —
-- which is what it has always meant to the cascade and to the canvas.
-- Only a rule saved from now on can leave one unanswered.
--
-- The DEFAULT stays. A writer that omits the column still gets false,
-- exactly as before; the admin sends every column explicitly, so its
-- null wins. Dropping the default as well would change what an INSERT
-- that mentions no switch means, which is nobody's request and another
-- thing to be wrong about.
--
-- `Is_Active` keeps its NOT NULL. It is not a style field — it is the
-- switch that says whether the rule applies at all, and a rule that is
-- neither on nor off is a rule nobody can reason about.

ALTER TABLE "GIS_Style"
  ALTER COLUMN "Dashed"       DROP NOT NULL,
  ALTER COLUMN "Scale_Width"  DROP NOT NULL,
  ALTER COLUMN "Scale_Symbol" DROP NOT NULL;

COMMENT ON COLUMN "GIS_Style"."Dashed" IS
  'Dashed, continuous, or NULL to take whichever the style beneath says. '
  'False is a decision and overrides; null is the absence of one.';
COMMENT ON COLUMN "GIS_Style"."Scale_Width" IS
  'Draw to the real width on the ground, fixed pixels, or NULL to inherit.';
COMMENT ON COLUMN "GIS_Style"."Scale_Symbol" IS
  'Draw the symbol to scale, at fixed pixels, or NULL to inherit.';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_name = 'GIS_Style'
     AND column_name IN ('Dashed', 'Scale_Width', 'Scale_Symbol')
     AND is_nullable = 'NO';
  IF n > 0 THEN
    RAISE EXCEPTION 'A style switch is still NOT NULL — a variation that '
      'does not set it cannot be saved.';
  END IF;
  RAISE NOTICE 'Dashed, Scale_Width and Scale_Symbol can now be left unset, '
    'which is how a variation inherits them. Nothing already stored changed.';
END $$;
