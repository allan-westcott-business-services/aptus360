# portal.js — scopes on the record, and says which version it is

    netlify/functions/portal.js

One file. No migration.

## How to tell whether it is live

Signed in as the test developer, open:

    https://<your-site>/api/portal/me

The JSON includes:

    "scope": "project_developer"

If that field is absent, an older build is still serving — and an older
build scopes on Project.Organisation_Branch_ID, a cached column that
has drifted on your data, which is why Anwyl Lancashire sees twelve
sites instead of one.

## What this file does

A developer's sites are found through Project_Developer only. On your
data that is exactly one project for branch 17: Manchester Road,
Carrington.

## If the marker IS present and you still see twelve

Then something else is adding them and I want to know — send me what
/api/portal/me returns and I will work from that rather than guessing.
