/* Coming back to the tab does not throw the page away.

   Supabase fires TOKEN_REFRESHED whenever a tab regains focus. Two
   things then happened, and together they unmounted the whole
   application every time somebody looked at another tab:

     1. `onAuthStateChange` set a NEW session object each time, so
        everything watching `session` ran again;
     2. App returned a Loading screen while it re-asked who the account
        is — and that return unmounts the entire tree, so the page
        somebody was on was destroyed and rebuilt empty.

   What the user saw was the app refreshing whenever they looked away,
   losing whatever they had on screen. It is the kind of fault that
   gets lived with rather than reported, and it is two lines.

   Read statically: the trigger is a browser tab and a token, and
   standing that up here would be testing a mock of Supabase. The
   SHAPE, though, is exactly what regresses — somebody adds a spinner
   for a re-check and the page starts blanking again. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const auth = readFileSync("./src/lib/AuthContext.jsx", "utf8");
const app = readFileSync("./src/App.jsx", "utf8");

// 1. A refreshed token keeps the session object it had.
{
  const at = auth.indexOf("onAuthStateChange");
  const block = at >= 0 ? auth.slice(at, at + 700) : "";
  if (!block) {
    fail("the auth subscription cannot be found where it was");
  } else {
    if (/onAuthStateChange\(\([^)]*\) => setSession\(s\)\)/.test(block)) {
      fail("every auth event replaces the session object, so returning to "
        + "the tab re-runs everything that watches it");
    }
    if (!/prev\.user\.id === s\.user\.id/.test(block)) {
      fail("the session is replaced without checking it is the same user, "
        + "so a token refresh reads as a new sign-in");
    }
    if (!/return same \? prev : s/.test(block)) {
      fail("the previous session object is not kept when the user has not "
        + "changed");
    }
  }
}

// 2. The application is not blanked while a re-check runs.
{
  if (/if \(asking \|\| !who\)/.test(app)) {
    fail("the whole tree is unmounted while the routing check re-runs, "
      + "which happens on every token refresh \u2014 the page somebody is on "
      + "is destroyed and rebuilt empty");
  }
  if (!/if \(!who\) return/.test(app)) {
    fail("nothing waits for the routing answer at all, so the app renders "
      + "before it knows which application to render");
  }
  /* And no unread flag left behind to be wired back in. A state nobody
     reads is a state somebody eventually puts in a render. */
  if (/const \[asking, setAsking\]/.test(app)) {
    fail("the asking flag is still declared, and an unread flag is one "
      + "somebody will put back into the render");
  }
}

// 3. The routing check runs on the session, not on every render.
{
  const at = app.indexOf('http.get("/portal/me")');
  /* Far enough to reach the dependency list past the comments between:
     a slice that stops short reports a fault that is not there, which
     is worse than no check. */
  const tail = at >= 0 ? app.slice(at, at + 1600) : "";
  if (!/\[session, authEnabled, field\]/.test(tail)) {
    fail("the routing check's dependencies have changed \u2014 anything that "
      + "changes per render here asks the server on every render");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Returning to the tab keeps the page that was on it.");
process.exit(bad ? 1 : 0);
