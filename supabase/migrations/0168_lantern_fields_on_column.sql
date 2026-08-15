-- ════════════════════════════════════════════════════════════════
-- 0168 — the lantern is fields on the column, not an object
--
-- 0165 made the lantern a feature of its own, placed onto a column and
-- carrying Column_Feature_ID back to it. This removes it.
--
-- ── Why ──
--
-- The argument for two objects was that a lantern is changed on a
-- column that stays where it is, so they are bought and replaced
-- separately. That is true, and it turned out not to be worth what it
-- cost.
--
-- A lantern sits at its column's point, is placed at the same moment,
-- and is read on the same row of a drawing. So the second object bought
-- an association that had to be kept honest — deleting a column had to
-- take its lanterns, a lantern could be orphaned, the two geometries
-- could drift — in exchange for a distinction nobody was using.
--
-- The lantern's fields now live on the column: Lantern_Type, Wattage_W
-- and Mounting, beside Height_m and Material.
--
-- ── What this does ──
--
-- Deletes any lantern feature, removes its style row, and takes the
-- role back out of the constraint. In that order, because the
-- constraint refuses a role that rows still carry.
--
-- Nothing is migrated onto the columns. Lanterns were placeable for a
-- few hours between 0165 and this, on one drawing, and were carrying
-- nothing but nulls — a script to move fields that were never filled in
-- is more ways to be wrong than it is worth. The count below says how
-- many were removed; if it is not zero on your database, look at them
-- before running this.
--
-- ── Not reverting 0165 ──
--
-- 0165 also added servicevalve and pumping to the role constraint,
-- which had been missing since 0105 and was a real fault. Those stay.
-- ════════════════════════════════════════════════════════════════

-- ** Run this first. ** How many lanterns exist, and on which projects.
-- Expect none, or a handful on one drawing:
--
--   SELECT "Project_ID", count(*) FROM "GIS_Feature"
--    WHERE "Feature_Role" = 'lantern' GROUP BY 1;

DELETE FROM "GIS_Feature" WHERE "Feature_Role" = 'lantern';

DELETE FROM "GIS_Style" WHERE "Feature_Role" = 'lantern';

-- The whole list again, built from what the application writes rather
-- than from the previous statement of it — which is how servicevalve
-- and pumping came to be missing when 0165 restated it from 0105.
ALTER TABLE "GIS_Feature" DROP CONSTRAINT IF EXISTS "GIS_Feature_Feature_Role_check";

ALTER TABLE "GIS_Feature"
  ADD CONSTRAINT "GIS_Feature_Feature_Role_check"
  CHECK ("Feature_Role" IN
    ('shape','plot','meter','poc','substation','joint','source','spannode',
     'linkbox','column','governor','servicevalve','pumping'));


-- ── Check ───────────────────────────────────────────────────────
--
-- Nothing left carrying the role, and nothing styling it:
--
--   SELECT count(*) FROM "GIS_Feature" WHERE "Feature_Role" = 'lantern';
--   SELECT count(*) FROM "GIS_Style"   WHERE "Feature_Role" = 'lantern';
--
-- The columns, and what is recorded against them. The lantern fields
-- appear once something has been entered — they are written as nulls on
-- a new column and jsonb keeps them, so a column placed since this will
-- show them empty rather than absent:
--
--   SELECT "Feature_ID", "Label",
--          "Attributes" ->> 'Height_m'      AS height,
--          "Attributes" ->> 'Material'      AS material,
--          "Attributes" ->> 'Lantern_Type'  AS lantern,
--          "Attributes" ->> 'Wattage_W'     AS watts,
--          "Attributes" ->> 'Mounting'      AS mounting
--     FROM "GIS_Feature"
--    WHERE "Feature_Role" = 'column'
--    ORDER BY "Feature_ID";
--
-- And the roles the constraint allows, which should read as the ones
-- the drawing can place:
--
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'GIS_Feature_Feature_Role_check';
