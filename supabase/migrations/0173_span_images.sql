-- ════════════════════════════════════════════════════════════════
-- 0173 — a picture of each span, for the work instruction
--
-- A gang arriving on a road needs to recognise which length of it they
-- are digging. The span's name — "A10 to A11" — means nothing to
-- anybody standing on it. A picture of the trench, the nodes at each
-- end and the plots around it does.
--
-- ── Taken when the call-off is raised ──
--
-- Not when the instruction is opened. If the drawing moves afterwards,
-- the operative still sees what was called off, which is the point of a
-- record. It also means the picture is drawn by the canvas, which is
-- the only thing that knows how to draw this network — there is no
-- server-side renderer and building one would be a second drawing
-- engine to keep in step with the first.
--
-- ── The file, and the row ──
--
-- The image goes in storage and the row holds its path. Same shape as
-- Plot_Utility_Photo: a path rather than a URL, so moving or renaming
-- the bucket does not strand every row, and the public URL is derived
-- when it is read.
--
-- ── Why the bucket is public ──
--
-- A work instruction is opened on a tablet in a van, often by somebody
-- following a link. Signed URLs expire, and an expired picture in the
-- middle of a job is worse than an unlisted one: the path contains a
-- submission id and a span id and nothing about the site, and what it
-- shows is a length of trench.
--
-- If that changes, the read side derives the URL in one place and can
-- sign instead.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Mains_Call_Off_Span"
  ADD COLUMN IF NOT EXISTS "Span_Image_Path" text;

COMMENT ON COLUMN "Mains_Call_Off_Span"."Span_Image_Path" IS 'Path in the call-off-spans bucket to the picture of this span, drawn by the canvas when the call-off was raised. Null where the call-off was raised from the form rather than the drawing, or predates it.';


-- The bucket. Guarded, because a database that already has it should
-- not fail here, and because storage.buckets may not exist on a
-- database where storage has never been used.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('call-off-spans', 'call-off-spans', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;


-- ── Check ───────────────────────────────────────────────────────
--
-- The bucket exists and is public:
--
--   SELECT id, public FROM storage.buckets WHERE id = 'call-off-spans';
--
-- How many spans have a picture. Call-offs raised from the form have
-- none and never will — only the drawing can produce one:
--
--   SELECT s."Submission_ID",
--          count(*)                                          AS spans,
--          count(*) FILTER (WHERE s."Span_Image_Path" IS NOT NULL) AS with_image
--     FROM "Mains_Call_Off_Span" s
--    GROUP BY 1 ORDER BY 1 DESC LIMIT 20;
--
-- ** A span raised from the drawing with no picture. ** Worth watching
-- after this goes in: it means the capture failed and nobody was told,
-- which is the failure mode to avoid — the call-off saved, so the
-- absence is quiet:
--
--   SELECT sub."Submission_ID", sub."Selection_Mode", count(*) AS spans_without
--     FROM "Mains_Call_Off_Span" s
--     JOIN "Mains_Call_Off_Submission" sub USING ("Submission_ID")
--    WHERE s."Span_Image_Path" IS NULL AND sub."Selection_Mode" = 'Span'
--    GROUP BY 1, 2 ORDER BY 1 DESC;
--
-- Files with no row pointing at them, after spans have been deleted.
-- Storage is not cleaned up by a foreign key, so this is the list to
-- remove by hand if it ever grows:
--
--   SELECT name FROM storage.objects
--    WHERE bucket_id = 'call-off-spans'
--      AND name NOT IN (SELECT "Span_Image_Path" FROM "Mains_Call_Off_Span"
--                        WHERE "Span_Image_Path" IS NOT NULL);
