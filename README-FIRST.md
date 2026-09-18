# One file: the Enquiry Sheets screen, with spacing

    src/features/admin/EnquiryFormsAdmin.jsx

## Why it was squashed

The screen used layout classes from the GIS Styles admin — and that CSS
is injected by THAT component when it renders. With it unmounted the
rules simply do not exist, so every control stacked with no grid and no
spacing at all.

Third time this pattern has caught us today. A class defined inside
another component's stylesheet is not a shared class; only
src/styles.css is shared.

## Now

The screen carries its own stylesheet: a grid with real gaps, sections
as cards with room inside them and space between them, a rule above
each question, and the answers of a choice question indented under it
so they read as belonging to that question rather than as more
questions.

## Note

This is the same file as in yesterday's enquiry-section fix, with the
styling added. If you have not applied that one yet, this supersedes
it — but you still need the admin.js from it.
