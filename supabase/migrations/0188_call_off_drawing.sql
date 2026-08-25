-- ════════════════════════════════════════════════════════════════
-- 0188 — the office attaches the drawing
--
-- The sketch page of a jointing work instruction is drawn over the
-- electric design. Until now that backdrop was produced by the
-- application: rendered off the GIS canvas when the call-off was
-- raised, stored as a PNG, and shown behind the sketch.
--
-- It has never once worked on site.
--
-- ── Why it is being done a different way ──
--
-- The rendered route had three separate faults in it, each hiding the
-- next. The site plan was drawn at NaN, because asLaidImage's `at`
-- returned an array and planLayer read `.x` off it. The drawing could
-- only ever be taken at the moment of raising, so a call-off raised
-- before a plan was set up was wrong permanently. And the whole thing
-- was a raster, so a gang zooming in to mark a joint got a staircase.
--
-- All three are fixed. None of it matters if the office already has
-- the drawing as a PDF — which it does, because that PDF is what the
-- GIS canvas was set up from in the first place.
--
-- So: the office attaches it to the call-off, and the tablet renders
-- that file. No derivation, nothing to go stale, and the gang is
-- looking at the same sheet the office is looking at. This is what the
-- original application did, and it was right.
--
-- ── The rendered drawing stays ──
--
-- As_Laid_Path is not dropped. It is what the office prints, it is
-- what every call-off raised before this has, and it is the fallback
-- where nobody has attached anything. The attachment wins where it
-- exists; see field-queue.js.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Mains_Call_Off_Submission"
  ADD COLUMN IF NOT EXISTS "Drawing_Path" text,
  ADD COLUMN IF NOT EXISTS "Drawing_Name" text,
  ADD COLUMN IF NOT EXISTS "Drawing_Uploaded_At" timestamptz;

COMMENT ON COLUMN "Mains_Call_Off_Submission"."Drawing_Path" IS
  'The design drawing the office attached to this call-off, in the '
  'call-off-drawing bucket. Rendered behind the sketch page of every '
  'jointing work instruction raised from it. Takes precedence over '
  'As_Laid_Path, which the application renders for itself.';

COMMENT ON COLUMN "Mains_Call_Off_Submission"."Drawing_Name" IS
  'The file name as the office attached it. Shown on the call-off so '
  'somebody can tell which revision is on there without opening it — '
  'these are named like AP2228.APT.LV.XX.DR.Y.110001 REV02.';


-- ── The bucket ───────────────────────────────────────────────────
--
-- Public read, as call-off-as-laid is. A tablet on a mobile signal
-- fetches this by URL, and a signed URL that expires mid-shift is a
-- gang standing over a hole with a blank screen.
--
-- Written only by the function holding the service-role key. The
-- browser's anon key has no policies and can write nothing.
--
-- ** Run this in the SQL editor, or create the bucket in the
--    dashboard with the same name and Public on. **

INSERT INTO storage.buckets (id, name, public)
SELECT 'call-off-drawing', 'call-off-drawing', true
 WHERE NOT EXISTS (
   SELECT 1 FROM storage.buckets WHERE id = 'call-off-drawing');


-- ── Check ───────────────────────────────────────────────────────
--
-- The three columns:
--
--   SELECT column_name, data_type
--     FROM information_schema.columns
--    WHERE table_name = 'Mains_Call_Off_Submission'
--      AND column_name LIKE 'Drawing%';
--
-- And the bucket, public:
--
--   SELECT id, public FROM storage.buckets WHERE id = 'call-off-drawing';
--
-- ── Afterwards ──
--
-- Which call-offs still have no drawing attached. These are the ones
-- whose jointing sketches fall back to the rendered picture:
--
--   SELECT s."Submission_ID", s."Site_Name", s."Drawing_Name"
--     FROM "Mains_Call_Off_Submission" s
--    WHERE s."Drawing_Path" IS NULL
--    ORDER BY s."Submission_ID" DESC;
-- ════════════════════════════════════════════════════════════════
