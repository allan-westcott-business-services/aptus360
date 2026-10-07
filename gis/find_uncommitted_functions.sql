-- ════════════════════════════════════════════════════════════════════
--  Every database function that is not in the repository
-- ════════════════════════════════════════════════════════════════════
--
-- Read-only. One result set.
--
-- The first recovery asked for five functions by name and got them.
-- That was the wrong question: naming them meant only finding the ones
-- I already knew were missing. The schema dump then turned up a sixth,
-- `gis_set_length` — the trigger that writes `Length_m`, which is the
-- field this morning's bill of materials fix was built around. It was
-- missed because it was not on my list.
--
-- So this asks the opposite way round. It lists every function in the
-- database except the 21 the migrations define, which is the whole set
-- of what exists only in production. Whatever comes back is what is at
-- risk, named by the database rather than by me.
--
-- Export the result as CSV and send it over.
-- ════════════════════════════════════════════════════════════════════

SELECT p.proname                  AS "Function",
       pg_get_function_identity_arguments(p.oid) AS "Arguments",
       pg_get_functiondef(p.oid)  AS "Definition"
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.prokind = 'f'
   -- Functions that belong to an installed extension are not ours to
   -- keep; they come back with the extension.
   AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.objid = p.oid AND d.deptype = 'e')
   AND lower(p.proname) NOT IN (
                     'av_agreement_utility',
                     'av_invoice_derive_totals',
                     'av_invoice_register',
                     'copy_project_drawing',
                     'create_project_option',
                     'gis_assign_meters',
                     'gis_bom',
                     'gis_place_joints',
                     'gis_project_utilities',
                     'gis_seed_reference',
                     'gis_trace_network',
                     'gis_unplaced_plots',
                     'log_project_changes',
                     'next_gis_undo_seq',
                     'next_option_letter',
                     'option_letter',
                     'prune_gis_undo',
                     'set_updated_at',
                     'sync_project_main_developer',
                     'title_case',
                     'vat_rate_at')
 ORDER BY p.proname;
