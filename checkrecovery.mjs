/* Somebody who clicks "reset my password" gets a password field.

   ── What went wrong ──

   A reset link does not open a signed-out page. Supabase exchanges the
   link for a REAL session and then fires PASSWORD_RECOVERY, so by the
   time anything renders, `session` is set.

   App showed the login screen only when there was no session:

       if (!session) { ... return <LoginPage /> }

   So the person who asked to reset their password was signed straight
   into the application and never saw a password field. The one screen
   the email promised them was the one screen the session prevented.
   Nothing errored. Nothing looked broken. They just never arrived.

   ── Why this is a rendering test and not a grep ──

   Every part of this worked on its own. LoginPage read `type=recovery`
   from the hash and switched to its reset step correctly; it had a
   test, and the test passed. The fault was entirely in whether that
   screen was ever MOUNTED, which only a render can answer.

   So this mounts the real App, with a session and a recovery hash, and
   asks the one question that matters: is there a password field on the
   screen?

   It is written to fail against the old code. Put the session check
   back in front of the recovery check and this goes red.
*/

import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { bad += 1; console.log(`  FAIL ${m}`); };

/* ─── 1. The order, in the source ───

   Cheap, and it names the mistake. The render below is the real test;
   this says which line to look at when it goes red. */
{
  const app = readFileSync("./src/App.jsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

  const recoveryAt = app.search(/if \(recovering\)/);
  const sessionAt = app.search(/if \(!session\)/);

  if (recoveryAt < 0) {
    fail("App never checks `recovering`, so a reset link lands in the "
      + "application with no password field anywhere");
  } else if (sessionAt >= 0 && recoveryAt > sessionAt) {
    fail("App checks the session before the recovery, and a reset link "
      + "arrives WITH a session — so the reset screen is unreachable");
  }

  const ctx = readFileSync("./src/lib/AuthContext.jsx", "utf8");
  if (!/PASSWORD_RECOVERY/.test(ctx)) {
    fail("nothing listens for PASSWORD_RECOVERY, so a recovery that "
      + "arrives after the client has loaded is missed");
  }
  if (!/type=recovery/.test(ctx)) {
    fail("nothing reads type=recovery from the hash, so a recovery is "
      + "missed on the first paint, before the client arrives");
  }
  /* Both, deliberately: the hash is there at first paint and the event
     arrives later. Either alone leaves a gap. */

  if (!/endRecovery/.test(ctx)) {
    fail("there is no way to end a recovery, so the reset screen never "
      + "lets go");
  }
  const login = readFileSync("./src/features/auth/LoginPage.jsx", "utf8");
  if (!/endRecovery/.test(login)) {
    fail("the screen that sets the new password never ends the recovery, "
      + "so it reopens on every refresh");
  }
}

/* ─── 2. The render: a session, a recovery hash, a password field ─── */
{
  const { build } = await import("esbuild");
  const { JSDOM } = await import("jsdom");

  const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>",
    { url: "http://localhost/#access_token=x&type=recovery", pretendToBeVisual: true });
  for (const k of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement",
    "HTMLSelectElement", "Element", "Node", "Event", "MouseEvent", "SVGElement",
    "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame",
    "localStorage", "sessionStorage"]) {
    if (globalThis[k] === undefined) globalThis[k] = dom.window[k];
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const React = (await import("react")).default;
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const shared = {
    react: React,
    "react/jsx-runtime": await import("react/jsx-runtime"),
    "react-dom": await import("react-dom"),
    "react-dom/client": await import("react-dom/client"),
  };

  /* A stand-in for Supabase holding exactly the state a reset link
     leaves behind: a valid session, and a PASSWORD_RECOVERY event. */
  const session = { user: { id: "u1", email: "someone@aptusutilities.co.uk" } };
  const fakeClient = `
    const session = ${JSON.stringify(session)};
    export const authEnabled = true;
    export const getSupabase = () => Promise.resolve({
      auth: {
        getSession: () => Promise.resolve({ data: { session } }),
        onAuthStateChange: (cb) => {
          setTimeout(() => cb("PASSWORD_RECOVERY", session), 0);
          return { data: { subscription: { unsubscribe() {} } } };
        },
        updateUser: () => Promise.resolve({ error: null }),
        signInWithPassword: () => Promise.resolve({ error: null }),
        resetPasswordForEmail: () => Promise.resolve({ error: null }),
        signOut: () => Promise.resolve({}),
      },
    });
  `;

  let App;
  try {
    const bundle = await build({
      entryPoints: ["src/App.jsx"], bundle: true, write: false, format: "cjs",
      jsx: "automatic", platform: "browser", logLevel: "silent",
      external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
      define: {
        "import.meta.env": JSON.stringify({
          VITE_USE_MOCKS: "true", MODE: "test", DEV: false,
        }),
      },
      plugins: [{
        name: "fake-supabase",
        setup(b) {
          b.onResolve({ filter: /supabaseClient\.js$/ },
            () => ({ path: "fake-supabase", namespace: "fake" }));
          b.onLoad({ filter: /.*/, namespace: "fake" },
            () => ({ contents: fakeClient, loader: "js" }));
        },
      }],
    });
    const mod = { exports: {} };
    new Function("require", "module", "exports", "globalThis",
      bundle.outputFiles[0].text)(
      (id) => (shared[id]?.createElement ? shared[id] : shared[id]), mod, mod.exports,
      globalThis);
    App = mod.exports.default;
  } catch (e) {
    fail(`App would not build for the test: ${String(e).slice(0, 160)}`);
  }

  if (App) {
    const root = createRoot(document.getElementById("root"));
    await act(async () => { root.render(React.createElement(App)); });
    await act(async () => { await new Promise((r) => setTimeout(r, 500)); });

    const text = document.body.textContent || "";
    const passwords = [...document.querySelectorAll("input[type=password]")];

    if (!passwords.length) {
      fail("a reset link with a live session shows NO password field — "
        + `the screen reads: "${text.trim().slice(0, 90)}"`);
    }
    /* Two of them: the new password and its confirmation. One would
       mean the sign-in form, which also has a password box — and
       landing on the sign-in form is its own kind of wrong here. */
    if (passwords.length === 1) {
      fail("only one password field, which is the sign-in form rather "
        + "than the set-a-new-password form");
    }
    root.unmount();
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "A reset link reaches the password form, even though it arrives "
    + "with a live session.");
process.exit(bad ? 1 : 0);
