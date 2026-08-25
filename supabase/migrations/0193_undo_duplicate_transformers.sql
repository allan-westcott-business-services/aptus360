-- ════════════════════════════════════════════════════════════════
-- 0193 — undo the duplicate transformers 0189 created
--
-- 0189 seeded Electric_Transformer_Size on the assumption that it was
-- empty, because no export had been supplied for it. It was not. The
-- table already held IDs 1-5, and the seed added four more beside them:
--
--   2   315 kVA    315   0.02606      7   300/315   315   0.02733
--   3   500 kVA    500   0.01644      8   500       500   0.01644
--   4   800 kVA    800   0.01022     10   750/800   800   0.01098
--   5  1000 kVA   1000   0.00820     11   1000     1000   0.00820
--
-- Two entries for each of four transformers. Left alone, a designer
-- picking "500" from the dropdown sees it twice with no way to tell
-- which, and two schemes on the same transformer can be checked against
-- different rows.
--
-- ── Which set survives ──
--
-- IDs 1-5, for two reasons.
--
-- They came first, so any drawing that already names a transformer
-- names one of them. The seeded four had existed for hours and no
-- drawing can have been made against them — 0192's own check showed
-- zero scopes configured, and the POC-fed scheme this all came from
-- carries no transformer at all.
--
-- And they answer a question 0189 could not. That migration flagged a
-- judgement call: the workbook lists 315 and 300/315 separately
-- (0.02606 / 0.02733), and 800 and 750/800 (0.01022 / 0.01098), and it
-- guessed the slash variants from the workbook's own dropdown. Rows 2
-- and 4 settle it — this business uses the plain sizes, 0.02606 and
-- 0.01022. The guess was wrong and is being reverted, which is the
-- better outcome than it never having been visible.
--
-- Note 500 and 1000 carry identical figures in both sets, so only the
-- 315 and 800 pairs actually disagreed.
--
-- ── What has to move first ──
--
-- Electric_Impedance references 7, 8, 10 and 11 — those are the IDs the
-- ORIGINAL app used, which is why the exported matrix names them.
-- Deleting the rows without repointing first would either fail on the
-- foreign key or orphan 66 rows.
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- Nothing to do if 0189's transformer block was already removed.
DO $t$
DECLARE
  moved int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Electric_Transformer_Size"
                  WHERE "Transformer_Size_ID" IN (7, 8, 10, 11)) THEN
    RAISE NOTICE 'No duplicate transformers present - nothing to undo.';
    RETURN;
  END IF;

  /* Guard: only proceed if the survivors are actually there. Repointing
     onto rows that do not exist would trade a duplicate for an orphan. */
  IF (SELECT count(*) FROM "Electric_Transformer_Size"
       WHERE "Transformer_Size_ID" IN (2, 3, 4, 5)) <> 4 THEN
    RAISE EXCEPTION
      'Transformers 2, 3, 4, 5 are not all present - resolve by hand rather than running this.';
  END IF;

  -- The impedance matrix, 66 rows.
  UPDATE "Electric_Impedance" SET "Transformer_Size_ID" =
    CASE "Transformer_Size_ID" WHEN 7 THEN 2 WHEN 8 THEN 3
                               WHEN 10 THEN 4 WHEN 11 THEN 5 END
   WHERE "Transformer_Size_ID" IN (7, 8, 10, 11);
  GET DIAGNOSTICS moved = ROW_COUNT;
  RAISE NOTICE 'Electric_Impedance: % rows repointed.', moved;

  /* Any drawing that named one of the four. Expected to be none, but
     checked rather than assumed — a substation left pointing at a
     deleted row reports "source not set" and starts every circuit at
     zero ohms, which reads better than the truth. */
  UPDATE "GIS_Feature" SET "Attributes" = jsonb_set(
    "Attributes", '{VD_Transformer_Size_ID}',
    to_jsonb(CASE ("Attributes" ->> 'VD_Transformer_Size_ID')::bigint
               WHEN 7 THEN 2 WHEN 8 THEN 3 WHEN 10 THEN 4 WHEN 11 THEN 5 END))
   WHERE "Feature_Role" = 'substation'
     AND ("Attributes" ->> 'VD_Transformer_Size_ID') ~ '^[0-9]+$'
     AND ("Attributes" ->> 'VD_Transformer_Size_ID')::bigint IN (7, 8, 10, 11);
  GET DIAGNOSTICS moved = ROW_COUNT;
  RAISE NOTICE 'Substations: % repointed.', moved;

  DELETE FROM "Electric_Transformer_Size" WHERE "Transformer_Size_ID" IN (7, 8, 10, 11);
  RAISE NOTICE 'Duplicate transformers removed. Five remain.';
END $t$;

COMMIT;


-- ════════════════════════════════════════════════════════════════
-- BEFORE 0189 IS EVER RUN AGAIN
--
-- It is idempotent, which here works against you: re-running it puts
-- 7, 8, 10 and 11 straight back. Delete or comment out its
-- Electric_Transformer_Size block — the one headed "recovered from the
-- workbook" — so that a fresh database gets your five and not both.
-- ════════════════════════════════════════════════════════════════


-- ── One gap this exposed ────────────────────────────────────────
-- ID 1, 200 kVA, has NO loop impedance. A scheme on that transformer
-- starts at zero ohms and every figure downstream reads better than the
-- truth, with nothing on screen to say so. The workbook gives 0.04013
-- for a 200 kVA ("Transformer ELI's"!G17) — but given rows 2 and 4 use
-- the plain sizes rather than the workbook's slash variants, confirm
-- this against the same source those came from before setting it:
--
--   UPDATE "Electric_Transformer_Size"
--      SET "Loop_Impedance_Ohm" = 0.04013 WHERE "Transformer_Size_ID" = 1;


-- ── Checks ──────────────────────────────────────────────────────
-- Five rows, no duplicate ratings.
--   SELECT "Transformer_Size_ID", "Label", "Rating_kVA", "Loop_Impedance_Ohm"
--     FROM "Electric_Transformer_Size" ORDER BY "Rating_kVA";
--
-- The matrix still resolves - expect 66 and no nulls.
--   SELECT count(*) AS rows, count(t."Transformer_Size_ID") AS resolving
--     FROM "Electric_Impedance" i
--     LEFT JOIN "Electric_Transformer_Size" t
--            ON t."Transformer_Size_ID" = i."Transformer_Size_ID";
--
-- No substation left pointing at a transformer that is gone.
--   SELECT "Feature_ID", "Label", "Attributes" ->> 'VD_Transformer_Size_ID' AS points_at
--     FROM "GIS_Feature"
--    WHERE "Feature_Role" = 'substation'
--      AND ("Attributes" ->> 'VD_Transformer_Size_ID') IS NOT NULL
--      AND NOT EXISTS (SELECT 1 FROM "Electric_Transformer_Size" t
--                       WHERE t."Transformer_Size_ID"
--                             = ("Attributes" ->> 'VD_Transformer_Size_ID')::bigint);
