# Two files. Copy both over. Nothing else needed.

    netlify/functions/admin.js
    src/features/admin/EnquiryFormsAdmin.jsx

## Why

The deployed versions of these two still refer to `Enquiry_Section` — a
table I created in error and then dropped. The screen asks for it, and
PostgREST answers "could not find the table in the schema cache".

Neither file in here mentions it. That is the whole fix.

## How to know it worked

Open each file after copying and search for `Enquiry_Section`:

  netlify/functions/admin.js   — should list only Enquiry_Form,
                                 Enquiry_Question, Enquiry_Option
  EnquiryFormsAdmin.jsx        — should not contain the word at all

Then deploy and hard-refresh the browser, because the old screen may
still be cached as a chunk.

## My fault, twice over

I sent two different deltas under the same file name,
aptus360-enquiry-editor.zip — the first with the mistaken schema, the
second with the rewrite. If both were in your downloads, the older one
would win.

This zip has a name that cannot collide. I will date-stamp them from
now on.
