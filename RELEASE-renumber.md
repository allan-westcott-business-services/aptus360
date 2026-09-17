# Delta — migration renumbered 0218 → 0220

Three files, changed by the renumber only:

    supabase/migrations/0220_cad_layer_catalogue.sql   (was 0218_...)
    checkdxflayers.mjs                                 the path it checks
    HANDOVER.md                                        the number it cites

**Delete `supabase/migrations/0218_cad_layer_catalogue.sql` if you took
it from the previous zip.** Your tree already has 0218_portal.sql and
0219_portal_branch.sql — both uncommitted, which is why I could not see
the numbers were taken.

Nothing inside the migration changed. If you already ran it as 0218 it
does not need running again; renaming the file only keeps the folder
honest.

The rest of the CAD Layers feature is unchanged and still in
aptus360-cad-layers2.zip.
