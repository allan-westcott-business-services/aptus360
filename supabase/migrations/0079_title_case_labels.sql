-- ════════════════════════════════════════════════════════════════
-- 0079 — menu labels in Title Case
--
-- The Trench, Electric, Gas, Water and Street Lighting menus list line
-- types by name, and those names come from the database rather than the
-- code. So "Mains trench" sat in a menu of Title Case items looking like
-- an oversight, and no amount of editing the JSX would have changed it.
--
-- Layers and surfaces are named the same way and appear in the same
-- menus, so they get the same treatment.
--
-- Capitalising every word except the small ones. Doing this in SQL keeps
-- it to one pass rather than a list of hand-written UPDATEs that has to
-- be extended every time someone adds a type.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION title_case(src text) RETURNS text AS $$
DECLARE
  word text;
  out_words text[] := '{}';
  i integer := 0;
  small text[] := ARRAY['a','an','and','as','at','but','by','for','from',
                        'in','of','on','or','the','to','with'];
BEGIN
  IF src IS NULL OR src = '' THEN RETURN src; END IF;
  FOREACH word IN ARRAY regexp_split_to_array(src, '\s+') LOOP
    i := i + 1;
    -- Already carrying a capital past the first letter means an
    -- initialism or a unit: POC, kVA, LV. Left exactly as written.
    IF word <> lower(word) AND substring(word from 2) <> lower(substring(word from 2)) THEN
      out_words := out_words || word;
    ELSIF i > 1 AND lower(word) = ANY (small) THEN
      out_words := out_words || lower(word);
    ELSE
      out_words := out_words || (upper(left(word, 1)) || substring(word from 2));
    END IF;
  END LOOP;
  RETURN array_to_string(out_words, ' ');
END;
$$ LANGUAGE plpgsql IMMUTABLE;


UPDATE "GIS_Line_Type"    SET "Label" = title_case("Label")
 WHERE "Label" IS DISTINCT FROM title_case("Label");

UPDATE "GIS_Layer"        SET "Label" = title_case("Label")
 WHERE "Label" IS DISTINCT FROM title_case("Label");

UPDATE "GIS_Surface_Type" SET "Label" = title_case("Label")
 WHERE "Label" IS DISTINCT FROM title_case("Label");


-- ── Check ───────────────────────────────────────────────────────
-- What the menus will now read:
--   SELECT "Layer_Key", "Type_Key", "Label" FROM "GIS_Line_Type"
--    ORDER BY "Layer_Key", "Sort_Order";
--
-- Expect the initialisms intact — LV Feeder, HV Cable, not Lv Feeder:
--   SELECT "Label" FROM "GIS_Line_Type" WHERE "Label" ~ '(LV|HV|POC)';
--
-- Expect none: anything still lower-cased mid-label. A row here is a
-- word the function's small-word list has not accounted for:
--   SELECT "Label" FROM "GIS_Line_Type" WHERE "Label" ~ ' [a-z]'
--   UNION ALL
--   SELECT "Label" FROM "GIS_Layer" WHERE "Label" ~ ' [a-z]';
