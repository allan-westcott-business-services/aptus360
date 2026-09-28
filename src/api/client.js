/* Thin fetch wrapper for the API layer.

   Every call goes to /api/*, which Netlify routes to netlify/functions/*.
   The browser never talks to Supabase directly — that is what lets RLS stay
   on and the service-role key stay server-side. */

/* Sample data unless something explicitly says otherwise. Defaulting the
   other way meant an unconfigured deploy failed with a confusing error
   instead of just working. */
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== "false";

/* What the user sees when the session has gone. One sentence, and it
   names the thing to do — a message that only says what is wrong is
   half a message. */
export const SESSION_GONE = "Your session has expired — sign in again.";

/* ── The signed-in user's token, and what to do when there isn't one ──

   The token travels with every request so functions can tell who's
   calling. Imported lazily to keep this module usable when auth isn't
   configured at all.

   This used to answer a missing session with `{}` — no Authorization
   header — and the request went out unsigned. Every endpoint is behind
   withAuth, so the server refused it, correctly, with "Sign in to use
   this." — and that landed on whatever the person happened to be doing.
   A text note that would not save. A levels check that would not run.
   The failure looked like a fault in the feature rather than in the
   session, and it cost most of a morning to find, because a dead
   session can look like anything except a dead session.

   So a missing token is now answered here, once, before anything is
   sent. Three states, not two:

     auth is off        no token wanted, send as before. This is the
                        unconfigured case, not the signed-out one.
     token in hand      send it.
     auth on, no token  the session has gone. Say so and send nothing. */
async function authToken() {
  try {
    const { getSupabase, authEnabled } = await import("../lib/supabaseClient.js");
    if (!authEnabled) return { required: false, token: null };
    const supabase = await getSupabase();
    if (!supabase) return { required: false, token: null };
    const { data } = await supabase.auth.getSession();
    return { required: true, token: data?.session?.access_token ?? null };
  } catch {
    /* The auth client would not load or would not answer. Treated as a
       session that has gone rather than as auth being off: guessing the
       other way is what sent unsigned requests in the first place. */
    return { required: true, token: null };
  }
}

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/* Announced rather than acted on directly: this module knows nothing
   about routing or React, and AuthContext owns the session. */
function announceSignedOut() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("aptus:signed-out"));
  }
}

async function request(path, { method = "GET", body, signal } = {}) {
  const auth = await authToken();
  /* Nothing is sent without a token where one is required. The refusal
     would be identical and it would arrive wearing the costume of
     whatever asked for it. */
  if (auth.required && !auth.token) {
    announceSignedOut();
    throw new ApiError(SESSION_GONE, 401, null);
  }

  const res = await fetch(`/api${path}`, {
    method,
    signal,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError(`Expected JSON, got: ${text.slice(0, 120)}`, res.status, text);
    }
  }

  if (!res.ok) {
    /* A refused request ends the session rather than surfacing as an
       error on whatever screen asked.

       Every endpoint now requires a signed-in caller, so a 401 means the
       session has gone — expired, revoked, or signed out in another tab.
       Left as an ordinary failure it would read as "Sign in to use
       this." on a screen the person is already looking at, with no way
       to act on it, and every subsequent request would say the same.

       Announced rather than acted on directly: this module knows nothing
       about routing or React, and AuthContext is what owns the session.
       It listens for this and clears it. */
    if (res.status === 401) {
      announceSignedOut();
      /* The server's own words here are "Sign in to use this.", which
         is true and unhelpful on a screen somebody is already looking
         at. Said the same way as the case above, so a session that
         dies before the request and one that dies at the server read
         identically to whoever is looking. */
      throw new ApiError(SESSION_GONE, 401, data);
    }
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data);
  }
  return data;
}

export const http = {
  get: (p, o) => request(p, { ...o, method: "GET" }),
  post: (p, body, o) => request(p, { ...o, method: "POST", body }),
  patch: (p, body, o) => request(p, { ...o, method: "PATCH", body }),
  put: (p, body, o) => request(p, { ...o, method: "PUT", body }),
  /* A body, optionally. Every other verb here takes one in the second
     argument and this did not, so `del(path, { submissionId })` read
     the body as options and sent nothing — an endpoint asking "which
     one?" and a caller that thought it had said. Kept optional, so the
     existing callers passing options still work. */
  del: (p, body, o) => (body && typeof body === "object" && !("headers" in body)
    ? request(p, { ...o, method: "DELETE", body })
    : request(p, { ...body, method: "DELETE" })),
};

export { ApiError };
