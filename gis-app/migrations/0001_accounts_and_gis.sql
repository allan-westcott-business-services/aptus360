-- ════════════════════════════════════════════════════════════════════
-- 0001 — accounts, and the GIS tables that belong to them
--
-- The first migration of the GIS application's own database.
--
-- ── The decision this encodes ──
--
-- Each customer of the GIS app is an Account. Organisations, projects,
-- plots and drawings live inside one. Westcott is one Account among
-- several.
--
-- An Account is deliberately NOT an Organisation. In Aptus360,
-- "Organisation" means a company you work WITH — an IDNO, a DNO, a
-- developer. An Account is a company that PAYS FOR THE SOFTWARE. One
-- table asked to mean both is how an IDNO ends up a tenant with access
-- to everybody's drawings.
--
-- ── Why the Account is on every table ──
--
-- Not derived through Project at read time. A row-level security policy
-- that has to join its way to the account is slower on every query and
-- easier to get subtly wrong, and the one place you cannot afford a
-- subtle mistake is the wall between two paying customers.
--
-- The cost of carrying it is that a row could name an account its
-- parent does not belong to. That is closed below with composite
-- foreign keys rather than a trigger: GIS_Feature points at
-- (Project_ID, Account_ID) together, so a feature on another account's
-- project is not something the database will store. It is not caught
-- and corrected — it cannot be written.
--
-- ── What is deliberately not here ──
--
-- The five recovered GIS functions come in 0002, because two of them
-- read tables that do not exist on this side: gis_project_utilities
-- reads Project_Scope, and gis_seed_reference reads
-- Project."Eastings"/"Northings". Both need rework rather than copying,
-- and that is a separate piece of thinking from the schema.
--
-- Table shapes are taken from supabase/baseline/gis_tables.sql in the
-- Aptus360 repository — the live schema as pg_dump returned it — so
-- that drawings can be moved across later without translation.
--
-- Geometry is JSONB coordinate arrays. There is no PostGIS dependency
-- and this database needs no spatial extension.
-- ════════════════════════════════════════════════════════════════════


-- ── Who the database thinks you are ─────────────────────────────────
--
-- Supabase's auth.uid() reads the signed-in user from the request's
-- JWT. Every policy below goes through account_ids(), which turns that
-- into the set of accounts the caller belongs to.
--
-- STABLE, not VOLATILE, so the planner calls it once per query rather
-- than once per row. SECURITY DEFINER so a member can be found without
-- giving everyone read access to the membership table itself, and
-- search_path pinned because SECURITY DEFINER without it is how a
-- function gets hijacked by a planted table.

