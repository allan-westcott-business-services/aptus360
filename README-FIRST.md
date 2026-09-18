# One file: the Enquiry Sheets screen

    src/features/admin/EnquiryFormsAdmin.jsx

Includes yesterday's spacing fix. No migration, no SQL.

## Why Document / One choice / Several choices did nothing

I guessed three of the seven Kind values. The database accepts:

    text  long_text  date  number  file  choice_one  choice_many

I had written document, choice and multi. Selecting one of those wrote
a value the check constraint rejects: the save failed, the dropdown
sprang back, and it read as a control that does nothing.

Now they match the constraint exactly.

## And the failure is now visible

The error banner is sticky. It was at the top of the pane, which is
nowhere near somebody editing the twentieth question — the save was
failing and reporting it off-screen. That is why this looked like
nothing happening rather than an error.

## Held by the check

checkenquiryform.mjs now lists the seven kinds the constraint allows
and fails if the editor offers anything else, or drops one. If a kind
is ever added, it goes in the constraint AND the editor, and the check
notices when only one of the two happened.

## Suite state

155 of 173 pass, the same 18 pre-existing failures. Build clean.
