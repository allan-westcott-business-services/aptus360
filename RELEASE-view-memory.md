# Delta — the canvas comes back where you left it

    src/features/gis/GISCanvasPage.jsx
    checkviewmemory.mjs   new check
    HANDOVER.md

No migration.

## What it does

The canvas now remembers where you were looking, per project, and
restores it when that drawing opens again — including after the page
remounts, which is what was happening when you came back to the tab.

Stored in the session store, not the database: where you were looking
is not a fact about the scheme, so it does not follow you to another
machine and a colleague opening the drawing does not inherit your zoom.

Written on a short delay, because a pan is a hundred view updates and
writing each one would be a hundred serialisations for one gesture.

## What I could not pin down

The remount itself. The visibility listener in AuthContext only bumps
an idle timer, and the lazy-chunk reload only fires when a deploy has
replaced a chunk mid-session. The cause is likely outside this page —
a browser discarding a background tab is the usual one — and the fix
holds whatever it turns out to be.

If it is ever worth chasing: the question is whether the canvas's mount
effect runs again on tab return. That distinguishes a remount from a
re-render, and the two have entirely different causes.

## Suite state

149 of 167 pass, the same 18 pre-existing failures. Build clean.
