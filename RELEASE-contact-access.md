# Delta — portal access comes from contacts and stakeholders

    supabase/migrations/0224_contact_scope.sql   ← RUN THIS
    netlify/functions/portal.js
    netlify/functions/portal-accounts.js
    checkportalscope.mjs
    HANDOVER.md

Supersedes the previous contact-access delta.

## The three sources, and only these

    Contact of an ORGANISATION    every site of every branch
    Contact of a BRANCH           that branch's sites
    STAKEHOLDER on a project      that scheme

Nothing else grants access. The contact list is asked first; a
Portal_Access row is still honoured, but only as a legacy grant for
accounts created before this, and nothing makes one as the way in any
more.

Narrowest wins: somebody named as a stakeholder on a scheme sees that
scheme, whatever else they are a contact of.

## How each is set

- **Organisation or branch** — Organisations › Branches & contacts.
  0224 adds an organisation-level contact, so a contact can be attached
  to the whole group rather than to one office.
- **Project** — the project's own stakeholder list, which is kept there
  anyway. The list somebody maintains while running a job is the list
  that decides who can watch it.

## Two guards

**Staff are excluded**: a contact whose address belongs to an active
Person stays in the application rather than being moved to a client
portal.

**No portal role, no account**: an organisation that is not a developer,
DNO or IDNO grants nothing — guessing would show a subcontractor a
developer's schemes. A project with no developer recorded likewise.

## Suite state

152 of 170 pass, the same 18 pre-existing failures. Build clean.
