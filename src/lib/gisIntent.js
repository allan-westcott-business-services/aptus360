/* Opening the GIS canvas from somewhere else in the app, with something
   already selected.

   The shell decides which page is showing and the canvas holds its own
   project, and the outline design tab is three components below the
   shell with neither in scope. Threading a callback down through
   ProjectsPage and ProjectDetail would put GIS navigation into two
   components that have nothing to do with it, and every future caller
   would have to be threaded the same way.

   So: one small channel with one purpose. A caller says where it wants
   to go, the shell hears it and switches, and the canvas picks up the
   payload when it mounts.

   Consumed once. An intent left lying around would fire again the next
   time someone opened the canvas from the sidebar, isolating a utility
   they had not asked for and giving no clue why. */

let pending = null;
const listeners = new Set();

/* Ask for the GIS canvas.

     projectId — which project to open
     utilityId — optional; the canvas shows only this utility's layer

   The payload is set before anyone is told, so a listener that switches
   the view synchronously still finds it waiting. */
export function openGis(intent) {
  pending = intent || null;
  listeners.forEach((fn) => {
    try { fn(pending); } catch { /* one bad listener must not stop the rest */ }
  });
}

/* Take the intent, if there is one, and clear it. */
export function takeGisIntent() {
  const out = pending;
  pending = null;
  return out;
}

export function onOpenGis(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
