# Delta — External or Internal, where it can actually be seen

    src/features/gis/FeatureEditor.jsx
    checkdxflayers.mjs   asserts where it renders
    checkbuildmaintype.mjs  checkbulkfields.mjs  (from the previous delta)
    HANDOVER.md

No migration. Includes the previous delta's line-editor changes.

## Why it vanished

The editor has THREE Status dropdowns — trench, service and main. I put
the field beside the trench one, and a cable or a meter never reaches
that branch, so it rendered for nothing.

## Where it is now

- **Mains feeder cable** — beside the main's Status, where the two are
  read together
- **Meter** — beside the meter reference, since a meter has no Status
  dropdown of its own

Built once and rendered in both places, so the two cannot drift apart.

The check now asserts it is built once and rendered under both
branches: "the code exists" and "the code runs" are different claims,
and only the second is what you see.

## Suite state

148 of 166 pass, the same 18 pre-existing failures. Build clean.
