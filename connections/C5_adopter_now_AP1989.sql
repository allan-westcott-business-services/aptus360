-- ════════════════════════════════════════════════════════════════════
--  AP1989's adopter, before and after
-- ════════════════════════════════════════════════════════════════════
--
-- Read-only. One result set. Run after 0258.
--
-- C1 row 3 reported the raw `Adopter` text and said "United Utilities"
-- on water. That text has not changed and will not: it is the field
-- that was never maintained. What changed is which field the import
-- reads.
--
-- So this shows both side by side, per utility: what the connection's
-- text says, what the contract's IDNO says, and which one the import
-- will actually write. Water should read Independent Water Networks,
-- from the contract, with "United Utilities" still sitting in the text
-- column beside it — that contrast IS the fix, and a report showing
-- only the new answer would hide what was wrong.

SELECT
  util                                        AS "Utility",
  conns                                       AS "Connections",
  COALESCE(text_said, '(nothing in the text)') AS "What the text says",
  COALESCE(idno_id, '(none on the contract)')  AS "Contract IDNO",
  COALESCE(writes, '(nothing — would import without an adopter)')
                                              AS "What the import writes",
  src                                         AS "Taken from"
FROM (
  SELECT
    CASE btrim(r."Utility_ID")
      WHEN '1' THEN 'Electric' WHEN '2' THEN 'Gas' WHEN '3' THEN 'Water'
      ELSE '(utility ' || btrim(r."Utility_ID") || ')' END          AS util,
    count(*)::text                                                  AS conns,
    string_agg(DISTINCT NULLIF(btrim(r."Adopter"), ''), ', ')       AS text_said,
    string_agg(DISTINCT
      CASE btrim(r."Utility_ID")
        WHEN '1' THEN NULLIF(btrim(lpi."Electric_IDNO_ID"), '')
        WHEN '2' THEN NULLIF(btrim(lpi."Gas_IDNO_ID"), '')
        WHEN '3' THEN NULLIF(btrim(lpi."Water_IDNO_ID"), '')
      END, ', ')                                                    AS idno_id,
    string_agg(DISTINCT o."Name", ', ')                             AS writes,
    string_agg(DISTINCT r.adopter_source, ', ')                     AS src,
    min(btrim(r."Utility_ID"))                                      AS ord
  FROM "Legacy_Connection_Resolved" r
  JOIN "Plot" pl    ON pl."Plot_ID" = r.new_plot_id
  JOIN "Project" pr ON pr."Project_ID" = pl."Project_ID"
  LEFT JOIN "Legacy_Project_Import" lpi
    ON NULLIF(btrim(lpi."Contract_ID"), '')::bigint = pr."Legacy_Contract_ID"
  LEFT JOIN "Organisation" o
    ON o."Organisation_ID" = r.adopter_organisation_id
  WHERE btrim(pr."AP_Number") = 'AP1989'
    AND r.dup_rank = 1
  GROUP BY 1
) z ORDER BY ord;
