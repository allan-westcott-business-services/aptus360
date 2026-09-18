# Delta — Date Received on the project Details tab

    src/features/projects/ProjectDetailsForm.jsx
    checkdatereceived.mjs   new check
    HANDOVER.md

No migration, and no endpoint change: Date_Received was already
writable by the projects endpoint. Only the field was missing.

## Where it is

Top of the Details tab, first in the reference row — to the left of AP
Number, with Tender Ref after it.

That order is deliberate: the date is the first thing that happened. An
enquiry arrives, and the references follow when they are issued.

## Why it matters more than most fields

It was set on the Add form and then invisible here, so a date typed
wrongly on the way in could never be corrected — and it is the date the
KPI clock runs from.

## Suite state

154 of 172 pass, the same 18 pre-existing failures. Build clean.
