# Pre Contract tab — the full structure

    netlify/functions/portal.js
    src/features/portal/DeveloperPortal.jsx
    checkportal.mjs  HANDOVER.md

No migration. Carries everything before it.

## The order now

    Enquiry received
    Documentation
      (each document we have asked for, with Upload on the line)
    Team assigned
      Project manager / Estimator / Account manager, with contacts
    POC
      Electric / Gas / Water
        Application submitted - date - to whom
        each option, with its quotations and costs
        Invoice paid                       (grey - no source)
    Outline Design
      Electric / Gas / Water
        Designer assigned                  (named)
        Design started                     (grey - no source)
        Design completed                   Project_Scope.Actual_Date
        Sent to client                     Project_Scope.Date_Sent
        Approved by client                 (grey - no source)
    Quotation
      Quotation completed / Sent to client / Approved by client
                                           (all grey - no source)
    Contract Design
      as Outline Design, all grey - nothing records it separately yet

POC moved above the design, as asked. Water appears wherever it has a
POC application, the same as electric and gas.

## Colours

**Grey means no date recorded** — every stage is listed whether or not
we know anything about it.

**Red means one thing only**: a document we have asked you for and not
received. That is genuinely outstanding and can be acted on from the
line itself.

**Amber** means started but not finished. **Green** requires every
child to be done — a branch with two stages recorded and three
untracked is amber, not green.

## To turn the grey lines on

Design started, approved by client, the three Quotation stages,
Contract Design, and invoice paid all need a source. Name the table and
column for any of them and it is the same wiring as the others.

## Suite state

148 of 166 pass, the same 18 pre-existing failures. Build clean.
