import { createClient } from "@supabase/supabase-js";

/* Browser client, for authentication only.

   This uses the ANON key, which is safe to ship — with RLS on and no
   policies, it can't read a single row. Data still goes through
   /api/*, which uses the service key server-side. All this client does
   is sign people in and hold the session. */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const authEnabled = Boolean(url && anonKey);

export const supabase = authEnabled
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,      // stay signed in on this device
        autoRefreshToken: true,
        detectSessionInUrl: true,  // needed for the password-reset link
      },
    })
  : null;
