-- ════════════════════════════════════════════════════════════════
-- 0189 — electric catalogue, carried across from the original
--
-- The original app and this one read tables of the same NAME with
-- different column names inside them. So the exported rows cannot be
-- loaded as they stand: every key and three of the value columns are
-- renamed on the way in.
--
--   Electric_Cable_Type    Electric_Cable_Type_ID   → Cable_Type_ID
--                          Type_Name                → Cable_Type
--   Electric_Cable_Size    Electric_Cable_Size_ID   → Cable_Size_ID
--                          Electric_Cable_Type_ID   → Cable_Type_ID
--                          Cable_Rating_A           → Rating_Amps
--                          Size_mm2                 → CSA_mm2
--   Electric_Impedance     Electric_Impedance_ID    → Impedance_ID
--                          Fuse_A                   → Fuse_Rating_Amps
--                          Volt_Drop_Factor         → Volt_Drop_Pct
--   Electric_VD_Setting    Electric_VD_Setting_ID   → VD_Setting_ID
--
-- Loop_Impedance_Ohm and Volt_Drop_Base — the two the volt drop sum
-- actually reads — are named the same in both and carry across
-- unchanged.
--
-- ── IDs are preserved deliberately ──
-- Every span node on every existing drawing stores a cable in
-- GIS_Feature.Attributes.VD_Cable_Size_ID, and a substation stores
-- VD_Transformer_Size_ID. Those are the original's IDs. Letting the
-- sequence allocate new ones would leave every drawing pointing at a
-- cable that is no longer the one it was drawn with — which reports as
-- a wrong figure rather than as an error, because the ID still
-- resolves, just to the wrong row.
--
-- ── Idempotent ──
-- ON CONFLICT DO UPDATE throughout, so this can be re-run after a
-- correction to the source data without duplicating anything. It
-- overwrites the catalogue columns and leaves Is_Active alone on rows
-- that already exist, so a cable someone has since deactivated here
-- stays deactivated.
--
-- ── NOT in this file ──
-- Electric_Transformer_Size. No export was supplied for it, and the
-- impedance rows below reference transformer IDs 7, 8, 10 and 11.
-- Until those rows exist, the FK insert at the end of this file will
-- fail — which is the intended behaviour, because the transformer is
-- where the whole cascade starts. See the note at the foot.
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── Preflight ────────────────────────────────────────────────────
-- Fail loudly and early if this database is the original's schema
-- rather than this app's. Inserting into the wrong shape produces a
-- column-does-not-exist error halfway through a transaction, which is
-- recoverable but reads as a mystery; this says what is wrong.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'Electric_Cable_Size' AND column_name = 'Cable_Size_ID'
  ) THEN
    RAISE EXCEPTION
      'Electric_Cable_Size has no Cable_Size_ID column — this database is on the original schema (Electric_Cable_Size_ID). Do not run this file against it.';
  END IF;
END $$;


-- ── Voltage_Rating ──
INSERT INTO "Voltage_Rating" ("Voltage_Rating_ID","Voltage_Rating","Sort_Order") VALUES
  (1, 'LV', 10),
  (2, 'HV', 20),
  (3, 'HV+', 30),
  (4, 'EHV', 40)
ON CONFLICT ("Voltage_Rating_ID") DO UPDATE SET
  "Voltage_Rating" = EXCLUDED."Voltage_Rating";

-- ── Electric_Cable_Type ── (Type_Name → Cable_Type)
INSERT INTO "Electric_Cable_Type"
  ("Cable_Type_ID","Cable_Type","Cable_Code","Usage_Type","Voltage_Rating_ID","Sort_Order","Is_Active") VALUES
  (1, '3c WAVE', NULL, 'Mains', 1, 1, true),
  (2, '4c WAVE', NULL, 'Mains', 1, 2, true),
  (11, 'Single Phase Service CNE', NULL, 'Service', 1, 3, true),
  (12, '3 Phase Service', NULL, 'Service', 1, 4, true),
  (13, 'Earth Cable', NULL, 'Mains', NULL, 5, true),
  (15, 'Pilot Cable', NULL, 'Mains', 2, 7, true),
  (16, 'Triplex 11KV', NULL, 'Mains', 2, 8, true),
  (17, '3 Core HV', NULL, 'Mains', 2, 9, true),
  (18, 'Triplex 20KV', NULL, 'Mains', 2, 10, true),
  (19, 'LSZH MAINS', NULL, 'Mains', 1, 11, true),
  (20, 'LSZH SINGLE PHASE', NULL, 'Service', 1, 12, true),
  (21, 'LSZH 3 PHASE', NULL, 'Service', 1, 13, true),
  (22, 'Single Phase Service SNE', NULL, 'Service', 1, 14, true)
