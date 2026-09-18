# One file: dates and radio spacing

    src/features/portal/DeveloperPortal.jsx

No migration. Includes the Next/Back change from the last zip.

## Dates

Everything in the portal now reads **18-Sep-26**: the enquiry answers,
the milestone dates, all of it.

Two details worth knowing. The day is padded to two digits so a column
of dates lines up. And the month comes from a fixed list rather than
the locale, because en-GB renders September as "Sept" — four letters
where every other month has three.

A date ANSWER is stored in that form as well, not as 2026-09-18,
because it is read beside its question by whoever picks the enquiry up,
and an ISO date in a sentence reads as a reference number.

## Radio buttons and checkboxes

Ten pixels between the control and its words, and the control no longer
shrinks when the text wraps.

They were using a class defined inside the feature editor's own
stylesheet, which does not exist in the portal — so there was no gap at
all. Fourth time that pattern has caught us today.

## Suite state

156 of 174 pass, the same 18 pre-existing failures. Build clean.
