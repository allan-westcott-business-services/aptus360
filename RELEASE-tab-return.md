# Delta — returning to the tab no longer refreshes the page

    src/lib/AuthContext.jsx   a refreshed token is not a new session
    src/App.jsx               the tree is not unmounted while re-checking
    checktabreturn.mjs        new check
    HANDOVER.md

No migration.

## The cause

Supabase fires TOKEN_REFRESHED whenever a tab regains focus. The auth
context set a NEW session object on every event, so App's routing check
re-ran, set its "asking" flag, and returned a Loading screen.

That return unmounts the whole tree. Whatever page you were on was
destroyed and rebuilt from scratch — which is what you were seeing.

## The fix

The session object is replaced only when it is genuinely a different
session: a different user, or signed in versus signed out. A token
refresh keeps the object it had. Nothing reads the token from there —
the api client asks Supabase on each request — so nothing goes stale.

And the Loading screen now shows only while the answer is not yet
known, not while it is being re-checked. A re-check happens quietly
behind whatever is on screen.

## Related

The GIS canvas view memory from the earlier delta is still worth
keeping: it survives a real page reload, which this does not address.
But it was a plaster over this fault, and I said at the time I could
not find the cause. This is the cause.

## Suite state

153 of 171 pass, the same 18 pre-existing failures. Build clean.