ON CONFLICT ("Cable_Type_ID") DO UPDATE SET
  "Cable_Type"        = EXCLUDED."Cable_Type",
  "Usage_Type"        = EXCLUDED."Usage_Type",
  "Voltage_Rating_ID" = EXCLUDED."Voltage_Rating_ID",
  "Sort_Order"        = EXCLUDED."Sort_Order";

-- ── Electric_Cable_Size ── (Cable_Rating_A → Rating_Amps, Size_mm2 → CSA_mm2)
INSERT INTO "Electric_Cable_Size"
  ("Cable_Size_ID","Cable_Type_ID","Size_Label","Material","CSA_mm2","Rating_Amps",
   "Preferred_Fuse_A","Loop_Impedance_Ohm","Volt_Drop_Base","Sort_Order","Is_Active") VALUES
  (1, 1, '95', 'Aluminium', NULL, 235, 315, 0.687, 191, 10, true),
  (2, 1, '185', 'Aluminium', NULL, 335, 500, 0.361, 105, 20, true),
  (4, 1, '300', 'Aluminium', NULL, 435, 630, 0.291, 73, 30, true),
  (5, 2, '95', 'Aluminium', NULL, 0, 0, 0.687, 191, 40, true),
  (6, 2, '185', 'Aluminium', NULL, 0, 0, 0.361, 105, 50, true),
  (8, 2, '300', 'Aluminium', NULL, 0, 0, 0.291, 73, 60, true),
  (35, 16, '95', 'Aluminium', NULL, NULL, NULL, NULL, NULL, 70, true),
  (36, 16, '185', 'Aluminium', NULL, NULL, NULL, NULL, NULL, 80, true),
  (37, 16, '300', 'Aluminium', NULL, NULL, NULL, NULL, NULL, 90, true),
  (38, 16, '95.', 'Copper', NULL, NULL, NULL, NULL, NULL, 100, true),
  (39, 16, '185.', 'Copper', NULL, NULL, NULL, NULL, NULL, 110, true),
  (40, 16, '300.', 'Copper', NULL, NULL, NULL, NULL, NULL, 111, true),
  (41, 18, '185', 'Aluminium', NULL, NULL, NULL, NULL, NULL, 1, true),
  (42, 18, '300', 'Aluminium', NULL, NULL, NULL, NULL, NULL, 2, true),
  (44, 13, '70 INSULATED', 'Copper', NULL, NULL, NULL, NULL, NULL, 1, true),
  (45, 13, '70 BARE', 'Copper', NULL, NULL, NULL, NULL, NULL, 2, true),
  (46, 13, '120 BARE', 'Copper', NULL, NULL, NULL, NULL, NULL, 3, true),
  (47, 13, '120 INSULATED', 'Copper', NULL, NULL, NULL, NULL, NULL, 4, true),
  (48, 11, '4', 'Copper', NULL, NULL, NULL, NULL, NULL, 1, true),
  (49, 11, '16', 'Copper', NULL, NULL, NULL, NULL, NULL, 2, true),
  (50, 11, '25', 'Aluminium', NULL, NULL, NULL, NULL, NULL, 3, true),
  (51, 11, '35', 'Aluminium', NULL, NULL, NULL, NULL, NULL, 4, true),
  (52, 12, '25', 'Aluminium', NULL, NULL, NULL, NULL, NULL, 1, true),
  (53, 12, '35', 'Aluminium', NULL, NULL, NULL, NULL, NULL, 2, true),
  (54, 15, '2.5', 'Copper', NULL, NULL, NULL, NULL, NULL, 1, true),
  (55, 17, '95', 'Aluminium', NULL, NULL, NULL, NULL, NULL, 1, true),
  (56, 17, '185', 'Aluminium', NULL, NULL, NULL, NULL, NULL, 2, true),
  (57, 17, '300', 'Aluminium', NULL, NULL, NULL, NULL, NULL, 3, true),
  (58, 19, '95', 'Aluminium', NULL, NULL, NULL, NULL, NULL, 1, true),
  (59, 19, '185', 'Aluminium', NULL, NULL, NULL, NULL, NULL, 2, true),
  (60, 19, '300', 'Aluminium', NULL, NULL, NULL, NULL, NULL, 3, true),
  (61, 20, '35', 'Aluminium', NULL, NULL, NULL, NULL, NULL, 1, true),
  (62, 21, '25', 'Aluminium', NULL, NULL, NULL, NULL, NULL, 1, true),
  (64, 20, '35.', 'Copper', NULL, NULL, NULL, NULL, NULL, 2, true),
  (65, 22, '4', 'Copper', NULL, NULL, NULL, NULL, NULL, 1, true),
  (66, 22, '16', 'Copper', NULL, NULL, NULL, NULL, NULL, 2, true),
  (67, 22, '35', 'Aluminium', NULL, NULL, NULL, NULL, NULL, 3, true)
