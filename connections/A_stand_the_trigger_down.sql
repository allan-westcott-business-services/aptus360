-- ════════════════════════════════════════════════════════════════════
--  PART A — stand pu_pack_trg down, and say what it would have done
-- ════════════════════════════════════════════════════════════════════
--
-- Run 0256_connection_lookups.sql first.
--
-- pu_pack_trg fires BEFORE INSERT on Plot_Utility:
--
--     IF NEW."Service_Card_Submission_Date" IS NOT NULL AND OLD IS NULL
--        AND (status IS NULL OR status IN ('Pack Not Submitted',
--                                          'Pack In Progress'))
--        THEN NEW."Pack_Status_ID" := <Submitted>
--
-- That is right for a pack being submitted in the app today. It is
-- wrong for history: it would rewrite what the old system recorded.
--
-- With 0256 run, all 32,792 pack statuses resolve and the trigger
-- leaves Returned, Issued and IT Issues alone. But a row the old
-- system marked Pack In Progress, or left blank, would still come out
-- as Submitted. So the import lands exactly what the old system said,
-- and this part counts the rows the trigger would have changed. PART D
-- carries the one-line UPDATE that applies the trigger's inference
-- afterwards if you decide you want it. Inventing a status silently
-- during a migration is not undoable.
--
-- The trigger itself is cheap, by the way — two lookups against an
-- eight-row table. Not the 19.5 million rows recalc_project_points
-- turned out to read.

ALTER TABLE "Plot_Utility" DISABLE TRIGGER pu_pack_trg;

SELECT 'pu_pack_trg' AS "Trigger",
       (SELECT CASE WHEN tgenabled = 'D' THEN 'disabled' ELSE 'STILL ON' END
          FROM pg_trigger WHERE tgrelid = '"Plot_Utility"'::regclass
           AND tgname = 'pu_pack_trg') AS "State",
       (SELECT count(*) FROM "Legacy_Connection_Resolved" r
         WHERE r.new_plot_id IS NOT NULL AND r.dup_rank = 1
           AND COALESCE(btrim(r."Service_Card_Submission_Date"), '') <> ''
           AND (r.pack_status_id IS NULL
                OR r.pack_status_id IN (SELECT "Pack_Status_ID" FROM "Pack_Status"
                                         WHERE "Pack_Status" IN ('Pack Not Submitted',
                                                                 'Pack In Progress')))
       )::text || ' rows it would have stamped Submitted' AS "Would have changed";
