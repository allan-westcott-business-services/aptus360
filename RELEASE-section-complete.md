# Cross-section feature — every file, in one piece

    supabase/migrations/0214_section_mark_role.sql
    supabase/migrations/0215_annotation_layer.sql
    src/features/gis/sectionMarks.js
    src/features/gis/njug.js
    src/features/gis/trenchSection.js
    src/features/gis/GISCanvasPage.jsx
    src/features/gis/FeatureEditor.jsx
    checksectionmark.mjs
    HANDOVER.md

## New this round — cable sizes are areas

"63mm" on a water main is 63mm across. "185mm" on a cable is 185 SQUARE
millimetres of conductor. Read as a diameter, a 185mm² LV cable drew
wider than a sewer.

Cables are now drawn as the circle of their area — about 15mm across
for 185mm² — and labelled "185mm²". A run with no size is nominal in
the right unit: 95mm² for a cable, 100mm for a pipe.

## What that circle is, and is not

It is the CONDUCTOR area. A finished 185mm² four-core is nearer 50mm
over the sheath, and the cable catalogue holds impedance and volt drop
but no overall diameter — so the section shows what it was given and
says so in the notes, rather than drawing an invented figure somebody
could measure off.

If overall diameters are added to Electric_Cable_Size later, one
function reads them.

## Where everything is

- **Place:** Trench menu › Place Cross-Section, then click a trench
- **Show:** click the mark → Show Cross-section, or right-click it
- **Flip:** the checkbox in the dialogue header, or in the mark's editor

## Suite state

146 of 164 pass, the same 18 pre-existing failures. Build clean.
