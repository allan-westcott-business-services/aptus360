-- ════════════════════════════════════════════════════════════════
-- 0196 — a non-residential supply is a seed, not a meter
--
-- 0194 made a supply BE a meter: one point, Feature_Role 'meter',
-- carrying NRS_ID and Supply_Type. Its reasoning was that fifty places
-- ask whether something is a meter and a new role would need every one
-- of them auditing.
--
-- That reasoning is sound and the conclusion is wrong, because it can
-- only ever describe an ELECTRIC supply. It is why placement hard-codes
-- Layer_Key 'electric' and Meter_Utility 'Electric', and why the record
-- takes exactly one utility. A pumping station needing a water
-- connection as well as a three-phase supply cannot be said at all.
--
-- ── What a supply actually is ──
--
-- A plot seed with a different symbol. The seed marks where the thing
-- is; the meters are placed against it, up to one per utility, exactly
-- as a dwelling has gas, water and electric. So:
--
--   the supply    Feature_Role 'nrs', a black triangle, NRS_ID on it
--   its meters    Feature_Role 'meter', one per utility, NRS_ID on each
--
-- ── Why the load does not move ──
--
-- circuitKva already reads NRS_ID off the METER, not off the supply
-- point:
--
--   const kva = m.Attributes?.NRS_ID != null
--     ? nrsById(m.Attributes.NRS_ID)?.Requested_kVA : ...plot lookup
--
-- so a meter carrying NRS_ID goes on contributing its Requested_kVA
-- with nothing in the volt drop or the way-fuse comparison changing.
-- meterBelongsTo likewise already has a fallback for a seed with no
-- plot behind it. The load model was built for this shape; only the
-- placement was not.
--
-- ** Do not run this before the code that goes with it is deployed. **
-- It expects a role the canvas draws nothing for until then, and a
-- supply nobody can see is the fault this whole thread started with.
--
-- ── Nothing is converted ──
--
-- An earlier draft of this migration turned the three supplies already
-- on drawings into seeds in place, kept the two that were carrying load
-- as meters, and put a seed three metres from each. It worked and it
-- guessed: three metres east and three south is not where a pump is,
-- and somebody would have had to drag both of them anyway.
--
-- They are being deleted and re-placed instead, which is the right
-- answer while there are three of them and would be the wrong answer at
-- three hundred. See the step below.
-- ════════════════════════════════════════════════════════════════

-- ── Run this first ─────────────────────────────────────────────
--
-- Take the supplies placed under 0194 off the drawings. They are the
-- old shape — the supply IS its own electric meter — and leaving one
-- behind is worse than either shape on its own: the canvas would offer
-- to place a supply that is already there, because "placed" now means
-- its SEED is on the drawing, while the old point went on carrying its
-- load on the circuit.
--
-- Look at what is about to go:
--
--   SELECT "Feature_ID","Project_ID","Label","Feature_Role",
--          "Attributes" ->> 'NRS_ID'     AS nrs_id,
--          "Attributes" ->> 'Circuit_ID' AS circuit,
--          "Attributes" ->> 'Connects'   AS connects
--     FROM "GIS_Feature"
--    WHERE "Attributes" ->> 'NRS_ID' IS NOT NULL
--    ORDER BY "Project_ID","Feature_ID";
--
-- Expect three: Pump 1 and Pump 2 on circuit 1, and TBS1 on none, all
-- three connecting to nothing. If any row has a Connects, stop — a
-- supply with a service run to it leaves a cable ending in mid-air, and
-- that wants deleting through the canvas so the cascade is asked about.
--
--   DELETE FROM "GIS_Feature"
--    WHERE "Attributes" ->> 'NRS_ID' IS NOT NULL;
--
-- The Non_Residential_Supply records are NOT touched. It is the marks
-- on the drawing that are being removed, not the supplies themselves —
-- they go back on the canvas from the Place menu, which will offer all
-- three again the moment their seeds are gone.

BEGIN;

-- ── 1. A supply has utilities, plural ───────────────────────────
--
-- Many-to-many, like Project_Scope and for the same reason: the answer
-- is a set, and a column can only hold one of them. The single
-- Utility_ID it replaces is seeded across and then left alone — see the
-- foot of this file.
--
-- No Utility rows of its own are invented. The picker offers whatever
-- "Utility" holds, which on this system includes Section 38 On Site,
-- Section 278 Off Site and Private Street Lighting as well as the three
-- that are metered. Only the ones mapping to a drawing layer can take a
-- meter, and that is the application's business, not this table's.
CREATE TABLE IF NOT EXISTS "NRS_Utility" (
  "NRS_Utility_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "NRS_ID"     bigint NOT NULL REFERENCES "Non_Residential_Supply" ON DELETE CASCADE,
  "Utility_ID" bigint NOT NULL REFERENCES "Utility"
);

-- One row per pairing. Neither column is nullable, so a plain unique
-- index is honest here — unlike gis_style_scope_uniq, which needs
-- COALESCE because NULL never equals NULL and a scope is mostly nulls.
CREATE UNIQUE INDEX IF NOT EXISTS nrs_utility_uniq
  ON "NRS_Utility" ("NRS_ID", "Utility_ID");

CREATE INDEX IF NOT EXISTS nrs_utility_nrs_idx ON "NRS_Utility" ("NRS_ID");

