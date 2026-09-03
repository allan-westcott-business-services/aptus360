-- ════════════════════════════════════════════════════════════════
-- 0202 — the link box becomes a drawable electric object
--
-- The role has existed since 0072 — carried with trenches, bulk
-- deletable, findable — but it could not be placed, edited or usefully
-- drawn: no menu made one, no editor knew its shape, and its style row
-- was seeded a red square nobody had chosen.
--
-- A link box connects one input cable to one or three outputs through
-- fuses: a 2 way (one fuse) or a 4 way (three). Ways and fuse ratings
-- ride in Attributes (Link_Ways: 2 or 4; Way_Fuse_A: {"1": 315, ...};
-- fuse ratings 200, 315, 400 or 630 A) — JSONB, so no schema change.
-- The symbol is a yellow square, like a joint, with its connection
-- nodes drawn by the canvas: one input, and the outputs numbered 1–3
-- on a 4 way. Only the colour needs the database.
-- ════════════════════════════════════════════════════════════════

UPDATE "GIS_Style"
   SET "Colour" = '#f59e0b'
 WHERE "Feature_Role" = 'linkbox';


-- ── Check ───────────────────────────────────────────────────────
--   SELECT "Style_Name","Symbol","Colour" FROM "GIS_Style"
--    WHERE "Feature_Role" = 'linkbox';
-- Expect: Link box, square, #f59e0b.
