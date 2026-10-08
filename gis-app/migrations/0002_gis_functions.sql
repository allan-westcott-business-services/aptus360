-- ════════════════════════════════════════════════════════════════════
-- 0002 — the GIS functions
--
-- Ten functions the canvas needs. All ten were recovered from the
-- Aptus360 production database, where they had been running and
-- existing nowhere else; see 0259 and 0260 in that repository.
--
-- Seven come across as they stand. Three cannot, and the reasons are
-- the interesting part:
--
--   gis_place_joints       INSERTS into GIS_Feature, which now has a
--                          NOT NULL Account_ID. Reworked to take the
--                          account from the project it is drawing on.
--
--   gis_project_utilities  read Project_Scope, an Aptus360 table.
--                          Reads Project_Utility here, which 0001
--                          added for exactly this.
--
--   gis_set_length         unchanged itself, but its trigger has to be
--                          re-created — a trigger belongs to a table,
--                          and these are new tables.
--
-- gis_seed_reference needed no change at all: it reads
-- Project."Eastings"/"Northings", and 0001 put both on this side's
-- Project because this function was the reason to.
--
-- ── A note on who these run as ──
--
-- All ten are SECURITY INVOKER, which is the default and is what is
-- wanted. They run with the caller's rights, so row-level security
-- applies inside them: gis_trace_network walking a network can only
-- walk one the caller may see. A SECURITY DEFINER function here would
-- be a hole straight through 0001's policies.
--
-- The one exception is in 0001: account_ids() is SECURITY DEFINER,
-- because finding out which accounts you belong to cannot itself
-- require permission to read the membership table.
-- ════════════════════════════════════════════════════════════════════


-- ── Geometry helpers ────────────────────────────────────────────────

