# Delta — Organisation (Branch) as the heading, and the metric card

    src/features/portal/DeveloperPortal.jsx
    netlify/functions/portal.js
    supabase/migrations/0225_enquiry_form.sql   (schema only, nothing reads it yet)
    checkportalscope.mjs
    HANDOVER.md

## The header

    Barratt Homes (Yorkshire East)     24px, bold — the heading
    Your sites                         14px, muted — the list's label

The branch appears in brackets where the account belongs to one. An
organisation-level contact sees the company alone, rather than an
office they are not at.

## The card

Number of projects, counted from the sites already loaded.

## Two things I got wrong on the way

I reused the class `.pt-who`, which this file already uses for the
signed-in person's name in the top bar — so my 24px bold rule landed on
that too. Renamed `.pt-org`. Worth knowing if you saw the top bar look
odd on the last build.

And I wrote backticks inside the CSS template literal while explaining
that rename, which ends the string. The build still passed; checkscope
caught it.

## Enquiry sheet

Schema unchanged from the last delta and still awaiting your read
before I build the admin designer and the form on top of it.

## Suite state

154 of 172 pass, the same 18 pre-existing failures. Build clean.
