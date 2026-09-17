# Client portal — the new front door, and the developer's own pages

    supabase/migrations/0218_portal.sql        ← RUN FIRST
    src/features/portal/AudienceLanding.jsx    new — the four squares
    src/features/portal/DeveloperPortal.jsx    new — sites, progress, documents
    netlify/functions/portal.js                new — the only endpoint they touch
    src/App.jsx                                routes by ACCOUNT, not by square
    checkportal.mjs                            new check
    checkfieldqueue.mjs                        re-anchored (see below)
    HANDOVER.md

## One thing to set up before it works

A **Supabase Storage bucket named `portal`**, private. Documents go
there on signed URLs; nothing else uses it.

Then give somebody access by inserting a row:

    INSERT INTO "Portal_Access" ("Email","Audience","Customer_ID","Full_Name")
    VALUES ('someone@developer.co.uk', 'developer', 42, 'Jane Smith');

They sign in with an ordinary Supabase account on that email. Staff
accounts need no row at all — no row means staff.

## The door

Four squares: Aptus Staff & Contractors, Client Developer, DNO, IDNO.
Pressing one leads to sign-in.

**The square grants nothing.** What opens afterwards is decided by the
audience recorded against the account. A staff account that pressed
"Client Developer" still gets the app. This is deliberate: if the
landing page granted access, the landing page would be the security
boundary, and that is not a boundary anybody should be able to walk
around by editing a URL.

## What a developer gets

**Their sites**, and only theirs — scoped server-side from the signed-in
account. A site id typed into the address bar is refused as "no such
site" rather than "forbidden", so project numbers cannot be probed.

**Progress**, as the full sequence of milestones with dates against the
ones reached — including who a POC application went to, which is the
thing they chase. The page says plainly that we maintain the dates.

**Documents both ways.** Things we have asked them for, which they
upload; and things we have sent them to review, sign or approve, which
they download and mark done. Uploads go straight to storage on a signed
URL, so a large drawing does not pass through a function.

## DNO and IDNO

Named as not open yet rather than dropped into the staff app — which
would put a network owner in front of every developer's scheme. Ready
for the functionality when you are.

## Still to do

- **Nothing writes the milestone dates yet.** The tables and the display
  are built; the job that refreshes them as each stage completes is
  not, so staff would have to enter them by hand today. Tell me which
  system events should set which dates and I will wire it.
- An admin screen for Portal_Access (rows are SQL for now).
- The DNO and IDNO portals.

## Suite state

148 of 166 pass, the same 18 pre-existing failures. Build clean.

Note: `checkfieldqueue` asserted the Gate's old one-line field branch,
which the new routing replaced. The property is unchanged — the field
app must be its own surface — and the case now tests it in both shapes.
