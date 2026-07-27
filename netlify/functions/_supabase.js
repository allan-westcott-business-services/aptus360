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
   against Supabase rather than trusted, but not yet enforced — every
   endpoint still works without it so nothing breaks mid-rollout. Turn
   it into a hard requirement once everyone has an account. */
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
