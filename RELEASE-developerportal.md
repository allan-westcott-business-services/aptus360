# Delta — the correct DeveloperPortal.jsx

    src/features/gis/../portal/DeveloperPortal.jsx
    checkjsxclosers.mjs

One file that matters. No migration.

## Why you are still seeing ))}

The fix for it went out in aptus360-portal-fix.zip. The two deltas
since then either did not include this file, or landed on a tree that
never received it — so the deployed build still has the old copy.

My working copy is clean: checkjsxclosers passes, and the only `))}`
left in the file is a real closer inside a .map.

## Confirm it after copying

    node checkjsxclosers.mjs

Expect "No stray closers render as text". If it fails, the file did not
land where you think it did.

That check is included here for exactly that reason — it takes a second
and answers the question the screen was asking.

## What this file contains

Everything up to now: the site list grouped by branch where there is
more than one, one card function shared by both paths, and the portal
calls as they were before I briefly added and removed a door parameter.
