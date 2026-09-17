# Fix — the enquiry date was never selected

    netlify/functions/portal.js
    checkportal.mjs  HANDOVER.md

No migration.

## What was wrong

`Project.Date_Received` was read but not asked for. A column missing
from a function's select list is simply not returned, so the field came
back undefined and "Enquiry received" showed as "to come" on every
site — with no error anywhere.

This is recurring fault 4 in the handover, which has now bitten four
times in this codebase.

## The check that closes it

checkportal now compares every field the portal reads off a project
against the columns it selected. Removing Date_Received from the list
reproduces your symptom and fails the check.

## Everything else in this file

The scoping fix (Project_Developer only), the version marker, and the
four progress dates. It supersedes every earlier portal.js.

## Suite state

148 of 166 pass, the same 18 pre-existing failures. Build clean.
