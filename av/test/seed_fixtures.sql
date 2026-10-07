-- Fixtures: the organisations and the 0258 map as they stand live, and
-- projects for most but deliberately NOT all of the export's contracts,
-- so the "contract not found" path is exercised rather than assumed.

-- The 21 organisations the 0258 map points at, under the names 0258 used.
INSERT INTO "Organisation" ("Name") VALUES
  ('GTC'),('Independent Water Networks'),('Last Mile'),('MUA'),
  ('Welsh Water'),('ES Pipelines'),('United Utilities'),('Icosa Water'),
  ('ESP Water'),('ESP Electricity'),('Cadent'),('Northern Gas Networks'),
  ('Dee Valley Water'),('South Staffordshire Water'),('Yorkshire Water'),
  ('Northern Powergrid'),('Northumbrian Water'),('Western Power Distribution');

-- The map 0258 built, keyed on the legacy IDNO id. Five legacy ids share
-- MUA, which is the point of mapping by name.
INSERT INTO "Legacy_Lookup_Map" ("Kind","Legacy_ID","New_ID","Note")
SELECT 'idno', v.id, o."Organisation_ID", 'from 0258'
  FROM (VALUES
    ('4','GTC'),('6','Independent Water Networks'),('7','Last Mile'),
    ('8','MUA'),('15','Welsh Water'),('18','MUA'),('19','ES Pipelines'),
    ('21','United Utilities'),('22','Icosa Water'),('24','ESP Water'),
    ('31','ESP Electricity'),('32','Cadent'),('33','Northern Gas Networks'),
    ('34','Dee Valley Water'),('37','MUA'),('38','South Staffordshire Water'),
    ('42','Yorkshire Water'),('43','MUA'),('44','Northern Powergrid'),
    ('46','Northumbrian Water'),('47','Western Power Distribution')
  ) AS v(id,nm)
  JOIN "Organisation" o ON o."Name" = v.nm;

-- Projects for all but 68 of the export's contracts. The 68 left out are
-- the ones whose agreements must be reported rather than imported.
INSERT INTO "Project" ("Legacy_Contract_ID","AP_Number")
SELECT c, 'AP' || c
  FROM (SELECT DISTINCT "Contract_ID"::bigint AS c FROM av_src
         ORDER BY 1 OFFSET 68) s;

-- A project that already carries an agreement, to prove the import does
-- not trample one and does not fall over on the unique index.
INSERT INTO "AV_Agreement" ("Project_ID","AV_Agreement_Type_ID","AV_Value","Notes")
SELECT p."Project_ID", 6, 999.99, 'pre-existing, must survive untouched'
  FROM "Project" p
 WHERE p."Legacy_Contract_ID" = (
   SELECT "Contract_ID"::bigint FROM av_src
    WHERE "AV_Agreement_Type_ID" = '1' ORDER BY 1 OFFSET 200 LIMIT 1)
 LIMIT 1;