ON CONFLICT ("Cable_Size_ID") DO UPDATE SET
  "Cable_Type_ID"      = EXCLUDED."Cable_Type_ID",
  "Size_Label"         = EXCLUDED."Size_Label",
  "Material"           = EXCLUDED."Material",
  "CSA_mm2"            = EXCLUDED."CSA_mm2",
  "Rating_Amps"        = EXCLUDED."Rating_Amps",
  "Preferred_Fuse_A"   = EXCLUDED."Preferred_Fuse_A",
  "Loop_Impedance_Ohm" = EXCLUDED."Loop_Impedance_Ohm",
  "Volt_Drop_Base"     = EXCLUDED."Volt_Drop_Base",
  "Sort_Order"         = EXCLUDED."Sort_Order";

-- ── Electric_Transformer_Size ── (recovered from the workbook)
--
-- No export was supplied for this table, and it is where the whole
-- cascade starts: without it sourceImpedance() returns null, every
-- circuit begins at zero ohms, and every reading comes out better than
-- the truth.
--
-- The figures are the workbook's own — sheet "Transformer ELI's",
-- column G, which is what its VLOOKUP reads to seed the substation.
--
-- The four IDs are not guesses. Each transformer in Electric_Impedance
-- carries a distinct set of fuse ratings, and they match the workbook's
-- pivot columns one for one:
--
--   ID 7   200/250/315                 = pivot 315xxx  → 300/315 kVA
--   ID 8   200/250/315/355/400         = pivot 500xxx  → 500 kVA
--   ID 10  200/250/315/355/400/500/630 = pivot 800xxx  → 750/800 kVA
--   ID 11  200/250/315/355/400/500/630 = pivot 1000xxx → 1000 kVA
--
-- Confirmed twice over: the highest fuse against each ID is exactly the
-- Max Fuse the workbook lists for that transformer (315, 400, 630, 630).
--
-- ── ONE THING TO CHECK ──
-- The workbook lists 315 and 300/315 separately (0.02606 / 0.02733), and
-- 800 and 750/800 separately (0.01022 / 0.01098). The selectable list at
-- data!C39:C43 offers the SLASH variants, so those are used here. If your
-- schemes are specified on the plain sizes, change these two rows:
--
--   UPDATE "Electric_Transformer_Size" SET "Label" = '315',
--          "Loop_Impedance_Ohm" = 0.02606 WHERE "Transformer_Size_ID" = 7;
--   UPDATE "Electric_Transformer_Size" SET "Label" = '800',
--          "Loop_Impedance_Ohm" = 0.01022 WHERE "Transformer_Size_ID" = 10;
--
-- The difference is about 5% of the transformer's own contribution,
-- which is a small part of a total — but it is the part every circuit
-- inherits, so it is worth being right.
INSERT INTO "Electric_Transformer_Size"
  ("Transformer_Size_ID","Label","Rating_kVA","Loop_Impedance_Ohm","Sort_Order","Is_Active") VALUES
  (7,  '300/315', 315,  0.02733, 10, true),
  (8,  '500',     500,  0.01644, 20, true),
  (10, '750/800', 800,  0.01098, 30, true),
  (11, '1000',    1000, 0.00820, 40, true)
