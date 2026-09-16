# Cross-section feature — every file, in one piece

Not a delta. This is the complete set for the section-mark feature, so
nothing can be missing.

    supabase/migrations/0214_section_mark_role.sql   role + style
    supabase/migrations/0215_annotation_layer.sql    annotation layer
    src/features/gis/sectionMarks.js    the mark: where it sits, how it lies
    src/features/gis/njug.js            NJUG Vol 1 as data, surface mapping
    src/features/gis/trenchSection.js   the section model and its drawing
    src/features/gis/GISCanvasPage.jsx  placement, drawing, dialogue
    src/features/gis/FeatureEditor.jsx  ← the missing piece
    checksectionmark.mjs
    HANDOVER.md

## Why you could not see the checkbox

"Viewed from the other side" lives in FeatureEditor.jsx. That file went
out with the flip, and none of the three deltas since included it — so
a tree built from the later ones has the mirroring everywhere except
the switch that turns it on. My fault: deltas only work if every one is
applied, and I kept shipping the files I had just changed rather than
the files the feature needs.

## Where everything is

- **Place:** Water/Gas/Electric menu › Place Cross-Section, then click a
  trench.
- **Show:** click the mark → **Show Cross-section** in its editor, or
  right-click the mark.
- **Flip:** in the same editor, the checkbox under that button. It turns
  the triangles and mirrors the section together.

## Suite state

146 of 164 pass, the same 18 pre-existing failures. Build clean.
