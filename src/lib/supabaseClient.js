/* Browser client, for authentication and file upload only.

   Loaded on demand, not at module scope.

   The library is around a hundred kilobytes and takes over a second to
   evaluate on a throttled device — and it was being evaluated before
   anything rendered, because AuthContext imported it and App imports
   AuthContext. So every visit paid for the whole of supabase-js before
   the login form appeared, including the realtime and postgrest clients
   this app never touches: data goes through /api/*, which uses the
   service key server-side.

   Now the shell renders first and the client arrives shortly after. The
   session check happens a moment later than it did, which is why
   AuthProvider still starts in a loading state rather than assuming
   nobody is signed in.

   This uses the ANON key, which is safe to ship — with RLS on and no
   policies, it can't read a single row. */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const authEnabled = Boolean(url && anonKey);

/* One client per page, however many callers ask for it. The promise
   itself is cached rather than the client, so two callers arriving
   together share one import rather than racing to create two. */
let pending = null;

export function getSupabase() {
  if (!authEnabled) return Promise.resolve(null);
  if (!pending) {
    pending = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(url, anonKey, {
        auth: {
          persistSession: true,      // stay signed in on this device
          autoRefreshToken: true,
          detectSessionInUrl: true,  // needed for the password-reset link
        },
      }));
  }
  return pending;
}