CREATE TABLE "Account" (
  "Account_ID"  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Name"        text NOT NULL,
  "Is_Active"   boolean NOT NULL DEFAULT true,
  "Created_At"  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "Account_Member" (
  "Account_Member_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Account_ID"        bigint NOT NULL REFERENCES "Account" ON DELETE CASCADE,
  -- The Supabase auth user. No foreign key: auth.users lives in another
  -- schema this migration should not reach into.
  "Auth_UID"          uuid NOT NULL,
  "Email"             text,
  -- 'owner' may manage members; 'member' may draw; 'viewer' may not.
  "Role"              text NOT NULL DEFAULT 'member',
  "Is_Active"         boolean NOT NULL DEFAULT true,
  "Created_At"        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_member_role_check
    CHECK ("Role" IN ('owner', 'member', 'viewer')),
  CONSTRAINT account_member_once UNIQUE ("Account_ID", "Auth_UID")
);

CREATE INDEX account_member_uid_idx ON "Account_Member" ("Auth_UID")
  WHERE "Is_Active";

CREATE FUNCTION account_ids() RETURNS bigint[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(m."Account_ID"), '{}')
    FROM "Account_Member" m
    JOIN "Account" a ON a."Account_ID" = m."Account_ID"
   WHERE m."Auth_UID" = auth.uid()
     AND m."Is_Active" AND a."Is_Active";
$$;

COMMENT ON FUNCTION account_ids() IS
  'The accounts the signed-in user belongs to. Every RLS policy reads '
  'this. Returns an empty array for a caller with no membership, which '
  'matches nothing — the honest answer for an account that has not been '
  'set up rather than an error.';

-- May the caller write, as opposed to read? A viewer may not.
CREATE FUNCTION account_ids_writable() RETURNS bigint[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(m."Account_ID"), '{}')
    FROM "Account_Member" m
    JOIN "Account" a ON a."Account_ID" = m."Account_ID"
   WHERE m."Auth_UID" = auth.uid()
     AND m."Is_Active" AND a."Is_Active"
     AND m."Role" IN ('owner', 'member');
$$;


-- ── Lookups the drawing needs ───────────────────────────────────────
--
-- Utility is shared across accounts and not owned by any of them:
-- electric is electric. Readable by anyone signed in, writable by
-- nobody through the API.

CREATE TABLE "Utility" (
  "Utility_ID"  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Utility"     text NOT NULL UNIQUE,
  "Colour"      text,
  "Sort_Order"  integer NOT NULL DEFAULT 0,
  "Is_Active"   boolean NOT NULL DEFAULT true
);

INSERT INTO "Utility" ("Utility", "Colour", "Sort_Order") VALUES
  ('Electric',                '#f59e0b', 10),
  ('Gas',                     '#eab308', 20),
  ('Water',                   '#3b82f6', 30),
  -- The canvas has a lighting layer with its own line types, and that
  -- layer names this utility. Seeding only the three obvious ones left
  -- the lighting layer's Utility_ID resolving to NULL — not an error,
  -- just a quietly unlinked layer. Found when 0003 was generated from
  -- the live catalogues.
  --
  -- gis_project_utilities still returns only electric, gas and water,
  -- exactly as it does in Aptus360, so this changes nothing about what
  -- a site is drawn for.
  ('Private Street Lighting', '#a855f7', 40);


-- ── A site, and its plots ───────────────────────────────────────────
--
-- Still called Project, and its key still Project_ID, because the
-- canvas routes every endpoint by :projectId and all five recovered
-- functions take p_project. Renaming it to Site would be a cosmetic
-- change rippling through 160 files of working code.
--
-- Legacy_Project_ID is how a drawing imported from Aptus360 remembers
-- where it came from. Nothing joins on it; it is for tracing.

CREATE TABLE "Project" (
  "Project_ID"        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Account_ID"        bigint NOT NULL REFERENCES "Account" ON DELETE CASCADE,
  "Project_Ref"       text,
  "Site_Name"         text NOT NULL,
  "Site_Address"      text,
  "Postcode"          text,
  -- Seeds the basemap's grid reference. gis_seed_reference read these
  -- off Aptus360's Project; here they belong to the site itself.
  "Eastings"          numeric,
  "Northings"         numeric,
  "Legacy_Project_ID" bigint,
  "Is_Active"         boolean NOT NULL DEFAULT true,
  "Created_At"        timestamptz NOT NULL DEFAULT now(),
  "Updated_At"        timestamptz NOT NULL DEFAULT now(),
  -- The target of every composite foreign key below. This is what makes
  -- "a feature on another account's project" unstorable.
  CONSTRAINT project_account_key UNIQUE ("Project_ID", "Account_ID"),
  CONSTRAINT project_ref_per_account UNIQUE ("Account_ID", "Project_Ref")
);

CREATE INDEX project_account_idx ON "Project" ("Account_ID");

-- Which utilities a site is drawn for. gis_project_utilities read this
-- from Aptus360's Project_Scope; here it is the site's own list.
CREATE TABLE "Project_Utility" (
  "Project_ID" bigint NOT NULL,
  "Account_ID" bigint NOT NULL,
  "Utility_ID" bigint NOT NULL REFERENCES "Utility",
  PRIMARY KEY ("Project_ID", "Utility_ID"),
  FOREIGN KEY ("Project_ID", "Account_ID")
    REFERENCES "Project" ("Project_ID", "Account_ID") ON DELETE CASCADE
);

CREATE TABLE "Plot" (
  "Plot_ID"        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Project_ID"     bigint NOT NULL,
  "Account_ID"     bigint NOT NULL,
  "Plot_Number"    text NOT NULL,
  "Plot_Ref"       text,
  "KVA_Load"       numeric,
  "Legacy_Plot_ID" bigint,
  "Created_At"     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plot_account_key UNIQUE ("Plot_ID", "Account_ID"),
  CONSTRAINT plot_number_per_project UNIQUE ("Project_ID", "Plot_Number"),
  FOREIGN KEY ("Project_ID", "Account_ID")
    REFERENCES "Project" ("Project_ID", "Account_ID") ON DELETE CASCADE
);

CREATE INDEX plot_project_idx ON "Plot" ("Project_ID");


-- ── The drawing ─────────────────────────────────────────────────────
--
-- Shapes follow the live Aptus360 schema so that drawings move across
-- unchanged. What is added is Account_ID and the composite keys.

CREATE TABLE "GIS_Layer" (
  "Layer_ID"   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Layer_Key"  text NOT NULL UNIQUE,
  "Label"      text NOT NULL,
  "Colour"     text DEFAULT '#64748b',
  "Sort_Order" integer NOT NULL DEFAULT 0,
  "Is_Active"  boolean NOT NULL DEFAULT true,
  "Utility_ID" bigint REFERENCES "Utility"
);

CREATE TABLE "GIS_Line_Type" (
  "Line_Type_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Type_Key"     text NOT NULL,
  "Label"        text NOT NULL,
  "Layer_Key"    text NOT NULL,
  "Colour"       text DEFAULT '#64748b',
  "Width_px"     numeric NOT NULL DEFAULT 2,
  "Dashed"       boolean NOT NULL DEFAULT false,
  "Sort_Order"   integer NOT NULL DEFAULT 0,
  "Is_Active"    boolean NOT NULL DEFAULT true,
  CONSTRAINT line_type_key_per_layer UNIQUE ("Layer_Key", "Type_Key")
);

CREATE TABLE "GIS_Surface_Type" (
  "GIS_Surface_Type_ID"     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Surface_Key"             text NOT NULL UNIQUE,
  "Label"                   text NOT NULL,
  "Reinstatement_Rate"      numeric,
  "Sort_Order"              integer NOT NULL DEFAULT 0,
  "Is_Active"               boolean NOT NULL DEFAULT true,
  "Dig_Factor"              numeric NOT NULL DEFAULT 1.0,
  "Reinstate_M2_Hr"         numeric,
  "Reinstate_Source"        text,
  "Reinstate_Sample_Size"   integer,
  "Reinstate_Setup_Minutes" integer,
  CONSTRAINT surface_reinstate_positive
    CHECK ("Reinstate_M2_Hr" IS NULL OR "Reinstate_M2_Hr" > 0),
  CONSTRAINT surface_reinstate_provenance
    CHECK ("Reinstate_Source" IS NULL OR "Reinstate_M2_Hr" IS NOT NULL),
  CONSTRAINT surface_reinstate_setup
    CHECK ("Reinstate_Setup_Minutes" IS NULL OR "Reinstate_Setup_Minutes" >= 0),
  CONSTRAINT surface_reinstate_source
    CHECK ("Reinstate_Source" IS NULL
           OR "Reinstate_Source" IN ('estimate', 'measured'))
);

CREATE TABLE "GIS_Feature" (
  "Feature_ID"   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Project_ID"   bigint NOT NULL,
  "Account_ID"   bigint NOT NULL,
  "Layer_Key"    text NOT NULL DEFAULT 'note',
  "Feature_Type" text NOT NULL,
  "Geometry"     jsonb NOT NULL,
  "Label"        text,
  "Attributes"   jsonb NOT NULL DEFAULT '{}'::jsonb,
  "Plot_ID"      bigint,
  "Created_At"   timestamptz NOT NULL DEFAULT now(),
  "Updated_At"   timestamptz NOT NULL DEFAULT now(),
  "Feature_Role" text NOT NULL DEFAULT 'shape',
  CONSTRAINT feature_account_key UNIQUE ("Feature_ID", "Account_ID"),
  CONSTRAINT "GIS_Feature_Feature_Type_check"
    CHECK ("Feature_Type" IN ('point', 'line', 'polygon')),
  -- The 25 roles the live check constraint permits, as fifteen
  -- migrations left it.
  CONSTRAINT "GIS_Feature_Feature_Role_check"
    CHECK ("Feature_Role" IN ('shape','plot','meter','poc','substation',
      'joint','source','spannode','linkbox','column','governor',
      'servicevalve','pumping','hvtt','reducer','nrs','feederpoint',
      'msdb','hdcutout','primary','ringsub','openpoint','washout',
      'sectionmark','textnote')),
  FOREIGN KEY ("Project_ID", "Account_ID")
    REFERENCES "Project" ("Project_ID", "Account_ID") ON DELETE CASCADE,
  -- Aptus360 cascades a feature away with its plot. Kept, because the
  -- behaviour is relied on — but now it cannot reach across accounts.
  FOREIGN KEY ("Plot_ID", "Account_ID")
    REFERENCES "Plot" ("Plot_ID", "Account_ID") ON DELETE CASCADE
);

CREATE INDEX gis_feature_project_idx ON "GIS_Feature" ("Project_ID");
CREATE INDEX gis_feature_plot_idx    ON "GIS_Feature" ("Plot_ID");

CREATE TABLE "GIS_Basemap" (
  "Basemap_ID"       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Project_ID"       bigint NOT NULL,
  "Account_ID"       bigint NOT NULL,
  "File_Name"        text,
  "Storage_Path"     text,
  "Image_Url"        text NOT NULL,
  "Image_Width"      integer,
  "Image_Height"     integer,
  "Metres_Per_Pixel" numeric,
  "Stated_Scale"     text,
  "Cal_Point_A"      jsonb,
  "Cal_Point_B"      jsonb,
  "Cal_Distance_M"   numeric,
  "Origin_X"         numeric NOT NULL DEFAULT 0,
  "Origin_Y"         numeric NOT NULL DEFAULT 0,
  "Rotation_Deg"     numeric NOT NULL DEFAULT 0,
  "Opacity"          numeric NOT NULL DEFAULT 0.6,
  "Locked"           boolean NOT NULL DEFAULT false,
  "Ref_Canvas_X"     numeric,
  "Ref_Canvas_Y"     numeric,
  "Ref_Easting"      numeric,
  "Ref_Northing"     numeric,
  "Created_At"       timestamptz NOT NULL DEFAULT now(),
  "Updated_At"       timestamptz NOT NULL DEFAULT now(),
  "Source_Kind"      text NOT NULL DEFAULT 'image',
  "Pdf_Page"         integer NOT NULL DEFAULT 1,
  "Page_Width"       numeric,
  "Page_Height"      numeric,
  CONSTRAINT "GIS_Basemap_Opacity_check" CHECK ("Opacity" >= 0 AND "Opacity" <= 1),
  CONSTRAINT "GIS_Basemap_Source_Kind_check" CHECK ("Source_Kind" IN ('image','pdf')),
  FOREIGN KEY ("Project_ID", "Account_ID")
    REFERENCES "Project" ("Project_ID", "Account_ID") ON DELETE CASCADE
);

COMMENT ON COLUMN "GIS_Basemap"."Metres_Per_Pixel" IS
  'Metres per unit of the source at scale 1 — image pixels, or PDF points.';

CREATE TABLE "GIS_Source" (
  "Source_ID"   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Project_ID"  bigint NOT NULL,
  "Account_ID"  bigint NOT NULL,
  "Feature_ID"  bigint,
  "Source_Type" text NOT NULL DEFAULT 'Substation',
  "Label"       text,
  "Ways"        integer NOT NULL DEFAULT 4,
  "Created_At"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GIS_Source_Source_Type_check"
    CHECK ("Source_Type" IN ('Substation','Feeder Pillar','POC','Existing Main')),
  FOREIGN KEY ("Project_ID", "Account_ID")
    REFERENCES "Project" ("Project_ID", "Account_ID") ON DELETE CASCADE,
  FOREIGN KEY ("Feature_ID", "Account_ID")
    REFERENCES "GIS_Feature" ("Feature_ID", "Account_ID") ON DELETE CASCADE
);

-- Drawing styles. Per account, because how a customer draws their
-- schemes is theirs.
CREATE TABLE "GIS_Style" (
  "GIS_Style_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Account_ID"   bigint NOT NULL REFERENCES "Account" ON DELETE CASCADE,
  "Name"         text NOT NULL,
  "Layer_Key"    text,
  "Feature_Role" text,
  "Utility_ID"   bigint REFERENCES "Utility",
  "Rules"        jsonb NOT NULL DEFAULT '{}'::jsonb,
  "Sort_Order"   integer NOT NULL DEFAULT 0,
  "Is_Active"    boolean NOT NULL DEFAULT true,
  "Created_At"   timestamptz NOT NULL DEFAULT now(),
  "Updated_At"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX gis_style_account_idx ON "GIS_Style" ("Account_ID");

CREATE TABLE "GIS_Overlay" (
  "Overlay_ID"  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Project_ID"  bigint NOT NULL,
  "Account_ID"  bigint NOT NULL,
  "Name"        text,
  "Kind"        text NOT NULL DEFAULT 'os',
  "Geometry"    jsonb NOT NULL DEFAULT '[]'::jsonb,
  "Is_Visible"  boolean NOT NULL DEFAULT true,
  "Created_By"  uuid,
  "Created_At"  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY ("Project_ID", "Account_ID")
    REFERENCES "Project" ("Project_ID", "Account_ID") ON DELETE CASCADE
);

CREATE TABLE "GIS_Grid_Link" (
  "Project_ID"  bigint PRIMARY KEY,
  "Account_ID"  bigint NOT NULL,
  "Transform"   jsonb NOT NULL DEFAULT '{}'::jsonb,
  "Updated_By"  uuid,
  "Updated_At"  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY ("Project_ID", "Account_ID")
    REFERENCES "Project" ("Project_ID", "Account_ID") ON DELETE CASCADE
);

CREATE TABLE "GIS_Undo" (
  "Undo_ID"    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Project_ID" bigint NOT NULL,
  "Account_ID" bigint NOT NULL,
  "Seq"        bigint NOT NULL,
  "User_ID"    uuid,
  "Action"     text NOT NULL,
  "Payload"    jsonb NOT NULL DEFAULT '{}'::jsonb,
  "Created_At" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT undo_seq_per_project UNIQUE ("Project_ID", "Seq"),
  FOREIGN KEY ("Project_ID", "Account_ID")
    REFERENCES "Project" ("Project_ID", "Account_ID") ON DELETE CASCADE
);


-- ── Keeping Updated_At honest ───────────────────────────────────────

CREATE FUNCTION set_updated_at() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN NEW."Updated_At" = now(); RETURN NEW; END;
$$;

CREATE TRIGGER project_updated_at BEFORE UPDATE ON "Project"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER gis_feature_updated_at BEFORE UPDATE ON "GIS_Feature"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER gis_basemap_updated_at BEFORE UPDATE ON "GIS_Basemap"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER gis_style_updated_at BEFORE UPDATE ON "GIS_Style"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ════════════════════════════════════════════════════════════════════
--  Row-level security
--
--  Aptus360 has none: every table has RLS enabled with no policy
--  behind it, and every endpoint runs on the service key, so the
--  database cannot tell one caller from another. For one customer that
--  is defensible. For several it is not — one missed check in one
--  function returns another company's drawings and nothing underneath
--  stops it.
--
--  So here the database does the filtering, and a bug in a function is
--  a bug rather than a breach.
--
--  A note on the service key: it bypasses RLS entirely, by design.
--  These policies protect against a mistake in application code, not
--  against code that deliberately uses the service key. Functions that
--  act for a signed-in person should use their token, not the service
--  key — that is what makes any of this worth having.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE "Account"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account_Member"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Utility"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GIS_Layer"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GIS_Line_Type"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GIS_Surface_Type" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project_Utility"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Plot"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GIS_Feature"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GIS_Basemap"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GIS_Source"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GIS_Style"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GIS_Overlay"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GIS_Grid_Link"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GIS_Undo"         ENABLE ROW LEVEL SECURITY;

-- Your own account, and your own membership of it.
CREATE POLICY account_read ON "Account" FOR SELECT
  USING ("Account_ID" = ANY (account_ids()));
CREATE POLICY account_member_read ON "Account_Member" FOR SELECT
  USING ("Account_ID" = ANY (account_ids()));

-- Shared catalogues: everyone signed in reads them, nobody writes them
-- through the API. No FOR ALL policy, so writes have no policy and are
-- refused.
CREATE POLICY utility_read      ON "Utility"          FOR SELECT USING (true);
CREATE POLICY layer_read        ON "GIS_Layer"        FOR SELECT USING (true);
CREATE POLICY line_type_read    ON "GIS_Line_Type"    FOR SELECT USING (true);
CREATE POLICY surface_type_read ON "GIS_Surface_Type" FOR SELECT USING (true);

/* Everything the account owns: read what is yours, write what is yours
   and you have the role for.

   WITH CHECK as well as USING on the write policies, and this is the
   half that is easy to forget: USING decides which rows you may touch,
   WITH CHECK decides what you may leave behind. Without it you could
   UPDATE your own feature and set its Account_ID to somebody else's —
   handing them a row, or hiding one from yourself. */
CREATE POLICY project_read  ON "Project" FOR SELECT
  USING ("Account_ID" = ANY (account_ids()));
CREATE POLICY project_write ON "Project" FOR ALL
  USING ("Account_ID" = ANY (account_ids_writable()))
  WITH CHECK ("Account_ID" = ANY (account_ids_writable()));

CREATE POLICY project_utility_read ON "Project_Utility" FOR SELECT
  USING ("Account_ID" = ANY (account_ids()));
CREATE POLICY project_utility_write ON "Project_Utility" FOR ALL
  USING ("Account_ID" = ANY (account_ids_writable()))
  WITH CHECK ("Account_ID" = ANY (account_ids_writable()));

CREATE POLICY plot_read ON "Plot" FOR SELECT
  USING ("Account_ID" = ANY (account_ids()));
CREATE POLICY plot_write ON "Plot" FOR ALL
  USING ("Account_ID" = ANY (account_ids_writable()))
  WITH CHECK ("Account_ID" = ANY (account_ids_writable()));

CREATE POLICY feature_read ON "GIS_Feature" FOR SELECT
  USING ("Account_ID" = ANY (account_ids()));
CREATE POLICY feature_write ON "GIS_Feature" FOR ALL
  USING ("Account_ID" = ANY (account_ids_writable()))
  WITH CHECK ("Account_ID" = ANY (account_ids_writable()));

CREATE POLICY basemap_read ON "GIS_Basemap" FOR SELECT
  USING ("Account_ID" = ANY (account_ids()));
CREATE POLICY basemap_write ON "GIS_Basemap" FOR ALL
  USING ("Account_ID" = ANY (account_ids_writable()))
  WITH CHECK ("Account_ID" = ANY (account_ids_writable()));

CREATE POLICY source_read ON "GIS_Source" FOR SELECT
  USING ("Account_ID" = ANY (account_ids()));
CREATE POLICY source_write ON "GIS_Source" FOR ALL
  USING ("Account_ID" = ANY (account_ids_writable()))
  WITH CHECK ("Account_ID" = ANY (account_ids_writable()));

CREATE POLICY style_read ON "GIS_Style" FOR SELECT
  USING ("Account_ID" = ANY (account_ids()));
CREATE POLICY style_write ON "GIS_Style" FOR ALL
  USING ("Account_ID" = ANY (account_ids_writable()))
  WITH CHECK ("Account_ID" = ANY (account_ids_writable()));

CREATE POLICY overlay_read ON "GIS_Overlay" FOR SELECT
  USING ("Account_ID" = ANY (account_ids()));
CREATE POLICY overlay_write ON "GIS_Overlay" FOR ALL
  USING ("Account_ID" = ANY (account_ids_writable()))
  WITH CHECK ("Account_ID" = ANY (account_ids_writable()));

CREATE POLICY grid_link_read ON "GIS_Grid_Link" FOR SELECT
  USING ("Account_ID" = ANY (account_ids()));
CREATE POLICY grid_link_write ON "GIS_Grid_Link" FOR ALL
  USING ("Account_ID" = ANY (account_ids_writable()))
  WITH CHECK ("Account_ID" = ANY (account_ids_writable()));

CREATE POLICY undo_read ON "GIS_Undo" FOR SELECT
  USING ("Account_ID" = ANY (account_ids()));
CREATE POLICY undo_write ON "GIS_Undo" FOR ALL
  USING ("Account_ID" = ANY (account_ids_writable()))
  WITH CHECK ("Account_ID" = ANY (account_ids_writable()));
