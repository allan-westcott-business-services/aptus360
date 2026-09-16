# Delta — DXF export was mirrored about the X axis

Three files, this request only:

    src/features/gis/dxf.js   y is negated on the way out
    checkdxf.mjs              the check that had asserted the bug
    HANDOVER.md

No migration. This delta stands alone — dxf.js has no dependency on the
other session files.

## The cause

The drawing stores metres in SCREEN convention: y grows downward, which
is what the canvas does everywhere. CAD grows y north. Writing the
stored y straight out mirrors the whole plan about its X axis.

Your reading of it as mirrored rather than rotated is what identified
it — a 180-degree rotation would have reversed the text too.

## The fix

Every y is negated on the way out, before the origin offset is applied,
so an origin given as a real easting and northing means what a surveyor
means by it.

Re-export and re-import; nothing needs changing on the AutoCAD side.

## Note

My check had asserted the wrong thing outright ("y must not be
flipped"), which is why the suite passed with the bug in it. It now
requires the negation and also checks that a run's turn direction
survives — which is what distinguishes a mirror from a move.

## Suite state

145 of 163 pass, the same 18 pre-existing failures. Build clean.