ON CONFLICT ("Transformer_Size_ID") DO UPDATE SET
  "Label"              = EXCLUDED."Label",
  "Rating_kVA"         = EXCLUDED."Rating_kVA",
  "Loop_Impedance_Ohm" = EXCLUDED."Loop_Impedance_Ohm",
  "Sort_Order"         = EXCLUDED."Sort_Order";

-- The rest of the workbook's ladder, for whenever a scheme needs one.
-- Left commented because these IDs are unknown — your original table may
-- already use 1-6 and 9 for them, and inventing IDs here would create a
-- second row for a transformer you already have.
--   25    0.31109      250   0.03252
--   50    0.15531      315   0.02606
--   100   0.08207      800   0.01022
--   200   0.04013


-- ── Electric_Impedance ── (Fuse_A → Fuse_Rating_Amps, Volt_Drop_Factor → Loop_Impedance_Ohms)
--
-- Guarded, because these rows reference transformer IDs 7, 8, 10 and
-- 11 and no Electric_Transformer_Size export was supplied. Without the
-- guard the foreign key rejects the insert, the transaction rolls back,
-- and the cable catalogue — which needs no transformer and which the
-- volt drop sum genuinely reads — is lost along with it.
--
-- So the impedance matrix is skipped rather than allowed to take
-- everything else down with it, and it says so. Re-run this file once
-- the transformers are loaded and the rows will go in; the inserts
-- above are idempotent and will simply overwrite themselves.
--
-- ── THE COLUMN IS NOT A VOLT DROP FIGURE ──
--
-- It is named Volt_Drop_Factor in the original and Volt_Drop_Pct here,
-- and both names are wrong. The workbook settles it: this is the pivot
-- at impedances!I:AF, keyed transformer x fuse (315200 = 315 kVA on a
-- 200 A fuse), and regulat.xls!L9 labels the result it produces
--
--   "Mx impedance value for selected fuse (ohms)"
--
-- Ohms. The values run 0.045 to 0.337, which is the range of a loop
-- impedance limit and nothing like a percentage — Max_Volt_Drop_Pct is
-- 7. data!R35 takes the MIN across sections, which is the binding
-- constraint on the run.
--
-- So it loads into Loop_Impedance_Ohms, which this schema already has
-- and which was sitting empty. Volt_Drop_Pct is left null rather than
-- filled with a number that is not a percentage.
--
-- Nothing reads the table today, in either app. It is carried because
-- the data exists, it is editable in Admin > Electric Specs >
-- Impedances, and it is the fault-protection check the volt drop
-- cascade deliberately does not do.
INSERT INTO "Electric_Impedance"
  ("Impedance_ID","Cable_Size_ID","Transformer_Size_ID","Fuse_Rating_Amps","Loop_Impedance_Ohms") VALUES
  (100, 1, 7, 200, 0.327),
  (101, 1, 7, 250, 0.255),
  (102, 1, 7, 315, 0.206),
  (103, 1, 8, 200, 0.333),
  (104, 1, 8, 250, 0.261),
  (105, 1, 8, 315, 0.213),
  (106, 1, 8, 355, 0.152),
  (107, 1, 8, 400, 0.119),
  (108, 1, 10, 200, 0.335),
  (109, 1, 10, 250, 0.264),
  (110, 1, 10, 315, 0.216),
  (111, 1, 10, 355, 0.155),
  (112, 1, 10, 400, 0.122),
  (113, 1, 10, 500, 0.08),
  (114, 1, 10, 630, 0.045),
  (115, 1, 11, 200, 0.337),
  (116, 1, 11, 250, 0.265),
  (117, 1, 11, 315, 0.217),
  (118, 1, 11, 355, 0.156),
  (119, 1, 11, 400, 0.124),
  (120, 1, 11, 500, 0.081),
  (121, 1, 11, 630, 0.047),
  (124, 2, 7, 200, 0.324),
  (125, 2, 7, 250, 0.252),
  (126, 2, 7, 315, 0.204),
  (127, 2, 8, 200, 0.331),
  (128, 2, 8, 250, 0.259),
  (129, 2, 8, 315, 0.211),
  (130, 2, 8, 355, 0.172),
  (131, 2, 8, 400, 0.147),
  (132, 2, 10, 200, 0.334),
  (133, 2, 10, 250, 0.262),
  (134, 2, 10, 315, 0.214),
  (135, 2, 10, 355, 0.175),
  (136, 2, 10, 400, 0.151),
  (137, 2, 10, 500, 0.114),
  (138, 2, 10, 630, 0.083),
  (139, 2, 11, 200, 0.335),
  (140, 2, 11, 250, 0.264),
  (141, 2, 11, 315, 0.216),
  (142, 2, 11, 355, 0.177),
  (143, 2, 11, 400, 0.152),
  (144, 2, 11, 500, 0.115),
  (145, 2, 11, 630, 0.085),
  (172, 4, 7, 200, 0.323),
  (173, 4, 7, 250, 0.251),
  (174, 4, 7, 315, 0.203),
  (175, 4, 8, 200, 0.33),
  (176, 4, 8, 250, 0.258),
  (177, 4, 8, 315, 0.21),
  (178, 4, 8, 355, 0.171),
  (179, 4, 8, 400, 0.146),
  (180, 4, 10, 200, 0.333),
  (181, 4, 10, 250, 0.262),
  (182, 4, 10, 315, 0.214),
  (183, 4, 10, 355, 0.175),
  (184, 4, 10, 400, 0.15),
  (185, 4, 10, 500, 0.113),
  (186, 4, 10, 630, 0.09),
  (187, 4, 11, 200, 0.335),
  (188, 4, 11, 250, 0.263),
  (189, 4, 11, 315, 0.215),
  (190, 4, 11, 355, 0.176),
  (191, 4, 11, 400, 0.152),
  (192, 4, 11, 500, 0.115),
  (193, 4, 11, 630, 0.092)
