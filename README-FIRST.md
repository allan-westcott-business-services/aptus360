# One file: the form waits for you to finish typing

    src/features/portal/DeveloperPortal.jsx

No migration. The other two files from the last zip are unchanged.

## What was wrong

The form worked out which question to show from which questions had
answers — so the first letter typed counted as an answer and it jumped
to the next question mid-word.

That reading is right for "where does this answer LEAD" and wrong for
"has this person finished answering". The second is a fact about the
screen, not about the data.

## Now

The question in front of you is held explicitly. **Next question**
moves on, following the jumps exactly as before. **Back** returns to
the last one and keeps what you put.

A required question cannot be passed with Next. **Send enquiry**
appears only at the end, rather than sitting greyed out beside a
question you are still answering.

## Suite state

156 of 174 pass, the same 18 pre-existing failures. Build clean.
