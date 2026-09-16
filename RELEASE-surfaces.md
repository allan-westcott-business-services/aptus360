# Delta — surface mapping by key, with unmade as footway

    src/features/gis/njug.js            the mapping
    src/features/gis/trenchSection.js   carries policy vs assumed
    src/features/gis/GISCanvasPage.jsx  says which, and why
    checksectionmark.mjs
    HANDOVER.md

No migration. Includes the section layout fixes from the previous
delta.

## The mapping

    footway          → footway        the guidance's own
    carriageway_12   → carriageway
    carriageway_34   → carriageway
    verge            → verge
    unmade           → FOOTWAY        your decision, as instructed
    agricultural     → verge          not decided — flagged

By key, from GIS_Surface_Type, not by matching words in a label — so
renaming a label in admin cannot change a depth.

## Three kinds of answer, said differently

The guidance's own surfaces say nothing extra. **Unmade** shows a quiet
line: worked to the footway figures, your standard rather than NJUG's.
**Agricultural** shows a stronger line: NJUG has no column for it, a
verge was assumed, confirm before working to it.

That last one is still open. Ploughing and subsoiling are why I have
not quietly picked a figure for agricultural land — tell me what your
engineers require and it is one line.

## Suite state

146 of 164 pass, the same 18 pre-existing failures. Build clean.
