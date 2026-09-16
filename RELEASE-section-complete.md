# Cross-section feature — every file, in one piece

The whole feature, not a delta, so nothing can be missing.

    supabase/migrations/0214_section_mark_role.sql
    supabase/migrations/0215_annotation_layer.sql
    src/features/gis/sectionMarks.js
    src/features/gis/njug.js
    src/features/gis/trenchSection.js
    src/features/gis/GISCanvasPage.jsx
    src/features/gis/FeatureEditor.jsx
    checksectionmark.mjs
    HANDOVER.md

## New this round — flipping actually mirrors, immediately

The editor's checkbox wrote to a draft while the dialogue was built
from the saved feature, so ticking it changed nothing until you saved
and reopened.

**The switch is now in the section dialogue itself**, beside the close
button. Tick it and the drawing mirrors at once; the answer is written
to the mark afterwards, so the triangles on the canvas turn to match
and the next opening agrees. The editor keeps its checkbox too, and now
hands the dialogue the unsaved draft so a tick there is honoured
straight away.

## Where everything is

- **Place:** Water/Gas/Electric menu › Place Cross-Section, click a trench
- **Show:** click the mark → Show Cross-section, or right-click it
- **Flip:** the checkbox in the dialogue header (or in the mark's editor)

## Suite state

146 of 164 pass, the same 18 pre-existing failures. Build clean.
