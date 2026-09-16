# Session change set — wash outs, main to trench end, print parity, water build type

Seventeen files. **One migration (0213), required, and you have already
run it.** Copy the tree over `aptus360/` — paths match, nothing deleted.
Supersedes every earlier zip from this session.

    src/features/gis/waterNetwork.js      NEW THIS ROUND: main runs to the dig's end
    src/features/gis/washOuts.js          where a wash out goes
    src/features/gis/lineLabel.js         line label composition
    src/features/gis/printPdf.js          paths primitive, centred text
    src/features/gis/printVector.js       symbols, sizes, labels, glyphs
    src/features/gis/GISCanvasPage.jsx    131–137
    src/features/gis/FeatureEditor.jsx    134
    src/features/gis/buildStatus.js       134
    src/features/gis/joints.js            135
    src/lib/gisStyle.js                   symbols, SYMBOL_TEXT, cascade
    src/features/admin/GisStylesAdmin.jsx wash out role, cascade inspector
    supabase/migrations/0213_washout_role.sql
    checkprintpdf.mjs  checkstyleinspector.mjs  checkbuildmaintype.mjs
    checkwashouts.mjs  checkmaintotrenchend.mjs
    HANDOVER.md

## New this round — the main reaches the end of the trench

The sizing walk prunes any node with nothing beyond it to serve, so a
run stopped at the last service tee: bare dig at the end of the street,
no wash out on it, and pipe missing from the bill. A run that ends at a
dead end now carries on along the trench to where the dig stops, and
the wash out goes at that new end.

Three deliberate limits: a run that ended at a junction or a size
change is NOT extended (there is served pipe ahead of it); a fork
beyond the last service stops the extension rather than guessing which
leg is the main, and the bare-trench report still names it; and the
size does not change over the tail — the pipe that arrives carries on.

## Wash outs, print parity (130–135), water build type (134)

As before: wash outs at every dead end as a disc with WO, colour
following the water main; symbols, sizes, line labels and hand-placed
label positions all print as the screen shows them; and the build lays
`water_main` planned rather than the incumbent's type.

**On existing drawings, re-run Build Water Network.** One pass now:
relays the mains as the right type and status, carries them to the end
of the dig, replaces the service valves, and places the wash outs. The
status line reports the wash out count.

## Suite state

142 of 160 pass — the same 18 pre-existing failures as this session's
baseline, with two new checks added and passing. Build clean. Each fix
fails its own cases when reverted.
