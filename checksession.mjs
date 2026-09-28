/* A dead session says so, once, before anything else fails.

   ── What went wrong ──

   Every endpoint sits behind withAuth. The browser's api client read
   the session, and when it could not get a token it returned `{}` — no
   Authorization header — and sent the request anyway. The server
   refused it, correctly, with "Sign in to use this."

   That refusal then arrived attached to whatever the person happened to
   be doing. A text note that would not save. An undo journal that
   silently stopped recording. The reported fault was "I can't place a
   text note", and a morning went into the note, the table, its
   triggers, its constraints and its row-level security before the
   response body on one failed request said `Sign in to use this.`

   Three rules come out of that, and this checks all three.

     1. Where auth is configured and there is no token, nothing is sent.
        The request is refused here, with a message that names the thing
        to do, and the signed-out event is announced so AuthContext can
        clear the session.

     2. Where auth is NOT configured at all, the request goes as it
        always did. That is the unconfigured deployment, not a signed-out
        person, and conflating the two would break it entirely.

     3. A 401 from the server reads the same as a 401 raised here.
        Whether the session died a moment before the request or a moment
        after is not a distinction anybody can act on.

   The module is re-implemented rather than imported: client.js imports
   supabaseClient.js, which reads import.meta.env and pulls in
   supabase-js. The source is read as well, so an implementation that
   drifts from the model is caught. */

import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const SRC = "src/api/client.js";
const src = readFileSync(SRC, "utf8");

const SESSION_GONE = "Your session has expired — sign in again.";

/* ── The model: request(), as client.js now has it ── */
function makeClient({ authEnabled, token, authThrows = false, server }) {
  const events = [];
  const sent = [];

  const authToken = async () => {
    try {
      if (authThrows) throw new Error("module would not load");
      if (!authEnabled) return { required: false, token: null };
      return { required: true, token: token ?? null };
    } catch {
      return { required: true, token: null };
    }
  };

  const request = async (path) => {
    const auth = await authToken();
    if (auth.required && !auth.token) {
      events.push("signed-out");
      const e = new Error(SESSION_GONE); e.status = 401; throw e;
    }
    sent.push({ path, authorization: auth.token ? `Bearer ${auth.token}` : undefined });
    const res = server(path, auth.token);
    if (res.status === 401) {
      events.push("signed-out");
      const e = new Error(SESSION_GONE); e.status = 401; throw e;
    }
    if (res.status >= 400) {
      const e = new Error(res.body?.error || `Request failed (${res.status})`);
      e.status = res.status; throw e;
    }
    return res.body;
  };

  return { request, events, sent };
}

/* A server that behaves like withAuth: anything unsigned is refused. */
const withAuthServer = (path, token) => (token
  ? { status: 200, body: { ok: true, path } }
  : { status: 401, body: { error: "Sign in to use this." } });

// ─── 1. No token, auth on: nothing is sent, and it says why ───
{
  const c = makeClient({ authEnabled: true, token: null, server: withAuthServer });
  let err = null;
  await c.request("/projects/34/gis").catch((e) => { err = e; });

  if (!err) fail("a request with no session went through");
  else {
    if (err.status !== 401) fail(`a dead session failed with ${err.status}, expected 401`);
    if (err.message !== SESSION_GONE) {
      fail(`a dead session said "${err.message}" rather than naming what to do`);
    }
    /* "Sign in to use this." is the server's phrasing, and it is what
       the person saw attached to a text note. It must not be what the
       client reports. */
    if (/Sign in to use this/.test(err.message)) {
      fail("the client still reports the server's wording for a dead session");
    }
  }
  if (c.sent.length) fail(`${c.sent.length} unsigned request(s) were sent anyway`);
  if (!c.events.includes("signed-out")) fail("nothing announced the signed-out session");
}

// ─── 2. Auth off entirely: unchanged behaviour ───
{
  /* Everything answers, because there is no auth in this deployment. */
  const c = makeClient({
    authEnabled: false, token: null,
    server: (path) => ({ status: 200, body: { ok: true, path } }),
  });
  const out = await c.request("/projects/34/gis").catch((e) => e);
  if (out instanceof Error) fail(`an unconfigured deployment was refused: ${out.message}`);
  if (c.sent.length !== 1) fail("the request was not sent where auth is off");
  if (c.sent[0]?.authorization) fail("a token was sent where there is no auth");
  if (c.events.length) fail("an unconfigured deployment was told it had been signed out");
}

// ─── 3. A token in hand: sent, and signed ───
{
  const c = makeClient({ authEnabled: true, token: "abc.def", server: withAuthServer });
  const out = await c.request("/projects/34/gis").catch((e) => e);
  if (out instanceof Error) fail(`a signed request failed: ${out.message}`);
  if (c.sent[0]?.authorization !== "Bearer abc.def") {
    fail(`the token was sent as "${c.sent[0]?.authorization}"`);
  }
  if (c.events.length) fail("a good session was announced as signed out");
}

