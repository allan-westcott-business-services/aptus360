# Delta — wash outs: bulk delete, and joined to the pipe

Only the files that changed since the previous zip. Everything else in
that zip still applies and is unchanged; copy this over the top of it.

    src/features/gis/bulkDelete.js      "All wash outs" category
    src/features/gis/GISCanvasPage.jsx  linkable rule + Connects on creation
    checkwashouts.mjs                   two new cases
    HANDOVER.md                         fault 137 postscript

No migration in this delta — 0213 is unchanged and already run.

## Bulk Delete

"All wash outs", under Points, beside the service valves.

## The wash out joins the pipe, not the dig

`connectedTo` is geometry alone, and now the main reaches the end of
the trench both lines have a vertex at that point — so a wash out
touched both and reported a connection to the trench. `linkable` now
refuses every pairing but wash-out-to-water-main, and the build writes
the wash out's `Connects` at creation, because the links pass at the
end of the build runs over the drawing as it was before the wash outs
existed.

## Not in this delta

The main running to the end of the trench is `waterNetwork.js`, which
did not change this round — it is in the previous zip.

## Suite state

142 of 160 pass, the same 18 pre-existing failures. Build clean.
