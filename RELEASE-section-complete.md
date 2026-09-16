# Cross-section feature — every file, in one piece

The whole feature, so nothing can be missing.

    supabase/migrations/0214_section_mark_role.sql
    supabase/migrations/0215_annotation_layer.sql
    src/features/gis/sectionMarks.js
    src/features/gis/njug.js
    src/features/gis/trenchSection.js
    src/features/gis/GISCanvasPage.jsx
    src/features/gis/FeatureEditor.jsx
    checksectionmark.mjs
    HANDOVER.md

## New this round — the ground stays put when mirrored

The ground box and the grey surface bar were drawn from X(0), and
mirrored, X(0) is the right-hand edge — so both shot off to the right
while the pipes stayed where they were.

A rect needs a left edge and a width. Only things that sit at a
position across the footway go through the mirroring transform; the
ground is the frame those positions are measured in, not a position.

Worth knowing for any mirrored drawing: under a reflection, a
coordinate maps and an extent does not.

## Where everything is

- **Place:** Water/Gas/Electric menu › Place Cross-Section, click a trench
- **Show:** click the mark → Show Cross-section, or right-click it
- **Flip:** the checkbox in the dialogue header, or in the mark's editor

## Suite state

146 of 164 pass, the same 18 pre-existing failures. Build clean.
