-- ════════════════════════════════════════════════════════════════
-- 0099 — how much cable is on a drum
--
-- Cable is delivered in drums of a set length, so a run longer than a
-- drum has to be jointed part way along it. That joint is not at
-- anything the network does — nothing forks, nothing tees, the cable
-- does not change — it is at the point the previous length ran out.
-- Nothing in the catalogue records the figure, so it could not be
-- placed.
--
-- Per size rather than per type: 95 mm² and 300 mm² of the same
-- construction come on different drums, and it is the size that decides
-- how much fits on one.
--
-- Left null rather than defaulted. A size with no figure is not a size
-- with an infinite drum, it is one nobody has entered yet, and the
-- placement skips it — inventing a length would put joints on drawings
-- that no schedule justifies. Fill them in under
-- Admin → Electric Specs → Cable sizes.
--
-- ── The column names here are the live ones ─────────────────────
-- This repo's 0082 creates the table with Electric_Cable_Size_ID and
-- Electric_Cable_Type_ID; the deployed table uses Cable_Size_ID and
-- Cable_Type_ID, which is what the application selects. The table name
-- is the same in both, and ADD COLUMN needs no key column, so this is
-- safe either way — but it is worth knowing that the repo's copy of that
-- table does not describe the live one.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Electric_Cable_Size"
  ADD COLUMN IF NOT EXISTS "Drum_Length_m" numeric;

COMMENT ON COLUMN "Electric_Cable_Size"."Drum_Length_m" IS
  'Standard delivered drum length in metres. A run longer than this is '
  'jointed at each multiple. Null means not recorded, and no drum joints '
  'are placed for that size.';


-- ── Check ───────────────────────────────────────────────────────
-- Which sizes still have no figure — these place no drum joints:
--   SELECT "Size_Label", "Drum_Length_m" FROM "Electric_Cable_Size"
--    WHERE "Is_Active" AND "Drum_Length_m" IS NULL ORDER BY "Sort_Order";
--
-- A starting point if the figures are the same across a range, adjust to
-- your supplier's drums before relying on it:
--   UPDATE "Electric_Cable_Size" SET "Drum_Length_m" = 500
--    WHERE "Drum_Length_m" IS NULL;
