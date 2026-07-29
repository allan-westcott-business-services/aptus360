-- ════════════════════════════════════════════════════════════════
-- 0066 — teams, photos, and the fields the connections table needs
--
-- Four things the Plot Connections table asks for, one of which turned
-- out to exist already.
--
--   Team: who is doing the work. A table of its own rather than free
--   text, so a team can be renamed once and every visit follows.
--
--   Photos: evidence against a connection. Many per connection, so a
--   table rather than a column. The file lives in Supabase storage; this
--   holds the path, as the basemaps do.
--
--   Meter card submission date: already on Plot_Utility since 0021. It
--   has simply never been shown.
--
--   IDNO: not stored on the connection at all. It belongs to the
--   project's AV agreement for that utility, so it is read through a
--   view — copying it onto every connection would mean 40 rows to
--   correct when an agreement changes.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "Team" (
  "Team_ID"    bigserial PRIMARY KEY,
  "Team_Name"  text NOT NULL UNIQUE,
  "Notes"      text,
  "Sort_Order" integer NOT NULL DEFAULT 0,
  "Is_Active"  boolean NOT NULL DEFAULT true
);
ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
-- Deliberately unseeded: the teams are yours to name.

ALTER TABLE "Plot_Utility"
  ADD COLUMN IF NOT EXISTS "Team_ID" bigint REFERENCES "Team";

CREATE INDEX IF NOT EXISTS plot_utility_team_idx ON "Plot_Utility" ("Team_ID");


-- ── Photographs against a connection ─────────────────────────────
CREATE TABLE IF NOT EXISTS "Plot_Utility_Photo" (
  "Photo_ID"        bigserial PRIMARY KEY,
  "Plot_Utility_ID" bigint NOT NULL REFERENCES "Plot_Utility" ON DELETE CASCADE,
  -- Where the file sits in the bucket. The public URL is derived from
  -- this rather than stored, so moving buckets doesn't invalidate rows.
  "Storage_Path"    text NOT NULL,
  "Caption"         text,
  "Uploaded_By"     text,
  "Uploaded_At"     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "Plot_Utility_Photo" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS plot_utility_photo_idx
  ON "Plot_Utility_Photo" ("Plot_Utility_ID");

-- The bucket itself is not created here: storage buckets aren't schema.
-- Create one named connection-photos in Supabase › Storage, public read,
-- the same shape as basemaps. Until then the schema is ready and the
-- upload will fail with a clear message.


-- ── The connection, with what it needs from elsewhere ────────────
-- IDNO comes from the project's AV agreement for that utility. SLP and
-- plot number come from the plot. Neither is copied onto the connection:
-- an agreement changes once and every connection under it follows.
CREATE OR REPLACE VIEW "Plot_Connection_Detail" AS
  SELECT
    pu.*,
    pl."Project_ID",
    pl."Plot_Number",
    pl."Plot_Ref",
    -- Both tables have a Self_Lay_Provider, so this one must be aliased
    -- or it collides with the one pu.* already brought in. They mean
    -- different things and both are worth having: pu."Self_Lay_Provider"
    -- is per utility, for a plot that is self-lay on water only; is_slp
    -- is the plot-level flag the column shows.
    --
    -- It is a boolean and NOT NULL. The emptiness test that was here
    -- first treated it as text, which Postgres refused outright — better
    -- than coercing, which would have made every plot self-lay.
    pl."Self_Lay_Provider" AS is_slp,
    t."Team_Name",
    agr."IDNO_ID"   AS agreement_idno_id,
    idno."IDNO_Name" AS agreement_idno_name,
    (SELECT COUNT(*) FROM "Plot_Utility_Photo" ph
      WHERE ph."Plot_Utility_ID" = pu."Plot_Utility_ID") AS photo_count
  FROM "Plot_Utility" pu
  JOIN "Plot" pl ON pl."Plot_ID" = pu."Plot_ID"
  LEFT JOIN "Team" t ON t."Team_ID" = pu."Team_ID"
  -- One agreement per project per utility. LATERAL with a limit rather
  -- than a plain join, so a duplicate agreement can't multiply the
  -- connection rows — that would double every figure downstream.
  LEFT JOIN LATERAL (
    SELECT a."IDNO_ID" FROM "AV_Agreement" a
     WHERE a."Project_ID" = pl."Project_ID"
       AND a."Utility_ID" = pu."Utility_ID"
     ORDER BY a."AV_Agreement_ID"
     LIMIT 1
  ) agr ON true
  LEFT JOIN "IDNO" idno ON idno."IDNO_ID" = agr."IDNO_ID";


-- ── Check ───────────────────────────────────────────────────────
-- Expect the new columns to resolve:
--   SELECT "Plot_Number", "Utility_ID", "Team_Name", agreement_idno_name,
--          is_slp, "Meter_Card_Submission_Date", photo_count
--     FROM "Plot_Connection_Detail" WHERE "Project_ID" = <project>
--    ORDER BY "Plot_Number";
--
-- Connections whose project has no AV agreement for that utility — the
-- IDNO column will be blank for these, and that is a missing agreement
-- rather than a fault here:
--   SELECT DISTINCT "Project_ID", "Utility_ID"
--     FROM "Plot_Connection_Detail" WHERE agreement_idno_id IS NULL;
--
-- Projects with more than one agreement for the same utility. The view
-- takes the earliest; if this returns rows, decide which is right:
--   SELECT "Project_ID", "Utility_ID", COUNT(*)
--     FROM "AV_Agreement" GROUP BY 1, 2 HAVING COUNT(*) > 1;
