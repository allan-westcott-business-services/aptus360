# Delta — Show Cross-section: in the editor, and actually working

    src/features/gis/GISCanvasPage.jsx   the fix + the editor wiring
    src/features/gis/FeatureEditor.jsx   the button
    checksectionmark.mjs                 three more cases
    HANDOVER.md

No migration — 0214 from the previous delta is still required.

⚠ Assumes the full session set plus the cross-section delta.

## Why nothing happened

The mark's trench was found with `f.Feature_ID === id` against the id
stored on the mark. An id that comes back from the database as a
string fails that strict comparison, so the lookup found nothing and
the function returned early — leaving no trace on screen at all.

Three fixes: numbers on both sides; a fallback to the trench the mark
is physically sitting on, for any mark whose link is missing or stale;
and a try/catch that reports a failure instead of swallowing it. A
button that does nothing is the worst outcome — a misclick and a bug
look the same, so you just click again.

## Where the button is now

In the feature editor — click the mark, and **Show Cross-section** is
in the dialogue header, under the feature id. The right-click item
stays as a shortcut; say if you would rather it went.

## Suite state

146 of 164 pass, the same 18 pre-existing failures. Build clean.
