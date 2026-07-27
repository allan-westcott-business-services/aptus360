/* Thin fetch wrapper for the API layer.

   Every call goes to /api/*, which Netlify routes to netlify/functions/*.
   The browser never talks to Supabase directly — that is what lets RLS stay
   on and the service-role key stay server-side. */

/* Sample data unless something explicitly says otherwise. Defaulting the
   other way meant an unconfigured deploy failed with a confusing error
   instead of just working. */
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== "false";

/* The signed-in user's token travels with every request so functions can
   tell who's calling. Imported lazily to keep this module usable when
   auth isn't configured. */
async function authHeader() {
  try {
    const { supabase } = await import("../lib/supabaseClient.js");
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
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

async function request(path, { method = "GET", body, signal } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    signal,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(await authHeader()),
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
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data);
  }
  return data;
}

export const http = {
  get: (p, o) => request(p, { ...o, method: "GET" }),
  post: (p, body, o) => request(p, { ...o, method: "POST", body }),
  patch: (p, body, o) => request(p, { ...o, method: "PATCH", body }),
  put: (p, body, o) => request(p, { ...o, method: "PUT", body }),
  del: (p, o) => request(p, { ...o, method: "DELETE" }),
};

export { ApiError };
