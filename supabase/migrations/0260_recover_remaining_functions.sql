-- ════════════════════════════════════════════════════════════════════
-- 0260 — the other 41 functions that were never committed
--
-- 0259 recovered five. That number was wrong because the question was
-- wrong: it asked for five functions BY NAME, so it could only find
-- what was already known to be missing. Asking the database the
-- opposite way round — every function in public except the 21 the
-- migrations define — returned 41.
--
-- Two thirds of this database's logic has been living in production
-- and nowhere else.
--
-- This changes nothing. Every one is CREATE OR REPLACE over a
-- definition already in place, reproduced exactly as
-- pg_get_functiondef returned it, so running this against the live
-- database is a no-op. The point is that the repository now describes
-- the database.
--
-- ── What was missing ──
--
--   Project and tender (12) — recalc_project_points, the whole points
--     engine, with design_points_for and the three triggers that call
--     it; enforce_status_transition, which is the tender workflow's
--     rules; promote_on_secured; create_project_revision.
--   Organisation and people (11) — including link_person_to_auth,
--     which is SECURITY DEFINER and creates the Person row that every
--     access check in _access.js depends on.
--   Asset value and invoicing (7) — av_invoice_totals,
--     av_next_invoice_number and the quotation rules.
--   GIS (5) — gis_set_length and gis_line_length, which together
--     maintain Length_m; gis_point_in_ring and gis_plot_developer,
--     which decide which developer a plot belongs to; gis_to_grid.
--   Plot (3) — set_plot_ref and the two refreshers behind it.
--   Other (3) — log_entity_changes, ncr_assign_reference,
--     sync_vehicle_current_mileage.
--
-- ── What this does not cover ──
--
-- Functions only. The triggers that fire them, and the tables they act
-- on, are a separate gap: supabase/baseline/ holds the six GIS tables,
-- and the rest of the pre-migration schema is still unrecorded.
--
-- Safe to run twice.
-- ════════════════════════════════════════════════════════════════════

-- ── Helpers that other functions call, so they come first ──────────
--
-- Every one of these is LANGUAGE sql, which Postgres validates at
-- creation rather than at call time. gis_plot_developer calls
-- gis_point_in_ring, so the order below is load-bearing.

-- tidy_person_name
CREATE OR REPLACE FUNCTION public.tidy_person_name(raw text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        initcap(
          btrim(regexp_replace(regexp_replace(raw, '[._]+', ' ', 'g'),
                               '\s+', ' ', 'g'))
        ),
        '('')([a-z])', '\1\2', 'g'
      ),
      '(-)([a-z])', '\1\2', 'g'
    ), '');
$function$;

