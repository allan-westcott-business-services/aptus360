-- ════════════════════════════════════════════════════════════════
-- 0136 — energisation is per utility, not per plot
--
-- A plot does not go live. Its gas goes live, its water goes live, its
-- electric goes live, and on a phased handover they do it on three
-- different days — the electric weeks ahead so the site has power, the
-- gas when the meter is fitted. One date on the plot cannot say that,
-- and the one it does say is whichever of the three somebody typed.
--
-- Plot_Utility already holds this shape for the live site: a row per
-- plot per utility, carrying Programmed_Date, As_Laid_Date and
-- Connection_Date. This is the same idea on the call-off — what is
-- being *asked for*, before any of it exists.
--
-- ── The plot-level date stays ──
--
-- Not dropped, and not migrated into per-utility rows.
--
-- Dropping it would throw away every date on every call-off already
-- raised. Migrating it would mean guessing which utilities each of
-- those dates was meant for, and the guess would have to come from the
-- project's Plot_Utility rows matched on a plot *number held as text* —
-- which is what Service_Call_Off_Plot stores, deliberately, so a
-- submission survives a plot being renumbered. A guess like that is
-- wrong quietly.
--
-- So it becomes the fallback: a utility with no row of its own uses the
-- plot's date. Every call-off raised before today reads exactly as it
-- did, and every one raised after can say three different things.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "Service_Call_Off_Plot_Utility" (
  "Service_Plot_Utility_ID" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Service_Plot_ID"         bigint NOT NULL
    REFERENCES "Service_Call_Off_Plot" ("Service_Plot_ID") ON DELETE CASCADE,
  "Utility_ID"              bigint NOT NULL REFERENCES "Utility" ("Utility_ID"),
  "Energisation_Date"       date,
  /* One row per utility per plot. Two dates for a plot's gas is not a
     phased handover, it is a disagreement. */
  CONSTRAINT service_plot_utility_once UNIQUE ("Service_Plot_ID", "Utility_ID")
);

CREATE INDEX IF NOT EXISTS scopu_plot_idx
  ON "Service_Call_Off_Plot_Utility" ("Service_Plot_ID");

COMMENT ON COLUMN "Service_Call_Off_Plot_Utility"."Energisation_Date" IS
  'When this utility on this plot is wanted live. Null means no date '
  'has been asked for; the plot''s own Energisation_Date is the '
  'fallback for utilities with no row here.';

COMMENT ON COLUMN "Service_Call_Off_Plot"."Energisation_Date" IS
  'The whole plot''s energisation date. Kept as the fallback for '
  'utilities with no row in Service_Call_Off_Plot_Utility — see 0136. '
  'New call-offs set the per-utility rows.';


-- ── Check ───────────────────────────────────────────────────────
-- Every plot on a call-off and what it is asking for, per utility,
-- falling back to the plot's own date the way the application does:
--   SELECT s."Submission_ID", p."Plot", u."Utility",
--          COALESCE(pu."Energisation_Date", p."Energisation_Date") AS wanted_live,
--          CASE WHEN pu."Energisation_Date" IS NOT NULL THEN 'per utility'
--               WHEN p."Energisation_Date"  IS NOT NULL THEN 'from the plot'
--               ELSE 'none asked for' END AS source
--     FROM "Service_Call_Off_Plot" p
--     JOIN "Mains_Call_Off_Submission" s ON s."Submission_ID" = p."Submission_ID"
--     LEFT JOIN "Service_Call_Off_Plot_Utility" pu ON pu."Service_Plot_ID" = p."Service_Plot_ID"
--     LEFT JOIN "Utility" u ON u."Utility_ID" = pu."Utility_ID"
--    ORDER BY s."Submission_ID", p."Sort_Order", u."Sort_Order";
--
-- Dates asked for before the trench they need is closed. Nothing can be
-- energised before it is in the ground, and this is what the form now
-- refuses — worth running once to see what was saved before it did:
--   SELECT p."Plot", u."Utility", pu."Energisation_Date", a."End_Date" AS dig_ends
--     FROM "Service_Call_Off_Plot_Utility" pu
--     JOIN "Service_Call_Off_Plot" p ON p."Service_Plot_ID" = pu."Service_Plot_ID"
--     JOIN "Utility" u ON u."Utility_ID" = pu."Utility_ID"
--     JOIN "Call_Off_Assignment" a ON a."Submission_ID" = p."Submission_ID"
--     JOIN "Task_Type" t ON t."Task_Type_ID" = a."Task_Type_ID"
--    WHERE lower(t."Task_Type_Name") LIKE 'excav%'
--      AND pu."Energisation_Date" <= a."End_Date"
--    ORDER BY pu."Energisation_Date";
