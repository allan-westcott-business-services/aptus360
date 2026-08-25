-- Is each placed non-residential supply actually being counted?
--
-- Four things all have to be true before its load reaches the volt drop
-- and the impedance. Any one missing and the supply sits on the drawing
-- looking connected while contributing nothing — which reads as a
-- lighter design rather than as an error.

SELECT
  f."Project_ID",
  f."Feature_ID",
  f."Label",
  n."Supply_Ref",
  n."Requested_kVA",
  f."Attributes" ->> 'Circuit_ID' AS circuit_id,
  CASE
    WHEN n."NRS_ID" IS NULL
      THEN 'NO - NRS_ID points at no record'
    WHEN f."Attributes" ->> 'Circuit_ID' IS NULL
      THEN 'NO - on no circuit, so every trace prunes it out'
    WHEN NOT EXISTS (
      SELECT 1 FROM "GIS_Feature" o
       WHERE o."Project_ID" = f."Project_ID"
         AND o."Feature_Role" = 'spannode'
         AND o."Attributes" ->> 'Circuit_ID' = f."Attributes" ->> 'Circuit_ID')
      THEN 'NO - that circuit has no span nodes to trace along'
    WHEN n."Requested_kVA" IS NULL OR n."Requested_kVA" = 0
      THEN 'PARTLY - counted as a customer, but carries no load'
    ELSE 'YES'
  END AS counted,
  f."Attributes" ->> 'Supply_Type' AS supply_type
FROM "GIS_Feature" f
LEFT JOIN "Non_Residential_Supply" n
       ON n."NRS_ID" = (f."Attributes" ->> 'NRS_ID')::bigint
WHERE f."Feature_Role" = 'meter'
  AND f."Attributes" ->> 'NRS_ID' IS NOT NULL
ORDER BY f."Project_ID", f."Feature_ID";


-- ── Reading it ──────────────────────────────────────────────────
--
-- YES      its Requested_kVA is in the cumulative load at every node
--          downstream, so both the volt drop and the phase current
--          move. Loop impedance does NOT move — that is length and
--          cable only, and a supply adds neither to the main.
--
-- PARTLY   the worst state, and the quiet one. It counts as a customer
--          for the unbalanced correction, which is keyed on how MANY
--          are on a section, while adding nothing to the load. So it
--          raises 1 + 4.14/sqrt(K) by making K larger, and the figures
--          come out slightly LOWER than without it. Fill in
--          Requested_kVA on the project record.
--
-- NO       on the drawing, off the calculation.
--
-- supply_type should read 'nrs'. Anything else and it draws as an
-- ordinary meter square rather than a black triangle — cosmetic only,
-- the load is unaffected.


-- ── Proving it, rather than trusting this ───────────────────────
-- Run the levels check, note the phase current at E0, then:
--
--   UPDATE "GIS_Feature" SET "Attributes" = "Attributes" - 'Circuit_ID'
--    WHERE "Feature_ID" = <the supply>;
--
-- Re-run. The current at E0 should fall by exactly
-- Requested_kVA x 1000 / (sqrt(3) x Output_V). Put the Circuit_ID back
-- and it should return. Amps is the honest column here: it is worked
-- out from the unweighted load, so it moves by the whole of the
-- supply's kVA, where the volt drop moves by a weighted share.
