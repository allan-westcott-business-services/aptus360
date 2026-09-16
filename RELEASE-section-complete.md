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

## New this round — no name beside the mark

"Section 1" no longer prints along the trench. The shape says what the
mark is, and a drawing with several of them does not need three words
of annotation about annotation beside each.

The Label stays on the feature: it still names the section in the
dialogue the mark opens, and the build still numbers marks as it places
them. Only what is DRAWN changed.

## Where everything is

- **Place:** Trench menu › Place Cross-Section, then click a trench
- **Show:** click the mark → Show Cross-section, or right-click it
- **Flip:** the checkbox in the dialogue header, or in the mark's editor

## Suite state

146 of 164 pass, the same 18 pre-existing failures. Build clean.
