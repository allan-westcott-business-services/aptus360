# Delta — the staff guard removed

Three files, changed by this fix only:

    netlify/functions/portal.js   the guard, and the door, both gone
    checkportalscope.mjs          asserts the guard stays absent
    HANDOVER.md

No migration — 0224 is unchanged and you have run it.

App.jsx and DeveloperPortal.jsx are NOT here: the door parameter went
into them and came back out within the same round, and both are now
byte-identical to what I last sent. I checked rather than assumed.

## What changed

The contact lookup no longer consults the Person table. An address that
is both staff and a contact now opens the portal, which you have said
will not arise outside testing.

The check asserts that test stays absent, so it reads as a decision
rather than an oversight.

## Your test account

me@allanmurrell.co.uk — active contact, branch 19, organisation 2,
which holds the customer role. After deploying this it should open the
developer portal with that branch's sites.

## Suite state

152 of 170 pass, the same 18 pre-existing failures. Build clean.
