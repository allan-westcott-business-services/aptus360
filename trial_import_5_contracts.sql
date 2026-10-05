-- ════════════════════════════════════════════════════════════════════
--  FIVE CONTRACTS, to see how they land
-- ════════════════════════════════════════════════════════════════════
--
-- Asked for: "Can we just import 5 Contracts from the migrated data just
-- so I can see how they land in the new app".
--
-- Everything is in this one file. No CSVs to load, no staging tables to
-- create, no migrations to run first — the five contracts, their 177
-- plots and their 259 connections are written out below as literal
-- values, and the few columns the import needs are added if they are not
-- already there.
--
-- Paste the whole thing into the Supabase SQL editor and run it.
--
-- ── Undoing it ──
--
-- One statement, and it is exact, because every row this creates is
-- marked with where it came from:
--
--   DELETE FROM "Plot_Utility" WHERE "Legacy_Plot_Utility_ID" IS NOT NULL;
--   DELETE FROM "Plot"         WHERE "Legacy_Plot_ID" IS NOT NULL;
--   DELETE FROM "Project"      WHERE "Legacy_Contract_ID" IS NOT NULL;
--
-- In that order. Nothing else in your database is touched.
--
-- ── The five, and why these five ──
--
--   1764  AP2253  Shakerley Road, Tyldesley     38 plots, 101 connections
--                 The full picture, and it has an old Branch_ID.
--    537  AP2262  Heckenhurst Avenue, Worsthorne 39 plots, 95 connections
--                 A customer but no branch — the commoner case.
--   1416  AP2302  Land Opp Maes Dulas, Newtown   32 plots, 60 connections
--                 A different status, so the stage can be checked.
--    212  AP0265  Moor Park, Crosby               8 plots, no connections
--                 Carries tender reference 1208.034, which it KEEPS as
--                 its project ref rather than being given a new one.
--    129  AP2392  Christie Road, Stretford       60 plots, 3 connections
--                 No Customer_ID and no Branch_ID at all — only the
--                 Audacia name. This is what "pick the customer by hand"
--                 looks like, and its Notes say who it should be.
--
-- ── What will be empty, and why ──
--
--   * The customer, on all five. The customers have not been migrated,
--     so there is nothing to attach to. Each project's Notes name the
--     company, and the old ids are kept so one UPDATE attaches them
--     later.
--   * Region, property type and heat source on the plots. Those are
--     numbered in both systems and the numbers have not been reconciled
--     — see query 1.5 of the full import. Left empty rather than
--     guessed.
--   * The plot addresses. 136,251 plots carry one across the whole file
--     and the new Plot table has no address columns.
--
-- Everything else is real data.

-- ── 0. BEFORE ANYTHING: what else does Project insist on? ────────────
--
-- The first run of this failed on
--
--   null value in column "Date_Received" of relation "Project"
--   violates not-null constraint
--
-- because the old CONTRACT record has no received date — that fact
-- lived on the tender. Date_Received is handled below, but rather than
-- find the next one the same way, run this first and it names every
-- column that would refuse:
--
--   SELECT column_name, data_type
--     FROM information_schema.columns
--    WHERE table_name = 'Project'
--      AND is_nullable = 'NO'
--      AND column_default IS NULL
--      AND is_identity = 'NO'
--      AND is_generated = 'NEVER'
--    ORDER BY column_name;
--
-- Anything in that list other than Project_Ref, Date_Received and
-- Project_Status_ID is one I have not accounted for — send me the list
-- and I will.

-- ── 1. The columns the import needs ──────────────────────────────────
--
-- The same ones migrations 0247, 0249 and 0250 add. Safe to run whether
-- or not you have run those.

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "Tender_Quote_Value" numeric(14,2),
  ADD COLUMN IF NOT EXISTS "Legacy_Contract_ID" bigint,
  ADD COLUMN IF NOT EXISTS "Legacy_Tender_ID"   bigint,
  ADD COLUMN IF NOT EXISTS "Legacy_Customer_ID" bigint,
  ADD COLUMN IF NOT EXISTS "Legacy_Branch_ID"   bigint;
ALTER TABLE "Plot"
  ADD COLUMN IF NOT EXISTS "Legacy_Plot_ID" bigint;
ALTER TABLE "Plot_Utility"
  ADD COLUMN IF NOT EXISTS "Planned_Jointing_Date"  date,
  ADD COLUMN IF NOT EXISTS "Actual_Jointing_Date"   date,
  ADD COLUMN IF NOT EXISTS "Legacy_Plot_Utility_ID" bigint;

CREATE UNIQUE INDEX IF NOT EXISTS "Project_Legacy_Contract_UQ"
  ON "Project" ("Legacy_Contract_ID") WHERE "Legacy_Contract_ID" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Plot_Legacy_Plot_UQ"
  ON "Plot" ("Legacy_Plot_ID") WHERE "Legacy_Plot_ID" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Plot_Utility_Legacy_UQ"
  ON "Plot_Utility" ("Legacy_Plot_Utility_ID") WHERE "Legacy_Plot_Utility_ID" IS NOT NULL;

-- ── 2. The data, as it is in the original app ────────────────────────
--
-- Temporary tables: they exist for this session only and disappear when
-- you close the editor. Nothing is left behind.

CREATE TEMP TABLE "_trial_contract" (
  contract_id bigint, ap_number text, customer_id bigint, branch_id bigint,
  region_id bigint, site_name text, site_address text, tender_reference text,
  tender_quote_value numeric, secured_date text, date_signed text,
  contract_status_id bigint, fire_service_id bigint, min_service_call_off int,
  lay_only_mu boolean, audacia_customer_name text, gas_ref text,
  electric_ref text, water_ref text, old_plot_count int);

CREATE TEMP TABLE "_trial_plot" (
  plot_id bigint, contract_id bigint, plot text, plot_ref text,
  property_config_id bigint, heat_source_id bigint, kva_load numeric,
  pv boolean, heat_pump_model_id bigint);

CREATE TEMP TABLE "_trial_conn" (
  plot_utility_id bigint, plot_id bigint, utility_id bigint,
  programmed_date text, connection_date text, as_laid_date text,
  visit_outcome text, meter_number text, adopter text, team_id bigint,
  status_of_pack text, service_card_submission_date text,
  meter_card_submission_date text, self_lay boolean, dead_jointed_date text,
  expected_asset_value numeric, planned_jointing_date text,
  actual_jointing_date text);

-- The five contracts
INSERT INTO "_trial_contract" VALUES
  (1764, 'AP2253', NULL, 265, 7, 'Shakerley Road, Tyldesley', 'Shakerley Road, Tyldesley, Greater Manchester, M29 8ES', NULL, 134149.36, '2024-07-03', NULL, 5, NULL, NULL, false, '[MCI02] MCI Developments North West', NULL, NULL, NULL, 37),
  (537, 'AP2262', 42, NULL, 7, 'Heckenhurst Avenue, Worsthorne', 'Heckenhurst Avenue, Worsthorne, BB10 3JZ', NULL, 140454.53, '2024-07-25', NULL, 5, 1, NULL, false, '[APP01] Applethwaite Homes', NULL, NULL, NULL, 36),
  (1416, 'AP2302', 610, NULL, 1, 'Land Opp Maes Dulas, Newtown, Powys', 'Llanidloes Road, Mochdre, Stepaside, Powys, SY16 4BB', NULL, 122515.28, '2025-01-24', NULL, 4, 9, NULL, false, '[SJR01] SJ Roberts Construction', NULL, NULL, NULL, 29),
  (212, 'AP0265', NULL, NULL, 7, 'Moor Park, Crosby', 'Moor Park, Off Crosby Moor, Crosby, Maryport, CA15 6RH', '1208.034', 47484.30, '2013-01-01', NULL, 4, NULL, NULL, false, '[DAU01] Day Cummins', 'ESN014037', 'Y49224', '4100113881', 0),
  (129, 'AP2392', NULL, NULL, 7, 'Christie Road, Stretford, M32 0EW (GK Construction)', 'Christie Road, Stretford, M32 0EW', NULL, 291502.16, '2025-10-24', NULL, 5, NULL, NULL, false, '[GKC01] GK Construction & Project Management', NULL, NULL, NULL, 60);

