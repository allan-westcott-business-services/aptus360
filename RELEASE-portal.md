# Client portal — complete set, now with a screen for accounts

    supabase/migrations/0218_portal.sql         ← RUN FIRST
    supabase/migrations/0219_portal_branch.sql  ← THEN THIS
    src/features/portal/AudienceLanding.jsx
    src/features/portal/PortalLogin.jsx
    src/features/portal/DeveloperPortal.jsx
    src/features/admin/PortalAccountsAdmin.jsx  NEW — the screen
    src/features/admin/AdminPage.jsx            registers it
    src/lib/adminTables.js                      adds it to the admin menu
    src/features/auth/LoginPage.jsx
    src/App.jsx
    netlify/functions/portal.js
    netlify/functions/portal-orgs.js
    netlify/functions/portal-accounts.js
    netlify/functions/admin.js                  allows the table
    checkportal.mjs  checkfieldqueue.mjs  HANDOVER.md

**Commit all of these — several are new files in new folders.**

## New: Admin › Portal Accounts

Creating a client login is now a form. Email, name, kind of account,
organisation, branch, and an optional password.

**Leave the password blank** and they get an emailed invitation and
choose their own — the safer way round, since a password you type is a
password that lives in an email thread. Set one only when you are on
the phone to them.

**Branch** matters where a developer has more than one office: they see
that branch's sites only. Leave it blank for a one-office developer and
they see everything their organisation is on.

The list switches accounts off rather than deleting them. An account
that uploaded documents and approved things is part of a site's
history; deleting the row would leave those attributed to nobody.
Removing the Supabase sign-in itself is a Supabase dashboard job,
deliberately not a button here.

## Still to do

- Nothing writes the milestone dates yet — that is the remaining gap
  before a developer sees anything useful on the progress page.
- DNO and IDNO portals.

## Suite state

148 of 166 pass, the same 18 pre-existing failures. Build clean.
