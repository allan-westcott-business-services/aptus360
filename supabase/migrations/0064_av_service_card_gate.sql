-- ════════════════════════════════════════════════════════════════
-- 0064 — an invoice depends on the service card, not the meter
--
-- 0060 treated a plot as earned once it had a meter number or a
-- connection date. That is when the work happened, but it is not when
-- the money can be asked for. The asset value claim goes with the
-- service card, and until that has been submitted there is nothing to
-- invoice against — so a plot with a meter in the ground and no service
-- card submitted was being offered for billing when it shouldn't be.
--
-- Connection date and meter number stay on the register. They are still
-- the useful context for why a service card is or isn't in, and hiding
-- them would make an unbillable plot harder to explain. They just no
-- longer decide anything.
--
-- The view has to go first: it is built on the function, and a function
-- cannot be dropped while something depends on it.
-- ════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS "AV_Register";
DROP FUNCTION IF EXISTS av_invoice_register(bigint);

CREATE OR REPLACE FUNCTION av_invoice_register(p_project bigint DEFAULT NULL)
RETURNS TABLE (
  plot_utility_id  bigint,
  project_id       bigint,
  project_ref      text,
  site_name        text,
  plot_id          bigint,
  plot_number      text,
  plot_ref         text,
  utility_id       bigint,
  utility          text,
  connection_date  date,
  meter_number     text,
  sc_submitted     date,
  -- Renamed from has_meter, because it no longer means that. A column
  -- that keeps its old name after changing its meaning is how a later
  -- reader gets it wrong.
  can_invoice      boolean,
  av_invoice_id    bigint,
  invoice_number   text,
  invoice_date     date,
  invoice_status   text,
  idno_name        text,
  agreement_type   text,
  net_value        numeric,
  invoiced         boolean
) AS $$
  SELECT
    pu."Plot_Utility_ID",
    pr."Project_ID",
    pr."Project_Ref",
    pr."Site_Name",
    pl."Plot_ID",
    pl."Plot_Number",
    pl."Plot_Ref",
    u."Utility_ID",
    u."Utility",
    pu."Connection_Date",
    pu."Meter_Number",
    pu."Service_Card_Submission_Date",
    pu."Service_Card_Submission_Date" IS NOT NULL,
    inv."AV_Invoice_ID",
    inv."Invoice_Number",
    inv."Invoice_Date",
    inv."Status",
    idno."IDNO_Name",
    agt."AV_Agreement_Type",
    line."Net_Value",
    line."AV_Invoice_Line_ID" IS NOT NULL
  FROM "Plot_Utility" pu
  JOIN "Plot" pl     ON pl."Plot_ID"    = pu."Plot_ID"
  JOIN "Project" pr  ON pr."Project_ID" = pl."Project_ID"
  JOIN "Utility" u   ON u."Utility_ID"  = pu."Utility_ID"
  LEFT JOIN "AV_Invoice_Line" line
    ON line."Plot_ID" = pu."Plot_ID"
   AND line."Utility_ID" = pu."Utility_ID"
  LEFT JOIN "AV_Invoice" inv ON inv."AV_Invoice_ID" = line."AV_Invoice_ID"
  LEFT JOIN "IDNO" idno      ON idno."IDNO_ID" = inv."IDNO_ID"
  LEFT JOIN "AV_Agreement_Type" agt
    ON agt."AV_Agreement_Type_ID" = inv."AV_Agreement_Type_ID"
  WHERE (p_project IS NULL OR pr."Project_ID" = p_project)
  ORDER BY pr."Project_Ref",
           NULLIF(regexp_replace(pl."Plot_Number", '\D', '', 'g'), '')::bigint NULLS LAST,
           pl."Plot_Number",
           u."Utility";
$$ LANGUAGE sql STABLE;


CREATE OR REPLACE VIEW "AV_Register" AS
  SELECT r.*,
         -- A cancelled invoice does not count as claimed, or a voided
         -- one would leave its plot looking settled for ever.
         (r.invoiced AND r.invoice_status IS DISTINCT FROM 'Cancelled') AS claimed,
         (r.can_invoice
          AND NOT (r.invoiced AND r.invoice_status IS DISTINCT FROM 'Cancelled')) AS billable
    FROM av_invoice_register(NULL) r;


-- ── Check ───────────────────────────────────────────────────────
-- What can be invoiced now:
--   SELECT project_ref, plot_number, utility, sc_submitted
--     FROM "AV_Register" WHERE billable ORDER BY project_ref, plot_number;
--
-- The gap this migration exposes: connected, metered, but no service
-- card submitted. These were offered for billing before and shouldn't
-- have been, and they are the list worth chasing.
--   SELECT project_ref, plot_number, utility, connection_date, meter_number
--     FROM "AV_Register"
--    WHERE sc_submitted IS NULL
--      AND (connection_date IS NOT NULL OR meter_number IS NOT NULL)
--    ORDER BY connection_date;
--
-- Already invoiced with no service card date — raised under the old
-- rule, and worth knowing about:
--   SELECT project_ref, plot_number, utility, invoice_number, invoice_date
--     FROM "AV_Register"
--    WHERE claimed AND sc_submitted IS NULL
--    ORDER BY invoice_date DESC;