-- Their plots
INSERT INTO "_trial_plot" VALUES
  (1417, 212, '1', 'AP0265-1', 14, 1, 1.80, false, NULL),
  (1418, 212, '2', 'AP0265-2', 14, 1, 1.80, false, NULL),
  (1419, 212, '3', 'AP0265-3', 14, 1, 1.80, false, NULL),
  (1420, 212, '4', 'AP0265-4', 11, 1, 1.50, false, NULL),
  (1421, 212, '5', 'AP0265-5', 11, 1, 1.50, false, NULL),
  (1422, 212, '6', 'AP0265-6', 11, 1, 1.50, false, NULL),
  (1423, 212, '7', 'AP0265-7', 11, 1, 1.50, false, NULL),
  (1424, 212, '8', 'AP0265-8', 11, 1, 1.50, false, NULL),
  (140961, 1764, '1', 'AP2253-1', 12, 1, 1.50, false, NULL),
  (140962, 1764, '2', 'AP2253-2', 12, 1, 1.50, false, NULL),
  (140963, 1764, '3', 'AP2253-3', 12, 1, 1.50, false, NULL),
  (140964, 1764, '4', 'AP2253-4', 12, 1, 1.50, false, NULL),
  (140965, 1764, '5', 'AP2253-5', 12, 1, 1.50, false, NULL),
  (140966, 1764, '6', 'AP2253-6', 12, 1, 1.50, false, NULL),
  (140967, 1764, '7', 'AP2253-7', 12, 1, 1.50, false, NULL),
  (140968, 1764, '8', 'AP2253-8', 12, 1, 1.50, false, NULL),
  (140969, 1764, '9', 'AP2253-9', 12, 1, 1.50, false, NULL),
  (140971, 1764, '10', 'AP2253-10', 12, 1, 1.50, false, NULL),
  (140972, 1764, '11', 'AP2253-11', 12, 1, 1.50, false, NULL),
  (140973, 1764, '12', 'AP2253-12', 12, 1, 1.50, false, NULL),
  (140974, 1764, '13', 'AP2253-13', 12, 1, 1.50, false, NULL),
  (140975, 1764, '14', 'AP2253-14', 12, 1, 1.50, false, NULL),
  (140976, 1764, '15', 'AP2253-15', 12, 1, 1.50, false, NULL),
  (140977, 1764, '16', 'AP2253-16', 12, 1, 1.50, false, NULL),
  (140978, 1764, '17', 'AP2253-17', 12, 1, 1.50, false, NULL),
  (140979, 1764, '18', 'AP2253-18', 12, 1, 1.50, false, NULL),
  (140980, 1764, '19', 'AP2253-19', 12, 1, 1.50, false, NULL),
  (140981, 1764, '20', 'AP2253-20', 12, 1, 1.50, false, NULL),
  (140982, 1764, '21', 'AP2253-21', 12, 1, 1.50, false, NULL),
  (140983, 1764, '22', 'AP2253-22', 12, 1, 1.50, false, NULL),
  (140984, 1764, '23', 'AP2253-23', 12, 1, 1.50, false, NULL),
  (140985, 1764, '24', 'AP2253-24', 12, 1, 1.50, false, NULL),
  (140986, 1764, '25', 'AP2253-25', 12, 1, 1.50, false, NULL),
  (140987, 1764, '26', 'AP2253-26', 12, 1, 1.50, false, NULL),
  (140988, 1764, '27', 'AP2253-27', 12, 1, 1.50, false, NULL),
  (140989, 1764, '28', 'AP2253-28', 12, 1, 1.50, false, NULL),
  (140990, 1764, '29', 'AP2253-29', 12, 1, 1.50, false, NULL),
  (140992, 1764, '30', 'AP2253-30', 12, 1, 1.50, false, NULL),
  (140993, 1764, '31', 'AP2253-31', 12, 1, 1.50, false, NULL),
  (140994, 1764, '32', 'AP2253-32', 12, 1, 1.50, false, NULL),
  (140995, 1764, '33', 'AP2253-33', 12, 1, 1.50, false, NULL),
  (140996, 1764, '34', 'AP2253-34', 12, 1, 1.50, false, NULL),
  (140997, 1764, '35', 'AP2253-35', 12, 1, 1.50, false, NULL),
  (140998, 1764, '36', 'AP2253-36', 12, 1, 1.50, false, NULL),
  (140999, 1764, '37', 'AP2253-37', 12, 1, 1.50, false, NULL),
  (141000, 1764, 'TBS', 'AP2253-TBS', 28, 1, NULL, false, NULL),
  (141734, 537, '1', 'AP2262-1', 1, 1, 1.20, false, NULL),
  (141736, 537, '2', 'AP2262-2', 1, 1, 1.20, false, NULL),
  (141737, 537, '3', 'AP2262-3', 1, 1, 1.20, false, NULL),
  (141738, 537, '4', 'AP2262-4', 1, 1, 1.20, false, NULL),
  (141739, 537, '5', 'AP2262-5', 1, 1, 1.20, false, NULL),
  (141740, 537, '6', 'AP2262-6', 1, 1, 1.20, false, NULL),
  (141741, 537, '7', 'AP2262-7', 1, 1, 1.20, false, NULL),
  (141742, 537, '8', 'AP2262-8', 1, 1, 1.20, false, NULL),
  (141743, 537, '9', 'AP2262-9', 1, 1, 1.20, false, NULL),
  (141744, 537, '10', 'AP2262-10', 1, 1, 1.20, false, NULL),
  (141745, 537, '11', 'AP2262-11', 1, 1, 1.20, false, NULL),
  (141746, 537, '12', 'AP2262-12', 1, 1, 1.20, false, NULL),
  (141747, 537, '13', 'AP2262-13', 1, 1, 1.20, false, NULL),
  (141748, 537, '14', 'AP2262-14', 1, 1, 1.20, false, NULL),
  (141749, 537, '15', 'AP2262-15', 1, 1, 1.20, false, NULL),
  (141750, 537, '16', 'AP2262-16', 1, 1, 1.20, false, NULL),
  (141751, 537, '17', 'AP2262-17', 1, 1, 1.20, false, NULL),
  (141752, 537, '18', 'AP2262-18', 1, 1, 1.20, false, NULL),
  (141753, 537, '19', 'AP2262-19', 1, 1, 1.20, false, NULL),
  (141754, 537, '20', 'AP2262-20', 1, 1, 1.20, false, NULL),
  (141755, 537, '21', 'AP2262-21', 1, 1, 1.20, false, NULL),
  (141756, 537, '22', 'AP2262-22', 1, 1, 1.20, false, NULL),
  (141757, 537, '23', 'AP2262-23', 1, 1, 1.20, false, NULL),
  (141758, 537, '24', 'AP2262-24', 1, 1, 1.20, false, NULL),
  (141759, 537, '25', 'AP2262-25', 1, 1, 1.20, false, NULL),
  (141760, 537, '26', 'AP2262-26', 1, 1, 1.20, false, NULL),
  (141761, 537, '27', 'AP2262-27', 1, 1, 1.20, false, NULL),
  (141762, 537, '28', 'AP2262-28', 1, 1, 1.20, false, NULL),
  (141763, 537, '29', 'AP2262-29', 1, 1, 1.20, false, NULL),
  (141764, 537, '30', 'AP2262-30', 1, 1, 1.20, false, NULL),
  (141765, 537, '31', 'AP2262-31', 1, 1, 1.20, false, NULL),
  (141766, 537, '32', 'AP2262-32', 1, 1, 1.20, false, NULL),
  (141767, 537, '33', 'AP2262-33', 1, 1, 1.20, false, NULL),
  (141768, 537, '34', 'AP2262-34', 1, 1, 1.20, false, NULL),
  (141769, 537, '35', 'AP2262-35', 1, 1, 1.20, false, NULL),
  (141770, 537, '36', 'AP2262-36', 1, 1, 1.20, false, NULL),
  (141771, 537, 'TBS', 'AP2262-TBS', 28, 1, NULL, false, NULL),
  (141772, 537, 'Hyperoptic Cabinet', 'AP2262-Hyperoptic Cabinet', 28, 1, NULL, false, NULL),
  (141773, 537, 'FP01', 'AP2262-FP01', 28, 1, NULL, false, NULL),
  (144413, 1416, '1', 'AP2302-1', 12, 1, 1.50, false, NULL),
  (144414, 1416, '2', 'AP2302-2', 12, 1, 1.50, false, NULL),
  (144415, 1416, '3', 'AP2302-3', 12, 1, 1.50, false, NULL),
  (144416, 1416, '4', 'AP2302-4', 12, 1, 1.50, false, NULL),
  (144417, 1416, '5', 'AP2302-5', 12, 1, 1.50, false, NULL),
  (144418, 1416, '6', 'AP2302-6', 12, 1, 1.50, false, NULL),
  (144419, 1416, '7', 'AP2302-7', 12, 1, 1.50, false, NULL),
  (144420, 1416, '8', 'AP2302-8', 12, 1, 1.50, false, NULL),
  (144421, 1416, '9', 'AP2302-9', 12, 1, 1.50, false, NULL),
  (144422, 1416, '10', 'AP2302-10', 12, 1, 1.50, false, NULL),
  (144423, 1416, '11', 'AP2302-11', 12, 1, 1.50, false, NULL),
  (144424, 1416, '12', 'AP2302-12', 12, 1, 1.50, false, NULL),
  (144425, 1416, '13', 'AP2302-13', 12, 1, 1.50, false, NULL),
  (144426, 1416, '14', 'AP2302-14', 12, 1, 1.50, false, NULL),
  (144427, 1416, '15', 'AP2302-15', 12, 1, 1.50, false, NULL),
  (144428, 1416, '16', 'AP2302-16', 12, 1, 1.50, false, NULL),
  (144429, 1416, '17', 'AP2302-17', 12, 1, 1.50, false, NULL),
  (144430, 1416, '18', 'AP2302-18', 12, 1, 1.50, false, NULL),
  (144431, 1416, '19', 'AP2302-19', 12, 1, 1.50, false, NULL),
  (144432, 1416, '20', 'AP2302-20', 12, 1, 1.50, false, NULL),
  (144433, 1416, '21', 'AP2302-21', 12, 1, 1.50, false, NULL),
  (144434, 1416, '22', 'AP2302-22', 12, 1, 1.50, false, NULL),
  (144435, 1416, '23', 'AP2302-23', 12, 1, 1.50, false, NULL),
  (144436, 1416, '24', 'AP2302-24', 12, 1, 1.50, false, NULL),
  (144437, 1416, '25', 'AP2302-25', 12, 1, 1.50, false, NULL),
  (144438, 1416, '26', 'AP2302-26', 12, 1, 1.50, false, NULL),
  (144439, 1416, '27', 'AP2302-27', 12, 1, 1.50, false, NULL),
  (144440, 1416, '28', 'AP2302-28', 12, 1, 1.50, false, NULL),
  (144441, 1416, '29', 'AP2302-29', 12, 1, 1.50, false, NULL),
  (144442, 1416, 'PS', 'AP2302-PS', 28, 1, NULL, false, NULL),
  (144443, 1416, 'TBS', 'AP2302-TBS', 28, 1, NULL, false, NULL),
  (144444, 1416, 'FP', 'AP2302-FP', 1, 1, 1.20, false, NULL),
  (153843, 129, '1', 'AP2392-1', 1, 1, 1.20, false, NULL),
  (153844, 129, '2', 'AP2392-2', 1, 1, 1.20, false, NULL),
  (153845, 129, '3', 'AP2392-3', 1, 1, 1.20, false, NULL),
  (153846, 129, '4', 'AP2392-4', 1, 1, 1.20, false, NULL),
  (153847, 129, '5', 'AP2392-5', 1, 1, 1.20, false, NULL),
  (153848, 129, '6', 'AP2392-6', 1, 1, 1.20, false, NULL),
  (153849, 129, '7', 'AP2392-7', 1, 1, 1.20, false, NULL),
  (153850, 129, '8', 'AP2392-8', 1, 1, 1.20, false, NULL),
  (153851, 129, '9', 'AP2392-9', 1, 1, 1.20, false, NULL),
  (153852, 129, '10', 'AP2392-10', 1, 1, 1.20, false, NULL),
  (153853, 129, '11', 'AP2392-11', 1, 1, 1.20, false, NULL),
  (153854, 129, '12', 'AP2392-12', 1, 1, 1.20, false, NULL),
  (153855, 129, '13', 'AP2392-13', 1, 1, 1.20, false, NULL),
  (153856, 129, '14', 'AP2392-14', 1, 1, 1.20, false, NULL),
  (153857, 129, '15', 'AP2392-15', 1, 1, 1.20, false, NULL),
  (153858, 129, '16', 'AP2392-16', 1, 1, 1.20, false, NULL),
  (153859, 129, '17', 'AP2392-17', 1, 1, 1.20, false, NULL),
  (153860, 129, '18', 'AP2392-18', 1, 1, 1.20, false, NULL),
  (153861, 129, '19', 'AP2392-19', 1, 1, 1.20, false, NULL),
  (153862, 129, '20', 'AP2392-20', 1, 1, 1.20, false, NULL),
  (153863, 129, '21', 'AP2392-21', 1, 1, 1.20, false, NULL),
  (153864, 129, '22', 'AP2392-22', 1, 1, 1.20, false, NULL),
  (153865, 129, '23', 'AP2392-23', 1, 1, 1.20, false, NULL),
  (153866, 129, '24', 'AP2392-24', 1, 1, 1.20, false, NULL),
  (153867, 129, '25', 'AP2392-25', 1, 1, 1.20, false, NULL),
  (153868, 129, '26', 'AP2392-26', 1, 1, 1.20, false, NULL),
  (153869, 129, '27', 'AP2392-27', 1, 1, 1.20, false, NULL),
  (153870, 129, '28', 'AP2392-28', 1, 1, 1.20, false, NULL),
  (153871, 129, '29', 'AP2392-29', 1, 1, 1.20, false, NULL),
  (153872, 129, '30', 'AP2392-30', 1, 1, 1.20, false, NULL),
  (153873, 129, '31', 'AP2392-31', 1, 1, 1.20, false, NULL),
  (153874, 129, '32', 'AP2392-32', 1, 1, 1.20, false, NULL),
  (153875, 129, '33', 'AP2392-33', 1, 1, 1.20, false, NULL),
  (153876, 129, '34', 'AP2392-34', 1, 1, 1.20, false, NULL),
  (153877, 129, '35', 'AP2392-35', 1, 1, 1.20, false, NULL),
  (153878, 129, '36', 'AP2392-36', 1, 1, 1.20, false, NULL),
  (153879, 129, '37', 'AP2392-37', 1, 1, 1.20, false, NULL),
  (153880, 129, '38', 'AP2392-38', 1, 1, 1.20, false, NULL),
  (153881, 129, '39', 'AP2392-39', 1, 1, 1.20, false, NULL),
  (153882, 129, '40', 'AP2392-40', 1, 1, 1.20, false, NULL),
  (153883, 129, '41', 'AP2392-41', 1, 1, 1.20, false, NULL),
  (153884, 129, '42', 'AP2392-42', 1, 1, 1.20, false, NULL),
  (153885, 129, '43', 'AP2392-43', 1, 1, 1.20, false, NULL),
  (153886, 129, '44', 'AP2392-44', 1, 1, 1.20, false, NULL),
  (153887, 129, '45', 'AP2392-45', 1, 1, 1.20, false, NULL),
  (153888, 129, '46', 'AP2392-46', 1, 1, 1.20, false, NULL),
  (153889, 129, '47', 'AP2392-47', 1, 1, 1.20, false, NULL),
  (153890, 129, '48', 'AP2392-48', 1, 1, 1.20, false, NULL),
  (153891, 129, '49', 'AP2392-49', 1, 1, 1.20, false, NULL),
  (153892, 129, '50', 'AP2392-50', 1, 1, 1.20, false, NULL),
  (153893, 129, '51', 'AP2392-51', 1, 1, 1.20, false, NULL),
  (153894, 129, '52', 'AP2392-52', 1, 1, 1.20, false, NULL),
  (153895, 129, '53', 'AP2392-53', 1, 1, 1.20, false, NULL),
  (153896, 129, '54', 'AP2392-54', 1, 1, 1.20, false, NULL),
  (153897, 129, '55', 'AP2392-55', 1, 1, 1.20, false, NULL),
  (153898, 129, '56', 'AP2392-56', 1, 1, 1.20, false, NULL),
  (153899, 129, '57', 'AP2392-57', 1, 1, 1.20, false, NULL),
  (153900, 129, '58', 'AP2392-58', 1, 1, 1.20, false, NULL),
  (153901, 129, '59', 'AP2392-59', 1, 1, 1.20, false, NULL),
  (153902, 129, '60', 'AP2392-60', 1, 1, 1.20, false, NULL);

