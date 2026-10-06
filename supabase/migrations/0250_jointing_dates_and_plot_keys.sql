-- ── Jointing dates, and the keys that carry plots across ─────────────
--
-- For importing the original app's Plot and Plot_Utility tables:
-- 333,950 plots and 33,059 connections.
--
-- ── The jointing dates ──
--
-- Asked for: "Jointing Dates need to be added to the new table."
--
-- Planned_Jointing_Date and Actual_Jointing_Date are on 10,709 and
-- 10,662 of the old connection rows and have nowhere to land here. A
-- service is jointed onto the main as a dated event, planned and then
-- done, and the gap between the two is the thing anybody asks about —
-- so losing them would lose the record of when work was actually
-- carried out on a third of the connections.
--
-- Beside Dead_Jointed_Date, which is already on this table and is the
-- same kind of fact.
--
-- ── Legacy_Plot_ID ──
--
-- The whole chain hangs off it. A connection names a plot, a plot names
-- a contract, and the contract is already imported carrying
-- Legacy_Contract_ID — so with this column the connections land on
-- exactly the right plots with no matching, no names and no guessing:
--
--   Plot_Utility -> Plot -> Contract -> Project
--
-- Checked against the real exports: every one of the 13,718 plots that
-- has a connection is in the plot file, and every one of the 1,915
-- contracts those plots belong to is in the contract file. Nothing
-- dangles anywhere in that chain.
--
-- ── Legacy_Plot_Utility_ID ──
--
-- The same job one level down, and what makes the connection import
-- re-runnable: 33,059 rows is not something to import twice by
-- accident, and a half-finished run should be finishable rather than
-- undone.
--
-- Both are UNIQUE where set, and neither is a foreign key: they point
-- at tables in another system, so a constraint would be a promise this
-- database cannot keep.

ALTER TABLE "Plot_Utility"
  ADD COLUMN IF NOT EXISTS "Planned_Jointing_Date"  date,
  ADD COLUMN IF NOT EXISTS "Actual_Jointing_Date"   date,
  ADD COLUMN IF NOT EXISTS "Legacy_Plot_Utility_ID" bigint;

ALTER TABLE "Plot"
  ADD COLUMN IF NOT EXISTS "Legacy_Plot_ID" bigint;

COMMENT ON COLUMN "Plot_Utility"."Planned_Jointing_Date" IS
  'When the service was planned to be jointed onto the main.';
COMMENT ON COLUMN "Plot_Utility"."Actual_Jointing_Date" IS
  'When it actually was. The gap between this and the planned date is what '
  'anybody asks about.';
COMMENT ON COLUMN "Plot_Utility"."Legacy_Plot_Utility_ID" IS
  'Plot_Utility_ID in the original app. Null for connections created here.';
COMMENT ON COLUMN "Plot"."Legacy_Plot_ID" IS
  'Plot_ID in the original app. What the connection import joins on, and the '
  'only link between an old connection and the plot it belongs to.';

CREATE UNIQUE INDEX IF NOT EXISTS "Plot_Legacy_Plot_UQ"
  ON "Plot" ("Legacy_Plot_ID") WHERE "Legacy_Plot_ID" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Plot_Utility_Legacy_UQ"
  ON "Plot_Utility" ("Legacy_Plot_Utility_ID") WHERE "Legacy_Plot_Utility_ID" IS NOT NULL;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE (table_name = 'Plot_Utility'
          AND column_name IN ('Planned_Jointing_Date', 'Actual_Jointing_Date',
                              'Legacy_Plot_Utility_ID'))
      OR (table_name = 'Plot' AND column_name = 'Legacy_Plot_ID');
  IF n <> 4 THEN
    RAISE EXCEPTION 'Expected the two jointing dates and the two legacy keys; '
      'found % of 4.', n;
  END IF;
  RAISE NOTICE 'Connections can now record when a service was planned to be '
    'jointed and when it was, and plots can say which plot in the original '
    'app they came from.';
END $$;
