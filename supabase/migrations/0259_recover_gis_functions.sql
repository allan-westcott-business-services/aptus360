-- ════════════════════════════════════════════════════════════════════
-- 0259 — the five GIS functions that were never committed
--
-- These five have been running in production and existing nowhere else.
-- No migration creates them; src/lib/utilities.js already said as much
-- about one of them — "one of the migrations that were run and never
-- committed". They were recovered with pg_get_functiondef and are
-- reproduced here exactly as the database returned them.
--
-- This migration changes nothing. Every one is CREATE OR REPLACE with
-- the definition already in place, so running it against the live
-- database is a no-op. The point is that the next database built from
-- this repository has them, and that a lost database no longer means
-- rewriting joint placing, network tracing and meter assignment from
-- scratch.
--
-- ── What reading them revealed ──
--
-- Three are self-contained: gis_place_joints, gis_trace_network and
-- gis_assign_meters touch GIS_Feature and nothing else. They move with
-- GIS cleanly.
--
-- Two reach into business tables, which matters for the split:
--   gis_project_utilities reads Project_Scope and Utility
--   gis_seed_reference    reads Project."Eastings"/"Northings"
--
-- So a standalone GIS needs its own notion of which utilities a site
-- covers, and its own grid reference on the site record.
--
-- Also worth recording: geometry is JSONB arrays of coordinate pairs,
-- not PostGIS. The new database needs no spatial extension.
--
-- Safe to run twice.
-- ════════════════════════════════════════════════════════════════════

-- ── gis_place_joints ─────────────────────────────────────
-- Joints where line ends meet: 3+ ends is a tee, 2 is straight.
-- Skips anywhere a joint already sits, within p_tol.

CREATE OR REPLACE FUNCTION public.gis_place_joints(p_project bigint, p_tol numeric DEFAULT 0.3)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  r       record;
  made    integer := 0;
  jtype   text;
BEGIN
  FOR r IN
    WITH ends AS (
      SELECT f."Feature_ID",
             (f."Geometry" -> 0) AS pt, 'start' AS which
        FROM "GIS_Feature" f
       WHERE f."Project_ID" = p_project AND f."Feature_Type" = 'line'
      UNION ALL
      SELECT f."Feature_ID",
             (f."Geometry" -> (jsonb_array_length(f."Geometry") - 1)), 'end'
        FROM "GIS_Feature" f
       WHERE f."Project_ID" = p_project AND f."Feature_Type" = 'line'
    )
    SELECT (pt ->> 0)::numeric AS x, (pt ->> 1)::numeric AS y, COUNT(*) AS n
      FROM ends
     GROUP BY 1, 2
    HAVING COUNT(*) > 1
  LOOP
    -- Skip anywhere a joint already sits
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM "GIS_Feature" j
       WHERE j."Project_ID" = p_project
         AND j."Feature_Type" = 'point'
         AND j."Attributes" ? 'Joint_Type'
         AND abs((j."Geometry" -> 0 ->> 0)::numeric - r.x) < p_tol
         AND abs((j."Geometry" -> 0 ->> 1)::numeric - r.y) < p_tol
    );

    jtype := CASE WHEN r.n >= 3 THEN 'tee' ELSE 'straight' END;

    INSERT INTO "GIS_Feature"
      ("Project_ID","Layer_Key","Feature_Type","Geometry","Label","Attributes")
    VALUES (
      p_project, 'trench', 'point',
      jsonb_build_array(jsonb_build_array(r.x, r.y)),
      initcap(jtype) || ' joint',
      jsonb_build_object('Joint_Type', jtype, 'Ways_In', r.n)
    );
    made := made + 1;
  END LOOP;

  RETURN made;
END;
$function$;


-- ── gis_trace_network ─────────────────────────────────────
-- Walks outward from a source, numbering ways and hops. Stays on the
-- source's own layer, so a substation numbers electric cables and not
-- the trench they lie in.

CREATE OR REPLACE FUNCTION public.gis_trace_network(p_project bigint, p_source_feature bigint)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  letters text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  way_no  integer := 0;
  fid     bigint;
  frontier bigint[];
  next_f   bigint[];
  visited  bigint[] := '{}';
  conn     bigint;
  depth    integer;
  n        integer := 0;
  src_layer text;