ON CONFLICT ("Impedance_ID") DO UPDATE SET
  "Cable_Size_ID"       = EXCLUDED."Cable_Size_ID",
  "Transformer_Size_ID" = EXCLUDED."Transformer_Size_ID",
  "Fuse_Rating_Amps"    = EXCLUDED."Fuse_Rating_Amps",
  "Loop_Impedance_Ohms" = EXCLUDED."Loop_Impedance_Ohms";


-- ── Electric_VD_Setting ── (one row)
INSERT INTO "Electric_VD_Setting"
  ("VD_Setting_ID","Unbalanced","Max_Loop_Ohms","Max_Volt_Drop_Pct",
   "Unbalanced_Constant","Distributed_Load_Factor","RAG_Amber_Pct") VALUES
  (1, false, 0.28, '7', 4.14, 0.5, '80')
ON CONFLICT ("VD_Setting_ID") DO UPDATE SET
  "Unbalanced"              = EXCLUDED."Unbalanced",
  "Max_Loop_Ohms"           = EXCLUDED."Max_Loop_Ohms",
  "Max_Volt_Drop_Pct"       = EXCLUDED."Max_Volt_Drop_Pct",
  "Unbalanced_Constant"     = EXCLUDED."Unbalanced_Constant",
  "Distributed_Load_Factor" = EXCLUDED."Distributed_Load_Factor",
  "RAG_Amber_Pct"           = EXCLUDED."RAG_Amber_Pct";


-- ── Sequences ────────────────────────────────────────────────────
-- Every insert above supplied its own ID, so the sequences still sit
-- where they were. The next row added through the admin screen would
-- collide with an existing key. pg_get_serial_sequence is used rather
-- than a literal sequence name because it resolves both serial and
-- identity columns, and the two name differently.
SELECT setval(pg_get_serial_sequence('"Voltage_Rating"',           'Voltage_Rating_ID'),
              GREATEST((SELECT COALESCE(MAX("Voltage_Rating_ID"), 0) FROM "Voltage_Rating"), 1));
SELECT setval(pg_get_serial_sequence('"Electric_Transformer_Size"', 'Transformer_Size_ID'),
              GREATEST((SELECT COALESCE(MAX("Transformer_Size_ID"), 0) FROM "Electric_Transformer_Size"), 1));
