# Delta — developer name, metric cards, and the enquiry sheet's foundation

    src/features/portal/DeveloperPortal.jsx
    netlify/functions/portal.js
    supabase/migrations/0225_enquiry_form.sql   ← the schema only
    HANDOVER.md

## 1. Developer name — done

The organisation's name sits above the site list, with the branch in
brackets where the account belongs to one. An organisation-level
contact sees the company alone, since they are at no single office.

It comes from /portal/me, which the app already has when it routes
here, rather than a second request.

## 2. Metric cards — done

A card row above the list, showing the number of projects. It is a
grid, so the next ones land beside it without touching the layout —
which is the point of building a row rather than a sentence.

Counted from the list that was returned, not asked for separately, so
the number and the list cannot disagree.

## 3. Enquiry sheet — schema only, deliberately

The button is on the page, disabled with a reason rather than hidden.

0225 creates the four tables: Enquiry_Form (versioned, so rewording a
question does not rewrite what somebody already answered),
Enquiry_Section, Enquiry_Question (text, long text, number, date,
document, single choice, multiple choice), and Enquiry_Option.

**Branching lives on the OPTION**: Next_Question_ID / Next_Section_ID
say where an answer leads, both null meaning carry on. A jump is a
property of the answer given, and every other arrangement ends up
re-deriving which answer it was. Jumps go forward only — a form that
can jump backwards can loop, and a loop is a trap with no way out.

**Not built yet:** the admin editor, the form renderer, and the answers
themselves. Answers are deliberately absent from this migration: a
submitted enquiry outlives the form it was answered against, and that
is its own piece of work.

## What I need before building the editor

1. Does one sheet serve every utility, or one per utility? The schema
   allows either (Utility on the form); the editor is simpler if you
   know which.
2. Does an enquiry belong to a branch, or to the person who sent it?
   That decides who can see it afterwards.
3. Should a submitted enquiry become a project automatically, or sit in
   a queue for somebody here to accept?

## Suite state

154 of 172 pass, the same 18 pre-existing failures. Build clean.