-- Length of a line, by summing its segments. IMMUTABLE: the same
-- coordinates always give the same answer, so the planner may cache it.
CREATE OR REPLACE FUNCTION public.gis_line_length(geom jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  total numeric := 0;
  i integer;
  n integer;
  x1 numeric; y1 numeric; x2 numeric; y2 numeric;
BEGIN
  n := jsonb_array_length(geom);
  IF n < 2 THEN RETURN 0; END IF;
  FOR i IN 0..n-2 LOOP
    x1 := (geom -> i ->> 0)::numeric;
    y1 := (geom -> i ->> 1)::numeric;
    x2 := (geom -> (i+1) ->> 0)::numeric;
    y2 := (geom -> (i+1) ->> 1)::numeric;
    total := total + sqrt(power(x2-x1, 2) + power(y2-y1, 2));
  END LOOP;
  RETURN ROUND(total, 2);
END;
$function$;

-- Is a point inside a ring? Ray casting, east from the point.
CREATE OR REPLACE FUNCTION public.gis_point_in_ring(px double precision, py double precision, ring jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  n        integer := jsonb_array_length(ring);
  i        integer;
  j        integer;
  xi       double precision;
  yi       double precision;
  xj       double precision;
  yj       double precision;
  inside   boolean := false;
BEGIN
  IF n IS NULL OR n < 3 THEN
    RETURN false;
  END IF;

  j := n - 1;
  FOR i IN 0 .. n - 1 LOOP
    xi := (ring -> i ->> 0)::double precision;
    yi := (ring -> i ->> 1)::double precision;
    xj := (ring -> j ->> 0)::double precision;
    yj := (ring -> j ->> 1)::double precision;

    -- A ray cast east from the point crosses this edge if the edge
    -- straddles the point's latitude and the crossing is to the east.
    --
    -- The comparison is deliberately asymmetric — one end strictly
    -- above, the other not — so a ray passing exactly through a vertex
    -- counts that vertex once rather than twice. Symmetric comparisons
    -- put points on a horizontal edge outside their own polygon, which
    -- on a site laid out to a grid is a great many of them.
    IF ((yi > py) <> (yj > py))
       AND (px < (xj - xi) * (py - yi) / NULLIF(yj - yi, 0) + xi) THEN
      inside := NOT inside;
    END IF;
    j := i;
  END LOOP;

  RETURN inside;
END $function$;


-- ── Length_m, maintained by the database ────────────────────────────
--
-- This is the trigger behind the bill of materials. Length_m is the
-- DRAWN length and nothing but the drawing may write it; a measured
-- length — more digging than the line suggests — is a separate
-- attribute a person enters, and the bill reads that in preference.
-- Conflating the two is the fault fixed in Aptus360 migration 0257.

CREATE OR REPLACE FUNCTION public.gis_set_length()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW."Feature_Type" IN ('line','polygon') THEN
    NEW."Attributes" := COALESCE(NEW."Attributes", '{}'::jsonb)
      || jsonb_build_object('Length_m', gis_line_length(NEW."Geometry"));
  END IF;
  RETURN NEW;
END;
$function$;

-- A trigger belongs to its table, so this one is new even though the
-- function is not.
DROP TRIGGER IF EXISTS gis_length_trg ON "GIS_Feature";
CREATE TRIGGER gis_length_trg
  BEFORE INSERT OR UPDATE OF "Geometry" ON "GIS_Feature"
  FOR EACH ROW EXECUTE FUNCTION gis_set_length();


-- ── Canvas coordinates to the national grid ─────────────────────────

CREATE OR REPLACE FUNCTION public.gis_to_grid(p_project bigint, p_x numeric, p_y numeric)
 RETURNS TABLE(easting numeric, northing numeric)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT b."Ref_Easting"  + (p_x - b."Ref_Canvas_X"),
         -- Northing increases upward; canvas y increases downward
         b."Ref_Northing" - (p_y - b."Ref_Canvas_Y")
    FROM "GIS_Basemap" b
   WHERE b."Project_ID" = p_project
     AND b."Ref_Easting" IS NOT NULL;
$function$;

-- Seeds the basemap's grid reference from the site's own eastings and
-- northings, where it has not been calibrated by hand already.
--
-- Unchanged from Aptus360. It reads Project."Eastings"/"Northings",
-- and 0001 put those on this side's Project because of this function.
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


-- ── Which developer owns a plot ─────────────────────────────────────
--
-- The plot's seed point, against the boundary polygons drawn around
-- it. NULL when two boundaries claim it, because a plot in two
-- developers' areas is a drawing error and guessing hides it.

CREATE OR REPLACE FUNCTION public.gis_plot_developer(p_plot_id bigint)
 RETURNS bigint
 LANGUAGE sql
 STABLE
AS $function$
  WITH seed AS (
    SELECT (f."Geometry" -> 0 ->> 0)::double precision AS x,
           (f."Geometry" -> 0 ->> 1)::double precision AS y,
           f."Project_ID"
      FROM "GIS_Feature" f
     WHERE f."Plot_ID" = p_plot_id
       AND f."Feature_Role" = 'plot'
     LIMIT 1
  ),
  hits AS (
    SELECT (a."Attributes" ->> 'Project_Developer_ID')::bigint AS dev
      FROM "GIS_Feature" a, seed
     WHERE a."Project_ID" = seed."Project_ID"
       AND a."Layer_Key" = 'boundary'
       AND a."Feature_Type" = 'polygon'
       AND a."Attributes" ->> 'Project_Developer_ID' IS NOT NULL
       AND gis_point_in_ring(seed.x, seed.y, a."Geometry")
  )
  SELECT CASE WHEN COUNT(DISTINCT dev) = 1 THEN MIN(dev) ELSE NULL END
    FROM hits;
$function$;


-- ── Which utilities a site is drawn for ─────────────────────────────
--
-- REWORKED. In Aptus360 this read Project_Scope — the outline designs
-- a contract carries, which is a tender concept and does not exist on
-- this side. Here a site simply lists the utilities it is drawn for,
-- which is what 0001's Project_Utility is.
--
-- The returned shape is unchanged (utility_id, utility, layer_key), so
-- src/lib/utilities.js on the canvas needs no change.

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
    FROM "Project_Utility" pu
    JOIN "Utility" u ON u."Utility_ID" = pu."Utility_ID"
   WHERE pu."Project_ID" = p_project
     AND lower(u."Utility") IN ('electric','gas','water')
   ORDER BY u."Utility_ID";
$function$;


-- ── Placing joints where lines meet ─────────────────────────────────
--
-- REWORKED, in one line. The insert now carries Account_ID, which is
-- NOT NULL on this side. It is taken from the project being drawn on
-- rather than passed in: a caller who could choose the account could
-- choose the wrong one, and the composite foreign key would reject it
-- anyway — this way there is nothing to get wrong.
--
-- If the project is not visible to the caller, acct is NULL and the
-- insert fails on NOT NULL. That is the correct outcome: placing
-- joints on somebody else's drawing should not quietly do nothing.

CREATE OR REPLACE FUNCTION public.gis_place_joints(p_project bigint, p_tol numeric DEFAULT 0.3)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  r       record;
  made    integer := 0;
  jtype   text;
  acct    bigint;
BEGIN
  SELECT "Account_ID" INTO acct FROM "Project" WHERE "Project_ID" = p_project;
  IF acct IS NULL THEN
    RAISE EXCEPTION 'gis_place_joints: project % is not available', p_project;
  END IF;

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
      ("Project_ID","Account_ID","Layer_Key","Feature_Type","Geometry","Label","Attributes")
    VALUES (
      p_project, acct, 'trench', 'point',
      jsonb_build_array(jsonb_build_array(r.x, r.y)),
      initcap(jtype) || ' joint',
      jsonb_build_object('Joint_Type', jtype, 'Ways_In', r.n)
    );
    made := made + 1;
  END LOOP;

  RETURN made;
END;
$function$;


-- ── Numbering the network outward from a source ─────────────────────
--
-- Unchanged. Only updates GIS_Feature, so Account_ID is not its
-- concern, and row-level security keeps it inside the caller's own
-- drawings.

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


-- ── Nearest cable to each plot ──────────────────────────────────────
--
-- Unchanged, and carried across with its performance as it stands:
-- plots x lines x vertices, nested in plpgsql. Fine at current sizes,
-- slow on a large site. Recorded rather than rewritten, because
-- rewriting it is a change to behaviour that deserves its own
-- migration and its own test.

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