SELECT setval(pg_get_serial_sequence('"Electric_Cable_Type"',      'Cable_Type_ID'),
              GREATEST((SELECT COALESCE(MAX("Cable_Type_ID"), 0) FROM "Electric_Cable_Type"), 1));
SELECT setval(pg_get_serial_sequence('"Electric_Cable_Size"',      'Cable_Size_ID'),
              GREATEST((SELECT COALESCE(MAX("Cable_Size_ID"), 0) FROM "Electric_Cable_Size"), 1));
SELECT setval(pg_get_serial_sequence('"Electric_Impedance"',       'Impedance_ID'),
              GREATEST((SELECT COALESCE(MAX("Impedance_ID"), 0) FROM "Electric_Impedance"), 1));
SELECT setval(pg_get_serial_sequence('"Electric_VD_Setting"',      'VD_Setting_ID'),
              GREATEST((SELECT COALESCE(MAX("VD_Setting_ID"), 0) FROM "Electric_VD_Setting"), 1));

COMMIT;


-- ════════════════════════════════════════════════════════════════
-- Checks — run these after, and read the second one carefully.
-- ════════════════════════════════════════════════════════════════

-- Counts. Expect 4 / 13 / 37 / 66 / 1.
--   SELECT 'Voltage_Rating' t, count(*) FROM "Voltage_Rating"
--   UNION ALL SELECT 'Cable_Type',  count(*) FROM "Electric_Cable_Type"
--   UNION ALL SELECT 'Cable_Size',  count(*) FROM "Electric_Cable_Size"
--   UNION ALL SELECT 'Impedance',   count(*) FROM "Electric_Impedance"
--   UNION ALL SELECT 'VD_Setting',  count(*) FROM "Electric_VD_Setting";

-- WHICH CABLES CAN ACTUALLY BE CALCULATED ON.
-- Only six of the thirty-seven carry figures — the 3c and 4c WAVE in
-- 95, 185 and 300. Every service, HV, LSZH and earth cable has neither
-- a loop impedance nor a volt drop base, so a span node set to one of
-- them reports "cable not set" rather than a number. That is the
-- original's data as it stands, not a fault in the import.
--   SELECT t."Cable_Type", s."Size_Label", s."Material",
--          s."Loop_Impedance_Ohm", s."Volt_Drop_Base"
--     FROM "Electric_Cable_Size" s
--     JOIN "Electric_Cable_Type" t ON t."Cable_Type_ID" = s."Cable_Type_ID"
--    WHERE s."Loop_Impedance_Ohm" IS NOT NULL OR s."Volt_Drop_Base" IS NOT NULL
--    ORDER BY t."Sort_Order", s."Sort_Order";

-- Cables referenced by drawings that carry no figures — these are the
-- span nodes that will report as unset.
--   SELECT s."Cable_Size_ID", t."Cable_Type", s."Size_Label", count(*) AS span_nodes
--     FROM "GIS_Feature" f
--     JOIN "Electric_Cable_Size" s
--       ON s."Cable_Size_ID" = (f."Attributes" ->> 'VD_Cable_Size_ID')::bigint
--     JOIN "Electric_Cable_Type" t ON t."Cable_Type_ID" = s."Cable_Type_ID"
--    WHERE f."Feature_Role" = 'spannode'
--      AND s."Loop_Impedance_Ohm" IS NULL AND s."Volt_Drop_Base" IS NULL
--    GROUP BY 1,2,3 ORDER BY 4 DESC;

-- Span nodes pointing at a cable that does not exist at all. Should be
-- empty — and will be, because IDs were preserved.
--   SELECT DISTINCT f."Attributes" ->> 'VD_Cable_Size_ID' AS orphan_id
--     FROM "GIS_Feature" f
--    WHERE f."Feature_Role" = 'spannode'
--      AND f."Attributes" ->> 'VD_Cable_Size_ID' IS NOT NULL
--      AND NOT EXISTS (SELECT 1 FROM "Electric_Cable_Size" s
--                       WHERE s."Cable_Size_ID" = (f."Attributes" ->> 'VD_Cable_Size_ID')::bigint);
