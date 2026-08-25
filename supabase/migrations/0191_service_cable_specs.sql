-- ════════════════════════════════════════════════════════════════
-- 0191 — service cable specifications, from the workbook
--
-- Source: impedances!D41:G44 for the rating and the volt drop base,
-- and "Transformer ELI's"!I3:J4 for the loop impedance, which is a
-- separate two-cell table by size (25 -> 1.2, 35 -> 0.9785) and not
-- part of the block in D41:G44.
--
-- These are UPDATEs, not inserts. The rows already exist — 0189
-- carried across all 37 cable sizes, and the twelve service entries
-- came over with every electrical figure null because the original's
-- catalogue never held them. Inserting would duplicate.
--
-- ── This changes no levels figure today ──
-- voltDrop.js walks span nodes on the main only and never adds the
-- service tail from the main to the cut-out. Recording these makes the
-- Cable Specs screen complete and is the groundwork for that gap; it
-- does not close it on its own.
--
-- ── Why 35mm reads WORSE than 25mm ──
-- 3094 against 697 looks inverted for a larger cable. It is not: the
-- 3c25 entries are THREE PHASE and the 35 entries are SINGLE PHASE.
-- A single phase service carries its whole load on one phase and
-- returns it through the neutral, so the drop per kVA per metre is
-- several times higher regardless of being the larger conductor. The
-- two figures are not comparable and should not be sorted against each
-- other.
--
-- Within a like-for-like pair the ordering is the expected one:
-- 35 SCNE-Cu at 2201 beats 35 CNE aluminium at 3094, copper being the
-- better conductor.
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── 3c25 CNE → 3 Phase Service, 25mm, Aluminium ──
UPDATE "Electric_Cable_Size" SET
  "Rating_Amps"        = 116,
  "Volt_Drop_Base"     = 697,
  "Loop_Impedance_Ohm" = 1.2
WHERE "Cable_Size_ID" = 52;

-- ── 35 CNE → Single Phase Service CNE, 35mm, Aluminium ──
UPDATE "Electric_Cable_Size" SET
  "Rating_Amps"        = 174,
  "Volt_Drop_Base"     = 3094,
  "Loop_Impedance_Ohm" = 0.9785
WHERE "Cable_Size_ID" = 51;

COMMIT;


-- ════════════════════════════════════════════════════════════════
-- NOT APPLIED — two rows need a decision first
-- ════════════════════════════════════════════════════════════════
--
-- ── 3c25 SCNE (116 A, 699) ──
-- The catalogue has one "3 Phase Service" type and does not split it
-- into CNE and SCNE, so there is no row for this to land on. Either it
-- needs a new type, or the 3-phase service is only ever specified one
-- way and this line of the workbook is unused. Note 697 against 699 is
-- a 0.3% difference — if the distinction is not carried anywhere else,
-- it may not be worth a type of its own.
--
--   INSERT INTO "Electric_Cable_Type"
--     ("Cable_Type","Usage_Type","Voltage_Rating_ID","Sort_Order","Is_Active")
--   VALUES ('3 Phase Service SCNE','Service',<voltage_rating_id>,<sort>,true);
--   -- then add a 25mm size against the new Cable_Type_ID with
--   -- Rating_Amps 116, Volt_Drop_Base 699, Loop_Impedance_Ohm 1.2
--
-- ── 35 SCNE - Cu (174 A, 2201) ──
-- The workbook says COPPER. Neither candidate row is a clean match:
--
--   ID 67  Single Phase Service SNE, 35mm, ALUMINIUM
--   ID 64  LSZH SINGLE PHASE,        35mm, Copper  (label "35.")
--
-- SNE and SCNE are not the same construction — separate neutral and
-- earth against split concentric neutral and earth — so ID 67 is a
-- match on neither material nor type, and taking it on the strength of
-- three shared letters would be a guess. ID 64 has the right material
-- but LSZH is a sheath specification, a different axis entirely.
--
-- Whichever it is:
--
--   UPDATE "Electric_Cable_Size" SET
--     "Rating_Amps" = 174, "Volt_Drop_Base" = 2201, "Loop_Impedance_Ohm" = 0.9785
--   WHERE "Cable_Size_ID" = <67 or 64 or a new row>;
--
-- ── Also unfigured ──
-- ID 53, 3 Phase Service 35mm, has no counterpart in the workbook at
-- all. It stays null and will report "cable not set" if a service is
-- ever specified on it.


-- ── Checks ──────────────────────────────────────────────────────
-- Every service cable and what it now carries. The two updated read
-- their figures; the rest are still null and will report "cable not
-- set" rather than a wrong number, which is the safe failure.
--   SELECT s."Cable_Size_ID", t."Cable_Type", s."Size_Label", s."Material",
--          s."Rating_Amps", s."Volt_Drop_Base", s."Loop_Impedance_Ohm"
--     FROM "Electric_Cable_Size" s
--     JOIN "Electric_Cable_Type" t ON t."Cable_Type_ID" = s."Cable_Type_ID"
--    WHERE t."Usage_Type" = 'Service'
--    ORDER BY t."Sort_Order", s."Sort_Order";
--
-- Confirm nothing was duplicated — expect 37.
--   SELECT count(*) FROM "Electric_Cable_Size";
