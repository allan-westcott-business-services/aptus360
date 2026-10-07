/* How many rows the connections table may build.

   The legacy import took that page from a couple of thousand
   connections to 33,150. Each one is a row of seventeen cells, so
   rendering them all is half a million DOM nodes — Chrome put up
   "Page Unresponsive".

   Two things keep it under control. Groups start collapsed on a large
   table, which costs nothing because a collapsed group renders its
   heading and none of its rows. And this shares one budget across
   whatever is open.

   ── Why it is a module of its own ──

   The failure mode of a budget is a table quietly showing fewer rows
   than it has, which is invisible from the screen — exactly how the
   endpoint's 2,000-row cap survived unnoticed until a project with 238
   connections displayed one of them. That is worth a test rather than
   an eyeball, and a .jsx file cannot be imported by a plain node
   check, so the rule lives here where checkconnectionsrender can
   reach it.

   A collapsed group takes nothing from the budget, so shutting one
   hands its share to the others rather than wasting it. */

export const ROW_CEILING = 1000;
export const TOTAL_ROWS = 2500;

export function planRows(groups, collapsed = {}, opts = {}) {
  const perGroup = opts.perGroup ?? ROW_CEILING;
  const total = opts.total ?? TOTAL_ROWS;
  const plan = new Map();
  let left = total;
  for (const [label, list] of groups) {
    if (label && collapsed[label]) { plan.set(label, 0); continue; }
    const n = Math.max(0, Math.min(list.length, perGroup, left));
    plan.set(label, n);
    left -= n;
  }
  return plan;
}
