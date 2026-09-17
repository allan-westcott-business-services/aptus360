# Progress dates, from the sources you named

    netlify/functions/portal.js              reads the four sources
    src/features/portal/DeveloperPortal.jsx  shows the POC tree
    checkportal.mjs  HANDOVER.md

No migration. This portal.js also carries the scoping fix and the
version marker.

## What a developer now sees

    Enquiry received          Project.Date_Received
    POC application submitted POC_Application.Application_Date
                              (falls back to Submitted_Date, and says which)
    POC quotation received    POC_Option / POC_Quotation Date_Received
    Outline design complete   Project_Scope.Actual_Date, ONE LINE PER UTILITY

Read from the source each time rather than copied by a job. A copy goes
stale silently; a read cannot. Where a hand-entered date disagrees with
the system, the system wins — the typed one was entered before the
system knew.

## Point of connection, in full

An application draws several options and each option several
quotations, so the page shows the tree: each option with the date it
arrived and whether it was chosen, and every quotation under it with
its reference, date and cost.

Collapsing that to "quotation received on X" would hide that three
arrived and one was selected, which is the part your client is waiting
on.

## What still has no date

Accepted, detailed design, adoption agreement, works start, energised,
complete. They show as "to come". Name a source for any of them and I
will wire it the same way; the rest want a staff screen.

## Suite state

148 of 166 pass, the same 18 pre-existing failures. Build clean.
