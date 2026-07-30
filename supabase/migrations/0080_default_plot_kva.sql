-- ════════════════════════════════════════════════════════════════
-- 0080 — a working kVA load per plot
--
-- Circuit sizing, the circuit report and the feeder build all read
-- Plot.KVA_Load, and a plot with none contributes nothing. A circuit of
-- seventy houses totalling 0 kVA is not a small circuit, it is an
-- unanswered question — and it looks the same on screen as a real
-- figure.
--
-- So every plot without one gets 2.2 kVA. That is a placeholder standing
-- in until proper reference data arrives, and it is deliberately set on
-- the plot rather than defaulted in code: a figure on the row can be
-- seen, questioned and overridden, whereas one applied silently at
-- calculation time cannot.
--
-- Plots that already carry a load are left alone. Someone entered those.
-- ════════════════════════════════════════════════════════════════

UPDATE "Plot"
   SET "KVA_Load" = 2.2
 WHERE "KVA_Load" IS NULL;

-- New plots get it too, so the placeholder does not have to be
-- reapplied every time a project is added. Reference data replacing
-- this should drop the default as well as backfilling the rows —
-- otherwise it quietly reappears on the next plot created.
ALTER TABLE "Plot" ALTER COLUMN "KVA_Load" SET DEFAULT 2.2;


-- ── Check ───────────────────────────────────────────────────────
-- Expect no rows: a plot with no load.
--   SELECT "Plot_ID", "Plot_Number" FROM "Plot" WHERE "KVA_Load" IS NULL;
--
-- The spread of loads. Anything other than 2.2 was entered by someone
-- and has been left as it was:
--   SELECT "KVA_Load", COUNT(*) FROM "Plot" GROUP BY 1 ORDER BY 1;
--
-- What a circuit now totals — the figure the circuit report and the
-- feeder build work from:
--   SELECT p."Project_Ref", COUNT(*) AS plots,
--          ROUND(SUM(pl."KVA_Load"), 1) AS kva
--     FROM "Plot" pl JOIN "Project" p ON p."Project_ID" = pl."Project_ID"
--    GROUP BY 1 ORDER BY 1;
--
-- To undo once real data arrives:
--   ALTER TABLE "Plot" ALTER COLUMN "KVA_Load" DROP DEFAULT;
