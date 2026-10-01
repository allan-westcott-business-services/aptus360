/* What am I allowed to open?

   One call, made once a session exists, beside the /portal/me call that
   already decides which application somebody gets. The app cannot work
   this out for itself: the grants are rows in Person_Menu_Visible
   against a Person found by email, and the browser has neither the
   service key nor any business holding the whole table.

   Only ever the CALLER's own grants. There is no person parameter, on
   purpose — an endpoint that answers "what is Sam allowed to open?" is
   an endpoint that tells anybody the shape of everybody's access, and
   nothing in the app needs it. People & Roles reads the table itself,
   through the admin endpoint, which is where that question belongs.

   The answer is advice, not permission. It decides what the sidebar
   shows; the endpoints that matter check the grant again for
   themselves (see _access.js). */

import { json, fail, withAuth } from "./_supabase.js";
import { grantedKeys } from "./_access.js";

export default withAuth(async function handler(req, context, user) {
  if (req.method !== "GET") return json({ error: "GET only" }, 405);
  try {
    const { personId, keys } = await grantedKeys(user);
    return json({
      email: user?.email ?? null,
      /* Named so the app can say WHY somebody has nothing, which is a
         different conversation in each case: no Person record is one
         for whoever set the account up, and a Person with no ticks is
         one for whoever manages their access. */
      personId,
      keys,
    });
  } catch (e) {
    /* Not an empty list. The app refuses to render rather than showing
       somebody an app with nothing in it and letting them conclude
       their access was taken away. */
    return fail(e);
  }
});

export const config = { path: "/api/access" };
