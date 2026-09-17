# CAD Layers — mapping geometry to your AutoCAD layer names

    supabase/migrations/0216_dxf_layer_map.sql    ← RUN FIRST
    supabase/migrations/0217_dxf_layer_cable.sql  ← THEN THIS
    src/features/gis/dxfLayerMap.js        new — matching and scoring
    src/features/gis/dxf.js                the export reads the schedule
    src/features/gis/GISCanvasPage.jsx     loads it when exporting
    src/features/admin/DxfLayersAdmin.jsx  new — the CAD Layers screen
    src/features/admin/AdminPage.jsx       registers the screen
    src/lib/adminTables.js                 adds it to the admin menu
    netlify/functions/admin.js             allows the table
    checkdxflayers.mjs                     new check
    HANDOVER.md

## Yes — a layer can align with a particular cable

A rule matches any of: utility, line type, point role, build status, a
size band, an **exact size**, a **cable type**, and a customer.

So "3c WAVE 95" gets its own layer, distinct from "4c WAVE 95" — which
a size band could never separate, since both are 95mm².

Cable type and size are matched as TEXT, against the names in your
catalogue, so a rule reads the way the schedule reads. Case does not
matter: "3C wave" is the same cable as "3c WAVE".

**Specificity:** customer > cable type > exact size > size band > line
type > role > status > utility. A cable somebody set by hand is used in
preference to the calculated one, because that is the cable that will
be laid.

## House style first

A rule with no customer is your own standard, used for everyone. A rule
with a customer applies only to their drawings and beats the house rule
it competes with.

## Safe to apply

0216 seeds the house style to reproduce exactly what the export does
today, so the next DXF is unchanged until somebody edits a rule. With
no schedule at all, the export falls back to the old derived names.
Anything matching nothing goes to APTUS-UNMAPPED.

## The inspector

Admin › CAD Layers, top panel: describe an object — including choosing
a specific cable from your catalogue — and see every rule that applies,
in order, and which one wins.

## Suite state

147 of 165 pass, the same 18 pre-existing failures. Build clean.
