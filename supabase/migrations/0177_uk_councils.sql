-- ════════════════════════════════════════════════════════════════
-- 0177 — the UK's councils, in the organisation register
--
-- A project names the town council and the county council it sits
-- under. Both dropdowns were empty because nothing had ever been loaded
-- into them.
--
-- ── Why they go in Organisation ──
--
-- Because that is where every other body already is: customers, DNOs,
-- gas transporters, water undertakers, fire authorities. A council is
-- an organisation the business deals with, and a second register for
-- one kind of organisation is a second place to look, a second admin
-- screen, and a second set of contact details to keep.
--
-- ── One role, eleven kinds ──
--
-- Local Authority already exists as a type (7). The eleven kinds become
-- subtypes underneath it, the same way Subcontractor holds trades.
--
-- Eleven separate types would have made "show me the local authorities"
-- impossible to ask — the Organisations screen filters by type, and
-- that is the question people actually ask. The kind is still recorded
-- on every one, and the project dropdowns read it.
--
-- ── What a "town council" is here ──
--
-- The second tier: district, borough and city councils. Not the
-- parish-level town councils, of which there are some eleven thousand —
-- for a utilities project the second-tier authority is the one that
-- matters for planning, highways and street works.
--
-- ── It goes stale, and says so ──
--
-- 184 of these 382 have a confirmed abolition date: 12 on 1 April 2027,
-- 172 on 1 April 2028. England is mid-reorganisation. The date is
-- carried so a council can drop out of the dropdowns when it goes,
-- without breaking projects that already name it — and because it is in
-- the source today and cannot be reconstructed later.
--
-- ── Keyed on the GSS code ──
--
-- E10000016, not the name. Names change: Colchester Borough became
-- Colchester City in 2022. Reconciling against a later file means
-- matching on something that does not move.
-- ════════════════════════════════════════════════════════════════

-- ── Columns for what a council is ───────────────────────────────

ALTER TABLE "Organisation"
  -- The ONS code. Null for everything that is not a council, which is
  -- most of the register.
  ADD COLUMN IF NOT EXISTS "GSS_Code" text,
  -- England, Scotland, Wales, Northern Ireland. Worth holding because
  -- the tiers differ by nation and a Scottish council has no county
  -- above it.
  ADD COLUMN IF NOT EXISTS "Nation" text,
  -- When it stops existing, where that is already decided.
  ADD COLUMN IF NOT EXISTS "Abolition_Date" date;

CREATE UNIQUE INDEX IF NOT EXISTS organisation_gss
  ON "Organisation" ("GSS_Code") WHERE "GSS_Code" IS NOT NULL;

COMMENT ON COLUMN "Organisation"."Abolition_Date" IS 'When this body ceases to exist, where that is already legislated. England is mid-reorganisation: 184 councils have a date. A project already naming one keeps it; the dropdowns stop offering it.';


-- ── Local Authority gains its kinds ─────────────────────────────

UPDATE "Organisation_Type"
   SET "Has_Subtypes" = true
 WHERE "Type_Key" = 'local_authority';

INSERT INTO "Organisation_Subtype"
  ("Organisation_Type_ID", "Subtype_Key", "Label", "Sort_Order")
SELECT t."Organisation_Type_ID", v.k, v.l, v.o
  FROM "Organisation_Type" t
  CROSS JOIN (VALUES
  ('county_council', 'County Council', 10),
  ('district_council', 'District Council', 20),
  ('borough_council', 'Borough Council', 30),
  ('city_council', 'City Council', 40),
  ('unitary', 'Unitary Authority', 50),
  ('met_borough', 'Metropolitan Borough', 60),
  ('london_borough', 'London Borough', 70),
  ('council_area', 'Council Area (Scotland)', 80),
  ('principal_council', 'Principal Council (Wales)', 90),
  ('ni_district', 'District Council (NI)', 100),
  ('sui_generis', 'Sui Generis Authority', 110)
  ) AS v(k, l, o)
 WHERE t."Type_Key" = 'local_authority'
   AND NOT EXISTS (
     SELECT 1 FROM "Organisation_Subtype" s
      WHERE s."Organisation_Type_ID" = t."Organisation_Type_ID"
        AND s."Subtype_Key" = v.k);


-- ── The councils ────────────────────────────────────────────────
--
-- Matched on the GSS code, so running this twice changes nothing and a
-- council loaded by hand beforehand is not duplicated.

CREATE TEMP TABLE _councils (
  gss text, name text, subtype text, nation text, abolition date
) ON COMMIT DROP;

