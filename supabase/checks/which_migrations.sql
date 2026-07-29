-- ════════════════════════════════════════════════════════════════
-- Which migrations are in?
--
-- There is no migration runner, so a migration exists only once it has
-- been pasted and run — and with sixty-odd of them, "did that one go
-- through?" is the first question whenever something looks unchanged.
--
-- Each row tests for one thing that migration creates. Safe: reads
-- catalogue tables only, changes nothing.
--
-- Expect every row to say yes. The first no is where to start.
-- ════════════════════════════════════════════════════════════════

SELECT * FROM (VALUES
  ('0049 org branch dropdown refresh',
   to_regprocedure('refresh_org_branch_dropdowns()') IS NOT NULL),

  ('0050 trench line types',
   EXISTS (SELECT 1 FROM "GIS_Line_Type" WHERE "Type_Key" = 'trench_main')),

  ('0051 GIS styles',
   to_regclass('"GIS_Style"') IS NOT NULL),

  ('0052 surface types and site',
   to_regclass('"GIS_Surface_Type"') IS NOT NULL),

  ('0054 unmade surface',
   EXISTS (SELECT 1 FROM "GIS_Surface_Type" WHERE "Surface_Key" = 'unmade')),

  ('0056 bill of materials',
   to_regprocedure('gis_bom(bigint)') IS NOT NULL),

  ('0057 POC, substation, circuits',
   (SELECT pg_get_constraintdef(oid) LIKE '%substation%'
      FROM pg_constraint WHERE conname = 'GIS_Feature_Feature_Role_check')),

  ('0059 span nodes and house type',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_name = 'GIS_Feature' AND column_name = 'Feature_Role')
   AND (SELECT pg_get_constraintdef(oid) LIKE '%spannode%'
          FROM pg_constraint WHERE conname = 'GIS_Feature_Feature_Role_check')),

  ('0060 AV register',
   to_regclass('"AV_Register"') IS NOT NULL),

  ('0061 AV invoice detail',
   to_regclass('"AV_Invoice_Detail"') IS NOT NULL),

  ('0062 org VAT and agreement types',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_name = 'Organisation' AND column_name = 'VAT_Registered')),

  ('0063 VAT rate history',
   to_regclass('"VAT_Rate"') IS NOT NULL),

  ('0064 service card gate',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_name = 'AV_Register' AND column_name = 'can_invoice')),

  ('0065 visit outcomes',
   EXISTS (SELECT 1 FROM "Visit_Outcome" WHERE "Visit_Outcome" = 'Dead Jointed')),

  ('0066 teams, photos, connection detail',
   to_regclass('"Plot_Utility_Photo"') IS NOT NULL),

  ('0067 AV agreement fields',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_name = 'AV_Agreement' AND column_name = 'Initial_AV_Fee')),

  ('0068 agreement operator',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_name = 'AV_Agreement_Detail' AND column_name = 'idno_vat_rate')),

  ('0069 operator utilities',
   to_regclass('"Operator_Utility"') IS NOT NULL),

  ('0070 agreement operator organisation',
   EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_name = 'AV_Agreement' AND column_name = 'IDNO_Organisation_ID'))
) AS t(migration, applied)
ORDER BY migration;


-- ── If 0070 says no ─────────────────────────────────────────────
-- Run it, then this should list ESP Water and every other water
-- operator the agreement picker will now offer:
--   SELECT o."Name", o.role_keys
--     FROM "Operator_Utility" o
--     JOIN "Utility" u ON u."Utility_ID" = ANY (o.utility_ids)
--    WHERE LOWER(u."Utility") = 'water'
--    ORDER BY o."Name";
