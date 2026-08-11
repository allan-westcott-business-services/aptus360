-- ════════════════════════════════════════════════════════════════
-- 0153 — the tee allowance goes back to diameters
--
-- 0152 moved it to a flat metre figure, on the grounds that metres are
-- easier to enter and to check against a real job. They are — but a
-- fixed length under-states the larger pipes, because a fitting on a
-- big main resists more than the same fitting on a small one. On a leg
-- with six tees it is right at 63mm and 13% out at 180mm, always in the
-- optimistic direction.
--
-- So the multiple of the bore is what the check reads again. At 60
-- diameters that is 3.05m on a 63mm main and 9.53m on a 180mm.
--
-- Tee_Length_M is left in place. Nothing reads it, and dropping a
-- column somebody may have typed a considered figure into is worse than
-- leaving it where it can be seen.
-- ════════════════════════════════════════════════════════════════

UPDATE "Gas_Pressure_Setting"
   SET "Tee_Diameters" = 60
 WHERE "Tee_Diameters" IS NULL OR "Tee_Diameters" <= 0;

COMMENT ON COLUMN "Gas_Pressure_Setting"."Tee_Diameters" IS
  'Equivalent length per service tee, as a multiple of the pipe bore. 60 is the textbook figure for gas taken through the branch of a tee.';

COMMENT ON COLUMN "Gas_Pressure_Setting"."Tee_Length_M" IS
  'Superseded by Tee_Diameters in 0153. Kept for reference; nothing reads it.';


-- ── Check ───────────────────────────────────────────────────────
--   SELECT "Tee_Diameters", "Tee_Length_M" FROM "Gas_Pressure_Setting";
