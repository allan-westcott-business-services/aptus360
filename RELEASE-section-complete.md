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

## New this round — Place Cross-Section is on the Trench menu

Removed from the Water, Gas and Electric menus. A section mark goes on
a trench, reports what the trench holds, and belongs to none of the
utilities it draws — offering it from each of them put it in three
wrong places at once.

It now sits on the **Trench** menu above the Checks group, and is
disabled with a reason when no trench is drawn, like the checks beside
it.

Print to Scale stays on the utility menus, where it was asked for.

## Where everything is

- **Place:** Trench menu › Place Cross-Section, then click a trench
- **Show:** click the mark → Show Cross-section, or right-click it
- **Flip:** the checkbox in the dialogue header, or in the mark's editor

## Suite state

146 of 164 pass, the same 18 pre-existing failures. Build clean.