BEGIN
  -- The layer the source sits on. Everything the walk touches must be on
  -- it: a substation numbers electric cables, a gas POC numbers gas
  -- mains, and neither numbers the trench they lie in.
  SELECT "Layer_Key" INTO src_layer
    FROM "GIS_Feature" WHERE "Feature_ID" = p_source_feature;
  IF src_layer IS NULL THEN RETURN 0; END IF;

  FOR fid IN
    SELECT f."Feature_ID"
      FROM "GIS_Feature" f
     WHERE f."Project_ID" = p_project
       AND f."Feature_Type" = 'line'
       AND f."Layer_Key" = src_layer
       AND f."Attributes" -> 'Connects' @> to_jsonb(p_source_feature)
     ORDER BY f."Feature_ID"
  LOOP
    way_no := way_no + 1;
    frontier := ARRAY[fid];
    visited := visited || fid;
    depth := 0;

    WHILE array_length(frontier, 1) > 0 LOOP
      depth := depth + 1;
      next_f := '{}';

      FOREACH conn IN ARRAY frontier LOOP
        UPDATE "GIS_Feature"
           SET "Attributes" = "Attributes"
             || jsonb_build_object(
                  'Way', way_no,
                  'Hop_Letter', substr(letters, LEAST(depth, 26), 1),
                  'Hop', depth)
         WHERE "Feature_ID" = conn;
        n := n + 1;

        SELECT COALESCE(array_agg(f."Feature_ID"), '{}') INTO next_f
          FROM "GIS_Feature" f
         WHERE f."Project_ID" = p_project
           AND f."Feature_Type" = 'line'
           AND f."Layer_Key" = src_layer
           AND f."Attributes" -> 'Connects' @> to_jsonb(conn)
           AND NOT (f."Feature_ID" = ANY (visited));

        visited := visited || next_f;
        frontier := (SELECT COALESCE(array_agg(DISTINCT x), '{}')
                       FROM unnest(frontier || next_f) AS x
                      WHERE NOT (x = ANY (ARRAY[conn])));
      END LOOP;

      frontier := next_f;
    END LOOP;
  END LOOP;

  RETURN n;
END;
$function$;


-- ── gis_assign_meters ─────────────────────────────────────
-- Nearest cable to each plot, within p_max_m. Note the nested loops:
-- plots x lines x vertices, in plpgsql. Fine at current sizes; worth
-- revisiting before it runs on a large site.

CREATE OR REPLACE FUNCTION public.gis_assign_meters(p_project bigint, p_max_m numeric DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  m       record;
  best    bigint;
  best_d  numeric;
  c       record;
  i       integer;
  d       numeric;
  n       integer := 0;
BEGIN
  FOR m IN
    SELECT "Feature_ID", ("Geometry" -> 0 ->> 0)::numeric AS x,
           ("Geometry" -> 0 ->> 1)::numeric AS y
      FROM "GIS_Feature"
     WHERE "Project_ID" = p_project AND "Layer_Key" = 'plot' AND "Plot_ID" IS NOT NULL
  LOOP
    best := NULL; best_d := p_max_m;

    FOR c IN
      SELECT "Feature_ID", "Geometry" FROM "GIS_Feature"
       WHERE "Project_ID" = p_project AND "Feature_Type" = 'line'
    LOOP
      FOR i IN 0..jsonb_array_length(c."Geometry") - 1 LOOP
        d := sqrt(
          power((c."Geometry" -> i ->> 0)::numeric - m.x, 2) +
          power((c."Geometry" -> i ->> 1)::numeric - m.y, 2));
        IF d < best_d THEN best_d := d; best := c."Feature_ID"; END IF;
      END LOOP;
    END LOOP;

    IF best IS NOT NULL THEN
      UPDATE "GIS_Feature"
         SET "Attributes" = "Attributes" || jsonb_build_object(
               'Meter_Cable', best, 'Meter_Distance_m', ROUND(best_d, 1))
       WHERE "Feature_ID" = m."Feature_ID";
      n := n + 1;
    END IF;
  END LOOP;

  RETURN n;
END;
$function$;


-- ── gis_seed_reference ─────────────────────────────────────
-- Seeds the basemap's grid reference from the project's eastings and
-- northings, only where it has not been calibrated already.

CREATE OR REPLACE FUNCTION public.gis_seed_reference(p_project bigint)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE e numeric; n numeric;
BEGIN
  SELECT "Eastings", "Northings" INTO e, n FROM "Project" WHERE "Project_ID" = p_project;
  IF e IS NULL OR n IS NULL THEN RETURN false; END IF;

  UPDATE "GIS_Basemap"
     SET "Ref_Canvas_X" = 0, "Ref_Canvas_Y" = 0,
         "Ref_Easting" = e, "Ref_Northing" = n
   WHERE "Project_ID" = p_project AND "Ref_Easting" IS NULL;
  RETURN FOUND;
END;
$function$;


-- ── gis_project_utilities ─────────────────────────────────────
-- Which layers a project draws on, from its scope.

CREATE OR REPLACE FUNCTION public.gis_project_utilities(p_project bigint)
 RETURNS TABLE(utility_id bigint, utility text, layer_key text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT u."Utility_ID", u."Utility",
         CASE lower(u."Utility")
           WHEN 'electric' THEN 'electric'
           WHEN 'gas'      THEN 'gas'
           WHEN 'water'    THEN 'water'
           ELSE 'note'
         END
    FROM "Project_Scope" ps
    JOIN "Utility" u ON u."Utility_ID" = ps."Utility_ID"
   WHERE ps."Project_ID" = p_project
     AND lower(u."Utility") IN ('electric','gas','water')
   ORDER BY u."Utility_ID";
$function$;