ALTER TABLE "NRS_Utility" ENABLE ROW LEVEL SECURITY;

-- Every supply that already names a utility keeps it.
INSERT INTO "NRS_Utility" ("NRS_ID", "Utility_ID")
SELECT n."NRS_ID", n."Utility_ID"
  FROM "Non_Residential_Supply" n
 WHERE n."Utility_ID" IS NOT NULL
ON CONFLICT DO NOTHING;


-- ── 2. 'nrs' is a feature role ──────────────────────────────────
--
-- The whole list again, taken from what the application writes rather
-- than carried forward from 0187. That is the instruction 0168 left,
-- 0181 repeated and 0187 repeated again, and it is the only method that
-- catches a role dropped by the previous statement rather than
-- inherited from it.
ALTER TABLE "GIS_Feature" DROP CONSTRAINT IF EXISTS "GIS_Feature_Feature_Role_check";

ALTER TABLE "GIS_Feature"
  ADD CONSTRAINT "GIS_Feature_Feature_Role_check"
  CHECK ("Feature_Role" IN
    ('shape','plot','meter','poc','substation','joint','source','spannode',
     'linkbox','column','governor','servicevalve','pumping','hvtt','reducer',
     'nrs'));


-- ── 3. The triangle belongs to the role now ─────────────────────
--
-- 0195 scoped it to Feature_Role 'meter' with Supply_Type 'nrs',
-- because under 0194 the supply was a meter and Supply_Type was the
-- only thing that could tell it apart. With a role of its own the role
-- is the scope, and Supply_Type goes back to being null — which matches
-- everything and narrows nothing.
--
-- Updated rather than deleted and re-inserted, so anything already
-- edited on that row — a colour somebody preferred, a size — survives.
UPDATE "GIS_Style"
   SET "Feature_Role" = 'nrs',
       "Supply_Type"  = NULL
 WHERE "Feature_Role" = 'meter'
   AND "Supply_Type"  = 'nrs';

-- If 0195 was never run, there is nothing to update and this puts the
-- rule in directly. The scope index has Supply_Type in it either way.
INSERT INTO "GIS_Style"
  ("Style_Name","Feature_Role","Symbol","Symbol_Size_Px","Colour","Sort_Order")
VALUES
  ('Non-residential supply', 'nrs', 'triangle', 10, '#000000', 205)
ON CONFLICT DO NOTHING;


-- ── 4. Nothing here ────────────────────────────────────────────
--
-- The supplies already placed are removed by hand before this runs —
-- see the step above the BEGIN. Converting them is not attempted,
-- because the only honest conversion needs a position nobody has
-- recorded: under 0194 the point IS the meter, and where the supply
-- itself stands was never asked for.

COMMIT;


-- ── Check ───────────────────────────────────────────────────────
--
-- The role is there, and reads sixteen ending in nrs:
--
--   SELECT pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname = 'GIS_Feature_Feature_Role_check';
--
-- The triangle now belongs to the role rather than to a meter with a
-- supply type. One row, Feature_Role 'nrs', Supply_Type null:
--
--   SELECT "Style_Name","Feature_Role","Supply_Type","Symbol","Colour"
--     FROM "GIS_Style"
--    WHERE "Feature_Role" IN ('meter','nrs') ORDER BY "Sort_Order";
--
-- The utilities came across from the single column:
--
--   SELECT n."Supply_Ref", u."Utility"
--     FROM "Non_Residential_Supply" n
--     JOIN "NRS_Utility" nu ON nu."NRS_ID" = n."NRS_ID"
--     JOIN "Utility" u ON u."Utility_ID" = nu."Utility_ID"
--    ORDER BY n."NRS_ID";
--
-- And no supply is on any drawing yet:
--
--   SELECT count(*) FROM "GIS_Feature"
--    WHERE "Attributes" ->> 'NRS_ID' IS NOT NULL;
--
-- ── Afterwards ──
--
-- Tick the utilities each supply takes on the Non-Res Supplies tab —
-- the three that came across name one each, and a pumping station
-- taking water as well as electric can now say so. Then place them from
-- the canvas: a click for the seed, then one per metered utility.
--
-- Pump 1 and Pump 2 were on Circuit 1 and are not on it now. Re-place
-- them, run the service to them, and put them back on the circuit
-- before reading any levels check — twenty kVA missing from a way reads
-- as headroom, which is the one direction a wrong number is dangerous
-- in.
--
-- ── Still to do, deliberately not here ──
--
-- "Non_Residential_Supply"."Utility_ID" is now read by nothing. It is
-- left standing rather than dropped in the same migration that stops
-- using it, so a deploy can be rolled back without losing which utility
-- each supply named. When the set has been in use long enough to trust:
--
--   ALTER TABLE "Non_Residential_Supply" DROP COLUMN "Utility_ID";
--
-- Check first that every supply carrying one has a matching row:
--
--   SELECT n."NRS_ID", n."Supply_Ref", n."Utility_ID"
--     FROM "Non_Residential_Supply" n
--    WHERE n."Utility_ID" IS NOT NULL
--      AND NOT EXISTS (SELECT 1 FROM "NRS_Utility" nu
--                       WHERE nu."NRS_ID" = n."NRS_ID"
--                         AND nu."Utility_ID" = n."Utility_ID");
-- ════════════════════════════════════════════════════════════════
