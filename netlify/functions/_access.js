/* Which screens the caller is allowed to use — the server's copy.

   ── Why there has to be a server's copy ──

   People & Roles grants menu access per person, and src/lib/access.js
   now acts on it: a screen somebody has not been given is not in their
   sidebar and the shell refuses to render it. That is the whole of what
   the browser can do, and it is worth nothing on its own. The menu is
   markup. The endpoint behind it is a URL, it answers anybody holding a
   valid session token, and a drawing is the most valuable thing in the
   system — so "restricted to some staff" has to mean the server
   refuses, not that the button is missing.

   So the grant is checked twice, in two places, against the same row:
   once to decide what to put on screen, and once, here, to decide
   whether to do the work.

   ── Found by email, like whoIs ──

   Every endpoint runs on the service key, so the database never sees
   the signed-in user and cannot answer this itself. The link from a
   login to a Person is the email address, matched the way the rest of
   this file matches it — case-insensitively, against an active person —
   because that is already how a change gets a name written against it.

   An account with no Person row has no grants. Not an error: contractor
   logins and old accounts exist, and the honest answer for them is that
   they have been given nothing.

   ── Nothing granted means refused ──

   The same strict rule as the browser side, for the same reason, and it
   is the reason migration 0245 exists: it grants people what they are
   already using before anything starts refusing. Deployed without it,
   this locks out everybody including whoever deployed it. */

import { supabase, json } from "./_supabase.js";

/* The Person this login belongs to, or null.

   Null is a real answer here and is treated as "no grants", so a
   missing row refuses rather than throwing — a 500 on an access check
   reads as an outage and sends somebody looking for a fault in the
   feature they were using. */
export async function personIdFor(user, db = supabase()) {
  const email = (user?.email || "").trim();
  if (!email) return null;
  const { data, error } = await db.from("Person")
    .select("Person_ID")
    .ilike("Email", email)
    .eq("Is_Active", true)
    .maybeSingle();
  if (error) return null;
  return data?.Person_ID ?? null;
}

/* Every menu key this login has been granted.

   An array rather than a Set because it is also the body of the /access
   answer, and JSON has no sets. */
export async function grantedKeys(user, db = supabase()) {
  const personId = await personIdFor(user, db);
  if (personId == null) return { personId: null, keys: [] };
  const { data, error } = await db.from("Person_Menu_Visible")
    .select("Menu_Key")
    .eq("Person_ID", personId);
  /* A failed read is NOT an empty grant list.
     Thrown, so the caller answers 500 and the app says it could not
     check — the same discipline /portal/me already follows. Swallowing
     it would turn a database blip into every member of staff being
     locked out of their own screens, which looks exactly like a
     permissions change nobody made. */
  if (error) throw error;
  return {
    personId,
    keys: [...new Set((data || []).map((r) => r.Menu_Key).filter(Boolean))],
  };
}

export async function hasMenu(user, key, db = supabase()) {
  const { keys } = await grantedKeys(user, db);
  return keys.includes(key);
}

/* The refusal an endpoint returns, or null to carry on.

   Returned rather than thrown so a handler reads as a guard clause:

     const no = await denyUnlessMenu(user, "gis-canvas");
     if (no) return no;

   403 and not 401: the caller is known and refused, which is a
   different thing from not being signed in, and the browser's api
   client treats a 401 as a dead session and sends them to the login
   screen. A refused draughtsman being told to sign in again, and then
   refused again, would be a loop with no explanation in it. */
export async function denyUnlessMenu(user, key, db = supabase()) {
  let allowed = false;
  try {
    allowed = await hasMenu(user, key, db);
  } catch (e) {
    return json({
      error: "We could not check what you are allowed to open, so nothing "
        + "has been changed. Please try again in a moment.",
      details: e?.message,
    }, 503);
  }
  if (allowed) return null;
  return json({
    error: "You do not have access to this. Ask the office to grant it in "
      + "People & Roles.",
  }, 403);
}