-- org_branch_label
CREATE OR REPLACE FUNCTION public.org_branch_label(org_name text, branch_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(org_name, '') ||
         CASE WHEN branch_name IS NULL OR branch_name = ''
              THEN '' ELSE ' (' || branch_name || ')' END;
$function$;

-- gis_line_length
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

-- gis_point_in_ring
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

-- gis_to_grid
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

-- gis_plot_developer
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

-- plot_kva
CREATE OR REPLACE FUNCTION public.plot_kva(p_plot bigint)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(
    pl."KVA_Load",
    (SELECT c."Consumption_kVA"
       FROM "House_Type_Consumption" c
       JOIN "Property_Config" pc ON pc."Bedrooms" = c."Bedrooms"
      WHERE pc."Property_Config_ID" = pl."Property_Config_ID"
        AND c."Heat_Source_ID" = pl."Heat_Source_ID"
      LIMIT 1)
  )
  FROM "Plot" pl WHERE pl."Plot_ID" = p_plot;
$function$;

-- av_invoiced_plots
CREATE OR REPLACE FUNCTION public.av_invoiced_plots(p_project bigint, p_utility bigint)
 RETURNS TABLE(plot_id bigint, plot_ref text, invoice_number text, net_value numeric)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT l."Plot_ID", l."Plot_Ref", i."Invoice_Number", l."Net_Value"
    FROM "AV_Invoice_Line" l
    JOIN "AV_Invoice" i ON i."AV_Invoice_ID" = l."AV_Invoice_ID"
   WHERE i."Project_ID" = p_project
     AND (p_utility IS NULL OR i."Utility_ID" = p_utility)
     AND i."Status" <> 'Cancelled';
$function$;

-- ── Everything else, alphabetically ────────────────────────────────
--
-- plpgsql is late-bound: a body naming a function that does not exist
-- yet still creates, and resolves on first call. So order stops
-- mattering from here.

-- av_invoice_totals
CREATE OR REPLACE FUNCTION public.av_invoice_totals()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE inv bigint; net numeric; rate numeric;
BEGIN
  inv := COALESCE(NEW."AV_Invoice_ID", OLD."AV_Invoice_ID");
  SELECT COALESCE(SUM("Net_Value"), 0) INTO net
    FROM "AV_Invoice_Line" WHERE "AV_Invoice_ID" = inv;
  SELECT "VAT_Rate" INTO rate FROM "AV_Invoice" WHERE "AV_Invoice_ID" = inv;

  UPDATE "AV_Invoice"
     SET "Net_Value"   = ROUND(net, 2),
         "VAT_Value"   = ROUND(net * COALESCE(rate, 0) / 100, 2),
         "Gross_Value" = ROUND(net + net * COALESCE(rate, 0) / 100, 2)
   WHERE "AV_Invoice_ID" = inv;
  RETURN NULL;
END;
$function$;

-- av_line_utility
CREATE OR REPLACE FUNCTION public.av_line_utility()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  SELECT "Utility_ID" INTO NEW."Utility_ID"
    FROM "AV_Invoice" WHERE "AV_Invoice_ID" = NEW."AV_Invoice_ID";
  RETURN NEW;
END;
$function$;

-- av_next_invoice_number
CREATE OR REPLACE FUNCTION public.av_next_invoice_number(p_contract text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE highest integer;
BEGIN
  IF p_contract IS NULL OR p_contract = '' THEN RETURN NULL; END IF;

  SELECT COALESCE(MAX(
           NULLIF(regexp_replace(
             split_part("Invoice_Number", '/', 2), '\D', '', 'g'), '')::integer), 0)
    INTO highest
    FROM "AV_Invoice"
   WHERE "Invoice_Number" LIKE p_contract || '/%';

  RETURN p_contract || '/' || lpad((highest + 1)::text, 3, '0');
END;
$function$;

-- create_project_revision
CREATE OR REPLACE FUNCTION public.create_project_revision(p_project bigint, p_carry_scopes bigint[] DEFAULT '{}'::bigint[], p_copy_plots boolean DEFAULT true)
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
DECLARE
  src        "Project"%ROWTYPE;
  stage      text;
  max_rev    integer;
  new_id     bigint;
  new_rev    integer;
  first_st   bigint;
  super_st   bigint;
  sc         record;
  carried    boolean;
  new_scope  bigint;
  dev        record;
  dev_map    jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO src FROM "Project" WHERE "Project_ID" = p_project;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project % not found', p_project; END IF;

  SELECT ps."Stage" INTO stage FROM "Project_Status" ps
   WHERE ps."Project_Status_ID" = src."Project_Status_ID";

  IF src."Project_Ref" IS NULL THEN
    RAISE EXCEPTION 'This project has no reference, so a revision has nothing to share it with';
  END IF;

  IF stage IS DISTINCT FROM 'Tender' THEN
    RAISE EXCEPTION 'Revisions can only be created at Tender stage — this project is at % stage', stage;
  END IF;

  SELECT COALESCE(MAX("Revision"), 0) INTO max_rev
    FROM "Project" WHERE "Project_Ref" = src."Project_Ref";
  new_rev := max_rev + 1;

  -- A revision starts fresh rather than inheriting where the last one got to
  SELECT "Project_Status_ID" INTO first_st FROM "Project_Status"
   WHERE "Stage" = 'Tender' ORDER BY "Sort_Order" LIMIT 1;
  SELECT "Project_Status_ID" INTO super_st FROM "Project_Status"
   WHERE "Stage" = 'Tender' AND "Status" = 'Superseded' LIMIT 1;

  INSERT INTO "Project" (
    "Project_Ref","Revision","Option_Letter","Project_Status_ID",
    "Customer_ID","Branch_ID","Region_ID","Sub_Region_ID",
    "Site_Name","Site_Address","Postcode","Eastings","Northings",
    "Date_Received","KPI_Date","BDD_KAM_ID","Estimator_ID","Quote_Type_ID",
    "I_and_C","Is_Priority","Notes","Manual_Base_Points",
    "Fire_Service_ID","Town_Council_ID","County_Council_ID",
    "Heat_Pump_Model_ID","Default_Heat_Source_ID"
  ) VALUES (
    src."Project_Ref", new_rev, src."Option_Letter", first_st,
    src."Customer_ID", src."Branch_ID", src."Region_ID", src."Sub_Region_ID",
    src."Site_Name", src."Site_Address", src."Postcode", src."Eastings", src."Northings",
    src."Date_Received", src."KPI_Date", src."BDD_KAM_ID", src."Estimator_ID", src."Quote_Type_ID",
    src."I_and_C", src."Is_Priority", src."Notes", src."Manual_Base_Points",
    src."Fire_Service_ID", src."Town_Council_ID", src."County_Council_ID",
    src."Heat_Pump_Model_ID", src."Default_Heat_Source_ID"
  ) RETURNING "Project_ID" INTO new_id;

  -- Developers come across, and plots need to point at the new rows
  FOR dev IN SELECT * FROM "Project_Developer" WHERE "Project_ID" = p_project LOOP
    INSERT INTO "Project_Developer"
      ("Project_ID","Customer_ID","Branch_ID","Is_Main","Developer_Code","Notes")
    VALUES (new_id, dev."Customer_ID", dev."Branch_ID", dev."Is_Main",
            dev."Developer_Code", dev."Notes")
    RETURNING "Project_Developer_ID" INTO new_scope;
    dev_map := dev_map || jsonb_build_object(dev."Project_Developer_ID"::text, new_scope);
  END LOOP;

  IF p_copy_plots THEN
    INSERT INTO "Plot" (
      "Project_ID","Plot_Number","Property_Config_ID","PV",
      "Heat_Pump_Model_ID","KVA_Load","Self_Lay_Provider","Project_Developer_ID"
    )
    SELECT new_id, pl."Plot_Number", pl."Property_Config_ID", pl."PV",
           pl."Heat_Pump_Model_ID", pl."KVA_Load", pl."Self_Lay_Provider",
           (dev_map ->> pl."Project_Developer_ID"::text)::bigint
      FROM "Plot" pl WHERE pl."Project_ID" = p_project;
  END IF;

  -- ── Designs: redone, or carried forward ──
  FOR sc IN SELECT * FROM "Project_Scope" WHERE "Project_ID" = p_project LOOP
    carried := sc."Project_Scope_ID" = ANY(p_carry_scopes);

    INSERT INTO "Project_Scope" (
      "Project_ID","Utility_ID","Scope_Status_ID","Revision","Carried_Forward",
      "Designer_ID","Design_Status_ID","Design_Checked_By","POC_Status_ID",
      "Target_Date","Actual_Date","External_Design","IDNO_ID","Reference",
      "Manual_Base_Points","Base_Points_Overridden"
    ) VALUES (
      new_id, sc."Utility_ID", sc."Scope_Status_ID", new_rev, carried,
      -- Carried forward keeps the design as it stands; a redo starts blank
      CASE WHEN carried THEN sc."Designer_ID" END,
      CASE WHEN carried THEN sc."Design_Status_ID" END,
      CASE WHEN carried THEN sc."Design_Checked_By" END,
      CASE WHEN carried THEN sc."POC_Status_ID" END,
      CASE WHEN carried THEN sc."Target_Date" END,
      CASE WHEN carried THEN sc."Actual_Date" END,
      CASE WHEN carried THEN sc."External_Design" ELSE false END,
      sc."IDNO_ID", sc."Reference",
      CASE WHEN carried THEN sc."Manual_Base_Points" END,
      CASE WHEN carried THEN sc."Base_Points_Overridden" ELSE false END
    );
  END LOOP;

  -- ── Supersede the original ──
  IF super_st IS NOT NULL THEN
    UPDATE "Project" SET "Project_Status_ID" = super_st WHERE "Project_ID" = p_project;
  END IF;

  INSERT INTO "Project_History" ("Project_ID","Field","Old_Value","New_Value")
  VALUES (new_id, 'Revision', src."Revision"::text, new_rev::text),
         (p_project, 'Superseded by', NULL, src."Project_Ref" || ' r' || new_rev);

  PERFORM recalc_project_points(new_id);
  RETURN new_id;
END;
$function$;

-- design_points_for
CREATE OR REPLACE FUNCTION public.design_points_for(p_plots integer, p_utility bigint)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE pts numeric;
BEGIN
  IF p_plots IS NULL THEN RETURN NULL; END IF;
  -- Street lighting scopes score zero design points, definitively.
  IF EXISTS (SELECT 1 FROM "Utility" WHERE "Utility_ID" = p_utility AND "Is_Lighting") THEN
    RETURN 0;
  END IF;
  SELECT b."Points" INTO pts FROM "Base_Points_Band" b
   WHERE p_plots BETWEEN b."Plot_From" AND b."Plot_To"
     AND (b."Utility_ID" IS NULL OR b."Utility_ID" = p_utility)
   ORDER BY b."Utility_ID" NULLS LAST LIMIT 1;
  RETURN pts;
END;
$function$;

-- enforce_status_transition
CREATE OR REPLACE FUNCTION public.enforce_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  from_stage text;
  ok boolean;
BEGIN
  IF NEW."Project_Status_ID" IS NOT DISTINCT FROM OLD."Project_Status_ID" THEN
    RETURN NEW;
  END IF;

  SELECT "Stage" INTO from_stage FROM "Project_Status"
   WHERE "Project_Status_ID" = OLD."Project_Status_ID";

  -- Contract-stage moves aren't governed by the tender workflow
  IF from_stage IS DISTINCT FROM 'Tender' THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM "Status_Transition" t
     WHERE t."Is_Active"
       AND t."From_Status_ID" = OLD."Project_Status_ID"
       AND t."To_Status_ID"   = NEW."Project_Status_ID"
       AND (t."Quote_Type_ID" IS NULL OR t."Quote_Type_ID" = NEW."Quote_Type_ID")
  ) INTO ok;

  IF NOT ok THEN
    RAISE EXCEPTION 'Status change not permitted: % cannot move to %',
      (SELECT "Status" FROM "Project_Status" WHERE "Project_Status_ID" = OLD."Project_Status_ID"),
      (SELECT "Status" FROM "Project_Status" WHERE "Project_Status_ID" = NEW."Project_Status_ID");
  END IF;

  RETURN NEW;
END;
$function$;

-- ensure_org_branch
CREATE OR REPLACE FUNCTION public.ensure_org_branch()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO "Organisation_Branch" ("Organisation_ID","Branch_Name")
  VALUES (NEW."Organisation_ID", 'Head Office')
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$function$;

-- gis_set_length
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

-- keep_one_branch
CREATE OR REPLACE FUNCTION public.keep_one_branch()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE remaining integer;
BEGIN
  SELECT COUNT(*) INTO remaining FROM "Organisation_Branch"
   WHERE "Organisation_ID" = OLD."Organisation_ID"
     AND "Organisation_Branch_ID" <> OLD."Organisation_Branch_ID";
  IF remaining = 0 AND EXISTS (
    SELECT 1 FROM "Organisation" WHERE "Organisation_ID" = OLD."Organisation_ID"
  ) THEN
    RAISE EXCEPTION 'An organisation must keep at least one branch — rename this one instead.';
  END IF;
  RETURN OLD;
END;
$function$;

-- link_person_to_auth
CREATE OR REPLACE FUNCTION public.link_person_to_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public."Person"
     SET "Auth_UID" = NEW.id
   WHERE LOWER("Email") = LOWER(NEW.email)
     AND "Auth_UID" IS NULL;

  -- No match: create the Person so they're not invisible to the app.
  IF NOT FOUND THEN
    INSERT INTO public."Person" ("Person_Name", "Email", "Auth_UID", "Is_Active")
    VALUES (
      public.tidy_person_name(
        /* A name given at sign-up wins, and is tidied too — people type
           their own names in lower case more often than not. NULLIF
           because an empty string is not a name, and COALESCE alone
           would take it over the address. */
        COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
                 split_part(NEW.email, '@', 1))
      ),
      NEW.email, NEW.id, true)
    ON CONFLICT ("Email") DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- log_entity_changes
