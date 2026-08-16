import { createClient } from "@supabase/supabase-js";

/* Server-side Supabase client.

   Uses the SERVICE ROLE key, which bypasses RLS. This module must never be
   imported from anything under src/ — it exists only inside functions, and
   the key has no VITE_ prefix so Vite cannot bundle it into the browser. */
let client = null;

export function supabase() {
  if (client) return client;

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Set both in .env locally and in Netlify environment variables."
    );
  }

  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/* Who's calling, from the bearer token the browser sends. Verified
   against Supabase rather than trusted.

   Enforced by withAuth below, which every endpoint is wrapped in. This
   is still exported on its own because a handler sometimes wants the
   user for its own reasons — gis-undo keeps history per person — and
   because the wrapper needs it. */
export async function currentUser(req) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return null;
    const { data, error } = await supabase().auth.getUser(token);
    if (error) return null;
    return data?.user ?? null;
  } catch {
    return null;
  }
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function fail(error, status = 500) {
  console.error("[api]", error);

  /* Supabase returns plain objects, not Error instances, so String(error)
     yields "[object Object]" and swallows the actual problem. Pull the
     message out explicitly and pass the diagnostic fields through. */
  let message;
  if (error instanceof Error) {
    message = error.message;
  } else if (error && typeof error === "object") {
    message = error.message || error.details || error.hint || JSON.stringify(error);
  } else {
    message = String(error);
  }

  return json(
    {
      error: message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    },
    status
  );
}


/* ── Every endpoint requires a signed-in caller ──

   Until now none of them did. currentUser existed and was called by one
   function out of forty-five, so anybody who knew a URL could read or
   write the whole database from anywhere. That was survivable while the
   only user was a laptop on a known machine; it stops being survivable
   the moment tablets are in vans.

   ── A wrapper, not a line in each handler ──

   Wrapping is one edit per file and cannot be half-done: a handler
   either goes through this or it does not, and checkauth.mjs fails the
   build if any endpoint is exported without it. A check inside each
   handler would be forty-five chances to forget, and forgetting looks
   exactly like working.

   ── Open endpoints are named, not assumed ──

   Nothing is public by default. Where an endpoint genuinely must answer
   an unauthenticated caller, it says so at its own export — visible in
   that file, and countable across all of them.

   ── The token is verified, not decoded ──

   currentUser asks Supabase whether the token is real. A JWT can be
   read by anyone; only the issuer can say whether it was issued, and
   whether it has since been revoked. */
export function withAuth(handler, { open = false } = {}) {
  if (open) return handler;

  return async function guarded(req, context) {
    const user = await currentUser(req);
    if (!user) {
      /* 401 rather than 403: the caller is not known, rather than known
         and refused. The browser's api client turns this into a message
         and the app sends them to the login screen. */
      return json({ error: "Sign in to use this." }, 401);
    }
    /* Passed on as a third argument, so a handler that wants to know who
       is calling does not have to verify the token a second time. */
    return handler(req, context, user);
  };
}
