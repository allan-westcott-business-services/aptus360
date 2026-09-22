-- ════════════════════════════════════════════════════════════════
-- 0232 — a copied project gets its own drawing
--
-- Create Option and Create Revision each copy the project, its
-- developers, its scopes and \u2014 as their own rows \u2014 its plots. Neither
-- copied the drawing. So an option or a revision opened on a blank
-- canvas, and a design marked "carried forward" was a promise the
-- copy did not keep: `Carried_Forward` was set by the revision flow
-- and read by nothing.
--
-- The reason each copy needs its OWN plots is the reason it needs
-- its own drawing: a different design of the same developer scheme
-- may have a different number of plots, different heat sources, or a
-- different layout of roads. A shared drawing would have the second
-- design's edits landing on the first.
--
-- ── Why it is not INSERT ... SELECT ──
--
-- A drawing refers to itself. On one real drawing:
--
--   Connects            258 features name the features they touch
--   Joint_Cables         88 joints name the cables they hold
--   Circuit_Origin_ID    84 meters name their origin point
--   Seed_Feature_ID      84 meters name their plot seed
--   Link_Box_ID          49 features name their box
--
-- and 249 features carry a `Plot_ID` \u2014 the OLD project's plots. Copied
-- as they stand, every cable would know its old joints, every meter
-- its old seed and its old plot, and the new drawing would be a set
-- of lines that do not know each other. Every one of those ids has
-- to be rewritten to the copy's own.
--
-- ── How ──
--
--   1. Refuse unless the destination has no features. A copy onto a
--      drawing somebody has started is a merge, and this is not one.
--   2. Map the plots: old Plot_ID -> new, matched on Plot_Number,
--      which is what the option and revision copies preserve. A plot
--      the destination does not have (somebody unticked "copy plots")
--      leaves its features with no Plot_ID rather than a wrong one.
--   3. Copy every feature, recording old id -> new id as it goes.
--   4. Rewrite the references. Any attribute whose name ends in `_ID`
--      or is `Connects` or `Joint_Cables`, whose value \u2014 or whose
--      array elements \u2014 equal an old feature id of the source, becomes
--      the new id. Named by shape rather than by a fixed list so a
--      referencing attribute added later is caught; a value that is
--      not an id of this drawing is left exactly as it was.
--   5. Copy the basemap row \u2014 the calibration and the image path. The
--      image itself stays where it is: two projects reading one file
--      in storage is fine, and it is what the file is for.
--
-- The whole thing is one function so a half-copied drawing cannot be
-- left behind: any error rolls all of it back.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION copy_project_drawing(p_from bigint, p_to bigint)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  n_features integer := 0;
  n_existing integer;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from = p_to THEN
    RAISE EXCEPTION 'copy_project_drawing: needs two different projects';
  END IF;

  SELECT COUNT(*) INTO n_existing FROM "GIS_Feature" WHERE "Project_ID" = p_to;
  IF n_existing > 0 THEN
    RAISE EXCEPTION 'copy_project_drawing: project % already has % feature(s); a copy is not a merge',
      p_to, n_existing;
  END IF;

  -- ── 2. The plots, matched on their number ──
  CREATE TEMP TABLE plot_map ON COMMIT DROP AS
  SELECT o."Plot_ID" AS old_id, n."Plot_ID" AS new_id
    FROM "Plot" o
    JOIN "Plot" n ON n."Project_ID" = p_to AND n."Plot_Number" = o."Plot_Number"
   WHERE o."Project_ID" = p_from;

  -- ── 3. The features, remembering what each one was ──
  --
  -- A temp table of the pairing rather than a loop with RETURNING,
  -- because the rewrite in step 4 wants the whole map at once.
  CREATE TEMP TABLE feature_map ON COMMIT DROP (
    old_id bigint PRIMARY KEY,
    new_id bigint NOT NULL
  );

  WITH copied AS (
    INSERT INTO "GIS_Feature"
      ("Project_ID", "Layer_Key", "Feature_Type", "Feature_Role",
       "Geometry", "Label", "Attributes", "Plot_ID")
    SELECT p_to, f."Layer_Key", f."Feature_Type", f."Feature_Role",
           f."Geometry", f."Label", f."Attributes",
           pm.new_id
      FROM "GIS_Feature" f
      LEFT JOIN plot_map pm ON pm.old_id = f."Plot_ID"
     WHERE f."Project_ID" = p_from
     ORDER BY f."Feature_ID"
    RETURNING "Feature_ID"
  ),
  numbered AS (
    -- The insert returns rows in the order it made them, which is the
    -- ORDER BY above; pairing by position is what maps old to new.
    SELECT "Feature_ID" AS new_id, row_number() OVER () AS rn FROM copied
  ),
  sources AS (
    SELECT "Feature_ID" AS old_id, row_number() OVER (ORDER BY "Feature_ID") AS rn
      FROM "GIS_Feature" WHERE "Project_ID" = p_from
  )
  INSERT INTO feature_map (old_id, new_id)
  SELECT s.old_id, n.new_id FROM sources s JOIN numbered n USING (rn);

  SELECT COUNT(*) INTO n_features FROM feature_map;

  -- ── 4. Every reference, rewritten ──
  --
  -- Two passes over the copied rows' Attributes: scalar keys, then
  -- array keys. A key qualifies by NAME (ends in _ID, or is Connects
  -- or Joint_Cables) and a value is rewritten only if it IS an old
  -- feature id of the source \u2014 so `NRS_ID`, `Cable_Size_ID` and every
  -- other id that points outside the drawing pass through untouched,
  -- because no feature of this drawing has that number.
  --
  -- Values arrive as jsonb numbers and go back as jsonb numbers.
  UPDATE "GIS_Feature" g
     SET "Attributes" = (
       SELECT COALESCE(jsonb_object_agg(kv.key, kv.value), '{}'::jsonb)
         FROM (
           SELECT e.key,
                  CASE
                    -- A scalar id that names a feature of the source.
                    WHEN e.key LIKE '%\_ID' AND jsonb_typeof(e.value) = 'number'
                         AND EXISTS (SELECT 1 FROM feature_map m WHERE m.old_id = (e.value #>> '{}')::bigint)
                      THEN to_jsonb((SELECT m.new_id FROM feature_map m WHERE m.old_id = (e.value #>> '{}')::bigint))
                    -- A list of ids: Connects, Joint_Cables, anything else
                    -- that names several.
                    WHEN e.key IN ('Connects', 'Joint_Cables') AND jsonb_typeof(e.value) = 'array'
                      THEN (
                        SELECT COALESCE(jsonb_agg(
                                 CASE WHEN jsonb_typeof(x) = 'number'
                                       AND EXISTS (SELECT 1 FROM feature_map m WHERE m.old_id = (x #>> '{}')::bigint)
                                      THEN to_jsonb((SELECT m.new_id FROM feature_map m WHERE m.old_id = (x #>> '{}')::bigint))
                                      ELSE x END), '[]'::jsonb)
                          FROM jsonb_array_elements(e.value) x)
                    ELSE e.value
                  END AS value
             FROM jsonb_each(g."Attributes") e
         ) kv
     )
   WHERE g."Project_ID" = p_to
     AND g."Attributes" IS NOT NULL
     AND g."Attributes" <> '{}'::jsonb;

  -- ── 5. The basemap: calibration and where the image is ──
  --
  -- One row per project. The image in storage is shared, on purpose:
  -- it is the same OS tile or site plan, and two projects reading one
  -- file is what a file store is for. Deleting one project's basemap
  -- removes the storage object today, which would take the other's
  -- image with it \u2014 noted at the foot rather than fixed here.
  --
  -- Every column the basemap endpoint reads (gis-basemap.js), which
  -- is the list that says what a basemap IS. Add a column there and
  -- it wants adding here.
  INSERT INTO "GIS_Basemap"
    ("Project_ID", "File_Name", "Storage_Path", "Image_Url",
     "Source_Kind", "Pdf_Page", "Page_Width", "Page_Height",
     "Image_Width", "Image_Height", "Metres_Per_Pixel", "Stated_Scale",
     "Cal_Point_A", "Cal_Point_B", "Cal_Distance_M",
     "Origin_X", "Origin_Y", "Rotation_Deg", "Opacity", "Locked",
     "Ref_Canvas_X", "Ref_Canvas_Y", "Ref_Easting", "Ref_Northing")
  SELECT p_to, "File_Name", "Storage_Path", "Image_Url",
         "Source_Kind", "Pdf_Page", "Page_Width", "Page_Height",
         "Image_Width", "Image_Height", "Metres_Per_Pixel", "Stated_Scale",
         "Cal_Point_A", "Cal_Point_B", "Cal_Distance_M",
         "Origin_X", "Origin_Y", "Rotation_Deg", "Opacity", "Locked",
         "Ref_Canvas_X", "Ref_Canvas_Y", "Ref_Easting", "Ref_Northing"
    FROM "GIS_Basemap"
   WHERE "Project_ID" = p_from
     AND NOT EXISTS (SELECT 1 FROM "GIS_Basemap" WHERE "Project_ID" = p_to);

  RETURN n_features;
END;
$$;

-- ── Checks ──────────────────────────────────────────────────────
--
-- Copy a project you can afford to look at closely, then:
--
-- Nothing on the copy still names a feature of the source. Expect
-- zero rows:
--
--   WITH src AS (SELECT "Feature_ID" FROM "GIS_Feature" WHERE "Project_ID" = <from>)
--   SELECT g."Feature_ID", e.key, e.value
--     FROM "GIS_Feature" g, jsonb_each(g."Attributes") e
--    WHERE g."Project_ID" = <to>
--      AND (   (jsonb_typeof(e.value) = 'number'
--               AND (e.value #>> '{}')::bigint IN (SELECT "Feature_ID" FROM src))
--           OR (jsonb_typeof(e.value) = 'array'
--               AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.value) x
--                            WHERE jsonb_typeof(x) = 'number'
--                              AND (x #>> '{}')::bigint IN (SELECT "Feature_ID" FROM src))));
--
-- Every meter and seed points at one of the copy's own plots:
--
--   SELECT COUNT(*) FROM "GIS_Feature" g
--    WHERE g."Project_ID" = <to> AND g."Plot_ID" IS NOT NULL
--      AND NOT EXISTS (SELECT 1 FROM "Plot" p
--                       WHERE p."Plot_ID" = g."Plot_ID" AND p."Project_ID" = <to>);
--   -- expect 0
--
-- And the same shape as the original:
--
--   SELECT "Project_ID", "Feature_Role", COUNT(*)
--     FROM "GIS_Feature" WHERE "Project_ID" IN (<from>, <to>)
--    GROUP BY 1, 2 ORDER BY 2, 1;
--
-- ── Not done here ───────────────────────────────────────────────
--
-- 1. Neither Create Option nor Create Revision CALLS this yet. Both
--    are database functions of their own, `create_project_revision`
--    is not in this folder, and the revision has a per-design
--    "carry forward" choice that should decide whether the drawing
--    comes across. The endpoints in netlify/functions/ can call it
--    after the copy; that is app work and is in the same change set.
--
-- 2. Non-residential supplies. `NRS_ID` on a meter points at the
--    NRS table, which the option copy does not duplicate, so a copied
--    drawing's pumps still name the source project's supply records.
--    Whether NRS is per project or shared wants checking before that
--    is called a fault.
--
-- 3. Deleting a project's basemap removes the storage object
--    (gis-basemap.js). With two projects sharing one file, the second
--    to be deleted takes the first's image. The delete should check
--    for other rows on the same Storage_Path first.
