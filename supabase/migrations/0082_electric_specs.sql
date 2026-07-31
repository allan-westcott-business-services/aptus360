-- ════════════════════════════════════════════════════════════════
-- 0082 — electric specs: cables, transformers, limits
--
-- What the span trace needs before it can show phase current, loop
-- impedance and volt drop. The original works these out from four
-- tables and a settings row, and the formulas it uses are recorded in
-- its own comments as verified against regulat.xls:
--
--   Ω   = (length ÷ 1000) × the cable's loop impedance per km
--   %VD = (distributed kVA × factor + terminal kVA)
--         × (volt drop base × 10⁻⁶) × length in metres × correction
--
-- where the correction is 1 + constant ÷ √(meter count) when the network
-- is set to unbalanced. That correction keys on customer count on the
-- section rather than current, which is unusual enough to be worth
-- stating: it comes from the spreadsheet and was confirmed against two
-- independent sections of it.
--
-- Distributed load is what a leg picks up along its length; terminal is
-- what it carries onward. The distributed half counts at half weight by
-- default, because a load tapped half way along drops half as much as
-- one at the end.
--
-- The tables are left empty. These are catalogue figures and they are
-- yours to bring across; seeding a guess would produce numbers that look
-- authoritative and are not.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "Electric_Cable_Type" (
  "Electric_Cable_Type_ID" bigserial PRIMARY KEY,
  "Type_Name"              text NOT NULL UNIQUE,
  "Sort_Order"             integer NOT NULL DEFAULT 0,
  "Is_Active"              boolean NOT NULL DEFAULT true
);
ALTER TABLE "Electric_Cable_Type" ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS "Electric_Cable_Size" (
  "Electric_Cable_Size_ID" bigserial PRIMARY KEY,
  "Electric_Cable_Type_ID" bigint NOT NULL REFERENCES "Electric_Cable_Type",
  "Size_Label"             text NOT NULL,
  -- Ohms per kilometre, out and back. The loop half of the sum.
  "Loop_Impedance_Ohm"     numeric,
  -- The %VD coefficient, in units of 10⁻⁶ per kVA per metre. Stored as
  -- the base figure rather than scaled, because that is how the
  -- catalogue quotes it.
  "Volt_Drop_Base"         numeric,
  "Sort_Order"             integer NOT NULL DEFAULT 0,
  "Is_Active"              boolean NOT NULL DEFAULT true,
  -- One entry per size per type. The original de-duplicates on read
  -- because its data had the same cable under several casings; a
  -- constraint stops that arising in the first place.
  UNIQUE ("Electric_Cable_Type_ID", "Size_Label")
);
ALTER TABLE "Electric_Cable_Size" ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS "Electric_Transformer_Size" (
  "Electric_Transformer_Size_ID" bigserial PRIMARY KEY,
  "Size_Label"                   text NOT NULL UNIQUE,
  "Size_kVA"                     numeric,
  -- The baseline the whole circuit starts from: every loop impedance
  -- figure downstream is added to this.
  "Loop_Impedance_Ohm"           numeric,
  "Sort_Order"                   integer NOT NULL DEFAULT 0,
  "Is_Active"                    boolean NOT NULL DEFAULT true
);
ALTER TABLE "Electric_Transformer_Size" ENABLE ROW LEVEL SECURITY;


-- Cable and transformer together, with a fuse rating. The original loads
-- this but its volt drop factor comes from the cable size's own
-- Volt_Drop_Base, so nothing reads these rows yet. Kept because the data
-- exists and discarding it on import would be harder to undo than
-- carrying it.
CREATE TABLE IF NOT EXISTS "Electric_Impedance" (
  "Electric_Impedance_ID"        bigserial PRIMARY KEY,
  "Electric_Cable_Size_ID"       bigint REFERENCES "Electric_Cable_Size",
  "Electric_Transformer_Size_ID" bigint REFERENCES "Electric_Transformer_Size",
  "Fuse_A"                       numeric,
  "Volt_Drop_Factor"             numeric
);
ALTER TABLE "Electric_Impedance" ENABLE ROW LEVEL SECURITY;


-- ── Limits and constants ─────────────────────────────────────────
-- One row. The defaults are the original's, which are regulat.xls's own.
CREATE TABLE IF NOT EXISTS "Electric_VD_Setting" (
  "Electric_VD_Setting_ID" bigserial PRIMARY KEY,
  "Unbalanced"             boolean NOT NULL DEFAULT false,
  "Max_Loop_Ohms"          numeric NOT NULL DEFAULT 0.28,
  "Max_Volt_Drop_Pct"      numeric NOT NULL DEFAULT 7,
  "Unbalanced_Constant"    numeric NOT NULL DEFAULT 4.14,
  "Distributed_Load_Factor" numeric NOT NULL DEFAULT 0.5,
  "RAG_Amber_Pct"          numeric NOT NULL DEFAULT 80,
  -- Exactly one row, enforced rather than assumed: the app reads the
  -- first it finds, and a second would silently change the answer
  -- depending on order.
  "Only_Row"               boolean NOT NULL DEFAULT true UNIQUE
);
ALTER TABLE "Electric_VD_Setting" ENABLE ROW LEVEL SECURITY;

INSERT INTO "Electric_VD_Setting" ("Only_Row") VALUES (true)
ON CONFLICT ("Only_Row") DO NOTHING;


-- ── What a drawing records ───────────────────────────────────────
-- The cable feeding a span node, and the transformer at the substation.
-- Both live in GIS_Feature.Attributes, so nothing is added to the table:
--
--   span node    Attributes.VD_Cable_Size_ID
--   substation   Attributes.VD_Transformer_Size_ID
--
-- A span node's cable is the one feeding that point — the stretch from
-- the previous span node to this one — which is why the sum walks span
-- to span rather than cable to cable.


-- ── Check ───────────────────────────────────────────────────────
-- The cable catalogue, once imported:
--   SELECT t."Type_Name", s."Size_Label", s."Loop_Impedance_Ohm", s."Volt_Drop_Base"
--     FROM "Electric_Cable_Size" s
--     JOIN "Electric_Cable_Type" t ON t."Electric_Cable_Type_ID" = s."Electric_Cable_Type_ID"
--    ORDER BY t."Sort_Order", t."Type_Name", s."Sort_Order";
--
-- A cable with neither figure cannot contribute to either column, and
-- the trace will report it as unset rather than as zero:
--   SELECT * FROM "Electric_Cable_Size"
--    WHERE "Loop_Impedance_Ohm" IS NULL AND "Volt_Drop_Base" IS NULL;
--
-- The limits in force:
--   SELECT * FROM "Electric_VD_Setting";
--
-- Which span nodes have a cable set — the trace needs one on every node
-- along a route before it can total that route:
--   SELECT f."Attributes" ->> 'Circuit_Letter' AS circuit,
--          f."Attributes" ->> 'Span_Label'     AS node,
--          f."Attributes" ->> 'VD_Cable_Size_ID' AS cable
--     FROM "GIS_Feature" f
--    WHERE f."Feature_Role" = 'spannode' AND f."Project_ID" = <project>
--    ORDER BY 1, (f."Attributes" ->> 'Span_Seq')::int;
