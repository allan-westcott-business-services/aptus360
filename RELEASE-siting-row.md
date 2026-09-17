# Delta — siting on the status row, and "Not set"

    src/features/gis/FeatureEditor.jsx
    checkdxflayers.mjs
    HANDOVER.md

No migration.

## Changes

**External or internal** now sits on the SAME ROW as Status, to its
right, using `fe-row` — the class this panel already uses for two
fields that belong together, so they size and wrap like every other
pair.

**"Not said" is now "Not set"**, which is what every other unset option
in the panel says.

Worth noting: this file already carried a comment explaining that
exact point about a different field — that "Not said" was the odd one
out and a phrase used once is one somebody stops to read. I wrote it
anyway. Your correction restores the panel's own convention.

## Suite state

148 of 166 pass, the same 18 pre-existing failures. Build clean.
Reverting the row fails the check.