INSERT INTO _councils (gss, name, subtype, nation, abolition) VALUES
('S12000033', 'Aberdeen City Council', 'council_area', 'Scotland', NULL),
  ('S12000034', 'Aberdeenshire Council', 'council_area', 'Scotland', NULL),
  ('E07000223', 'Adur District Council', 'district_council', 'England', NULL),
  ('E07000032', 'Amber Valley Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('S12000041', 'Angus Council', 'council_area', 'Scotland', NULL),
  ('N09000001', 'Antrim and Newtownabbey Borough Council', 'ni_district', 'Northern Ireland', NULL),
  ('N09000011', 'Ards and North Down Borough Council', 'ni_district', 'Northern Ireland', NULL),
  ('S12000035', 'Argyll and Bute Council', 'council_area', 'Scotland', NULL),
  ('N09000002', 'Armagh City, Banbridge and Craigavon Borough Council', 'ni_district', 'Northern Ireland', NULL),
  ('E07000224', 'Arun District Council', 'district_council', 'England', NULL),
  ('E07000170', 'Ashfield District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000105', 'Ashford Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000200', 'Babergh District Council', 'district_council', 'England', '2028-04-01'),
  ('E08000038', 'Barnsley Metropolitan Borough Council', 'met_borough', 'England', NULL),
  ('E07000066', 'Basildon Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000084', 'Basingstoke and Deane Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000171', 'Bassetlaw District Council', 'district_council', 'England', '2028-04-01'),
  ('E06000022', 'Bath and North East Somerset Council', 'unitary', 'England', NULL),
  ('E06000055', 'Bedford Borough Council', 'unitary', 'England', NULL),
  ('N09000003', 'Belfast City Council', 'ni_district', 'Northern Ireland', NULL),
  ('E08000025', 'Birmingham City Council', 'met_borough', 'England', NULL),
  ('E07000129', 'Blaby District Council', 'district_council', 'England', '2028-04-01'),
  ('E06000008', 'Blackburn with Darwen Borough Council', 'unitary', 'England', '2028-04-01'),
  ('E06000009', 'Blackpool Council', 'unitary', 'England', '2028-04-01'),
  ('W06000019', 'Blaenau Gwent County Borough Council', 'principal_council', 'Wales', NULL),
  ('E07000033', 'Bolsover District Council', 'district_council', 'England', '2028-04-01'),
  ('E08000001', 'Bolton Metropolitan Borough Council', 'met_borough', 'England', NULL),
  ('E07000146', 'Borough Council of King''s Lynn and West Norfolk', 'borough_council', 'England', '2028-04-01'),
  ('E07000136', 'Boston Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E06000058', 'Bournemouth, Christchurch and Poole Council', 'unitary', 'England', NULL),
  ('E06000036', 'Bracknell Forest Council', 'unitary', 'England', NULL),
  ('E07000067', 'Braintree District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000143', 'Breckland District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000068', 'Brentwood Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('W06000013', 'Bridgend County Borough Council', 'principal_council', 'Wales', NULL),
  ('E06000043', 'Brighton and Hove City Council', 'unitary', 'England', NULL),
  ('E06000023', 'Bristol City Council', 'unitary', 'England', NULL),
  ('E07000144', 'Broadland District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000234', 'Bromsgrove District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000095', 'Broxbourne Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000172', 'Broxtowe Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E06000060', 'Buckinghamshire Council', 'unitary', 'England', NULL),
  ('E07000117', 'Burnley Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E08000002', 'Bury Metropolitan Borough Council', 'met_borough', 'England', NULL),
  ('W06000018', 'Caerphilly County Borough Council', 'principal_council', 'Wales', NULL),
  ('E08000033', 'Calderdale Metropolitan Borough Council', 'met_borough', 'England', NULL),
  ('E07000008', 'Cambridge City Council', 'city_council', 'England', NULL),
  ('E10000003', 'Cambridgeshire County Council', 'county_council', 'England', NULL),
  ('E07000192', 'Cannock Chase District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000106', 'Canterbury City Council', 'city_council', 'England', '2028-04-01'),
  ('W06000015', 'Cardiff Council', 'principal_council', 'Wales', NULL),
  ('W06000010', 'Carmarthenshire County Council', 'principal_council', 'Wales', NULL),
  ('E07000069', 'Castle Point Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('N09000004', 'Causeway Coast and Glens Borough Council', 'ni_district', 'Northern Ireland', NULL),
  ('E06000056', 'Central Bedfordshire Council', 'unitary', 'England', NULL),
  ('W06000008', 'Ceredigion County Council', 'principal_council', 'Wales', NULL),
  ('E07000130', 'Charnwood Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000070', 'Chelmsford City Council', 'city_council', 'England', '2028-04-01'),
  ('E07000078', 'Cheltenham Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000177', 'Cherwell District Council', 'district_council', 'England', '2028-04-01'),
  ('E06000049', 'Cheshire East Council', 'unitary', 'England', NULL),
  ('E06000050', 'Cheshire West and Chester Council', 'unitary', 'England', NULL),
  ('E07000034', 'Chesterfield Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000225', 'Chichester District Council', 'district_council', 'England', NULL),
  ('E07000118', 'Chorley Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('W06000011', 'City and County of Swansea Council', 'principal_council', 'Wales', NULL),
  ('E08000032', 'City of Bradford Metropolitan District Council', 'met_borough', 'England', NULL),
  ('E08000017', 'City of Doncaster Council', 'met_borough', 'England', NULL),
  ('S12000036', 'City of Edinburgh Council', 'council_area', 'Scotland', NULL),
  ('E07000138', 'City of Lincoln Council', 'city_council', 'England', '2028-04-01'),
  ('E09000001', 'City of London Corporation', 'sui_generis', 'England', NULL),
  ('E08000036', 'City of Wakefield Metropolitan District Council', 'met_borough', 'England', NULL),
  ('E08000031', 'City of Wolverhampton Council', 'met_borough', 'England', NULL),
  ('E06000014', 'City of York Council', 'unitary', 'England', NULL),
  ('S12000005', 'Clackmannanshire Council', 'council_area', 'Scotland', NULL),
  ('E07000071', 'Colchester City Council', 'city_council', 'England', '2028-04-01'),
  ('S12000013', 'Comhairle nan Eilean Siar', 'council_area', 'Scotland', NULL),
  ('W06000003', 'Conwy County Borough Council', 'principal_council', 'Wales', NULL),
  ('E06000052', 'Cornwall Council', 'unitary', 'England', NULL),
  ('E07000079', 'Cotswold District Council', 'district_council', 'England', '2028-04-01'),
  ('E06000053', 'Council of the Isles of Scilly', 'sui_generis', 'England', NULL),
  ('E08000026', 'Coventry City Council', 'met_borough', 'England', NULL),
  ('E07000226', 'Crawley Borough Council', 'borough_council', 'England', NULL),
  ('E06000063', 'Cumberland Council', 'unitary', 'England', NULL),
  ('E07000096', 'Dacorum Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E06000005', 'Darlington Borough Council', 'unitary', 'England', NULL),
  ('E07000107', 'Dartford Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('W06000004', 'Denbighshire County Council', 'principal_council', 'Wales', NULL),
  ('E06000015', 'Derby City Council', 'unitary', 'England', '2028-04-01'),
  ('E10000007', 'Derbyshire County Council', 'county_council', 'England', '2028-04-01'),
  ('E07000035', 'Derbyshire Dales District Council', 'district_council', 'England', '2028-04-01'),
  ('N09000005', 'Derry City and Strabane District Council', 'ni_district', 'Northern Ireland', NULL),
  ('E10000008', 'Devon County Council', 'county_council', 'England', '2028-04-01'),
  ('E06000059', 'Dorset Council', 'unitary', 'England', NULL),
  ('E07000108', 'Dover District Council', 'district_council', 'England', '2028-04-01'),
  ('E08000027', 'Dudley Metropolitan Borough Council', 'met_borough', 'England', NULL),
  ('S12000006', 'Dumfries and Galloway Council', 'council_area', 'Scotland', NULL),
  ('S12000042', 'Dundee City Council', 'council_area', 'Scotland', NULL),
  ('E06000047', 'Durham County Council', 'unitary', 'England', NULL),
  ('S12000008', 'East Ayrshire Council', 'council_area', 'Scotland', NULL),
  ('E07000009', 'East Cambridgeshire District Council', 'district_council', 'England', NULL),
  ('E07000040', 'East Devon District Council', 'district_council', 'England', '2028-04-01'),
  ('S12000045', 'East Dunbartonshire Council', 'council_area', 'Scotland', NULL),
  ('E07000085', 'East Hampshire District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000242', 'East Hertfordshire District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000137', 'East Lindsey District Council', 'district_council', 'England', '2028-04-01'),
  ('S12000010', 'East Lothian Council', 'council_area', 'Scotland', NULL),
  ('S12000011', 'East Renfrewshire Council', 'council_area', 'Scotland', NULL),
  ('E06000011', 'East Riding of Yorkshire Council', 'unitary', 'England', NULL),
  ('E07000193', 'East Staffordshire Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000244', 'East Suffolk Council', 'district_council', 'England', '2028-04-01'),
  ('E10000011', 'East Sussex County Council', 'county_council', 'England', '2028-04-01'),
  ('E07000061', 'Eastbourne Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000086', 'Eastleigh Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000207', 'Elmbridge Borough Council', 'borough_council', 'England', '2027-04-01'),
  ('E07000072', 'Epping Forest District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000208', 'Epsom and Ewell Borough Council', 'borough_council', 'England', '2027-04-01'),
  ('E07000036', 'Erewash Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E10000012', 'Essex County Council', 'county_council', 'England', '2028-04-01'),
  ('E07000041', 'Exeter City Council', 'city_council', 'England', '2028-04-01'),
  ('S12000014', 'Falkirk Council', 'council_area', 'Scotland', NULL),
  ('E07000087', 'Fareham Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000010', 'Fenland District Council', 'district_council', 'England', NULL),
  ('N09000006', 'Fermanagh and Omagh District Council', 'ni_district', 'Northern Ireland', NULL),
  ('S12000047', 'Fife Council', 'council_area', 'Scotland', NULL),
  ('W06000005', 'Flintshire County Council', 'principal_council', 'Wales', NULL),
  ('E07000112', 'Folkestone and Hythe District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000080', 'Forest of Dean District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000119', 'Fylde Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E08000037', 'Gateshead Metropolitan Borough Council', 'met_borough', 'England', NULL),
  ('E07000173', 'Gedling Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('S12000049', 'Glasgow City Council', 'council_area', 'Scotland', NULL),
  ('E07000081', 'Gloucester City Council', 'city_council', 'England', '2028-04-01'),
  ('E10000013', 'Gloucestershire County Council', 'county_council', 'England', '2028-04-01'),
  ('E07000088', 'Gosport Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000109', 'Gravesham Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000145', 'Great Yarmouth Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000209', 'Guildford Borough Council', 'borough_council', 'England', '2027-04-01'),
  ('W06000002', 'Gwynedd Council', 'principal_council', 'Wales', NULL),
  ('E06000006', 'Halton Borough Council', 'unitary', 'England', NULL),
  ('E10000014', 'Hampshire County Council', 'county_council', 'England', '2028-04-01'),
  ('E07000131', 'Harborough District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000073', 'Harlow District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000089', 'Hart District Council', 'district_council', 'England', '2028-04-01'),
  ('E06000001', 'Hartlepool Borough Council', 'unitary', 'England', NULL),
  ('E07000062', 'Hastings Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000090', 'Havant Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E06000019', 'Herefordshire Council', 'unitary', 'England', NULL),
  ('E10000015', 'Hertfordshire County Council', 'county_council', 'England', '2028-04-01'),
  ('E07000098', 'Hertsmere Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000037', 'High Peak Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000132', 'Hinckley and Bosworth Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000227', 'Horsham District Council', 'district_council', 'England', NULL),
  ('E07000011', 'Huntingdonshire District Council', 'district_council', 'England', NULL),
  ('E07000120', 'Hyndburn Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('S12000018', 'Inverclyde Council', 'council_area', 'Scotland', NULL),
  ('E07000202', 'Ipswich Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('W06000001', 'Isle of Anglesey County Council', 'principal_council', 'Wales', NULL),
  ('E06000046', 'Isle of Wight Council', 'unitary', 'England', NULL),
  ('E10000016', 'Kent County Council', 'county_council', 'England', '2028-04-01'),
  ('E06000010', 'Kingston upon Hull City Council', 'unitary', 'England', NULL),
  ('E08000034', 'Kirklees Council', 'met_borough', 'England', NULL),
  ('E08000011', 'Knowsley Metropolitan Borough Council', 'met_borough', 'England', NULL),
  ('E10000017', 'Lancashire County Council', 'county_council', 'England', '2028-04-01'),
  ('E07000121', 'Lancaster City Council', 'city_council', 'England', '2028-04-01'),
  ('E08000035', 'Leeds City Council', 'met_borough', 'England', NULL),
  ('E06000016', 'Leicester City Council', 'unitary', 'England', '2028-04-01'),
  ('E10000018', 'Leicestershire County Council', 'county_council', 'England', '2028-04-01'),
  ('E07000063', 'Lewes District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000194', 'Lichfield District Council', 'district_council', 'England', '2028-04-01'),
  ('E10000019', 'Lincolnshire County Council', 'county_council', 'England', '2028-04-01'),
  ('N09000007', 'Lisburn and Castlereagh City Council', 'ni_district', 'Northern Ireland', NULL),
  ('E08000012', 'Liverpool City Council', 'met_borough', 'England', NULL),
  ('E09000002', 'London Borough of Barking and Dagenham', 'london_borough', 'England', NULL),
  ('E09000003', 'London Borough of Barnet', 'london_borough', 'England', NULL),
  ('E09000004', 'London Borough of Bexley', 'london_borough', 'England', NULL),
  ('E09000005', 'London Borough of Brent', 'london_borough', 'England', NULL),
  ('E09000006', 'London Borough of Bromley', 'london_borough', 'England', NULL),
  ('E09000007', 'London Borough of Camden', 'london_borough', 'England', NULL),
  ('E09000008', 'London Borough of Croydon', 'london_borough', 'England', NULL),
  ('E09000009', 'London Borough of Ealing', 'london_borough', 'England', NULL),
  ('E09000010', 'London Borough of Enfield', 'london_borough', 'England', NULL),
  ('E09000012', 'London Borough of Hackney', 'london_borough', 'England', NULL),
  ('E09000013', 'London Borough of Hammersmith and Fulham', 'london_borough', 'England', NULL),
  ('E09000014', 'London Borough of Haringey', 'london_borough', 'England', NULL),
  ('E09000015', 'London Borough of Harrow', 'london_borough', 'England', NULL),
  ('E09000016', 'London Borough of Havering', 'london_borough', 'England', NULL),
  ('E09000017', 'London Borough of Hillingdon', 'london_borough', 'England', NULL),
  ('E09000018', 'London Borough of Hounslow', 'london_borough', 'England', NULL),
  ('E09000019', 'London Borough of Islington', 'london_borough', 'England', NULL),
  ('E09000022', 'London Borough of Lambeth', 'london_borough', 'England', NULL),
  ('E09000023', 'London Borough of Lewisham', 'london_borough', 'England', NULL),
  ('E09000024', 'London Borough of Merton', 'london_borough', 'England', NULL),
  ('E09000025', 'London Borough of Newham', 'london_borough', 'England', NULL),
  ('E09000026', 'London Borough of Redbridge', 'london_borough', 'England', NULL),
  ('E09000027', 'London Borough of Richmond upon Thames', 'london_borough', 'England', NULL),
  ('E09000028', 'London Borough of Southwark', 'london_borough', 'England', NULL),
  ('E09000029', 'London Borough of Sutton', 'london_borough', 'England', NULL),
  ('E09000030', 'London Borough of Tower Hamlets', 'london_borough', 'England', NULL),
  ('E09000031', 'London Borough of Waltham Forest', 'london_borough', 'England', NULL),
  ('E09000032', 'London Borough of Wandsworth', 'london_borough', 'England', NULL),
  ('E06000032', 'Luton Borough Council', 'unitary', 'England', NULL),
  ('E07000110', 'Maidstone Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000074', 'Maldon District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000235', 'Malvern Hills District Council', 'district_council', 'England', '2028-04-01'),
  ('E08000003', 'Manchester City Council', 'met_borough', 'England', NULL),
  ('E07000174', 'Mansfield District Council', 'district_council', 'England', '2028-04-01'),
  ('E06000035', 'Medway Council', 'unitary', 'England', '2028-04-01'),
  ('E07000133', 'Melton Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('W06000024', 'Merthyr Tydfil County Borough Council', 'principal_council', 'Wales', NULL),
  ('E07000042', 'Mid Devon District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000203', 'Mid Suffolk District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000228', 'Mid Sussex District Council', 'district_council', 'England', NULL),
  ('N09000009', 'Mid Ulster District Council', 'ni_district', 'Northern Ireland', NULL),
  ('N09000008', 'Mid and East Antrim Borough Council', 'ni_district', 'Northern Ireland', NULL),
  ('E06000002', 'Middlesbrough Council', 'unitary', 'England', NULL),
  ('S12000019', 'Midlothian Council', 'council_area', 'Scotland', NULL),
  ('E06000042', 'Milton Keynes City Council', 'unitary', 'England', NULL),
  ('E07000210', 'Mole Valley District Council', 'district_council', 'England', '2027-04-01'),
  ('W06000021', 'Monmouthshire County Council', 'principal_council', 'Wales', NULL),
  ('W06000012', 'Neath Port Talbot County Borough Council', 'principal_council', 'Wales', NULL),
  ('E07000091', 'New Forest District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000175', 'Newark and Sherwood District Council', 'district_council', 'England', '2028-04-01'),
  ('E08000021', 'Newcastle City Council', 'met_borough', 'England', NULL),
  ('E07000195', 'Newcastle-under-Lyme Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('W06000022', 'Newport City Council', 'principal_council', 'Wales', NULL),
  ('N09000010', 'Newry, Mourne and Down District Council', 'ni_district', 'Northern Ireland', NULL),
  ('E10000020', 'Norfolk County Council', 'county_council', 'England', '2028-04-01'),
  ('S12000021', 'North Ayrshire Council', 'council_area', 'Scotland', NULL),
  ('E07000043', 'North Devon District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000038', 'North East Derbyshire District Council', 'district_council', 'England', '2028-04-01'),
  ('E06000012', 'North East Lincolnshire Council', 'unitary', 'England', NULL),
  ('E07000099', 'North Hertfordshire District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000139', 'North Kesteven District Council', 'district_council', 'England', '2028-04-01'),
  ('S12000050', 'North Lanarkshire Council', 'council_area', 'Scotland', NULL),
  ('E06000013', 'North Lincolnshire Council', 'unitary', 'England', NULL),
  ('E07000147', 'North Norfolk District Council', 'district_council', 'England', '2028-04-01'),
  ('E06000061', 'North Northamptonshire Council', 'unitary', 'England', NULL),
  ('E06000024', 'North Somerset Council', 'unitary', 'England', NULL),
  ('E08000022', 'North Tyneside Council', 'met_borough', 'England', NULL),
  ('E07000218', 'North Warwickshire Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000134', 'North West Leicestershire District Council', 'district_council', 'England', '2028-04-01'),
  ('E06000065', 'North Yorkshire Council', 'unitary', 'England', NULL),
  ('E06000057', 'Northumberland County Council', 'unitary', 'England', NULL),
  ('E07000148', 'Norwich City Council', 'city_council', 'England', '2028-04-01'),
  ('E06000018', 'Nottingham City Council', 'unitary', 'England', '2028-04-01'),
  ('E10000024', 'Nottinghamshire County Council', 'county_council', 'England', '2028-04-01'),
  ('E07000219', 'Nuneaton and Bedworth Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000135', 'Oadby and Wigston Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E08000004', 'Oldham Metropolitan Borough Council', 'met_borough', 'England', NULL),
  ('S12000023', 'Orkney Islands Council', 'council_area', 'Scotland', NULL),
  ('E07000178', 'Oxford City Council', 'city_council', 'England', '2028-04-01'),
  ('E10000025', 'Oxfordshire County Council', 'county_council', 'England', '2028-04-01'),
  ('W06000009', 'Pembrokeshire County Council', 'principal_council', 'Wales', NULL),
  ('E07000122', 'Pendle Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('S12000048', 'Perth and Kinross Council', 'council_area', 'Scotland', NULL),
  ('E06000031', 'Peterborough City Council', 'unitary', 'England', NULL),
  ('E06000026', 'Plymouth City Council', 'unitary', 'England', NULL),
  ('E06000044', 'Portsmouth City Council', 'unitary', 'England', '2028-04-01'),
  ('W06000023', 'Powys County Council', 'principal_council', 'Wales', NULL),
  ('E07000123', 'Preston City Council', 'city_council', 'England', '2028-04-01'),
  ('E06000038', 'Reading Borough Council', 'unitary', 'England', NULL),
  ('E06000003', 'Redcar and Cleveland Borough Council', 'unitary', 'England', NULL),
  ('E07000236', 'Redditch Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000211', 'Reigate and Banstead Borough Council', 'borough_council', 'England', '2027-04-01'),
  ('S12000038', 'Renfrewshire Council', 'council_area', 'Scotland', NULL),
  ('W06000016', 'Rhondda Cynon Taf County Borough Council', 'principal_council', 'Wales', NULL),
  ('E07000124', 'Ribble Valley Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E08000005', 'Rochdale Metropolitan Borough Council', 'met_borough', 'England', NULL),
  ('E07000075', 'Rochford District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000125', 'Rossendale Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000064', 'Rother District Council', 'district_council', 'England', '2028-04-01'),
  ('E08000018', 'Rotherham Metropolitan Borough Council', 'met_borough', 'England', NULL),
  ('E09000011', 'Royal Borough of Greenwich', 'london_borough', 'England', NULL),
  ('E09000020', 'Royal Borough of Kensington and Chelsea', 'london_borough', 'England', NULL),
  ('E09000021', 'Royal Borough of Kingston upon Thames', 'london_borough', 'England', NULL),
  ('E06000040', 'Royal Borough of Windsor and Maidenhead', 'unitary', 'England', NULL),
  ('E07000220', 'Rugby Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000212', 'Runnymede Borough Council', 'borough_council', 'England', '2027-04-01'),
  ('E07000176', 'Rushcliffe Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000092', 'Rushmoor Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E06000017', 'Rutland County Council', 'unitary', 'England', '2028-04-01'),
  ('E08000006', 'Salford City Council', 'met_borough', 'England', NULL),
  ('E08000028', 'Sandwell Metropolitan Borough Council', 'met_borough', 'England', NULL),
  ('S12000026', 'Scottish Borders Council', 'council_area', 'Scotland', NULL),
  ('E08000014', 'Sefton Metropolitan Borough Council', 'met_borough', 'England', NULL),
  ('E07000111', 'Sevenoaks District Council', 'district_council', 'England', '2028-04-01'),
  ('E08000039', 'Sheffield City Council', 'met_borough', 'England', NULL),
  ('S12000027', 'Shetland Islands Council', 'council_area', 'Scotland', NULL),
  ('E06000051', 'Shropshire Council', 'unitary', 'England', NULL),
  ('E06000039', 'Slough Borough Council', 'unitary', 'England', NULL),
  ('E08000029', 'Solihull Metropolitan Borough Council', 'met_borough', 'England', NULL),
  ('E06000066', 'Somerset Council', 'unitary', 'England', NULL),
  ('S12000028', 'South Ayrshire Council', 'council_area', 'Scotland', NULL),
  ('E07000012', 'South Cambridgeshire District Council', 'district_council', 'England', NULL),
  ('E07000039', 'South Derbyshire District Council', 'district_council', 'England', '2028-04-01'),
  ('E06000025', 'South Gloucestershire Council', 'unitary', 'England', NULL),
  ('E07000044', 'South Hams District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000140', 'South Holland District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000141', 'South Kesteven District Council', 'district_council', 'England', '2028-04-01'),
  ('S12000029', 'South Lanarkshire Council', 'council_area', 'Scotland', NULL),
  ('E07000149', 'South Norfolk District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000179', 'South Oxfordshire District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000126', 'South Ribble Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000196', 'South Staffordshire Council', 'district_council', 'England', '2028-04-01'),
  ('E08000023', 'South Tyneside Council', 'met_borough', 'England', NULL),
  ('E06000045', 'Southampton City Council', 'unitary', 'England', '2028-04-01'),
  ('E06000033', 'Southend-on-Sea City Council', 'unitary', 'England', '2028-04-01'),
  ('E07000213', 'Spelthorne Borough Council', 'borough_council', 'England', '2027-04-01'),
  ('E07000240', 'St Albans City and District Council', 'city_council', 'England', '2028-04-01'),
  ('E08000013', 'St Helens Borough Council', 'met_borough', 'England', NULL),
  ('E07000197', 'Stafford Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E10000028', 'Staffordshire County Council', 'county_council', 'England', '2028-04-01'),
  ('E07000198', 'Staffordshire Moorlands District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000243', 'Stevenage Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('S12000030', 'Stirling Council', 'council_area', 'Scotland', NULL),
  ('E08000007', 'Stockport Metropolitan Borough Council', 'met_borough', 'England', NULL),
  ('E06000004', 'Stockton-on-Tees Borough Council', 'unitary', 'England', NULL),
  ('E06000021', 'Stoke-on-Trent City Council', 'unitary', 'England', '2028-04-01'),
  ('E07000221', 'Stratford-on-Avon District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000082', 'Stroud District Council', 'district_council', 'England', '2028-04-01'),
  ('E10000029', 'Suffolk County Council', 'county_council', 'England', '2028-04-01'),
  ('E08000024', 'Sunderland City Council', 'met_borough', 'England', NULL),
  ('E10000030', 'Surrey County Council', 'county_council', 'England', '2027-04-01'),
  ('E07000214', 'Surrey Heath Borough Council', 'borough_council', 'England', '2027-04-01'),
  ('E07000113', 'Swale Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E06000030', 'Swindon Borough Council', 'unitary', 'England', NULL),
  ('E08000008', 'Tameside Metropolitan Borough Council', 'met_borough', 'England', NULL),
  ('E07000199', 'Tamworth Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000215', 'Tandridge District Council', 'district_council', 'England', '2027-04-01'),
  ('E07000045', 'Teignbridge District Council', 'district_council', 'England', '2028-04-01'),
  ('E06000020', 'Telford and Wrekin Council', 'unitary', 'England', NULL),
  ('E07000076', 'Tendring District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000093', 'Test Valley Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000083', 'Tewkesbury Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000114', 'Thanet District Council', 'district_council', 'England', '2028-04-01'),
  ('S12000017', 'The Highland Council', 'council_area', 'Scotland', NULL),
  ('S12000020', 'The Moray Council', 'council_area', 'Scotland', NULL),
  ('W06000014', 'The Vale of Glamorgan Council', 'principal_council', 'Wales', NULL),
  ('E07000102', 'Three Rivers District Council', 'district_council', 'England', '2028-04-01'),
  ('E06000034', 'Thurrock Council', 'unitary', 'England', '2028-04-01'),
  ('E07000115', 'Tonbridge and Malling Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E06000027', 'Torbay Council', 'unitary', 'England', NULL),
  ('W06000020', 'Torfaen County Borough Council', 'principal_council', 'Wales', NULL),
  ('E07000046', 'Torridge District Council', 'district_council', 'England', '2028-04-01'),
  ('E08000009', 'Trafford Metropolitan Borough Council', 'met_borough', 'England', NULL),
  ('E07000116', 'Tunbridge Wells Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000077', 'Uttlesford District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000180', 'Vale of White Horse District Council', 'district_council', 'England', '2028-04-01'),
  ('E08000030', 'Walsall Metropolitan Borough Council', 'met_borough', 'England', NULL),
  ('E06000007', 'Warrington Borough Council', 'unitary', 'England', NULL),
  ('E07000222', 'Warwick District Council', 'district_council', 'England', '2028-04-01'),
  ('E10000031', 'Warwickshire County Council', 'county_council', 'England', '2028-04-01'),
  ('E07000103', 'Watford Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000216', 'Waverley Borough Council', 'borough_council', 'England', '2027-04-01'),
  ('E07000065', 'Wealden District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000241', 'Welwyn Hatfield Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E06000037', 'West Berkshire Council', 'unitary', 'England', '2028-04-01'),
  ('E07000047', 'West Devon Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('S12000039', 'West Dunbartonshire Council', 'council_area', 'Scotland', NULL),
  ('E07000127', 'West Lancashire Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000142', 'West Lindsey District Council', 'district_council', 'England', '2028-04-01'),
  ('S12000040', 'West Lothian Council', 'council_area', 'Scotland', NULL),
  ('E06000062', 'West Northamptonshire Council', 'unitary', 'England', NULL),
  ('E07000181', 'West Oxfordshire District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000245', 'West Suffolk Council', 'district_council', 'England', '2028-04-01'),
  ('E10000032', 'West Sussex County Council', 'county_council', 'England', NULL),
  ('E09000033', 'Westminster City Council', 'london_borough', 'England', NULL),
  ('E06000064', 'Westmorland and Furness Council', 'unitary', 'England', NULL),
  ('E08000010', 'Wigan Metropolitan Borough Council', 'met_borough', 'England', NULL),
  ('E06000054', 'Wiltshire Council', 'unitary', 'England', NULL),
  ('E07000094', 'Winchester City Council', 'city_council', 'England', '2028-04-01'),
  ('E08000015', 'Wirral Metropolitan Borough Council', 'met_borough', 'England', NULL),
  ('E07000217', 'Woking Borough Council', 'borough_council', 'England', '2027-04-01'),
  ('E06000041', 'Wokingham Borough Council', 'unitary', 'England', NULL),
  ('E07000237', 'Worcester City Council', 'city_council', 'England', '2028-04-01'),
  ('E10000034', 'Worcestershire County Council', 'county_council', 'England', '2028-04-01'),
  ('E07000229', 'Worthing Borough Council', 'borough_council', 'England', NULL),
  ('W06000006', 'Wrexham County Borough Council', 'principal_council', 'Wales', NULL),
  ('E07000238', 'Wychavon District Council', 'district_council', 'England', '2028-04-01'),
  ('E07000128', 'Wyre Borough Council', 'borough_council', 'England', '2028-04-01'),
  ('E07000239', 'Wyre Forest District Council', 'district_council', 'England', '2028-04-01');

INSERT INTO "Organisation" ("Name", "GSS_Code", "Nation", "Abolition_Date", "Is_Active")
SELECT c.name, c.gss, c.nation, c.abolition, true
  FROM _councils c
 WHERE NOT EXISTS (
   SELECT 1 FROM "Organisation" o WHERE o."GSS_Code" = c.gss);

-- The role, and which kind of council it is.
INSERT INTO "Organisation_Role"
  ("Organisation_ID", "Organisation_Type_ID", "Organisation_Subtype_ID", "Is_Active")
SELECT o."Organisation_ID", t."Organisation_Type_ID", s."Organisation_Subtype_ID", true
  FROM _councils c
  JOIN "Organisation" o ON o."GSS_Code" = c.gss
  JOIN "Organisation_Type" t ON t."Type_Key" = 'local_authority'
  JOIN "Organisation_Subtype" s
    ON s."Organisation_Type_ID" = t."Organisation_Type_ID"
   AND s."Subtype_Key" = c.subtype
 WHERE NOT EXISTS (
   SELECT 1 FROM "Organisation_Role" r
    WHERE r."Organisation_ID" = o."Organisation_ID"
      AND r."Organisation_Type_ID" = t."Organisation_Type_ID");


-- ── The view gains what a council needs ─────────────────────────
--
-- Organisation_By_Role already joins organisation, role, type and
-- subtype — which is exactly the shape a council dropdown wants. It
-- predates these columns, so it gains them here rather than the reader
-- hand-rolling the same join a second time.
--
-- Appended, never reordered: 0062 says so, because a view that drops or
-- moves a column breaks every SELECT * against it.

CREATE OR REPLACE VIEW "Organisation_By_Role" AS
SELECT o."Organisation_ID", o."Name", o."Code", o."Is_Active",
       t."Type_Key", t."Label" AS role_label,
       st."Subtype_Key", st."Label" AS trade_label,
       r."Reference",
       o."VAT_Registered", o."VAT_Rate",
       o."GSS_Code", o."Nation", o."Abolition_Date"
  FROM "Organisation" o
  JOIN "Organisation_Role" r ON r."Organisation_ID" = o."Organisation_ID" AND r."Is_Active"
  JOIN "Organisation_Type" t ON t."Organisation_Type_ID" = r."Organisation_Type_ID"
  LEFT JOIN "Organisation_Subtype" st
         ON st."Organisation_Subtype_ID" = r."Organisation_Subtype_ID"
 WHERE o."Is_Active";


-- ── Check ───────────────────────────────────────────────────────
--
-- What went in, by kind. Expect 382 across eleven kinds:
--
--   SELECT s."Label", count(*)
--     FROM "Organisation_Role" r
--     JOIN "Organisation_Subtype" s USING ("Organisation_Subtype_ID")
--     JOIN "Organisation_Type" t ON t."Organisation_Type_ID" = r."Organisation_Type_ID"
--    WHERE t."Type_Key" = 'local_authority'
--    GROUP BY s."Label", s."Sort_Order" ORDER BY s."Sort_Order";
--
-- ** A council with no role. ** Would be an organisation the register
-- holds and no screen offers — expect none:
--
--   SELECT o."Name" FROM "Organisation" o
--    WHERE o."GSS_Code" IS NOT NULL
--      AND NOT EXISTS (SELECT 1 FROM "Organisation_Role" r
--                       WHERE r."Organisation_ID" = o."Organisation_ID");
--
-- What disappears, and when. Worth looking at before April 2027:
--
--   SELECT "Abolition_Date", count(*) FROM "Organisation"
--    WHERE "Abolition_Date" IS NOT NULL
--    GROUP BY 1 ORDER BY 1;
