# Delta — enquiry sheets: the admin editor

    supabase/migrations/0225_enquiry_form.sql        ← run in order
    supabase/migrations/0226_enquiry_submission.sql
    src/features/admin/EnquiryFormsAdmin.jsx   new screen
    src/features/admin/AdminPage.jsx  src/lib/adminTables.js
    netlify/functions/admin.js  netlify/functions/portal.js
    src/features/portal/DeveloperPortal.jsx
    checkenquiryform.mjs
    HANDOVER.md

Includes the developer name and metric cards from the previous delta.

## Admin › Enquiry Sheets

Build the sheet as it reads: sections, and questions inside them.

Answer types: short text, long text, number, date, document, one
choice, several choices.

**Branching** is set on the answer: each option has a "Then go to",
listing only the questions that come AFTER it. That is how a loop is
made impossible rather than detected — a form that can send somebody
backwards can send them round.

**Versions.** "Copy to a new version" duplicates the whole sheet,
including the jumps, remapped to point inside the copy. Edit the copy,
then "Make this the live sheet". One live sheet per utility, enforced
by the database, and the sheet it replaces is stood down.

An enquiry already submitted keeps the version it was answered
against — which is why editing never touches the old one.

## Your three answers, built in

- One sheet per utility (Utility on the sheet)
- An enquiry belongs to the BRANCH, with the sender recorded for reply
- Nothing becomes a project by itself: draft → submitted → accepted or
  declined, and Project_ID is filled only when one is made

## Still to build

The form renderer in the portal, submission and attachments, and the
accept/decline queue. The portal's "New enquiry" button is there,
disabled with a reason.

## Suite state

155 of 173 pass, the same 18 pre-existing failures. Build clean.
