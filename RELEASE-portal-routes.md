# The fix — three endpoints had no route

    netlify/functions/portal.js
    netlify/functions/portal-orgs.js
    netlify/functions/portal-accounts.js

One line added to the end of each:

    export const config = { path: "/api/portal/:what" };
    export const config = { path: "/api/portal-orgs" };
    export const config = { path: "/api/portal-accounts" };

Netlify routes a function by that config INSIDE the file, not by its
filename. Without it the function deploys cleanly and answers 404 —
which is why the organisation dropdown showed "None listed" while the
database had ten.

No migration. Nothing else changed.
