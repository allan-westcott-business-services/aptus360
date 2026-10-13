-- ════════════════════════════════════════════════════════════════════
--  0263 — the bucket the NCR attachments go in
-- ════════════════════════════════════════════════════════════════════
--
-- 0261 created the NCR_Attachment table and left the files nowhere to
-- live. Storage is not schema, so a bucket does not arrive with a
-- table — and a missing bucket does not announce itself, it just
-- returns "Bucket not found" the first time somebody uploads.
--
-- Created here rather than by hand, as 0236 did for the floor plans,
-- so the feature works the first time and the folder records that the
-- bucket is part of this schema rather than something a person
-- remembered to click.
--
-- ── Private ──
--
-- The 98 imported attachments are the operators' own paperwork: action
-- status emails, rejection notices, photographs of what was wrong on
-- site. A public bucket is a URL that gets forwarded, and these name
-- sites, plot numbers and members of staff.
--
-- Private means every read goes through a signed link minted by the
-- server, which is how call-off drawings and floor plans already work.
-- No storage policies are needed for that: the endpoint holds the
-- service key and the browser never talks to storage directly.

INSERT INTO storage.buckets (id, name, public)
VALUES ('ncr-attachments', 'ncr-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- ── The paths are the original system's, deliberately ──
--
-- <NCR_ID>/<epoch-ms>-<filename>, e.g.
--
--   1919/1780322384346-N0022305-1-Nightingale-road-Aptus-Utilities-01-06-2026.pdf
--
-- NCR_Attachment."Storage_Path" holds 98 of those already, so the
-- files must be copied across under exactly the same paths or every
-- row is a broken link. copy_ncr_attachments.mjs does that, driven by
-- the export rather than by listing the bucket, so the thing it copies
-- is precisely the set the rows refer to.

COMMENT ON TABLE "NCR_Attachment" IS
  'Files attached to a non-compliance report. Storage_Path is a path '
  'inside the ncr-attachments bucket (0263), private, read through a '
  'signed link. The 98 imported rows use the original system''s paths.';

DO $$
BEGIN
  PERFORM 1 FROM storage.buckets WHERE id = 'ncr-attachments';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the ncr-attachments bucket was not created';
  END IF;
  IF (SELECT public FROM storage.buckets WHERE id = 'ncr-attachments') THEN
    RAISE EXCEPTION
      'the ncr-attachments bucket is public, and these files name sites and staff';
  END IF;
  RAISE NOTICE 'Bucket ncr-attachments is ready. Copy the 98 files into it with '
    'copy_ncr_attachments.mjs, then run import_legacy_ncrs.sql part 4.1.';
END $$;
