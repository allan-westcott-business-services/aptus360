# Delta — cross-section marks and trench sections

    supabase/migrations/0214_section_mark_role.sql   ← RUN THIS FIRST
    src/features/gis/sectionMarks.js   new — where a mark sits, how it lies
    src/features/gis/njug.js           new — NJUG Vol 1 as data
    src/features/gis/trenchSection.js  new — the section model and its SVG
    src/features/gis/GISCanvasPage.jsx placement, drawing, right-click, modal
    checksectionmark.mjs               new check
    HANDOVER.md                        fault 141

⚠ Assumes the full session set is applied.

**Migration 0214 is required** — Feature_Role has a CHECK constraint,
so without it a mark cannot be saved. It carries the full current role
list plus `sectionmark`.

## Using it

**Water/Gas/Electric menu › Place Cross-Section**, then click a trench.
The mark lands on the line wherever you clicked — anywhere along, not
just at a vertex — drawn 2m of real ground long and square to the
trench. Right-click it → **Show Cross-section**.

The section is drawn from what the trench actually contains, at the
NJUG recommended positions and depths for that surface, with each run
at its own size. Anything worth saying is listed underneath: a run with
no size drawn nominal, two runs sharing a position, a sewer whose depth
follows its levels, an oil pipeline's approval requirement.

## What it is and is not

The section shows RECOMMENDED MINIMA, not a survey and not your
design's depths. Every drawing says so under it. An asset owner's spec
overrides the guidance; NJUG Issue 8 is from 2013 and worth confirming
as current.

The figures are in njug.js as data — one place to check and one to
change. Please have an engineer verify them against your own copy
before these drawings leave the office.

## Suite state

146 of 164 pass, the same 18 pre-existing failures. Build clean.
