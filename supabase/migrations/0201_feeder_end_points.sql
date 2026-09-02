-- ════════════════════════════════════════════════════════════════
-- 0201 — Feeder End Points: the cable's own junctions
--
-- A span node is a CIVIL fact: the dig branches or ends here. It was
-- also being made to carry ELECTRICAL facts — a circuit, a sequence, a
-- cable size, a volt drop — and one trench junction can carry two
-- circuits' cables with two different everything. One object cannot
-- honestly hold that, which is where a season of patches came from:
-- pass-through feeding rules, per-circuit renumbering fighting the
-- site-wide numbering, ties broken on Feature_ID.
--
-- So the electrical facts get their own feature. A Feeder End Point
-- ('feederpoint') stands wherever ONE CIRCUIT's cable ends or forks —
-- often at the same location as a span node, because cables fork where
-- trenches do, but it belongs to its circuit. Two circuits through one
-- junction are two feeder points at one location, each with its own
-- cable and its own level. Span nodes keep their site-wide numbering
-- and go back to documenting the dig.
--
-- Colours say which world a point belongs to: span nodes take the
-- trench brown (#8b5e34, the mains-trench colour from 0050), because
-- they are points on the dig; a feeder point is drawn in its circuit's
-- feeder colour by the canvas, so the style row's colour is only the
-- fallback for a point whose circuit cannot be resolved.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "GIS_Feature" DROP CONSTRAINT IF EXISTS "GIS_Feature_Feature_Role_check";
ALTER TABLE "GIS_Feature"
  ADD CONSTRAINT "GIS_Feature_Feature_Role_check"
  CHECK ("Feature_Role" IN
    ('shape','plot','meter','poc','substation','joint','source','spannode',
     'linkbox','column','governor','servicevalve','pumping','hvtt','reducer',
     'nrs','feederpoint'));

INSERT INTO "GIS_Style"
  ("Style_Name","Feature_Role","Symbol","Symbol_Size_Px","Colour","Sort_Order","Notes")
VALUES
  ('Feeder end point', 'feederpoint', 'circle', 7, '#1d4ed8', 196,
   'Where one circuit''s cable ends or forks. Drawn in the circuit''s own colour; this colour is the fallback.')
ON CONFLICT DO NOTHING;

-- Span nodes are points on the dig, and wear the dig's colour.
UPDATE "GIS_Style"
   SET "Colour" = '#8b5e34'
 WHERE "Feature_Role" = 'spannode';

-- One origin point per circuit, exactly as span nodes had: two Seq-0
-- points claiming one circuit would be two starts for one walk.
CREATE UNIQUE INDEX IF NOT EXISTS gis_feederpoint_origin_uniq
  ON "GIS_Feature" ("Project_ID", (("Attributes" ->> 'Circuit_ID')))
  WHERE "Feature_Role" = 'feederpoint'
    AND ("Attributes" ->> 'Span_Seq') = '0';


-- ── Check ───────────────────────────────────────────────────────
-- The role is accepted and the style row is in:
--   SELECT "Style_Name","Colour" FROM "GIS_Style"
--    WHERE "Feature_Role" IN ('feederpoint','spannode');
--
-- After the first Build LV Network on a project, its feeder points:
--   SELECT "Label","Attributes"->>'Circuit_ID' AS circuit,
--          "Attributes"->>'Span_Seq' AS seq
--     FROM "GIS_Feature"
--    WHERE "Project_ID" = <project> AND "Feature_Role" = 'feederpoint'
--    ORDER BY 2, 3::int;