// ─── 4. The auth client itself failing is a dead session, not "no auth" ───
{
  const c = makeClient({ authEnabled: true, token: "abc", authThrows: true, server: withAuthServer });
  let err = null;
  await c.request("/projects/34/gis").catch((e) => { err = e; });
  if (!err) fail("a broken auth client let an unsigned request through");
  if (c.sent.length) fail("a broken auth client sent the request unsigned");
  if (err && err.message !== SESSION_GONE) fail("a broken auth client did not report a dead session");
}

// ─── 5. A 401 from the server reads the same as one raised here ───
{
  /* The token is present but the server rejects it — expired between
     being read and being used, or revoked elsewhere. */
  const c = makeClient({
    authEnabled: true, token: "stale",
    server: () => ({ status: 401, body: { error: "Sign in to use this." } }),
  });
  let err = null;
  await c.request("/projects/34/gis").catch((e) => { err = e; });
  if (!err) fail("a server 401 was not raised to the caller");
  else if (err.message !== SESSION_GONE) {
    fail(`a server 401 said "${err.message}", not the same thing a local one says`);
  }
  if (!c.events.includes("signed-out")) fail("a server 401 did not announce the signed-out session");
}

// ─── 6. Other failures are untouched ───
{
  const c = makeClient({
    authEnabled: true, token: "ok",
    server: () => ({ status: 400, body: { error: "Nothing to save on that feature." } }),
  });
  let err = null;
  await c.request("/projects/34/gis?id=1").catch((e) => { err = e; });
  if (err?.status !== 400) fail("an ordinary failure changed status");
  if (err?.message !== "Nothing to save on that feature.") {
    fail(`an ordinary failure was rewritten as "${err?.message}"`);
  }
  if (c.events.length) fail("an ordinary 400 announced a signed-out session");
}

// ─── 7. The source says the same as the model ───
{
  const bit = (re, what) => { if (!re.test(src)) fail(what); };
  bit(/export const SESSION_GONE\s*=/, "there is no single wording for a dead session");
  bit(/authEnabled/, "client.js no longer distinguishes auth being off from having no token");
  bit(/if \(auth\.required && !auth\.token\)/,
    "the client no longer refuses to send a request it has no token for");
  /* Auth being off has to short-circuit before a token is looked for,
     or an unconfigured deployment is told it has been signed out and
     can do nothing at all. */
  bit(/if \(!authEnabled\) return \{ required: false/,
    "an unconfigured deployment is no longer let through");
  /* And the server's own 401 has to be reported the same way, or the
     wording depends on whether the session died just before the
     request or just after \u2014 a distinction nobody can act on. */
  bit(/res\.status === 401\)[\s\S]{0,600}?throw new ApiError\(SESSION_GONE, 401/,
    "a 401 from the server is still reported in the server's wording");
  /* The old shape: a catch that answered a missing session with no
     header and let the request go. */
  if (/return \{\};\s*\n\s*\}\s*\n\s*\}\s*\n\s*class ApiError/.test(src)) {
    fail("the old authHeader is still there, answering a dead session with no header");
  }
  if (/\.\.\.\(await authHeader\(\)\)/.test(src)) {
    fail("requests still spread an unsigned header set");
  }
}

// ─── 8. The GIS message stops guessing at causes ───
{
  const gis = readFileSync("netlify/functions/gis.js", "utf8");
  /* The thrown string, not the file. The comment above it records what
     the message used to say and why it changed, so searching the whole
     file for the old wording finds the history rather than the fault —
     the same trap the Split Circuit removal set. */
  const thrown = [...gis.matchAll(/throw new Error\(([\s\S]*?)\);/g)]
    .map((m) => m[1])
    .filter((t) => /is not on this drawing/.test(t));
  if (thrown.length !== 1) {
    fail(`${thrown.length} not-found messages, expected 1`);
  } else {
    const msg = thrown[0];
    if (/may have been|might have|possibly|perhaps/.test(msg)) {
      fail("the not-found message still speculates about a cause that was never diagnosed");
    }
    if (!/nothing was/.test(msg)) fail("the not-found message does not say nothing was saved");
    if (!/[Rr]eload/.test(msg)) fail("the not-found message does not say what to do next");
  }
}

// ─── 9. The undo journal's failure is no longer silent ───
{
  const page = readFileSync("src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = page.indexOf("const recordAction = useCallback(");
  const body = at < 0 ? "" : page.slice(at, page.indexOf("}, [projectId]);", at));
  if (!body) fail("recordAction is no longer a function I can read");
  else {
    if (/catch \{/.test(body)) {
      fail("recordAction still catches without looking at what went wrong");
    }
    if (!/historyWarned/.test(body)) {
      fail("a failing undo journal says nothing to the person relying on it");
    }
    /* Still swallowed, though. The work has already succeeded and a
       journal that is down must not undo it. */
    if (/throw\b/.test(body)) {
      fail("recordAction now fails the action when the journal is down");
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "A dead session is reported as one, once, before anything else fails.");
process.exit(bad ? 1 : 0);
