# Delta — developer name, metric cards, and the enquiry schema

    src/features/portal/DeveloperPortal.jsx   name + cards
    netlify/functions/portal.js               returns the developer name
    supabase/migrations/0225_enquiry_form.sql  the enquiry sheet's schema
    checkportalscope.mjs

0225 creates tables only — nothing reads them yet. Safe to run now or
to hold until the rest is built.

## Developer name

Above "Your sites", from the record the portal already loaded — no
second request. A contact at a group with several offices needs the
page to name the company, not only the branch.

## Metric cards

One card: Number of projects. The row is a grid, so the next two land
beside it without this being touched.

Counted from the sites already returned rather than asked for
separately — a second request could disagree with the list underneath
it.

## Enquiry sheet — schema now, screens next

This is a form engine, and the schema is the part that has to be right
first, so it is here on its own for you to read.

    Enquiry_Form       a VERSION of the sheet
    Enquiry_Question   one question, in a section, with a kind
    Enquiry_Option     the choices — and where each answer jumps to
    Enquiry_Submission + Enquiry_Answer   what comes back

Kinds: text, long text, date, number, file, one-choice, many-choice.

**Branching lives on the option, not the question.** "If Yes, skip 4
and go to 5" is a fact about the answer Yes. Put it there and a
question with four choices sends four different ways with no rules
engine, and the admin screen shows the branch beside the answer that
causes it. A question also has a default next, for kinds with no
options. Null means "the next one in order".

**Versions, not one living form.** An enquiry answered last month was
answered against the questions as they were then. Answers also store
the question text as asked, so editing a question later cannot change
what somebody appears to have been asked.

**Deliberately not built:** conditions like "show if Q2 = Yes AND
Q7 > 3". That is a rules engine and every one of them ends up needing
a debugger.

## What is still to come

The admin question designer, the developer-facing form with the jump
logic, and the "New enquiry" button. Tell me if the schema above is
right and I will build them on it; it is much cheaper to change now
than after three screens read it.

## Suite state

154 of 172 pass, the same 18 pre-existing failures. Build clean.