-- Their connections
INSERT INTO "_trial_conn" VALUES
  (2740, 140978, 2, '2025-07-09', '2025-07-09', '2025-07-11', 'Completed', 'E6S11324512562', 'MUA', 53, 'Returned', '2025-07-09', '2025-07-09', false, NULL, 643.42, NULL, NULL),
  (2741, 140978, 1, '2025-07-09', '2025-07-08', '2025-07-09', 'Completed', NULL, 'MUA', 53, 'Returned', '2025-07-08', NULL, false, NULL, 331.97, '2025-07-08', '2025-07-08'),
  (2742, 140978, 3, '2025-07-09', '2025-08-14', '2025-09-19', 'Completed', 'H25YU288158', 'United Utilities', 53, 'Returned', '2025-08-14', '2025-08-14', false, NULL, NULL, NULL, NULL),
  (2743, 140979, 2, '2025-07-09', '2025-07-09', '2025-07-11', 'Completed', 'E6S11324462562', 'MUA', 53, 'Returned', '2025-07-09', '2025-07-09', false, NULL, 643.42, NULL, NULL),
  (2744, 140979, 1, '2025-07-09', '2025-07-08', '2025-07-09', 'Completed', NULL, 'MUA', 53, 'Returned', '2025-07-08', NULL, false, NULL, 331.97, '2025-07-08', '2025-07-08'),
  (2745, 140979, 3, '2025-07-09', '2025-08-14', '2025-09-19', 'Completed', 'H25YU288159', 'United Utilities', 53, 'Returned', '2025-08-14', '2025-08-14', false, NULL, NULL, NULL, NULL),
  (5578, 140983, 2, '2025-09-16', '2025-09-16', '2025-07-11', 'Completed', 'E6S13120692562', 'MUA', 23, 'Returned', '2025-09-16', '2025-09-16', false, NULL, 643.42, NULL, NULL),
  (5579, 140983, 1, '2025-09-16', '2025-09-19', '2025-09-19', 'Completed', NULL, 'MUA', 23, 'Returned', '2025-09-19', NULL, false, NULL, 331.97, '2025-09-19', '2025-09-19'),
  (5580, 140983, 3, '2025-09-16', '2025-09-16', '2025-09-19', 'Completed', 'H25YU355956', 'United Utilities', 23, 'Returned', '2025-09-16', '2025-09-16', false, NULL, NULL, NULL, NULL),
  (5581, 140984, 2, '2025-09-16', '2025-09-16', '2025-07-11', 'Completed', 'E6S13120702562', 'MUA', 23, 'Returned', '2025-09-16', '2025-09-16', false, NULL, 643.42, NULL, NULL),
  (5582, 140984, 1, '2025-09-16', '2025-09-19', '2025-09-19', 'Completed', NULL, 'MUA', 23, 'Returned', '2025-09-19', NULL, false, NULL, 331.97, '2025-09-19', '2025-09-19'),
  (5583, 140984, 3, '2025-09-16', '2025-09-16', '2025-09-19', 'Completed', 'H25YU355952', 'United Utilities', 23, 'Returned', '2025-09-16', '2025-09-16', false, NULL, NULL, NULL, NULL),
  (5584, 140985, 2, '2025-09-16', '2025-09-16', '2025-07-11', 'Completed', 'E6S17382132462', 'MUA', 23, 'Returned', '2025-09-16', '2025-09-16', false, NULL, 643.42, NULL, NULL),
  (5585, 140985, 1, '2025-09-16', '2025-09-19', '2025-09-19', 'Completed', NULL, 'MUA', 23, 'Returned', '2025-09-19', NULL, false, NULL, 331.97, '2025-09-19', '2025-09-19'),
  (5586, 140985, 3, '2025-09-16', '2025-09-16', '2025-09-19', 'Completed', 'H25YU355953', 'United Utilities', 23, 'Returned', '2025-09-16', '2025-09-16', false, NULL, NULL, NULL, NULL),
  (5587, 140986, 2, '2025-09-16', '2025-09-16', '2025-07-11', 'Completed', 'E6S13120792562', 'MUA', 23, 'Returned', '2025-09-16', '2025-09-16', false, NULL, 643.42, NULL, NULL),
  (5588, 140986, 1, '2025-09-16', '2025-09-19', '2025-09-19', 'Completed', NULL, 'MUA', 23, 'Returned', '2025-09-19', NULL, false, NULL, 331.97, '2025-09-19', '2025-09-19'),
  (5589, 140986, 3, '2025-09-16', '2025-09-16', '2025-09-19', 'Completed', 'H25YU355951', 'United Utilities', 23, 'Returned', '2025-09-16', '2025-09-16', false, NULL, NULL, NULL, NULL),
  (5590, 140987, 2, '2025-09-16', '2025-09-16', '2025-07-11', 'Completed', 'E6S17382302462', 'MUA', 23, 'Returned', '2025-09-16', '2025-09-16', false, NULL, 643.42, NULL, NULL),
  (5591, 140987, 1, '2025-09-16', '2025-09-19', '2025-09-19', 'Completed', NULL, 'MUA', 23, 'Returned', '2025-09-19', NULL, false, NULL, 331.97, '2025-09-19', '2025-09-19'),
  (5592, 140987, 3, '2025-09-16', '2025-09-16', '2025-09-19', 'Completed', 'H25YU355955', 'United Utilities', 23, 'Returned', '2025-09-16', '2025-09-16', false, NULL, NULL, NULL, NULL),
  (7418, 141734, 2, '2025-10-29', '2025-11-06', '2025-09-19', 'Completed', 'E6S14371682562', 'MUA', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7419, 141734, 1, '2025-10-29', '2025-11-10', '2025-11-10', 'Completed', NULL, 'MUA', 18, 'Returned', '2025-11-10', NULL, false, NULL, NULL, '2025-11-10', '2025-11-10'),
  (7420, 141734, 3, '2025-10-29', '2025-11-06', '2025-09-26', 'Completed', 'H25YU484283', 'United Utilities', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7421, 141736, 2, '2025-10-29', '2025-11-06', '2025-09-19', 'Completed', 'E6S13719082562', 'MUA', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7422, 141736, 1, '2025-10-29', '2025-11-10', '2025-11-10', 'Completed', NULL, 'MUA', 18, 'Returned', '2025-11-10', NULL, false, NULL, NULL, '2025-11-10', '2025-11-10'),
  (7423, 141736, 3, '2025-10-29', '2025-11-06', '2025-09-26', 'Completed', 'H25YU484300', 'United Utilities', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7424, 141764, 2, '2025-10-29', '2025-11-06', '2025-09-19', 'Completed', 'E6S14369222562', 'MUA', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7425, 141764, 1, '2025-10-29', '2025-11-10', '2025-11-10', 'Completed', NULL, 'MUA', 18, 'Returned', '2025-11-10', NULL, false, NULL, NULL, '2025-11-10', '2025-11-10'),
  (7426, 141764, 3, '2025-10-29', '2025-11-06', '2025-09-26', 'Completed', 'H25YU484291', 'United Utilities', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7427, 141765, 2, '2025-10-29', '2025-11-06', '2025-09-19', 'Completed', 'E6S14371552562', 'MUA', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7428, 141765, 1, '2025-10-29', '2025-11-10', '2025-11-10', 'Completed', NULL, 'MUA', 18, 'Returned', '2025-11-10', NULL, false, NULL, NULL, '2025-11-10', '2025-11-10'),
  (7429, 141765, 3, '2025-10-29', '2025-11-06', '2025-09-26', 'Completed', 'H25YU484297', 'United Utilities', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7430, 141766, 2, '2025-10-29', '2025-11-06', '2025-09-19', 'Completed', 'E6S14371382562', 'MUA', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7431, 141766, 1, '2025-10-29', '2025-11-10', '2025-11-10', 'Completed', NULL, 'MUA', 18, 'Returned', '2025-11-10', NULL, false, NULL, NULL, '2025-11-10', '2025-11-10'),
  (7432, 141766, 3, '2025-10-29', '2025-11-06', '2025-09-26', 'Completed', 'H25YU484298', 'United Utilities', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7433, 141767, 2, '2025-10-29', '2025-11-06', '2025-09-19', 'Completed', 'E6S14371612562', 'MUA', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7434, 141767, 1, '2025-10-29', '2025-11-10', '2025-11-10', 'Completed', NULL, 'MUA', 18, 'Returned', '2025-11-10', NULL, false, NULL, NULL, '2025-11-10', '2025-11-10'),
  (7435, 141767, 3, '2025-10-29', '2025-11-06', '2025-09-26', 'Completed', 'DME7C0753103345', 'United Utilities', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7436, 141768, 2, '2025-10-29', '2025-11-06', '2025-09-19', 'Completed', 'E6S11324402562', 'MUA', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7437, 141768, 1, '2025-10-29', '2025-11-10', '2025-11-10', 'Completed', NULL, 'MUA', 18, 'Returned', '2025-11-10', NULL, false, NULL, NULL, '2025-11-10', '2025-11-10'),
  (7438, 141768, 3, '2025-10-29', '2025-11-06', '2025-09-26', 'Completed', 'H25YU484295', 'United Utilities', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7439, 141769, 2, '2025-10-29', '2025-11-06', '2025-09-19', 'Completed', 'E6S14369162562', 'MUA', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7440, 141769, 1, '2025-10-29', '2025-11-10', '2025-11-10', 'Completed', NULL, 'MUA', 18, 'Returned', '2025-11-10', NULL, false, NULL, NULL, '2025-11-10', '2025-11-10'),
  (7441, 141769, 3, '2025-10-29', '2025-11-06', '2025-09-26', 'Completed', 'H25YU484820', 'United Utilities', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7442, 141770, 2, '2025-10-29', '2025-11-06', '2025-09-19', 'Completed', 'E6S14369072562', 'MUA', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7443, 141770, 1, '2025-10-29', '2025-11-10', '2025-11-10', 'Completed', NULL, 'MUA', 18, 'Returned', '2025-11-10', NULL, false, NULL, NULL, '2025-11-10', '2025-11-10'),
  (7444, 141770, 3, '2025-10-29', '2025-11-06', '2025-09-26', 'Completed', 'H25YU484281', 'United Utilities', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7445, 141738, 2, '2025-10-29', '2025-11-06', '2025-09-19', 'Completed', 'E6S14369142562', 'MUA', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7446, 141738, 1, '2025-10-29', '2025-11-10', '2025-11-10', 'Completed', NULL, 'MUA', 18, 'Returned', '2025-11-10', NULL, false, NULL, NULL, '2025-11-10', '2025-11-10'),
  (7447, 141738, 3, '2025-10-29', '2025-11-06', '2025-09-26', 'Completed', 'H25YU484293', 'United Utilities', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7448, 141739, 2, '2025-10-29', '2025-11-06', '2025-09-19', 'Completed', 'E6S14369282562', 'MUA', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7449, 141739, 1, '2025-10-29', '2025-11-10', '2025-11-10', 'Completed', NULL, 'MUA', 18, 'Returned', '2025-11-10', NULL, false, NULL, NULL, '2025-11-10', '2025-11-10'),
  (7450, 141739, 3, '2025-10-29', '2025-11-06', '2025-09-26', 'Completed', 'H25YU484299', 'United Utilities', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7451, 141740, 2, '2025-10-29', '2025-11-06', '2025-09-19', 'Completed', 'E6S14369082562', 'MUA', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7452, 141740, 1, '2025-10-29', '2025-11-10', '2025-11-10', 'Completed', NULL, 'MUA', 18, 'Returned', '2025-11-10', NULL, false, NULL, NULL, '2025-11-10', '2025-11-10'),
  (7453, 141740, 3, '2025-10-29', '2025-11-06', '2025-09-26', 'Completed', 'H25YU484294', 'United Utilities', 18, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7554, 140961, 2, '2025-10-31', '2025-11-06', '2025-07-11', 'Completed', 'E6S11008162562', 'MUA', 23, 'Returned', '2025-11-06', '2025-11-06', false, NULL, 643.42, NULL, NULL),
  (7555, 140961, 1, '2025-10-31', '2025-11-04', '2025-11-04', 'Completed', NULL, 'MUA', 23, 'Returned', '2025-11-04', NULL, false, NULL, 331.97, '2025-11-04', '2025-11-04'),
  (7556, 140961, 3, '2025-10-31', '2025-11-06', '2025-09-19', 'Completed', 'H25YU355805', 'United Utilities', 23, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7557, 140962, 2, '2025-10-31', '2025-11-06', '2025-07-11', 'Completed', 'E6S14371542562', 'MUA', 23, 'Returned', '2025-11-06', '2025-11-06', false, NULL, 643.42, NULL, NULL),
  (7558, 140962, 1, '2025-10-31', '2025-11-04', '2025-11-04', 'Completed', NULL, 'MUA', 23, 'Returned', '2025-11-04', NULL, false, NULL, 331.97, '2025-11-04', '2025-11-04'),
  (7559, 140962, 3, '2025-10-31', '2025-11-06', '2025-09-19', 'Completed', 'H25YU355810', 'United Utilities', 23, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7560, 140963, 2, '2025-10-31', '2025-11-06', '2025-07-11', 'Completed', 'E6S11324552562', 'MUA', 23, 'Returned', '2025-11-06', '2025-11-06', false, NULL, 643.42, NULL, NULL),
  (7561, 140963, 1, '2025-10-31', '2025-11-04', '2025-11-04', 'Completed', NULL, 'MUA', 23, 'Returned', '2025-11-04', NULL, false, NULL, 331.97, '2025-11-04', '2025-11-04'),
  (7562, 140963, 3, '2025-10-31', '2025-11-06', '2025-09-19', 'Completed', 'H25YU355809', 'United Utilities', 23, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7563, 140964, 2, '2025-10-31', '2025-11-06', '2025-07-11', 'Completed', 'E6S14371692562', 'MUA', 23, 'Returned', '2025-11-06', '2025-11-06', false, NULL, 643.42, NULL, NULL),
  (7564, 140964, 1, '2025-10-31', '2025-11-04', '2025-11-04', 'Completed', NULL, 'MUA', 23, 'Returned', '2025-11-04', NULL, false, NULL, 331.97, '2025-11-04', '2025-11-04'),
  (7565, 140964, 3, '2025-10-31', '2025-11-06', '2025-09-19', 'Completed', 'H25YU484309', 'United Utilities', 23, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7566, 140965, 2, '2025-10-31', '2025-11-06', '2025-07-11', 'Completed', 'E6S13141732562', 'MUA', 23, 'Returned', '2025-11-06', '2025-11-06', false, NULL, 643.42, NULL, NULL),
  (7567, 140965, 1, '2025-10-31', '2025-11-04', '2025-11-04', 'Completed', NULL, 'MUA', 23, 'Returned', '2025-11-04', NULL, false, NULL, 331.97, '2025-11-04', '2025-11-04'),
  (7568, 140965, 3, '2025-10-31', '2025-11-06', '2025-09-19', 'Completed', 'H25YU355808', 'United Utilities', 23, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (7569, 140966, 2, '2025-10-31', '2025-11-06', '2025-07-11', 'Completed', 'E6S14371582562', 'MUA', 23, 'Returned', '2025-11-06', '2025-11-06', false, NULL, 643.42, NULL, NULL),
  (7570, 140966, 1, '2025-10-31', '2025-11-04', '2025-11-04', 'Completed', NULL, 'MUA', 23, 'Returned', '2025-11-04', NULL, false, NULL, 331.97, '2025-11-04', '2025-11-04'),
  (7571, 140966, 3, '2025-10-31', '2025-11-06', '2025-09-19', 'Completed', 'H25YU484170', 'United Utilities', 23, 'Returned', '2025-11-06', '2025-11-06', false, NULL, NULL, NULL, NULL),
  (8822, 140988, 2, '2025-11-24', '2025-12-03', '2025-07-11', 'Completed', NULL, 'MUA', 85, 'Returned', '2025-12-03', '2025-12-03', false, NULL, 643.42, NULL, NULL),
  (8823, 140988, 1, '2025-11-24', '2025-12-09', '2025-12-10', 'Completed', NULL, 'MUA', 85, 'Returned', '2025-12-09', NULL, false, NULL, 331.97, '2025-12-09', '2025-12-09'),
  (8824, 140988, 3, '2025-11-24', '2025-12-03', '2025-09-19', 'Completed', NULL, 'United Utilities', 85, 'Returned', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (8825, 140989, 2, '2025-11-24', '2025-12-03', '2025-07-11', 'Completed', 'E6S17344762562', 'MUA', 85, 'Returned', '2025-12-03', '2025-12-03', false, NULL, 643.42, NULL, NULL),
  (8826, 140989, 1, '2025-11-24', '2025-12-09', '2025-12-10', 'Completed', NULL, 'MUA', 85, 'Returned', '2025-12-09', NULL, false, NULL, 331.97, '2025-12-09', '2025-12-09'),
  (8827, 140989, 3, '2025-11-24', '2025-12-03', '2025-09-19', 'Completed', NULL, 'United Utilities', 85, 'Returned', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (8828, 140990, 2, '2025-11-24', '2025-12-03', '2025-07-11', 'Completed', NULL, 'MUA', 85, 'Returned', '2025-12-03', '2025-12-03', false, NULL, 643.42, NULL, NULL),
  (8829, 140990, 1, '2025-11-24', '2025-12-09', '2025-12-10', 'Completed', NULL, 'MUA', 85, 'Returned', '2025-12-09', NULL, false, NULL, 331.97, '2025-12-09', '2025-12-09'),
  (8830, 140990, 3, '2025-11-24', '2025-12-03', '2025-09-19', 'Completed', NULL, 'United Utilities', 85, 'Returned', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (8831, 140993, 2, '2025-11-24', '2025-12-03', '2025-07-11', 'Completed', 'E6S17344682562', 'MUA', 85, 'Returned', '2025-12-03', '2025-12-03', false, NULL, 643.42, NULL, NULL),
  (8832, 140993, 1, '2025-11-24', '2026-01-05', '2025-12-10', 'Completed', NULL, 'MUA', 85, 'Returned', '2026-01-05', NULL, false, NULL, 331.97, '2026-01-05', '2026-01-05'),
  (8833, 140993, 3, '2025-11-24', '2025-12-03', '2025-09-19', 'Completed', NULL, 'United Utilities', 85, 'Returned', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (8834, 140994, 2, '2025-11-24', '2025-12-03', '2025-07-11', 'Completed', 'E6S17344862562', 'MUA', 85, 'Returned', '2025-12-03', '2025-12-03', false, NULL, 643.42, NULL, NULL),
  (8835, 140994, 1, '2025-11-24', '2026-01-05', '2025-12-10', 'Completed', NULL, 'MUA', 85, 'Returned', '2026-01-05', NULL, false, NULL, 331.97, '2026-01-05', '2026-01-05'),
  (8836, 140994, 3, '2025-11-24', '2025-12-03', '2025-09-19', 'Completed', NULL, 'United Utilities', 85, 'Returned', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (8837, 140995, 2, '2025-11-24', '2025-12-03', '2025-07-11', 'Completed', 'E6S17344852562', 'MUA', 85, 'Returned', '2025-12-03', '2025-12-03', false, NULL, 643.42, NULL, NULL),
  (8838, 140995, 1, '2025-11-24', '2026-01-05', '2025-12-10', 'Completed', NULL, 'MUA', 85, 'Returned', '2026-01-05', NULL, false, NULL, 331.97, '2026-01-05', '2026-01-05'),
  (8839, 140995, 3, '2025-11-24', '2025-12-03', '2025-09-19', 'Completed', NULL, 'United Utilities', 85, 'Returned', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (8840, 140996, 2, '2025-11-24', '2025-12-03', '2025-07-11', 'Completed', 'E6S17344802562', 'MUA', 85, 'Returned', '2025-12-03', '2025-12-03', false, NULL, 643.42, NULL, NULL),
  (8841, 140996, 1, '2025-11-24', '2026-01-05', '2025-12-10', 'Completed', NULL, 'MUA', 85, 'Returned', '2026-01-05', NULL, false, NULL, 331.97, '2026-01-05', '2026-01-05'),
  (8842, 140996, 3, '2025-11-24', '2025-12-03', '2025-09-19', 'Completed', 'H25YU484139', 'United Utilities', 85, 'Returned', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (8843, 140997, 2, '2025-11-24', '2025-12-03', '2025-07-11', 'Completed', 'E6S17344692562', 'MUA', 85, 'Returned', '2025-12-03', '2025-12-03', false, NULL, 643.42, NULL, NULL),
  (8844, 140997, 1, '2025-11-24', '2026-01-05', '2025-12-10', 'Completed', NULL, 'MUA', 85, 'Returned', '2026-01-05', NULL, false, NULL, 331.97, '2026-01-05', '2026-01-05'),
  (8845, 140997, 3, '2025-11-24', '2025-12-03', '2025-09-19', 'Completed', 'H25YU484138', 'United Utilities', 85, 'Returned', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (8846, 140998, 2, '2025-11-24', '2025-12-03', '2025-07-11', 'Completed', 'E6S17344872562', 'MUA', 85, 'Returned', '2025-12-03', '2025-12-03', false, NULL, 643.42, NULL, NULL),
  (8847, 140998, 1, '2025-11-24', '2026-01-05', '2025-12-10', 'Completed', NULL, 'MUA', 85, 'Returned', '2026-01-05', NULL, false, NULL, 331.97, '2026-01-05', '2026-01-05'),
  (8848, 140998, 3, '2025-11-24', '2025-12-03', '2025-09-19', 'Completed', 'H25YU484137', 'United Utilities', 85, 'Returned', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (8849, 140999, 2, '2025-11-24', '2025-12-03', '2025-07-11', 'Completed', 'E6S17344672562', 'MUA', 85, 'Returned', '2025-12-03', '2025-12-03', false, NULL, 643.42, NULL, NULL),
  (8850, 140999, 1, '2025-11-24', '2026-01-05', '2025-12-10', 'Completed', NULL, 'MUA', 85, 'Returned', '2026-01-05', NULL, false, NULL, 331.97, '2026-01-05', '2026-01-05'),
  (8851, 140999, 3, '2025-11-24', '2025-12-03', '2025-09-19', 'Completed', 'H25YU484136', 'United Utilities', 85, 'Returned', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (11492, 141741, 2, '2026-02-12', '2026-02-23', '2025-09-19', 'Completed', NULL, 'MUA', 23, 'Returned', '2026-02-23', '2026-02-23', false, NULL, NULL, NULL, NULL),
  (11493, 141741, 1, '2026-02-12', '2026-02-18', '2026-05-19', 'Completed', NULL, 'MUA', 23, 'Returned', '2026-02-18', NULL, false, NULL, NULL, '2026-02-18', '2026-02-18'),
  (11494, 141741, 3, '2026-02-12', '2026-02-23', '2026-05-14', 'Completed', 'H25YU653385', 'United Utilities', 23, 'Returned', '2026-02-23', '2026-02-23', false, NULL, NULL, NULL, NULL),
  (11495, 141742, 2, '2026-02-12', '2026-02-23', '2025-09-19', 'Completed', 'E6S11360482562', 'MUA', 23, 'Returned', '2026-02-23', '2026-02-23', false, NULL, NULL, NULL, NULL),
  (11496, 141742, 1, '2026-02-12', '2026-02-18', '2026-05-19', 'Completed', NULL, 'MUA', 23, 'Returned', '2026-02-18', NULL, false, NULL, NULL, '2026-02-18', '2026-02-18'),
  (11497, 141742, 3, '2026-02-12', '2026-02-23', '2026-05-14', 'Completed', 'H25YU653386', 'United Utilities', 23, 'Returned', '2026-02-23', '2026-02-23', false, NULL, NULL, NULL, NULL),
  (11498, 141758, 2, '2026-02-12', '2026-02-23', '2025-09-19', 'Completed', 'E6S11360412562', 'MUA', 23, 'Returned', '2026-02-23', '2026-02-23', false, NULL, NULL, NULL, NULL),
  (11499, 141758, 1, '2026-02-12', '2026-02-18', '2026-05-19', 'Completed', NULL, 'MUA', 23, 'Returned', '2026-02-18', NULL, false, NULL, NULL, '2026-02-18', '2026-02-18'),
  (11500, 141758, 3, '2026-02-12', '2026-02-23', '2026-05-14', 'Completed', 'H25YU653382', 'United Utilities', 23, 'Returned', '2026-02-23', '2026-02-23', false, NULL, NULL, NULL, NULL),
  (11501, 141759, 2, '2026-02-12', '2026-02-23', '2025-09-19', 'Completed', 'E6S11360492562', 'MUA', 23, 'Returned', '2026-02-23', '2026-02-23', false, NULL, NULL, NULL, NULL),
  (11502, 141759, 1, '2026-02-12', '2026-02-18', '2026-05-19', 'Completed', NULL, 'MUA', 23, 'Returned', '2026-02-18', NULL, false, NULL, NULL, '2026-02-18', '2026-02-18'),
  (11503, 141759, 3, '2026-02-12', '2026-02-23', '2026-05-14', 'Completed', 'H25YU653381', 'United Utilities', 23, 'Returned', '2026-02-23', '2026-02-23', false, NULL, NULL, NULL, NULL),
  (11504, 141760, 2, '2026-02-12', '2026-02-23', '2025-09-19', 'Completed', 'E6S11360252562', 'MUA', 23, 'Returned', '2026-02-23', '2026-02-23', false, NULL, NULL, NULL, NULL),
  (11505, 141760, 1, '2026-02-12', '2026-02-18', '2026-05-19', 'Completed', NULL, 'MUA', 23, 'Returned', '2026-02-18', NULL, false, NULL, NULL, '2026-02-18', '2026-02-18'),
  (11506, 141760, 3, '2026-02-12', '2026-02-23', '2026-05-14', 'Completed', 'H25YU653384', 'United Utilities', 23, 'Returned', '2026-02-23', '2026-02-23', false, NULL, NULL, NULL, NULL),
  (11507, 141761, 2, '2026-02-12', '2026-02-23', '2025-09-19', 'Completed', 'E6S11360342562', 'MUA', 23, 'Returned', '2026-02-23', '2026-02-23', false, NULL, NULL, NULL, NULL),
  (11508, 141761, 1, '2026-02-12', '2026-02-18', '2026-05-19', 'Completed', NULL, 'MUA', 23, 'Returned', '2026-02-18', NULL, false, NULL, NULL, '2026-02-18', '2026-02-18'),
  (11509, 141761, 3, '2026-02-12', '2026-02-23', '2026-05-14', 'Completed', 'H25YU653383', 'United Utilities', 23, 'Returned', '2026-02-23', '2026-02-23', false, NULL, NULL, NULL, NULL),
  (11510, 141762, 2, '2026-02-12', '2026-02-23', '2025-09-19', 'Completed', 'E6S11360512562', 'MUA', 23, 'Returned', '2026-02-23', '2026-02-23', false, NULL, NULL, NULL, NULL),
  (11511, 141762, 1, '2026-02-12', '2026-02-18', '2026-05-19', 'Completed', NULL, 'MUA', 23, 'Returned', '2026-02-18', NULL, false, NULL, NULL, '2026-02-18', '2026-02-18'),
  (11512, 141762, 3, '2026-02-12', '2026-02-23', '2026-05-14', 'Completed', 'H25YU653387', 'United Utilities', 23, 'Returned', '2026-02-23', '2026-02-23', false, NULL, NULL, NULL, NULL),
  (11513, 141763, 2, '2026-02-12', '2026-02-23', '2025-09-19', 'Completed', 'E6S11360502562', 'MUA', 23, 'Returned', '2026-02-23', '2026-02-23', false, NULL, NULL, NULL, NULL),
  (11514, 141763, 1, '2026-02-12', '2026-02-18', '2026-05-19', 'Completed', NULL, 'MUA', 23, 'Returned', '2026-02-18', NULL, false, NULL, NULL, '2026-02-18', '2026-02-18'),
  (11515, 141763, 3, '2026-02-12', '2026-02-23', '2026-05-14', 'Completed', 'H25YU653388', 'United Utilities', 23, 'Returned', '2026-02-23', '2026-02-23', false, NULL, NULL, NULL, NULL),
  (11979, 140992, 2, '2026-02-25', '2026-02-25', '2025-07-11', 'Completed', 'E6S11360232562', 'MUA', 85, 'Returned', '2026-02-25', '2026-02-25', false, NULL, 643.42, NULL, NULL),
  (11980, 140992, 1, '2026-02-25', '2026-03-05', '2026-05-14', 'Completed', NULL, 'MUA', 85, 'Returned', '2026-03-05', NULL, false, NULL, 331.97, '2026-03-05', '2026-03-05'),
  (11981, 140992, 3, '2026-02-25', '2026-02-25', '2025-09-19', 'Completed', 'H26YU119769', 'United Utilities', 85, 'Returned', '2026-02-25', '2026-02-25', false, NULL, NULL, NULL, NULL),
  (12317, 140980, 2, '2026-03-03', '2026-03-10', '2026-03-23', 'Completed', 'E6S21101222562', 'MUA', 67, 'Returned', '2026-03-10', '2026-03-10', false, NULL, 643.42, NULL, NULL),
  (12318, 140980, 1, '2026-03-03', '2026-03-10', '2026-03-09', 'Completed', NULL, 'MUA', 67, 'Returned', '2026-03-10', NULL, false, NULL, 331.97, '2026-03-10', '2026-03-10'),
  (12319, 140980, 3, '2026-03-03', '2026-03-10', '2025-09-19', 'Completed', 'H26YU119781', 'United Utilities', 67, 'Returned', '2026-03-10', '2026-03-10', false, NULL, NULL, NULL, NULL),
  (12320, 140981, 2, '2026-03-03', '2026-03-10', '2026-03-23', 'Completed', 'E6S21101142562', 'MUA', 67, 'Returned', '2026-03-10', '2026-03-10', false, NULL, 643.42, NULL, NULL),
  (12321, 140981, 1, '2026-03-03', '2026-03-10', '2026-03-09', 'Completed', NULL, 'MUA', 67, 'Returned', '2026-03-10', NULL, false, NULL, 331.97, '2026-03-10', '2026-03-10'),
  (12322, 140981, 3, '2026-03-03', '2026-03-10', '2025-09-19', 'Completed', 'H26YU119690', 'United Utilities', 67, 'Returned', '2026-03-10', '2026-03-10', false, NULL, NULL, NULL, NULL),
  (12323, 140982, 2, '2026-03-03', '2026-03-10', '2026-03-23', 'Completed', 'E6S21100732562', 'MUA', 67, 'Returned', '2026-03-10', '2026-03-10', false, NULL, 643.42, NULL, NULL),
  (12324, 140982, 1, '2026-03-03', '2026-03-10', '2026-03-09', 'Completed', NULL, 'MUA', 67, 'Returned', '2026-03-10', NULL, false, NULL, 331.97, '2026-03-10', '2026-03-10'),
  (12325, 140982, 3, '2026-03-03', '2026-03-10', '2025-09-19', 'Completed', 'H26YU119750', 'United Utilities', 67, 'Returned', '2026-03-10', '2026-03-10', false, NULL, NULL, NULL, NULL),
  (13711, 141745, 2, '2026-05-07', '2026-05-14', '2026-04-09', 'Completed', 'E6S13008592662', 'MUA', 23, 'Returned', '2026-05-14', '2026-05-14', false, NULL, NULL, NULL, NULL),
  (13712, 141745, 1, '2026-05-07', '2026-05-13', '2026-05-19', 'Completed', NULL, 'MUA', 23, 'Returned', '2026-05-13', NULL, false, NULL, NULL, '2026-05-13', '2026-05-13'),
  (13713, 141745, 3, '2026-05-07', '2026-05-14', '2026-05-14', 'Completed', 'H26YU119805', 'United Utilities', 23, 'Returned', '2026-05-14', '2026-05-14', false, NULL, NULL, NULL, NULL),
  (13714, 141746, 2, '2026-05-07', '2026-05-14', '2026-04-09', 'Completed', 'E6S13008582662', 'MUA', 23, 'Returned', '2026-05-14', '2026-05-14', false, NULL, NULL, NULL, NULL),
  (13716, 141746, 3, '2026-05-07', '2026-05-14', '2026-05-14', 'Completed', 'H26YU119809', 'United Utilities', 23, 'Returned', '2026-05-14', '2026-05-14', false, NULL, NULL, NULL, NULL),
  (14454, 141747, 2, '2026-05-07', '2026-05-14', '2026-04-09', 'Completed', NULL, 'MUA', 23, 'Returned', '2026-05-14', '2026-05-14', false, NULL, NULL, NULL, NULL),
  (14456, 141747, 3, '2026-05-07', '2026-05-14', '2026-05-14', 'Completed', NULL, 'United Utilities', 23, 'Returned', '2026-05-14', '2026-05-14', false, NULL, NULL, NULL, NULL),
  (14457, 141748, 2, '2026-05-07', '2026-05-14', '2026-04-09', 'Completed', NULL, 'MUA', 23, 'Returned', '2026-05-14', '2026-05-14', false, NULL, NULL, NULL, NULL),
  (14459, 141748, 3, '2026-05-07', '2026-05-14', '2026-05-14', 'Completed', NULL, 'United Utilities', 23, 'Returned', '2026-05-14', '2026-05-14', false, NULL, NULL, NULL, NULL),
  (14460, 141749, 2, '2026-05-07', '2026-05-14', '2026-04-09', 'Completed', NULL, 'MUA', 23, 'Returned', '2026-05-14', '2026-05-14', false, NULL, NULL, NULL, NULL),
  (14462, 141749, 3, '2026-05-07', '2026-05-14', '2026-05-14', 'Completed', NULL, 'United Utilities', 23, 'Returned', '2026-05-14', '2026-05-14', false, NULL, NULL, NULL, NULL),
  (15027, 140967, 2, '2026-05-08', '2026-05-12', '2026-03-23', 'Completed', 'E6S13008572662', 'MUA', 67, 'Returned', '2026-05-12', '2026-05-12', false, NULL, 643.42, NULL, NULL),
  (15028, 140967, 3, '2026-05-08', '2026-05-12', '2025-09-19', 'Completed', 'H26YU119576', 'United Utilities', 67, 'Returned', '2026-05-12', '2026-05-12', false, NULL, NULL, NULL, NULL),
  (15029, 140968, 2, '2026-05-08', '2026-05-12', '2026-03-23', 'Completed', 'E6S13008632662', 'MUA', 67, 'Returned', '2026-05-12', '2026-05-12', false, NULL, 643.42, NULL, NULL),
  (15030, 140968, 3, '2026-05-08', '2026-05-12', '2025-09-19', 'Completed', 'H26YU119577', 'United Utilities', 67, 'Returned', '2026-05-12', '2026-05-12', false, NULL, NULL, NULL, NULL),
  (15031, 140969, 2, '2026-05-08', '2026-05-12', '2026-03-23', 'Completed', 'E6S13008502662', 'MUA', 67, 'Returned', '2026-05-12', '2026-05-12', false, NULL, 643.42, NULL, NULL),
  (15032, 140969, 3, '2026-05-08', '2026-05-12', '2025-09-19', 'Completed', 'H26YU119578', 'United Utilities', 67, 'Returned', '2026-05-12', '2026-05-12', false, NULL, NULL, NULL, NULL),
  (15033, 140971, 2, '2026-05-08', '2026-05-12', '2026-03-23', 'Completed', 'E6S13008692662', 'MUA', 67, 'Returned', '2026-05-12', '2026-05-12', false, NULL, 643.42, NULL, NULL),
  (15034, 140971, 3, '2026-05-08', '2026-05-12', '2025-09-19', 'Completed', 'H26YU119579', 'United Utilities', 67, 'Returned', '2026-05-12', '2026-05-12', false, NULL, NULL, NULL, NULL),
  (15035, 140972, 2, '2026-05-08', '2026-05-12', '2026-03-23', 'Completed', 'E6S13008662662', 'MUA', 67, 'Returned', '2026-05-12', '2026-05-12', false, NULL, 643.42, NULL, NULL),
  (15036, 140972, 3, '2026-05-08', '2026-05-12', '2025-09-19', 'Completed', 'H26YU119580', 'United Utilities', 67, 'Returned', '2026-05-12', '2026-05-12', false, NULL, NULL, NULL, NULL),
  (15037, 140973, 2, '2026-05-08', '2026-05-12', '2026-03-23', 'Completed', 'E6S13008822662', 'MUA', 67, 'Returned', '2026-05-12', '2026-05-12', false, NULL, 643.42, NULL, NULL),
  (15038, 140973, 3, '2026-05-08', '2026-05-12', '2025-09-19', 'Completed', 'H26YU119572', 'United Utilities', 67, 'Returned', '2026-05-12', '2026-05-12', false, NULL, NULL, NULL, NULL),
  (15039, 140974, 2, '2026-05-08', '2026-05-12', '2026-03-23', 'Completed', 'E6S13008552662', 'MUA', 67, 'Returned', '2026-05-12', '2026-05-12', false, NULL, 643.42, NULL, NULL),
  (15040, 140974, 3, '2026-05-08', '2026-05-12', '2025-09-19', 'Completed', 'H26YU119574', 'United Utilities', 67, 'Returned', '2026-05-12', '2026-05-12', false, NULL, NULL, NULL, NULL),
  (15041, 140975, 2, '2026-05-08', '2026-05-12', '2026-03-23', 'Completed', 'E6S13008492662', 'MUA', 67, 'Returned', '2026-05-12', '2026-05-12', false, NULL, 643.42, NULL, NULL),
  (15042, 140975, 3, '2026-05-08', '2026-05-12', '2025-09-19', 'Completed', 'H26YU119575', 'United Utilities', 67, 'Returned', '2026-05-12', '2026-05-12', false, NULL, NULL, NULL, NULL),
  (15043, 140976, 2, '2026-05-08', '2026-05-12', '2026-03-23', 'Completed', 'E6S13008672662', 'MUA', 67, 'Returned', '2026-05-12', '2026-05-12', false, NULL, 643.42, NULL, NULL),
  (15044, 140976, 3, '2026-05-08', '2026-05-12', '2025-09-19', 'Completed', 'H26YU119573', 'United Utilities', 67, 'Returned', '2026-05-12', '2026-05-12', false, NULL, NULL, NULL, NULL),
  (15045, 140977, 2, '2026-05-08', '2026-05-12', '2026-03-23', 'Completed', 'E6S13008762662', 'MUA', 67, 'Returned', '2026-05-12', '2026-05-12', false, NULL, 643.42, NULL, NULL),
  (15046, 140977, 3, '2026-05-08', '2026-05-12', '2025-09-19', 'Completed', 'H26YU119571', 'United Utilities', 67, 'Returned', '2026-05-12', '2026-05-12', false, NULL, NULL, NULL, NULL),
  (20745, 144413, 1, '2025-11-10', '2025-11-17', '2025-11-18', 'Completed', NULL, 'MUA', 24, 'Submitted', '2025-11-17', NULL, false, NULL, 1449.16, '2025-11-17', '2025-11-17'),
  (20746, 144413, 3, '2025-11-10', '2025-12-03', '2025-11-10', 'Completed', '70B3D5A9F014C614', 'Lastmile', 24, 'Submitted', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (20747, 144414, 1, '2025-11-10', '2025-11-17', '2025-11-18', 'Completed', NULL, 'MUA', 24, 'Submitted', '2025-11-17', NULL, false, NULL, 1449.16, '2025-11-17', '2025-11-17'),
  (20748, 144414, 3, '2025-11-10', '2026-03-06', '2025-11-10', 'Completed', '70B3D5A9F014C6B8', 'Lastmile', 24, 'Submitted', '2026-04-13', '2026-04-13', false, NULL, NULL, NULL, NULL),
  (20749, 144415, 1, '2025-11-10', '2025-11-17', '2025-11-18', 'Completed', NULL, 'MUA', 24, 'Submitted', '2025-11-17', NULL, false, NULL, 1449.16, '2025-11-17', '2025-11-17'),
  (20750, 144415, 3, '2025-11-10', '2025-12-03', '2025-11-10', 'Completed', '70B3D5A9F014C6E5', 'Lastmile', 24, 'Submitted', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (20751, 144416, 1, '2025-11-10', '2025-11-17', '2025-11-18', 'Completed', NULL, 'MUA', 24, 'Submitted', '2025-11-17', NULL, false, NULL, 1449.16, '2025-11-17', '2025-11-17'),
  (20752, 144416, 3, '2025-11-10', '2025-12-03', '2025-11-10', 'Completed', '70B3D5A9F014C8DB', 'Lastmile', 24, 'Submitted', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (20753, 144417, 1, '2025-11-10', '2025-11-17', '2025-11-18', 'Completed', NULL, 'MUA', 24, 'Submitted', '2025-11-17', NULL, false, NULL, 1449.16, '2025-11-17', '2025-11-17'),
  (20754, 144417, 3, '2025-11-10', '2025-12-03', '2025-11-10', 'Completed', '70B3D5A9F014C71B', 'Lastmile', 24, 'Submitted', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (20877, 144442, 1, '2025-11-24', '2025-11-27', '2025-12-01', 'Completed', NULL, 'MUA', 24, 'Submitted', '2025-11-27', NULL, false, NULL, 1449.16, '2025-11-27', '2025-11-27'),
  (20878, 144444, 1, '2025-11-24', '2025-11-27', '2025-12-01', 'Completed', NULL, 'MUA', 24, 'Submitted', '2025-11-27', NULL, false, NULL, 1449.16, '2025-11-27', '2025-11-27'),
  (20921, 144418, 1, '2025-11-26', '2025-11-27', '2025-12-01', 'Completed', NULL, 'MUA', 57, 'Submitted', '2025-11-27', NULL, false, NULL, 1449.16, '2025-11-27', '2025-11-27'),
  (20922, 144418, 3, '2025-11-26', '2025-12-03', '2025-11-10', 'Completed', '70B3D5A9F014EC55', 'Lastmile', 57, 'Submitted', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (20923, 144419, 1, '2025-11-26', '2025-11-27', '2025-12-01', 'Completed', NULL, 'MUA', 57, 'Submitted', '2025-11-27', NULL, false, NULL, 1449.16, '2025-11-27', '2025-11-27'),
  (20924, 144419, 3, '2025-11-26', '2025-12-03', '2025-11-10', 'Completed', '70B3D5A9F014DC6F', 'Lastmile', 57, 'Submitted', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (20925, 144420, 1, '2025-11-26', '2025-11-27', '2025-12-01', 'Completed', NULL, 'MUA', 57, 'Submitted', '2025-11-27', NULL, false, NULL, 1449.16, '2025-11-27', '2025-11-27'),
  (20926, 144420, 3, '2025-11-26', '2025-12-03', '2025-11-10', 'Completed', '70B3D5A9F014DC0E', 'Lastmile', 57, 'Submitted', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (20927, 144421, 1, '2025-11-26', '2025-11-27', '2025-12-01', 'Completed', NULL, 'MUA', 57, 'Submitted', '2025-11-27', NULL, false, NULL, 1449.16, '2025-11-27', '2025-11-27'),
  (20928, 144421, 3, '2025-11-26', '2025-12-03', '2025-11-10', 'Completed', '70B3D5A9F014DD52', 'Lastmile', 57, 'Submitted', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (20929, 144422, 1, '2025-11-26', '2025-11-27', '2025-12-01', 'Completed', NULL, 'MUA', 57, 'Submitted', '2025-11-27', NULL, false, NULL, 1449.16, '2025-11-27', '2025-11-27'),
  (20930, 144422, 3, '2025-11-26', '2025-12-03', '2025-11-10', 'Completed', '70B3D5A9F014EC2E', 'Lastmile', 57, 'Submitted', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (20931, 144423, 1, '2025-11-26', '2025-11-27', '2025-12-01', 'Completed', NULL, 'MUA', 57, 'Submitted', '2025-11-27', NULL, false, NULL, 1449.16, '2025-11-27', '2025-11-27'),
  (20932, 144423, 3, '2025-11-26', '2025-12-03', '2025-11-10', 'Completed', '70B3D5A9F014ED5D', 'Lastmile', 57, 'Submitted', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (20933, 144424, 1, '2025-11-26', '2025-11-27', '2025-12-01', 'Completed', NULL, 'MUA', 57, 'Submitted', '2025-11-27', NULL, false, NULL, 1449.16, '2025-11-27', '2025-11-27'),
  (20934, 144424, 3, '2025-11-26', '2025-12-03', '2025-11-10', 'Completed', '70B3D5A9F014D0A3', 'Lastmile', 57, 'Submitted', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (20935, 144425, 1, '2025-11-26', '2025-11-27', '2025-12-01', 'Completed', NULL, 'MUA', 57, 'Submitted', '2025-11-27', NULL, false, NULL, 1449.16, '2025-11-27', '2025-11-27'),
  (20936, 144425, 3, '2025-11-26', '2025-12-03', '2025-11-10', 'Completed', '70B3D5A9F014DCF6', 'Lastmile', 57, 'Submitted', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (20937, 144426, 1, '2025-11-26', '2025-11-27', '2025-12-01', 'Completed', NULL, 'MUA', 57, 'Submitted', '2025-11-27', NULL, false, NULL, 1449.16, '2025-11-27', '2025-11-27'),
  (20938, 144426, 3, '2025-11-26', '2025-12-03', '2025-11-10', 'Completed', '70B3D5A9F014DB7B', 'Lastmile', 57, 'Submitted', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (20939, 144427, 1, '2025-11-26', '2025-11-27', '2025-12-01', 'Completed', NULL, 'MUA', 57, 'Submitted', '2025-11-27', NULL, false, NULL, 1449.16, '2025-11-27', '2025-11-27'),
  (20940, 144427, 3, '2025-11-26', '2025-12-03', '2025-11-10', 'Completed', '70B3D5A9F014DBC9', 'Lastmile', 57, 'Submitted', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (20941, 144428, 1, '2025-11-26', '2025-11-27', '2025-12-01', 'Completed', NULL, 'MUA', 57, 'Submitted', '2025-11-27', NULL, false, NULL, 1449.16, '2025-11-27', '2025-11-27'),
  (20942, 144428, 3, '2025-11-26', '2025-12-03', '2025-11-10', 'Completed', '70B3D5A9F014DC8B', 'Lastmile', 57, 'Submitted', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (20943, 144429, 1, '2025-11-26', '2025-11-27', '2025-12-01', 'Completed', NULL, 'MUA', 57, 'Submitted', '2025-11-27', NULL, false, NULL, 1449.16, '2025-11-27', '2025-11-27'),
  (20944, 144429, 3, '2025-11-26', '2025-12-03', '2025-11-10', 'Completed', '70B3D5A9F014DD69', 'Lastmile', 57, 'Submitted', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (20945, 144430, 1, '2025-11-26', '2025-11-27', '2025-12-01', 'Completed', NULL, 'MUA', 57, 'Submitted', '2025-11-27', NULL, false, NULL, 1449.16, '2025-11-27', '2025-11-27'),
  (20946, 144430, 3, '2025-11-26', '2025-12-03', '2025-11-10', 'Completed', '70B3D5A9F014DD81', 'Lastmile', 57, 'Submitted', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (20947, 144431, 1, '2025-11-26', '2025-11-27', '2025-12-01', 'Completed', NULL, 'MUA', 57, 'Submitted', '2025-11-27', NULL, false, NULL, 1449.16, '2025-11-27', '2025-11-27'),
  (20948, 144431, 3, '2025-11-26', '2025-12-03', '2025-11-10', 'Completed', '70B3D5A9F014DBEC', 'Lastmile', 57, 'Submitted', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (20949, 144432, 1, '2025-11-26', '2025-11-27', '2025-12-01', 'Completed', NULL, 'MUA', 57, 'Submitted', '2025-11-27', NULL, false, NULL, 1449.16, '2025-11-27', '2025-11-27'),
  (20950, 144432, 3, '2025-11-26', '2025-12-03', '2025-11-10', 'Completed', '70B3D5A9F014DC5D', 'Lastmile', 57, 'Submitted', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (20951, 144433, 1, '2025-11-26', '2025-11-27', '2025-12-01', 'Completed', NULL, 'MUA', 57, 'Submitted', '2025-11-27', NULL, false, NULL, 1449.16, '2025-11-27', '2025-11-27'),
  (20952, 144433, 3, '2025-11-26', '2025-12-03', '2025-11-10', 'Completed', '70B3D5A9F014DC31', 'Lastmile', 57, 'Submitted', '2025-12-03', '2025-12-03', false, NULL, NULL, NULL, NULL),
  (21316, 144434, 1, '2026-01-26', '2026-01-29', '2026-01-30', 'Completed', NULL, 'MUA', 24, 'Submitted', '2026-01-29', NULL, false, NULL, 1449.16, '2026-01-29', '2026-01-29'),
  (21317, 144434, 3, '2026-01-26', '2026-01-27', '2025-11-10', 'Completed', '70B3D5A9F014DD35', 'Lastmile', 24, 'Submitted', '2026-01-27', '2026-01-27', false, NULL, NULL, NULL, NULL),
  (21318, 144435, 1, '2026-01-26', '2026-01-29', '2026-01-30', 'Completed', NULL, 'MUA', 24, 'Submitted', '2026-01-29', NULL, false, NULL, 1449.16, '2026-01-29', '2026-01-29'),
  (21319, 144435, 3, '2026-01-26', '2026-01-27', '2025-11-10', 'Completed', '70B3D5A9F014DCFE', 'Lastmile', 24, 'Submitted', '2026-01-27', '2026-01-27', false, NULL, NULL, NULL, NULL),
  (21664, 144436, 1, '2026-02-25', '2026-02-26', '2026-02-26', 'Completed', NULL, 'MUA', 24, 'Submitted', '2026-02-26', NULL, false, NULL, 1449.16, '2026-02-26', '2026-02-26'),
  (21665, 144437, 1, '2026-02-25', '2026-02-26', '2026-02-26', 'Completed', NULL, 'MUA', 24, 'Submitted', '2026-02-26', NULL, false, NULL, 1449.16, '2026-02-26', '2026-02-26'),
  (21666, 144438, 1, '2026-02-25', '2026-02-26', '2026-02-26', 'Completed', NULL, 'MUA', 24, 'Submitted', '2026-02-26', NULL, false, NULL, 1449.16, '2026-02-26', '2026-02-26'),
  (21667, 144439, 1, '2026-02-25', '2026-02-26', '2026-02-26', 'Completed', NULL, 'MUA', 24, 'Submitted', '2026-02-26', NULL, false, NULL, 1449.16, '2026-02-26', '2026-02-26'),
  (21668, 144440, 1, '2026-02-25', '2026-02-26', '2026-02-26', 'Completed', NULL, 'MUA', 24, 'Submitted', '2026-02-26', NULL, false, NULL, 1449.16, '2026-02-26', '2026-02-26'),
  (21669, 144441, 1, '2026-02-25', '2026-02-26', '2026-02-26', 'Completed', NULL, 'MUA', 24, 'Submitted', '2026-02-26', NULL, false, NULL, 1449.16, '2026-02-26', '2026-02-26'),
  (21691, 144436, 3, '2026-03-04', '2026-03-09', '2026-03-26', 'Completed', '70B3D5A9F014D032', 'Lastmile', 24, 'Submitted', '2026-03-09', '2026-03-09', false, NULL, NULL, NULL, NULL),
  (21692, 144437, 3, '2026-03-04', '2026-03-09', '2026-03-26', 'Completed', '70B3D5A9F014C7E1', 'Lastmile', 24, 'Submitted', '2026-03-09', '2026-03-09', false, NULL, NULL, NULL, NULL),
  (21693, 144438, 3, '2026-03-04', '2026-03-09', '2026-03-26', 'Completed', '70B3D5A9F014DBD5', 'Lastmile', 24, 'Submitted', '2026-03-09', '2026-03-09', false, NULL, NULL, NULL, NULL),
  (21694, 144439, 3, '2026-03-04', '2026-03-09', '2026-03-26', 'Completed', '70B3D5A9F014EE2D', 'Lastmile', 24, 'Submitted', '2026-03-09', '2026-03-09', false, NULL, NULL, NULL, NULL),
  (21695, 144440, 3, '2026-03-04', '2026-03-09', '2026-03-26', 'Completed', '70B3D5A9F014C815', 'Lastmile', 24, 'Submitted', '2026-03-09', '2026-03-09', false, NULL, NULL, NULL, NULL),
  (21696, 144441, 3, '2026-03-04', '2026-03-09', '2026-03-26', 'Completed', '70B3D5A9F014C6C7', 'Lastmile', 24, 'Submitted', '2026-03-09', '2026-03-09', false, NULL, NULL, NULL, NULL),
  (27124, 141755, 2, '2026-06-05', '2026-06-08', '2026-04-09', 'Completed', 'E6S13012272662', NULL, 23, 'Returned', '2026-06-08', '2026-06-08', false, NULL, NULL, NULL, NULL),
  (27125, 141755, 3, '2026-06-05', '2026-06-08', '2026-05-14', 'Completed', 'H24YU340320', NULL, 23, 'Returned', '2026-06-08', '2026-06-08', false, NULL, NULL, NULL, NULL),
  (27126, 141756, 2, '2026-06-05', '2026-06-08', '2026-04-09', 'Completed', 'E6S13012192662', NULL, 23, 'Returned', '2026-06-08', '2026-06-08', false, NULL, NULL, NULL, NULL),
  (27127, 141756, 3, '2026-06-05', '2026-06-08', '2026-05-14', 'Completed', 'H24YU340314', NULL, 23, 'Returned', '2026-06-08', '2026-06-08', false, NULL, NULL, NULL, NULL),
  (27128, 141757, 2, '2026-06-05', '2026-06-08', '2026-04-09', 'Completed', 'E6S13012312662', NULL, 23, 'Returned', '2026-06-08', '2026-06-08', false, NULL, NULL, NULL, NULL),
  (27129, 141757, 3, '2026-06-05', '2026-06-08', '2026-05-14', 'Completed', 'H24YU340315', NULL, 23, 'Returned', '2026-06-08', '2026-06-08', false, NULL, NULL, NULL, NULL),
  (27196, 153850, 3, '2026-06-08', '2026-06-08', '2026-06-12', 'Completed', 'H25YU031025', NULL, 89, 'Submitted', '2026-06-08', '2026-06-08', false, NULL, NULL, NULL, NULL),
  (27197, 153851, 3, '2026-06-08', '2026-06-08', '2026-06-12', 'Completed', 'H25YU030727', NULL, 89, 'Submitted', '2026-06-08', '2026-06-08', false, NULL, NULL, NULL, NULL),
  (27198, 153852, 3, '2026-06-08', '2026-06-08', '2026-06-12', 'Completed', 'C23LU624515', NULL, 89, 'Submitted', '2026-06-08', '2026-06-08', false, NULL, NULL, NULL, NULL),
  (29939, 141753, 2, '2026-07-20', '2026-07-20', '2025-09-19', 'Completed', 'E6S15542862662', NULL, NULL, 'Submitted', '2026-07-27', '2026-07-27', false, NULL, NULL, NULL, NULL),
  (29941, 141752, 2, '2026-07-20', '2026-07-20', '2025-09-19', 'Completed', 'E6S15542982662', NULL, NULL, 'Submitted', '2026-07-27', '2026-07-27', false, NULL, NULL, NULL, NULL),
  (29943, 141754, 2, '2026-07-20', '2026-07-20', '2025-09-19', 'Completed', 'E6S15542882662', NULL, NULL, 'Submitted', '2026-07-27', '2026-07-27', false, NULL, NULL, NULL, NULL),
  (30135, 141752, 1, '2026-07-23', '2026-07-24', NULL, 'Completed', NULL, NULL, 124, 'Submitted', '2026-07-29', NULL, false, NULL, NULL, '2026-07-24', '2026-07-24'),
  (30136, 141753, 1, '2026-07-23', '2026-07-24', NULL, 'Completed', NULL, NULL, 124, 'Submitted', '2026-07-29', NULL, false, NULL, NULL, '2026-07-24', '2026-07-24'),
  (30137, 141754, 1, '2026-07-23', '2026-07-24', NULL, 'Completed', NULL, NULL, 124, 'Submitted', '2026-07-29', NULL, false, NULL, NULL, '2026-07-24', '2026-07-24'),
  (30872, 141743, 3, '2026-08-11', '2026-08-19', NULL, 'Completed', NULL, NULL, NULL, 'Submitted', '2026-08-23', '2026-08-23', false, NULL, NULL, NULL, NULL),
  (30873, 141744, 3, '2026-08-11', '2026-08-19', NULL, 'Completed', NULL, NULL, NULL, 'Submitted', '2026-08-23', '2026-08-23', false, NULL, NULL, NULL, NULL),
  (30874, 141750, 3, '2026-08-11', '2026-08-19', NULL, 'Completed', NULL, NULL, NULL, 'Submitted', '2026-08-23', '2026-08-23', false, NULL, NULL, NULL, NULL),
  (30875, 141751, 3, '2026-08-11', '2026-08-19', NULL, 'Completed', NULL, NULL, NULL, 'Submitted', '2026-08-23', '2026-08-23', false, NULL, NULL, NULL, NULL),
  (31472, 141744, 1, '2026-08-17', '2026-08-18', '2026-08-21', 'Completed', NULL, NULL, 124, 'Submitted', '2026-08-21', NULL, false, NULL, NULL, '2026-08-18', '2026-08-18'),
  (31473, 141743, 1, '2026-08-17', '2026-08-18', '2026-08-21', 'Completed', NULL, NULL, 124, 'Submitted', '2026-08-21', NULL, false, NULL, NULL, '2026-08-18', '2026-08-18'),
  (31474, 141750, 1, '2026-08-17', '2026-08-18', '2026-08-21', 'Completed', NULL, NULL, 124, 'Submitted', '2026-08-21', NULL, false, NULL, NULL, '2026-08-18', '2026-08-18'),
  (31475, 141751, 1, '2026-08-17', '2026-08-18', '2026-08-21', 'Completed', NULL, NULL, 124, 'Submitted', '2026-08-21', NULL, false, NULL, NULL, '2026-08-18', '2026-08-18'),
  (31587, 141743, 2, '2026-08-11', '2026-08-19', NULL, 'Completed', 'E6S13746812662', NULL, 23, 'Submitted', '2026-08-23', '2026-08-23', false, NULL, NULL, NULL, NULL),
  (31588, 141744, 2, '2026-08-11', '2026-08-19', NULL, 'Completed', 'E6S16345192662', NULL, 23, 'Submitted', '2026-08-23', '2026-08-23', false, NULL, NULL, NULL, NULL),
  (31589, 141750, 2, '2026-08-11', '2026-08-19', NULL, 'Completed', 'E6S16345212662', NULL, 23, 'Submitted', '2026-08-23', '2026-08-23', false, NULL, NULL, NULL, NULL),
  (31590, 141751, 2, '2026-08-11', '2026-08-19', NULL, 'Completed', 'E6S16346042662', NULL, 23, 'Submitted', '2026-08-23', '2026-08-23', false, NULL, NULL, NULL, NULL);

-- ── 3. The projects ──────────────────────────────────────────────────
--
-- The reference follows your own scheme, YYMM.NNN dated from when the
-- contract was secured, carrying on from whatever that month already
-- holds — except AP0265, which already has 1208.034 and keeps it.
--
-- The status is taken from your own Project_Status list: the first one
-- at Contract stage. The full import maps each old status properly;
-- here it just needs to land somewhere sensible so the stage reads
-- right.

WITH keeps AS (
  SELECT split_part(btrim(tender_reference), '.', 1) AS yymm,
         btrim(tender_reference) AS ref
    FROM "_trial_contract"
   WHERE tender_reference ~ '^\d{4}\.\d+$'
),
taken AS (
  SELECT yymm, max(n) AS high FROM (
    SELECT split_part("Project_Ref", '.', 1) AS yymm,
           NULLIF(regexp_replace(split_part("Project_Ref", '.', 2), '\D', '', 'g'), '')::int AS n
      FROM "Project" WHERE "Project_Ref" ~ '^\d{4}\.'
    UNION ALL
    SELECT k.yymm, NULLIF(regexp_replace(split_part(k.ref, '.', 2), '\D', '', 'g'), '')::int
      FROM keeps k
  ) a GROUP BY yymm
),
dated AS (
  SELECT c.*, to_char(COALESCE(NULLIF(c.secured_date,'')::date,
                               NULLIF(c.date_signed,'')::date,
                               CURRENT_DATE), 'YYMM') AS yymm
    FROM "_trial_contract" c
),
numbered AS (
  SELECT d.*, COALESCE(t.high, 0)
           + row_number() OVER (PARTITION BY d.yymm ORDER BY d.contract_id) AS seq
    FROM dated d LEFT JOIN taken t ON t.yymm = d.yymm
   WHERE d.tender_reference IS NULL OR d.tender_reference !~ '^\d{4}\.\d+$'
),
all_rows AS (
  SELECT n.*, n.yymm || '.' || lpad(n.seq::text, 3, '0') AS new_ref FROM numbered n
  UNION ALL
  SELECT d.*, NULL::bigint AS seq, btrim(d.tender_reference) AS new_ref
    FROM dated d WHERE d.tender_reference ~ '^\d{4}\.\d+$'
)
INSERT INTO "Project" (
  "Project_Ref", "AP_Number", "Tender_Ref", "Site_Name", "Site_Address", "Postcode",
  "Date_Received", "Secured_Date", "Date_Signed", "Project_Status_ID", "Fire_Service_ID",
  "Tender_Quote_Value", "Minimum_Service_Call_Off", "Lay_Only_MU",
  "Legacy_Contract_ID", "Legacy_Customer_ID", "Legacy_Branch_ID", "Notes"
)
SELECT
  a.new_ref, a.ap_number, a.tender_reference, a.site_name, a.site_address,
  NULLIF(upper(btrim(substring(upper(COALESCE(a.site_address, ''))
    FROM '([A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2})\s*$'))), ''),
  /* ── Date_Received, which the old contract record does not have ──

     It is NOT NULL here, and over there the received date belonged to
     the TENDER — a contract is what a tender became. So the best date
     this record carries stands in for it: when it was secured, or when
     it was signed.

     Standing in, not pretending: the Notes say so on every project
     where it was invented, because a received date that is really a
     secured date will otherwise be read as fact and reported on. When
     the tender file arrives the real one can replace it. */
  COALESCE(NULLIF(a.secured_date, '')::date,
           NULLIF(a.date_signed, '')::date,
           DATE '1900-01-01'),
  NULLIF(a.secured_date, '')::date,
  NULLIF(a.date_signed, '')::date,
  (SELECT "Project_Status_ID" FROM "Project_Status"
    WHERE "Stage" = 'Contract' ORDER BY "Sort_Order" LIMIT 1),
  a.fire_service_id, a.tender_quote_value, a.min_service_call_off, a.lay_only_mu,
  a.contract_id, a.customer_id, a.branch_id,
  concat_ws(E'\n',
    'Imported from the original app (Contract ' || a.contract_id || ').',
    'Date received is a stand-in: the original app kept it on the tender, '
      || 'not the contract.',
    'Customer (not attached yet): ' || COALESCE(a.audacia_customer_name, 'not named'),
    CASE WHEN a.gas_ref IS NOT NULL THEN 'Gas ref: ' || a.gas_ref END,
    CASE WHEN a.electric_ref IS NOT NULL THEN 'Electric ref: ' || a.electric_ref END,
    CASE WHEN a.water_ref IS NOT NULL THEN 'Water ref: ' || a.water_ref END,
    CASE WHEN a.old_plot_count IS NOT NULL
      THEN 'Plot count in the old system: ' || a.old_plot_count END)
  FROM all_rows a
 WHERE NOT EXISTS (SELECT 1 FROM "Project" p WHERE p."Legacy_Contract_ID" = a.contract_id);

-- ── 4. The plots ─────────────────────────────────────────────────────

INSERT INTO "Plot" (
  "Project_ID", "Plot_Number", "Plot_Ref", "KVA_Load", "PV", "Legacy_Plot_ID"
)
SELECT p."Project_ID", t.plot, t.plot_ref, t.kva_load, t.pv, t.plot_id
  FROM "_trial_plot" t
  JOIN "Project" p ON p."Legacy_Contract_ID" = t.contract_id
 WHERE NOT EXISTS (SELECT 1 FROM "Plot" x WHERE x."Legacy_Plot_ID" = t.plot_id);

-- ── 5. The connections ───────────────────────────────────────────────
--
-- Pack status and visit outcome are matched on the words, and the
-- adopter against an organisation that holds an IDNO, DNO, GT, WU, IGT
-- or IWU role. An adopter you have not set up yet comes through empty —
-- that is the worklist, not a fault.

INSERT INTO "Plot_Utility" (
  "Plot_ID", "Utility_ID", "Programmed_Date", "Connection_Date", "As_Laid_Date",
  "Meter_Number", "Service_Card_Submission_Date", "Meter_Card_Submission_Date",
  "Pack_Status_ID", "Visit_Outcome", "Visit_Outcome_ID", "IDNO_ID",
  "AV_Value", "Self_Lay_Provider", "Dead_Jointed_Date", "Team_ID",
  "Planned_Jointing_Date", "Actual_Jointing_Date", "Legacy_Plot_Utility_ID"
)
SELECT
  pl."Plot_ID", c.utility_id,
  NULLIF(c.programmed_date,'')::date, NULLIF(c.connection_date,'')::date,
  NULLIF(c.as_laid_date,'')::date, c.meter_number,
  NULLIF(c.service_card_submission_date,'')::date,
  NULLIF(c.meter_card_submission_date,'')::date,
  (SELECT s."Pack_Status_ID" FROM "Pack_Status" s
    WHERE upper(btrim(s."Pack_Status")) = upper(btrim(c.status_of_pack)) LIMIT 1),
  c.visit_outcome,
  (SELECT v."Visit_Outcome_ID" FROM "Visit_Outcome" v
    WHERE upper(btrim(v."Visit_Outcome")) = upper(btrim(c.visit_outcome)) LIMIT 1),
  (SELECT o."Organisation_ID" FROM "Organisation" o
     JOIN "Organisation_Role" r ON r."Organisation_ID" = o."Organisation_ID"
     JOIN "Organisation_Type" t ON t."Organisation_Type_ID" = r."Organisation_Type_ID"
    WHERE t."Type_Key" IN ('idno','dno','gt','wu','igt','iwu') AND r."Is_Active"
      AND upper(btrim(o."Name")) = upper(btrim(c.adopter)) LIMIT 1),
  c.expected_asset_value, c.self_lay, NULLIF(c.dead_jointed_date,'')::date,
  c.team_id, NULLIF(c.planned_jointing_date,'')::date,
  NULLIF(c.actual_jointing_date,'')::date, c.plot_utility_id
  FROM "_trial_conn" c
  JOIN "Plot" pl ON pl."Legacy_Plot_ID" = c.plot_id
 WHERE NOT EXISTS (SELECT 1 FROM "Plot_Utility" x
                    WHERE x."Legacy_Plot_Utility_ID" = c.plot_utility_id);

-- ── 6. What landed ───────────────────────────────────────────────────

SELECT p."Project_Ref", p."AP_Number", p."Site_Name", p."Postcode",
       p."Tender_Quote_Value", p."Secured_Date",
       count(DISTINCT pl."Plot_ID") AS plots,
       count(pu."Plot_Utility_ID")  AS connections
  FROM "Project" p
  LEFT JOIN "Plot" pl ON pl."Project_ID" = p."Project_ID"
  LEFT JOIN "Plot_Utility" pu ON pu."Plot_ID" = pl."Plot_ID"
 WHERE p."Legacy_Contract_ID" IS NOT NULL
 GROUP BY 1,2,3,4,5,6
 ORDER BY 1;
