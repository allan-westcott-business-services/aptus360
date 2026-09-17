# Progress page — two tabs, and a tree

    netlify/functions/portal.js              builds the tree
    src/features/portal/DeveloperPortal.jsx  tabs and the tree
    checkportal.mjs  HANDOVER.md

No migration. This portal.js carries everything before it.

## Pre Contract

Laid out as your mockup: nested lines with a coloured dot each.

    Enquiry received - 3 Aug 2026
      Documentation
        Plot Breakdown - 5 Aug 2026
        Section 38 layout            [Upload]
    Team assigned
      Project manager: ...  (email, phone)
      Estimator: ...
    Outline design complete - Electric - ...
    POC
      Electric
        Application submitted - 10 Aug - to Northern Powergrid
        Option 1 - received 16 Jul
          Quotation 1 - 27 Jul - £1,234
        Invoice paid                 (grey - not recorded)
      Water
        ...

The upload button sits on the line that asks for the document.

## Three things worth knowing

**A parent's colour is computed from its children** — all done is
green, some done is amber, none done is red. A parent cannot claim to
be finished over an outstanding child.

**Grey is not red.** Nothing records invoice payment yet, so those
lines are grey and say "not recorded yet". Red would mean "not done",
which we cannot honestly claim about something we do not see. Give me a
source and they turn green or red properly.

**The team is named** — your question on the mockup. The project
already holds the project manager, estimator and account manager with
their contact details, and the developer's next question after "team
assigned" is who to ring.

## Site Build

An empty tab that says so, rather than hidden. Tell me what stages
belong there and where they are recorded and I will fill it.

## Suite state

148 of 166 pass, the same 18 pre-existing failures. Build clean.
