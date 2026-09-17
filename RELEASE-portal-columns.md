# Fix — the portal asked for columns a project does not have

    netlify/functions/portal.js                 the real columns, both site routes
    src/features/portal/DeveloperPortal.jsx     shows Site_Name / Display_Ref
    checkportal.mjs  HANDOVER.md

No migration.

## What was wrong

`Project_Name` and `Project_Number` were my invention. A project is
known by **Site_Name** and **Display_Ref** — the reference printed on
everything you have sent the developer. Postgres only complains at run
time, so the build was clean and the page failed for whoever opened it.

## What else that turned up

`Project` carries **Organisation_Branch_ID** itself, which is how most
schemes are recorded — I had been finding sites only through
Project_Developer, which covers schemes with more than one developer.
Both are now read, so a developer sees everything genuinely theirs.

That matters for your test: the Anwyl Lancashire project may be
recorded either way.

## And a check for the class

checkportal now audits every column the portal asks a project for
against the list projects.js maintains. An invented column now fails a
check rather than a user.

## Suite state

148 of 166 pass, the same 18 pre-existing failures. Build clean.
