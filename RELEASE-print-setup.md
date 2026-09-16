# Delta — Print to Scale sets the drawing up for issue

Three files, changed by this request only:

    src/features/gis/GISCanvasPage.jsx   the set-up + utility-menu entries
    checkprintsetup.mjs                  new check
    HANDOVER.md                          fault 139

No migration.

⚠ **This delta assumes the full session set is already applied.** The
GISCanvasPage.jsx in here imports from washOuts.js, lineLabel.js and
dxf.js. If those are not in your repo yet, apply
`aptus360-full-session.zip` instead — this is the same file, plus the
modules it needs.

## What it does

Clicking Print to Scale — from the Drawing menu, or from any utility
menu, which now offers it too — first:

    OFF  trench (mains and service)   ON   mains labels
    OFF  plot seeds                   ON   service labels
    OFF  span nodes
    OFF  feeder end points

Applied to the drawing, so what you see is what prints. Added to
whatever you already had hidden, so an isolate survives. Not put back
afterwards — a status line says what moved and the layer menu restores
it.

Printing from the Gas menu does NOT hide water and electric; utility
isolation was not asked for and is not assumed.

## Suite state

144 of 162 pass, the same 18 pre-existing failures. Build clean.
Removing a key or the master-label line fails the check.
