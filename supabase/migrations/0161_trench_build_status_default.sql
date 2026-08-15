-- ════════════════════════════════════════════════════════════════
-- 0161 — every trench has a build status
--
-- Planned, where nothing was set.
--
-- ── Why a blank is not good enough ──
--
-- Build status started as an optional note: it coloured the drawing and
-- nothing else read it. A trench with none was simply one nobody had
-- got round to marking.
--
-- The dig estimate changed that. An existing trench is laid but not
-- dug, so the status now decides whether a length of trench costs days
-- or nothing — and "nobody said" and "it is already there" had come to
-- look the same to anything reading the drawing. They are not the same:
-- a trench somebody has drawn is a trench somebody intends to dig, and
-- that is what planned means.
--
-- So it is a default rather than a question. New trenches are created
-- planned, the pieces of a split trench inherit it or fall back to it,
-- and this fills in what was drawn before any of that existed.
--
-- ── Everything that is not existing becomes planned ──
--
-- Not only the blanks. Existing is the one status the estimate treats
-- differently, and everything else on a drawing is trench still to be
-- dug — so this settles the whole column against that one distinction
-- rather than leaving three states that all mean "dig it" and differ
-- only in how they were once labelled.
--
-- ** This overwrites As-Built and To be Removed. ** Read the first
-- check query below before running it. Those are somebody's answers and
-- this replaces them, which cannot be undone from here — the previous
-- value is not kept anywhere. If either is in real use on your
-- drawings, change the WHERE clause to
--
--     AND COALESCE("Attributes" ->> 'Build_Status', '') = ''
--
-- which fills in the blanks and leaves every answered trench alone.
--
-- Worth knowing either way: an as-built trench becoming planned will be
-- charged for excavation, where before it carried no dig cost only if
-- it had been marked existing. If as-built should also mean "laid but
-- not dug", that is a change to digRate.js and not to this.
--
-- ── Only trenches ──
--
-- A cable or a pipe has no build status of its own; it takes the state
-- of the trench it is in.
--
-- Trenches are found by layer rather than by line type, because the
-- line types are per project and this is not: what makes a feature a
-- trench is that it sits on the trench layer.
-- ════════════════════════════════════════════════════════════════

UPDATE "GIS_Feature"
   SET "Attributes" = jsonb_set(
         COALESCE("Attributes", '{}'::jsonb),
         '{Build_Status}', '"planned"'::jsonb, true)
 WHERE "Feature_Type" = 'line'
   AND "Layer_Key" = 'trench'
   AND COALESCE("Attributes" ->> 'Build_Status', '') <> 'existing'
   AND COALESCE("Attributes" ->> 'Build_Status', '') <> 'planned';


-- ── Check ───────────────────────────────────────────────────────
--
-- ** Run this one first. ** What is about to be overwritten. Anything
-- in the as-built or to-be-removed rows is an answer this replaces:
--
--   SELECT COALESCE("Attributes" ->> 'Build_Status', '(none)') AS status,
--          count(*)
--     FROM "GIS_Feature"
--    WHERE "Feature_Type" = 'line' AND "Layer_Key" = 'trench'
--      AND COALESCE("Attributes" ->> 'Build_Status', '')
--            NOT IN ('existing', 'planned')
--    GROUP BY 1 ORDER BY 2 DESC;
--
-- What every trench is marked as afterwards. Expect only planned and
-- existing:
--
--   SELECT COALESCE("Attributes" ->> 'Build_Status', '(none)') AS status,
--          count(*)
--     FROM "GIS_Feature"
--    WHERE "Feature_Type" = 'line' AND "Layer_Key" = 'trench'
--    GROUP BY 1 ORDER BY 2 DESC;
--
-- And what that means for the digging. An existing trench is laid but
-- not dug, so this is the length of trench on each project that the
-- estimates will not charge excavation for — worth a look the first
-- time, in case something was marked existing that is not:
--
--   SELECT "Project_ID", count(*) AS sections
--     FROM "GIS_Feature"
--    WHERE "Feature_Type" = 'line' AND "Layer_Key" = 'trench'
--      AND "Attributes" ->> 'Build_Status' = 'existing'
--    GROUP BY "Project_ID" ORDER BY sections DESC;
--
-- Running it again would flatten anything marked as-built or to be
-- removed since, so it is not one to re-run casually. New trenches are
-- created planned and split pieces inherit their original's status, so
-- there should be nothing for a second run to do.
