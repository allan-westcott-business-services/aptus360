# Delta — audience landing page matched to the section one

    src/features/portal/AudienceLanding.jsx
    checkportallanding.mjs   new check
    HANDOVER.md

No migration.

## What changed

The four audience buttons now use the section landing page's styling: a
true square, the 2px border in the audience's own colour, the same
hover lift, focus ring and typography. They were flatter — hairline
border, grey wash, left-aligned text — and read as a different product
from the page next door.

They sit **two by two** instead of in a row. Four across a wide screen
is a row to read along; a square is one shape the eye takes in at once.
It still collapses to one column on a phone.

The blurb under each name is kept and styled quietly, for somebody
unsure which of the four they are.

## A note on the CSS

It is copied from HomePage rather than shared, because that component
keeps its CSS inside itself and lifting it out was a bigger change than
this warranted.

A copy drifts, so the new check compares the rules both pages share and
fails if any differ — allowing exactly one deliberate difference, the
column layout the blurb needs.

If a third page ever wants these squares, lift the CSS out then and
delete that check. Two copies is a coincidence; three is a pattern.

## Suite state

150 of 168 pass, the same 18 pre-existing failures. Build clean.
