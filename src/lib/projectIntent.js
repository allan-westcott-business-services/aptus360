import { remember } from "./session.js";

/* Opening a project, on a particular tab, from somewhere else in the
   app.

   The third of these — gisIntent for the canvas, callOffIntent for a
   call-off, this one for a project. Still three channels rather than
   one "navigate anywhere" mechanism, for the reason callOffIntent
   gives: a general one carries an arbitrary payload to an arbitrary
   page and nothing says what any page expects.

   ── Why it writes to the session ──

   ProjectsPage decides what to show from `recall("project")` when it
   mounts, and it is not mounted while somebody is looking at the
   call-offs list. So the destination is left where that page already
   looks, and the shell is told to switch — which mounts it, and it
   finds the project waiting.

   That is not a trick played on ProjectsPage; it is the same key that
   page writes itself to survive a reload. The one difference is who set
   it, and the page cannot tell the difference because there is none. */

const listeners = new Set();

/* Ask for a project.

     project — the row, as the projects list holds it
     tab     — which tab to land on, e.g. "calloffs"

   Written before anyone is told, so a listener that switches the view
   synchronously finds it there. */
export function openProject(project, tab = "details") {
  if (!project) return;
  remember("project", { project, tab });
  listeners.forEach((fn) => {
    try { fn({ project, tab }); } catch { /* one bad listener must not stop the rest */ }
  });
}

export function onOpenProject(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
