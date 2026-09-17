# Delta — portal contacts: organisation, branch, or one site

    supabase/migrations/0223_portal_project_scope.sql   ← RUN THIS
    netlify/functions/portal.js           resolves the three scopes
    netlify/functions/portal-accounts.js  accepts a site
    netlify/functions/portal-orgs.js      serves the sites to choose from
    src/features/admin/PortalAccountsAdmin.jsx
    checkportalscope.mjs   new check
    HANDOVER.md

## The three scopes

    Organisation, no branch   every site in every branch
    Organisation + branch     that branch's sites only
    + a site                  that one site

The first two already worked. The third is new: Admin › Portal
Accounts now has a **Site** dropdown under Branch, listing the sites
that branch (or organisation) actually runs.

**Naming a site is a ceiling.** The organisation on the record then
says who the contact is, not what they may see — otherwise the
narrowest scope would silently become the widest. The resolver returns
that project and stops before the organisation pass, and the check
asserts the ordering, not just the line.

## One thing you should know

The Organisation and Branch dropdowns on that screen were very likely
EMPTY in the live app. They called the generic admin endpoint, whose
allow-list carries neither Organisation nor Organisation_Branch, and
the errors were swallowed — so a refused request looked exactly like
"this organisation has no branches".

The screen now reads the portal's own endpoint, and shows a banner when
a lookup fails instead of quietly offering nothing. Worth a look at
whether anyone has been unable to set a branch until now.

## Suite state

151 of 169 pass, the same 18 pre-existing failures. Build clean.
