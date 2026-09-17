# Delta — Line Editor: no Line type, and siting beside status

    src/features/gis/FeatureEditor.jsx
    checkbuildmaintype.mjs   rewritten to the current rule
    checkbulkfields.mjs      rewritten to the current rule
    HANDOVER.md

No migration.

## Changes

**Line type is gone** from the line editor, both the trench row and the
rest. The drawing already says what a line is — colour, style, the menu
it was drawn from — so a read-only field was a row of the panel spent
on something already on screen.

Nothing anywhere edits Line_Type now, which remains deliberate: the
type decides the status list, the bill and what every build reads, so a
drawn-wrong line is deleted and drawn again.

**External or internal** now sits to the right of Build status, where
the two are read together. Still shown only on mains feeder cables and
meters.

## Two checks rewritten

Both asserted the old arrangement — one wanted the read-only field, the
other wanted the editor to keep it so a line could be reclassified.
They now assert the rule as it stands: nothing edits Line_Type. A check
that encodes a decision has to be revisited when the decision is.

## Suite state

148 of 166 pass, the same 18 pre-existing failures. Build clean.
