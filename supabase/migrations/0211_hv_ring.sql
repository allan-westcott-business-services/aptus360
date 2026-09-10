-- ════════════════════════════════════════════════════════════════
-- 0211 — the HV ring: primary, chain substations, open point
--
-- The drawing stopped at the POC. Upstream of it the standard UK
-- arrangement is the one the model could not say: the site's
-- substation is not on a dedicated way at the primary — it is looped
-- in and out of a shared 11 kV (sometimes 6.6 kV) circuit, one of
-- several substations in series on one way's cable, the far end
-- running back to a second way with a normally open point along the
-- route. A cable fault anywhere on the chain trips the way's breaker
-- at the primary and takes every substation on it, because the ring
-- switches at each RMU are load-break switches and cannot clear it;
-- supply comes back by sectionalising and closing the open point.
--
-- Three roles carry the topology:
--
--   primary     the primary substation (33/11 kV). Feed_Way and
--               Return_Way on its attributes record which ways of its
--               board the chain leaves from and returns to.
--   ringsub     another secondary substation looped into the same
--               circuit. The incumbent's, drawn so the chain reads.
--   openpoint   the normally open point — where the ring is split in
--               normal running. The walk of the chain stops here.
--
-- How the SITE's substation hangs off the circuit is a fact about the
-- substation, so it stays on the existing role as attributes
-- (HV_Connection: looped / teed / dedicated, RMU_Tee_Protection,
-- RMU_Tee_Fuse_A) and needs no schema change: Attributes is jsonb.
--
-- ── All three are placed as existing ──
--
-- The primary, the chain substations and the open point are the
-- incumbent's plant and the circuit's operating state — facts about
-- the world the design connects to, not things anybody prices. The
-- canvas writes Build_Status 'existing' into their attributes at
-- placement, which is the field 0208_bom_no_existing reads to keep a
-- feature off the bill. Until 0208 is run they will appear on the
-- bill like every other existing feature — the same standing caveat
-- 0197 carries, and the same fix.
--
-- ── Order ──
--
-- Rewrites the role constraint whole, so this must run AFTER
-- 0209_hdcutout_role (its list is carried below). Running 0209 and
-- then this is right; running this alone still yields the full list.
-- ════════════════════════════════════════════════════════════════

-- ── Run this first ───────────────────────────────────────────────
-- Nothing should carry these roles or the new line type yet. A row
-- here means a key was taken by something else, and the seeds below
-- would silently adopt it.
--
--   SELECT "Feature_Role", COUNT(*) FROM "GIS_Feature"
--    WHERE "Feature_Role" IN ('primary','ringsub','openpoint')
--    GROUP BY 1;
--
--   SELECT "Attributes" ->> 'Line_Type' AS type, COUNT(*)
--     FROM "GIS_Feature"
--    WHERE "Attributes" ->> 'Line_Type' = 'elec_hv_existing'
--    GROUP BY 1;


ALTER TABLE "GIS_Feature" DROP CONSTRAINT IF EXISTS "GIS_Feature_Feature_Role_check";
ALTER TABLE "GIS_Feature"
  ADD CONSTRAINT "GIS_Feature_Feature_Role_check"
  CHECK ("Feature_Role" IN
    ('shape','plot','meter','poc','substation','joint','source','spannode',
     'linkbox','column','governor','servicevalve','pumping','hvtt','reducer',
     'nrs','feederpoint','msdb','hdcutout',
     'primary','ringsub','openpoint'));

-- ── The symbols ──
--
-- All three are drawn by the canvas — a primary as a square with an
-- inset square, a ring substation as a dashed grey square, the open
-- point as an open switch blade turned to the cable. `Symbol` is
-- 'square' (and 'circle' for the open point) so anything reading the
-- style table rather than the canvas draws something of roughly the
-- right shape.
--
-- Slate and grey rather than the electric layer's colour, for the
-- reason the MSDB gives: these stand ON the circuit and the cable
-- says which; and greyed because they are the incumbent's — the same
-- claim 0197's dashed grey lines make about the network we did not
-- build.
INSERT INTO "GIS_Style"
  ("Style_Name","Feature_Role","Symbol","Symbol_Size_Px","Colour","Sort_Order","Notes")
VALUES
  ('Primary substation', 'primary', 'square', 13, '#334155', 200,
   'The 33/11 kV primary feeding the chain. Feed_Way and Return_Way on its attributes name the ways of its board this circuit uses.'),
  ('HV substation (on the ring)', 'ringsub', 'square', 10, '#64748b', 201,
   'Another secondary substation looped into the shared circuit. The incumbent''s; drawn so the chain reads.'),
  ('Normally open point', 'openpoint', 'circle', 9, '#334155', 202,
   'Where the ring is split in normal running. Everything before it is fed from this end; closing it back-feeds from the other.')
ON CONFLICT DO NOTHING;

-- ── The incumbent's HV cable ──
--
-- 0197 drew the incumbent's LV, gas and water and deliberately not
-- their HV; the ring is where their HV becomes something a design has
-- to say. Dashed and de-saturated like the rest of the family — the
-- drawing reads "not part of the build" from the dash long before any
-- label — and keeping a red hue so it still reads as HV beside
-- elec_hv's #b91c1c.
--
-- The `_existing` suffix is load-bearing, as it is for the 0197
-- types: statusOf defaults these lengths to Build_Status 'existing',
-- digEstimate charges no excavation, and 0208 (once run) keeps them
-- off the bill. mainsOnLayer never offers them a tee or a joint,
-- because the key does not end '_main' — nothing of ours is jointed
-- onto their 11 kV cable.
INSERT INTO "GIS_Line_Type"
  ("Type_Key","Label","Layer_Key","Colour","Width_px","Dashed","Sort_Order","Is_Active")
VALUES
  ('elec_hv_existing', 'Existing HV circuit (incumbent)', 'electric',
   '#c08a8a', 4.0, true, 13, true)
ON CONFLICT ("Type_Key") DO NOTHING;

-- Checks worth running after this:
--
--   -- The roles are allowed, and nothing else lost its place
--   -- (the list should hold twenty-two roles, ending in openpoint):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'GIS_Feature_Feature_Role_check';
--
--   -- The styles are there exactly once each:
--   SELECT "Style_Name","Symbol","Colour" FROM "GIS_Style"
--    WHERE "Feature_Role" IN ('primary','ringsub','openpoint')
--    ORDER BY "Sort_Order";
--
--   -- And the cable type beside its live sibling:
--   SELECT "Type_Key","Colour","Dashed" FROM "GIS_Line_Type"
--    WHERE "Type_Key" IN ('elec_hv','elec_hv_existing');
