/* Every endpoint requires a signed-in caller.

   Until this, none of them did. currentUser existed and was called by
   one function out of forty-five, so anyone who knew a URL could read or
   write the whole database from anywhere — no password, no account, from
   any machine.

   That was survivable while the only user was a laptop on a known
   machine. It stops being survivable the moment tablets are in vans: a
   device gets lost, an operative leaves, a link gets forwarded.

   ── Why this file matters more than the change it checks ──

   Adding the guard was a morning's work. Keeping it is the hard part:
   the next endpoint somebody writes will be copied from an existing one,
   and if they copy a handler without its wrapper nothing will look
   wrong. It will work. It will work for everyone, including people
   without an account.

   So this fails the build rather than trusting anybody to remember. */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const DIR = "./netlify/functions";
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".js"))
  /* Files beginning with an underscore are shared modules, not
     endpoints — Netlify does not route to them. */
  .filter((f) => !f.startsWith("_"));

const shared = readFileSync(join(DIR, "_supabase.js"), "utf8");

// 1. The guard exists and does what its name says.
{
  if (!/export function withAuth/.test(shared)) {
    fail("there is no withAuth wrapper");
  }
  /* Verified against Supabase, not decoded. Anyone can read a JWT; only
     the issuer can say whether it was issued and whether it has since
     been revoked. */
  if (!/await currentUser\(req\)/.test(shared)) {
    fail("withAuth does not verify the caller's token");
  }
  if (!/401/.test(shared)) fail("withAuth does not refuse an unknown caller");
  /* And it refuses by returning, rather than by throwing into a catch
     that some handler might swallow. */
  const fn = shared.slice(shared.indexOf("export function withAuth"));
  if (!/return json\(\{ error[^}]*\}, 401\)/.test(fn)) {
    fail("withAuth does not return a 401 response");
  }
}

// 2. Every endpoint goes through it.
//
//    The whole point: a handler either goes through the wrapper or it
//    does not, and this is what makes the difference visible.
{
  const open = [];
  for (const f of files) {
    const src = readFileSync(join(DIR, f), "utf8");

    if (!/export default/.test(src)) {
      /* No default export is not an endpoint — but say so rather than
         passing it silently, because a file that exports nothing is
         usually a mistake. */
      fail(`${f} has no default export`);
      continue;
    }

    if (/export default withAuth\(/.test(src)) {
      /* Explicitly open endpoints are allowed, and counted. */
      if (/withAuth\([\s\S]{0,4000}?\{\s*open:\s*true\s*\}/.test(src)) open.push(f);
      continue;
    }

    fail(`${f} is reachable without signing in`);
  }

  /* Nothing is open today. If that changes, it should be a decision
     somebody made rather than one that crept in — so the count is
     printed rather than silently allowed. */
  if (open.length) {
    console.log(`  note: ${open.length} endpoint(s) deliberately open: ${open.join(", ")}`);
  }
}

// 3. Nothing reaches the database outside the guard.
//
//    withAuth is the only thing between the internet and a client
//    holding the service-role key, which bypasses RLS entirely. A file
//    that imports supabase() but exports its handler raw would be that
//    key, unguarded.
{
  for (const f of files) {
    const src = readFileSync(join(DIR, f), "utf8");
    if (!/supabase\(\)/.test(src)) continue;
    if (!/export default withAuth\(/.test(src)) {
      fail(`${f} uses the service-role key without requiring a caller`);
    }
  }
}

// 4. The browser sends the token.
//
//    The guard is only half of it. If the client stopped attaching the
//    session, every request would start failing — so the two are checked
//    together rather than assumed to stay in step.
{
  const client = readFileSync("./src/api/client.js", "utf8");
  if (!/Authorization: `Bearer \$\{token\}`/.test(client)) {
    fail("the browser no longer sends the session token");
  }
  if (!/auth\.getSession\(\)/.test(client)) {
    fail("the browser does not read a session to send");
  }
  /* And a refused request has to be distinguishable, or the app cannot
     send somebody to the login screen. */
  if (!/this\.status = status/.test(client)) {
    fail("the api client discards the response status, so a 401 cannot be acted on");
  }
}

// 5. A refusal ends the session rather than surfacing as an error.
//
//    Now that every endpoint requires a caller, a lost session means
//    every panel on the page fails at once with "Sign in to use this."
//    on a screen the person is already looking at, and no way to act on
//    it. The client announces a 401 and the auth context clears.
{
  const client = readFileSync("./src/api/client.js", "utf8");
  const ctx = readFileSync("./src/lib/AuthContext.jsx", "utf8");

  if (!/res\.status === 401/.test(client)) {
    fail("the api client does not notice a refusal");
  }
  if (!/aptus:signed-out/.test(client)) {
    fail("the api client does not announce a refusal");
  }
  if (!/addEventListener\("aptus:signed-out"/.test(ctx)) {
    fail("nothing listens for a refusal, so the session is never cleared");
  }
  /* Cleared rather than signed out: signOut calls Supabase to end a
     session the server has already refused, and fails on the way. */
  /* Comments stripped first: the handler explains why it does not call
     signOut, and matching the explanation made this fail on correct
     code. */
  const code = ctx
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const handler = code.slice(code.indexOf("const onRefused"),
    code.indexOf("addEventListener(\"aptus:signed-out\""));
  if (!/setSession\(null\)/.test(handler)) {
    fail("a refusal does not clear the session");
  }
  if (/signOut\(/.test(handler)) {
    fail("a refusal calls signOut, which asks a server that has already refused");
  }
  /* And it is removed again, or every mount leaves a listener behind. */
  if (!/removeEventListener\("aptus:signed-out"/.test(ctx)) {
    fail("the refusal listener is never removed");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : `Every endpoint requires a caller (${files.length} checked).`);
process.exit(bad ? 1 : 0);
