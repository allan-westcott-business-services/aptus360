# Delta — a label no longer jumps back when grabbed again

Three files, this request only:

    src/features/gis/GISCanvasPage.jsx   the fix
    checklabelmove.mjs                   two more cases
    HANDOVER.md                          fault 140, second half

No migration. Includes the previous label-save fix.

⚠ Assumes the full session set is applied — this GISCanvasPage.jsx
imports washOuts.js, lineLabel.js and dxf.js.

## The cause

A feature carrying only a legacy `Label_Offset` is rendered from a
synthesised placement — the renderer builds one from the legacy keys —
so the click target records index 0 while `Attributes.Labels` does not
exist. The grab looked the offset up by that index, found nothing, and
started the drag from zero. Hence the jump back to the unmoved
position.

It only showed on the SECOND drag because the first drag is what writes
the legacy key that creates the synthesised placement in the first
place.

## The fix

The click target now carries the offset the renderer actually drew at,
and the grab starts from that. The old lookups remain as a fallback for
the labels whose targets carry no offset. One account of where a label
is, rather than two that can disagree.

## Suite state

145 of 163 pass, the same 18 pre-existing failures. Build clean.
Removing either half fails the check.
