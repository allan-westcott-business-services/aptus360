# The enquiry queue — where submitted enquiries appear

    supabase/migrations/0227_enquiry_decision.sql   ← RUN THIS
    netlify/functions/enquiries.js       new endpoint
    src/features/admin/EnquiriesAdmin.jsx  new screen
    src/features/admin/AdminPage.jsx  src/lib/adminTables.js
    checkenquiryqueue.mjs
    HANDOVER.md

## Admin › Enquiries

The list on the left, the enquiry beside it. Each answer shows the
question AS IT WAS WORDED when it was asked, so an enquiry from months
ago reads in its own terms however the sheet has changed.

Accept or Decline, with a note. Waiting enquiries sort first; decided
ones stay, because "what did we say to them in April" gets asked as
often as "what is new".

## 0227

Adds Decided_At, Decided_By and Decision_Note. The table recorded WHAT
was decided but not who, when or why — the three things somebody asks
about a decline four months later, usually because the developer has
come back.

Decided_By is an email rather than a person id: a decision outlives an
employment, and a name that stops resolving is worse than an address
that still reads.

## Accepting links a project; it does not create one

Creating one needs a reference, a customer and a branch decided by
rules this endpoint does not know, and a wrong project is worse than a
missing link. So Accept optionally takes a project number you have
already made, and can be left blank and joined up later.

If you would rather it created the project, tell me the rules for the
reference and the customer and I will build it.

## Two guards worth knowing

**Staff only.** A portal account reaching this endpoint would see every
developer's enquiries.

**Decided once.** A second decision is refused rather than overwriting
a colleague's answer and the date they gave it.

## Suite state

157 of 175 pass, the same 18 pre-existing failures. Build clean.
