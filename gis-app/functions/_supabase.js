import { createClient } from "@supabase/supabase-js";

/* ════════════════════════════════════════════════════════════════════
   The database, as the person calling.

   ── The difference from Aptus360, and the whole point of it ──

   Aptus360's equivalent uses the SERVICE ROLE key on every endpoint.
   That key bypasses row-level security completely, so the database
   never sees who is asking and cannot filter anything: every check
   lives in JavaScript, and one forgotten `.eq("Project_ID", id)`
   returns somebody else's data with nothing underneath to stop it.

   For a single customer that is defensible, and _access.js argues it
   well. For an application sold to several it is not: the missed check
   is no longer a bug, it is one company reading another's drawings.

   So here the default is `asUser(req)` — a client carrying the
   caller's own token. PostgREST then runs the query as that person,
   auth.uid() works, and migration 0001's policies do the filtering.
   A forgotten filter returns fewer rows, not more.

   ── The service key still exists, and is deliberately awkward ──

   `asService()` is here because two or three jobs genuinely need it —
   creating the first Account before anyone is a member of it, and
   anything run by a scheduled task with no signed-in person. It is
   named so that it stands out in a diff, and checkserviceuse.mjs
   fails the build if a request handler imports it without saying why.
   ════════════════════════════════════════════════════════════════════ */

const url = () => process.env.VITE_SUPABASE_URL;

/* The bearer token the browser sent, or null. */
export function tokenFrom(req) {
  const auth = req.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

/* The database as the caller. Every row it returns is one the policies
   in 0001 allow them, and every row it writes is one they may write.

   A new client per request, not a module-level singleton: the token
   differs per caller, and a cached client would serve one person's
   query under another person's rights. That is the kind of bug that
   only appears under load, when two requests overlap. */
export function asUser(req) {
  const token = tokenFrom(req);
  if (!token) return null;

  /* The ANON key, not the service key. The anon key grants nothing on
     its own; the Authorization header is what carries the identity,
     and RLS is what grants the rows. */
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url() || !anon) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. "
      + "Set both in .env locally and in the site's environment variables."
    );
  }

  return createClient(url(), anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/* The database with row-level security bypassed.
   SERVICE KEY — read the header of this file before using it. */
export function asService() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url() || !key) {
    throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(url(), key, { auth: { persistSession: false } });
}

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  });

/* An error the caller can act on, without handing them the database's
   own words. A constraint violation naming a column and a value is a
   map of the schema to somebody probing it. */
export function fail(e, status = 400) {
  const code = e?.code || "";
  if (code === "42501" || /row-level security/i.test(e?.message || "")) {
    /* 404, not 403. A 403 confirms the row exists and belongs to
       somebody else, which is itself worth knowing to an attacker.
       Not found is both truthful from where the caller stands and
       says nothing. */
    return json({ error: "Not found" }, 404);
  }
  if (code === "23505") return json({ error: "That already exists." }, 409);
  if (code === "23503") return json({ error: "That refers to something which does not exist." }, 400);
  console.error("[gis]", code, e?.message);
  return json({ error: "Something went wrong." }, status);
}

/* Every handler is wrapped in this. No token, no database client, no
   work — rather than each handler remembering to check. */
export function withAuth(handler) {
  return async (req, context) => {
    const db = asUser(req);
    if (!db) return json({ error: "Not signed in" }, 401);
    try {
      return await handler(req, context, db);
    } catch (e) {
      return fail(e, 400);
    }
  };
}

/* ── The account a project belongs to ──

   Read, never taken from the request. A body that could name its own
   Account_ID is a body that can file a drawing under somebody else's
   company; the composite foreign keys in 0001 would reject the worst
   of it, but the right answer is not to accept the field at all.

   Returns null when the project is not visible to this caller, which
   RLS has already decided. The handler turns that into a 404. */
export async function accountOfProject(db, projectId) {
  const { data, error } = await db
    .from("Project").select("Account_ID")
    .eq("Project_ID", projectId).maybeSingle();
  if (error) throw error;
  return data?.Account_ID ?? null;
}