CREATE OR REPLACE FUNCTION public.log_entity_changes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  entity  text := TG_ARGV[0];
  pk_col  text := TG_ARGV[1];
  cols    text[] := TG_ARGV[2:];
  col     text;
  oldv    text;
  newv    text;
  ent_id  bigint;
BEGIN
  EXECUTE format('SELECT ($1).%I', pk_col) INTO ent_id USING NEW;
  FOREACH col IN ARRAY cols LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', col, col)
      INTO oldv, newv USING OLD, NEW;
    IF oldv IS DISTINCT FROM newv THEN
      INSERT INTO "Entity_History" ("Entity_Type","Entity_ID","Field","Old_Value","New_Value")
      VALUES (entity, ent_id, col, oldv, newv);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

-- ncr_assign_reference
CREATE OR REPLACE FUNCTION public.ncr_assign_reference()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW."NCR_Reference" IS NULL OR btrim(NEW."NCR_Reference") = '' THEN
    NEW."NCR_Reference" := 'NCR' || lpad(nextval('ncr_reference_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$function$;

-- organisation_role_one_incumbent
CREATE OR REPLACE FUNCTION public.organisation_role_one_incumbent()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  incoming text;
  held     int;
BEGIN
  SELECT lower("Type_Key") INTO incoming
    FROM "Organisation_Type"
   WHERE "Organisation_Type_ID" = NEW."Organisation_Type_ID";

  IF incoming NOT IN ('dno', 'gt', 'wu') THEN
    RETURN NEW;                  -- independents may hold several
  END IF;

  SELECT count(*) INTO held
    FROM "Organisation_Role" r
    JOIN "Organisation_Type" t USING ("Organisation_Type_ID")
   WHERE r."Organisation_ID" = NEW."Organisation_ID"
     AND lower(t."Type_Key") IN ('dno', 'gt', 'wu')
     AND r."Organisation_Type_ID" <> NEW."Organisation_Type_ID";

  IF held > 0 THEN
    RAISE EXCEPTION
      'An organisation can hold one incumbent role. % already holds another (DNO, GT and WU are the incumbent for one utility each).',
      NEW."Organisation_ID";
  END IF;

  RETURN NEW;
END;
$function$;

-- pack_status_on_submission
CREATE OR REPLACE FUNCTION public.pack_status_on_submission()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE cur text; sub bigint;
BEGIN
  IF NEW."Service_Card_Submission_Date" IS NOT NULL
     AND (OLD IS NULL OR OLD."Service_Card_Submission_Date" IS NULL) THEN
    SELECT "Pack_Status" INTO cur FROM "Pack_Status"
     WHERE "Pack_Status_ID" = NEW."Pack_Status_ID";
    IF cur IS NULL OR cur IN ('Pack Not Submitted','Pack In Progress') THEN
      SELECT "Pack_Status_ID" INTO sub FROM "Pack_Status" WHERE "Pack_Status" = 'Submitted';
      NEW."Pack_Status_ID" := sub;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- promote_on_secured
CREATE OR REPLACE FUNCTION public.promote_on_secured()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  new_stage  text;
  new_status text;
  first_contract bigint;
BEGIN
  SELECT "Stage", "Status" INTO new_stage, new_status
  FROM "Project_Status" WHERE "Project_Status_ID" = NEW."Project_Status_ID";

  IF new_stage = 'Tender' AND LOWER(new_status) LIKE 'secured%' THEN
    SELECT "Project_Status_ID" INTO first_contract
    FROM "Project_Status" WHERE "Stage" = 'Contract'
    ORDER BY "Sort_Order" LIMIT 1;

    IF first_contract IS NOT NULL THEN
      NEW."Project_Status_ID" := first_contract;
      NEW."Secured_Date" := COALESCE(NEW."Secured_Date", CURRENT_DATE);
    END IF;
  END IF;

  IF NEW."Project_Status_ID" IS DISTINCT FROM OLD."Project_Status_ID" THEN
    NEW."Status_Changed_Date" := CURRENT_DATE;
  END IF;

  RETURN NEW;
END;
$function$;

-- recalc_project_points
CREATE OR REPLACE FUNCTION public.recalc_project_points(p_project bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  plots      integer;
  band_pts   numeric;
  manual     numeric;
  manual_tot numeric;
  base_auto  numeric := 0;
  base_used  numeric;
  design_pts numeric := 0;
  total      numeric;
  is_budget  boolean;
  r          record;
  parts      jsonb := '{}'::jsonb;
BEGIN
  SELECT COUNT(*) INTO plots FROM "Plot" WHERE "Project_ID" = p_project;

  SELECT b."Points" INTO band_pts FROM "Tender_Points_Band" b
   WHERE plots BETWEEN b."Plot_From" AND b."Plot_To" LIMIT 1;

  SELECT p."Manual_Base_Points", p."Manual_Total_Points", COALESCE(q."Is_Budget", false)
    INTO manual, manual_tot, is_budget
    FROM "Project" p
    LEFT JOIN "Quote_Type" q ON q."Quote_Type_ID" = p."Quote_Type_ID"
   WHERE p."Project_ID" = p_project;

  -- ── Tender base points: one rule per utility on the project ──
  IF is_budget THEN
    SELECT COALESCE("Points",0) INTO base_auto FROM "Tender_Points_Rule"
     WHERE "Rule_Key" = 'Budget' AND "Is_Active";
    parts := jsonb_build_object('Budget', base_auto);
  ELSE
    FOR r IN
      SELECT u."Utility" AS name, u."Is_Lighting",
             tr."Scales_With_Base_Points", tr."Points"
        FROM "Project_Scope" ps
        JOIN "Utility" u ON u."Utility_ID" = ps."Utility_ID"
        JOIN "Tender_Points_Rule" tr
          ON tr."Rule_Key" = CASE WHEN u."Is_Lighting" THEN 'Street Lighting' ELSE u."Utility" END
       WHERE ps."Project_ID" = p_project AND tr."Is_Active"
    LOOP
      DECLARE v numeric;
      BEGIN
        v := CASE WHEN r."Scales_With_Base_Points"
                  THEN COALESCE(band_pts,0) ELSE COALESCE(r."Points",0) END;
        base_auto := base_auto + v;
        parts := parts || jsonb_build_object(r.name, v);
      END;
    END LOOP;
  END IF;

  -- ── Design points: each outline design, honouring its override ──
  SELECT COALESCE(SUM(CASE WHEN ps."Base_Points_Overridden"
                           THEN COALESCE(ps."Manual_Base_Points",0)
                           ELSE COALESCE(ps."Auto_Base_Points",0) END), 0)
    INTO design_pts
    FROM "Project_Scope" ps WHERE ps."Project_ID" = p_project;

  base_used := COALESCE(manual, base_auto);
  total := COALESCE(manual_tot, design_pts + base_used);

  UPDATE "Project"
     SET "Total_Design_Points" = design_pts,
         "Tender_Base_Points"  = base_auto,
         "Tender_Total_Points" = total,
         "Points_Breakdown"    = parts
   WHERE "Project_ID" = p_project
     AND ("Total_Design_Points" IS DISTINCT FROM design_pts
       OR "Tender_Base_Points"  IS DISTINCT FROM base_auto
       OR "Tender_Total_Points" IS DISTINCT FROM total
       OR "Points_Breakdown"    IS DISTINCT FROM parts);

  UPDATE "Project_Scope" ps
     SET "Auto_Base_Points" = design_points_for(plots, ps."Utility_ID")
   WHERE ps."Project_ID" = p_project
     AND ps."Auto_Base_Points" IS DISTINCT FROM design_points_for(plots, ps."Utility_ID");
END;
$function$;

-- refresh_branch_dropdowns
CREATE OR REPLACE FUNCTION public.refresh_branch_dropdowns()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE "Customer_Branch"
     SET "Branch_Dropdown" = NEW."Customer_Name" || ' (' || "Branch_Name" || ')'
   WHERE "Customer_ID" = NEW."Customer_ID";
  RETURN NULL;
END;
$function$;

-- refresh_org_branch_dropdowns
CREATE OR REPLACE FUNCTION public.refresh_org_branch_dropdowns()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE "Organisation_Branch"
     SET "Branch_Dropdown" = org_branch_label(NEW."Name", "Branch_Name")
   WHERE "Organisation_ID" = NEW."Organisation_ID";
  RETURN NULL;
END;
$function$;

-- refresh_plot_refs
CREATE OR REPLACE FUNCTION public.refresh_plot_refs()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE "Plot"
     SET "Plot_Ref" = NEW."Project_Ref" || '-' || "Plot_Number"
   WHERE "Project_ID" = NEW."Project_ID";
  RETURN NULL;
END;
$function$;

-- refresh_plot_refs_for_project
CREATE OR REPLACE FUNCTION public.refresh_plot_refs_for_project()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE pid bigint;
BEGIN
  pid := COALESCE(NEW."Project_ID", OLD."Project_ID");
  UPDATE "Plot" SET "Plot_Number" = "Plot_Number" WHERE "Project_ID" = pid;
  RETURN NULL;
END;
$function$;

-- set_branch_dropdown
CREATE OR REPLACE FUNCTION public.set_branch_dropdown()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  SELECT c."Customer_Name" || ' (' || NEW."Branch_Name" || ')'
    INTO NEW."Branch_Dropdown"
  FROM "Customer" c
  WHERE c."Customer_ID" = NEW."Customer_ID";

  -- Orphan or missing customer: fall back to the branch name alone
  -- rather than writing NULL and emptying the dropdown.
  IF NEW."Branch_Dropdown" IS NULL THEN
    NEW."Branch_Dropdown" := NEW."Branch_Name";
  END IF;

  RETURN NEW;
END;
$function$;

-- set_org_branch_dropdown
CREATE OR REPLACE FUNCTION public.set_org_branch_dropdown()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE org_name text;
BEGIN
  SELECT "Name" INTO org_name FROM "Organisation"
   WHERE "Organisation_ID" = NEW."Organisation_ID";
  NEW."Branch_Dropdown" := org_branch_label(org_name, NEW."Branch_Name");
  RETURN NEW;
END;
$function$;

-- set_plot_ref
CREATE OR REPLACE FUNCTION public.set_plot_ref()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  proj_ref  text;
  dev_code  text;
  dev_count integer;
BEGIN
  SELECT p."Project_Ref" INTO proj_ref
    FROM "Project" p WHERE p."Project_ID" = NEW."Project_ID";

  SELECT COUNT(*) INTO dev_count
    FROM "Project_Developer" WHERE "Project_ID" = NEW."Project_ID";

  IF dev_count > 1 AND NEW."Project_Developer_ID" IS NOT NULL THEN
    SELECT UPPER("Developer_Code") INTO dev_code
      FROM "Project_Developer"
     WHERE "Project_Developer_ID" = NEW."Project_Developer_ID";
  END IF;

  NEW."Plot_Ref" := COALESCE(proj_ref || '-', '')
                 || COALESCE(dev_code || '-', '')
                 || NEW."Plot_Number";
  RETURN NEW;
END;
$function$;

-- single_accepted_av_quotation
CREATE OR REPLACE FUNCTION public.single_accepted_av_quotation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE rejected_id bigint;
BEGIN
  IF NEW."Accepted" THEN
    SELECT "Quotation_Status_ID" INTO rejected_id
      FROM "Quotation_Status" WHERE "Quotation_Status" = 'Rejected';

    UPDATE "AV_Quotation"
       SET "Accepted" = false,
           "Quotation_Status_ID" = COALESCE(rejected_id, "Quotation_Status_ID")
     WHERE "AV_Application_ID" = NEW."AV_Application_ID"
       AND "AV_Quotation_ID" <> NEW."AV_Quotation_ID"
       AND "Accepted";
  END IF;
  RETURN NEW;
END;
$function$;

-- single_primary_contact
CREATE OR REPLACE FUNCTION public.single_primary_contact()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW."Is_Primary" THEN
    UPDATE "Project_Contact" SET "Is_Primary" = false
     WHERE "Project_ID" = NEW."Project_ID"
       AND "Project_Contact_ID" <> NEW."Project_Contact_ID" AND "Is_Primary";
  END IF;
  RETURN NEW;
END;
$function$;

-- single_selected_option
CREATE OR REPLACE FUNCTION public.single_selected_option()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW."Selected" THEN
    UPDATE "POC_Option"
       SET "Selected" = false
     WHERE "POC_Application_ID" = NEW."POC_Application_ID"
       AND "Option_ID" <> NEW."Option_ID"
       AND "Selected";
  END IF;
  RETURN NEW;
END;
$function$;

-- stamp_poc_submitted
CREATE OR REPLACE FUNCTION public.stamp_poc_submitted()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE s text;
BEGIN
  SELECT "POC_Status" INTO s FROM "POC_Status"
   WHERE "POC_Status_ID" = NEW."POC_Status_ID";
  IF s = 'Submitted' AND NEW."Submitted_Date" IS NULL THEN
    NEW."Submitted_Date" := CURRENT_DATE;
  END IF;
  IF s = 'Received' AND NEW."Received_Date" IS NULL THEN
    NEW."Received_Date" := CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$function$;

-- sync_quotation_nrs_option
CREATE OR REPLACE FUNCTION public.sync_quotation_nrs_option()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  SELECT "Option_ID" INTO NEW."Option_ID"
    FROM "POC_Quotation" WHERE "Quotation_ID" = NEW."Quotation_ID";
  RETURN NEW;
END;
$function$;

-- sync_quotation_plot_option
CREATE OR REPLACE FUNCTION public.sync_quotation_plot_option()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  SELECT "Option_ID" INTO NEW."Option_ID"
    FROM "POC_Quotation" WHERE "Quotation_ID" = NEW."Quotation_ID";
  RETURN NEW;
END;
$function$;

-- sync_vehicle_current_mileage
CREATE OR REPLACE FUNCTION public.sync_vehicle_current_mileage()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_id bigint := COALESCE(NEW."Vehicle_ID", OLD."Vehicle_ID");
BEGIN
  UPDATE "Vehicle" v
     SET "Current_Mileage"     = l."Mileage",
         "Mileage_Recorded_On" = l."Reading_Date"
    FROM (
      SELECT "Mileage", "Reading_Date"
        FROM "Vehicle_Mileage_Log"
       WHERE "Vehicle_ID" = v_id
       ORDER BY "Reading_Date" DESC, "Log_ID" DESC
       LIMIT 1
    ) l
   WHERE v."Vehicle_ID" = v_id;

  -- The last reading deleted leaves nothing to show. Clearing beats
  -- leaving the figure from a reading that no longer exists.
  IF NOT EXISTS (SELECT 1 FROM "Vehicle_Mileage_Log" WHERE "Vehicle_ID" = v_id) THEN
    UPDATE "Vehicle"
       SET "Current_Mileage" = NULL, "Mileage_Recorded_On" = NULL
     WHERE "Vehicle_ID" = v_id;
  END IF;

  RETURN NULL;
END;
$function$;

-- trg_project_points
CREATE OR REPLACE FUNCTION public.trg_project_points()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM recalc_project_points(NEW."Project_ID");
  RETURN NULL;
END;
$function$;

-- trg_recalc_points
CREATE OR REPLACE FUNCTION public.trg_recalc_points()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE pid bigint;
BEGIN
  pid := COALESCE(NEW."Project_ID", OLD."Project_ID");
  PERFORM recalc_project_points(pid);
  RETURN NULL;
END;
$function$;

-- trg_scope_points_changed
CREATE OR REPLACE FUNCTION public.trg_scope_points_changed()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM recalc_project_points(COALESCE(NEW."Project_ID", OLD."Project_ID"));
  RETURN NULL;
END;
$function$;
