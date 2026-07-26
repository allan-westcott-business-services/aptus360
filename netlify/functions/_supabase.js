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

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function fail(error, status = 500) {
  console.error("[api]", error);
  return json({ error: error instanceof Error ? error.message : String(error) }, status);
}
