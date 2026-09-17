-- ── A layer for a particular CABLE, not just a size ──
--
-- 0216 lets a rule match a size band, which is enough for pipe: a
-- 180mm water main is a 180mm water main. A cable is not. "3c WAVE 95"
-- is a TYPE and a size together — three-core waveform, 95mm² — and a
-- CAD schedule that separates 3c WAVE 95 from 4c WAVE 95 cannot be
-- written with a band alone. They are the same 95mm².
--
-- So two more things a rule can match:
--
--   Cable_Type   the type's name as the catalogue spells it, from
--                Electric_Cable_Type.Type_Name
--   Size_Label   the size as the catalogue spells it, from
--                Electric_Cable_Size.Size_Label
--
-- Text rather than ids, deliberately. A CAD schedule is written by
-- people against names they can read, and a rule that says
-- '3c WAVE' / '95' can be checked by eye against the catalogue. Ids
-- would be unreadable in the editor and would break if the catalogue
-- were ever rebuilt.
--
-- ── Where they sit in the ordering ──
--
-- An exact size label beats a band that contains it, and a cable type
-- beats both: "this cable" is a more specific claim than "a cable of
-- about this size". Scored in dxfLayerMap.js, with the rest.

ALTER TABLE "DXF_Layer_Map"
  ADD COLUMN IF NOT EXISTS "Cable_Type" text,
  ADD COLUMN IF NOT EXISTS "Size_Label" text;

COMMENT ON COLUMN "DXF_Layer_Map"."Cable_Type" IS
  'Electric_Cable_Type.Type_Name, matched exactly. Blank means any.';
COMMENT ON COLUMN "DXF_Layer_Map"."Size_Label" IS
  'Electric_Cable_Size.Size_Label or a pipe size as written, matched '
  'exactly. Blank means any. Beats a size band that contains it.';

-- Checks worth running after this:
--
--   SELECT "CAD_Layer","Cable_Type","Size_Label","Size_From","Size_To"
--     FROM "DXF_Layer_Map" WHERE "Cable_Type" IS NOT NULL;
