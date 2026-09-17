# Delta — portal: sign in with email and password, then see your branches

    supabase/migrations/0223_portal_project_scope.sql   ← RUN THIS
    src/features/portal/PortalLogin.jsx      email and password only
    src/features/portal/DeveloperPortal.jsx  grouped by branch
    src/features/admin/PortalAccountsAdmin.jsx  site scope + real error
    netlify/functions/portal.js              three scopes, branch labels
    netlify/functions/portal-accounts.js  portal-orgs.js
    checkportal.mjs  checkportalscope.mjs  HANDOVER.md

Includes the portal-scope delta; this supersedes it.

## Signing in

Email and password. Nothing else.

The organisation and branch dropdowns are gone. Neither was ever sent
or checked — the code said so itself — and they made a contact find
their own company in a list of every organisation on the system before
they could type a password.

## After signing in

The portal shows what the account is attached to, from its Portal_Access
record:

- **Whole organisation** — every site, grouped under a heading per
  branch
- **One branch** — that branch's sites, no headings
- **One site** — that site

A site whose branch is not recorded appears under "Other sites" rather
than vanishing.

## Giving somebody access

Admin › Portal Accounts: organisation, then branch, then optionally a
single site. Naming a site is a ceiling — the organisation then says
who they are, not what they see.

## Suite state

151 of 169 pass, the same 18 pre-existing failures. Build clean. Two
existing checks that asserted the old sign-in were rewritten to the new
rule rather than dropped.
