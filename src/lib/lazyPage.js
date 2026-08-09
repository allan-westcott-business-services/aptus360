import { lazy } from "react";

/* Lazy pages that survive a deploy.

   ── The failure ──

   Vite names every chunk with a hash of its contents, and Netlify
   removes the previous build's files. So a tab left open across a deploy
   is holding an index that points at chunks which no longer exist: the
   first click on a lazy page asks for `HumanResourcesPage-BSeqkqPX.js`,
   gets a 404, and React reports

       Failed to fetch dynamically imported module

   Nothing is wrong with the page. The tab is simply older than the site,
   and the fix has always been a hard refresh — which is not something a
   user should have to know.

   ── The recovery ──

   A failed chunk fetch reloads the page once, which pulls a fresh index
   naming chunks that do exist, and lands back on the same screen because
   the view is in session storage.

   Once, and only for this kind of error. A reload loop is worse than the
   error it replaces: if the second attempt also fails the fault is not
   staleness — the network is down, or the file really is missing — and
   the error boundary should say so rather than the tab thrashing. The
   flag that enforces that is cleared on any successful load, so a later
   deploy gets its own single retry. */

const isStaleChunk = (err) => {
  const m = String(err?.message ?? err);
  return /dynamically imported module|Importing a module script failed/i.test(m)
    || /Failed to fetch/i.test(m);
};

/* Storage is unavailable in private windows and locked-down browsers,
   and throws on access. Failing to remember beats failing to render. */
const flagRead = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const flagWrite = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* fine */ } };
const flagClear = (k) => { try { sessionStorage.removeItem(k); } catch { /* fine */ } };

export function lazyPage(name, factory) {
  const flag = `aptus.chunkretry.${name}`;
  return lazy(() => factory()
    .then((mod) => {
      /* Loaded, so any earlier staleness is behind us and the next
         deploy is entitled to its own retry. */
      flagClear(flag);
      return mod;
    })
    .catch((err) => {
      if (!isStaleChunk(err) || flagRead(flag)) throw err;
      flagWrite(flag, "1");
      window.location.reload();
      /* Never settles. The page is on its way out, and resolving with
         anything here would flash a screen that is about to be
         replaced. */
      return new Promise(() => {});
    }));
}
