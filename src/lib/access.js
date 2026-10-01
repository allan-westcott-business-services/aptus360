/* What a signed-in person is allowed to open.

   ── Where this comes from ──

   People & Roles has had a Menu Access tab for a long time: a tick per
   screen per person, written to `Person_Menu_Visible` as a row holding
   a `Person_ID` and a `Menu_Key`, and the key is the view key out of
   navigation.js. The ticks saved. Nothing read them. The sidebar went
   on rendering every screen in the area, the landing page went on
   offering every square, and the shell went on rendering any view key
   it was handed — so the panel recorded a decision the app ignored,
   which is worse than not having the panel, because somebody had
   reasonably concluded the GIS Canvas was restricted.

   This is the rule those ticks mean. The questions are asked here, in
   one place, because they are one question asked from four directions —
   which squares to show, which menu items, whether the view we are
   about to render is allowed, and where to go when it is not — and four
   separate answers drift until a screen is hidden from the menu but
   still opens.

   ── Nothing granted means nothing visible ──

   No ticks, no access. The other way round — "no ticks means
   unrestricted" — is kinder on the day it is switched on and wrong ever
   after: a new starter would be given the whole business by default,
   and the one person nobody remembered to tick is the one who can see
   everything. So the rule is the strict one, and the awkwardness is
   handled where it belongs, in the migration that grants what people
   already have before this starts refusing.

   ── The landing page is always allowed ──

   Somewhere to stand. A person whose grants have all been revoked gets
   a page that says so, rather than a blank screen that reads as a
   broken sign-in.

   ── Unbuilt screens stay visible ──

   Menu Access only offers screens that exist, so a placeholder can
   never be ticked — which under a strict rule would mean no one could
   ever see one again, quietly removing the progress board the sidebar
   doubles as. There is nothing behind a placeholder to protect, so
   placeholders show inside an area somebody is already allowed into.
   An area nobody has a grant in stays hidden entirely, placeholders and
   all: a sidebar of nothing but coming-soon items is not access, it is
   a puzzle.

   ── Not the security boundary ──

   None of this is. It decides what is on screen, and anything on screen
   is a convenience. The boundary is server-side, in _access.js, where
   the endpoints that draw check the same grant — because a hidden menu
   item is still a reachable URL, and the drawings are the valuable
   part. */

import { AREAS, HOME_VIEW, findArea } from "./navigation.js";

/* The grants as a set, from whatever the endpoint answered with.

   Null and undefined are NOT the same as empty here, and the caller has
   to keep them apart: null is "not asked yet", which is a reason to
   render nothing, and empty is "asked, and the answer is none", which
   is a reason to say so. This function is only ever given an answer. */
export const grantSet = (keys = []) => new Set([].concat(keys ?? []).map(String));

/* Is this view allowed?

   Three ways to be: the landing page, a granted screen, or a
   placeholder in an area the person is already in. */
export function isGranted(keys, view) {
  if (view === HOME_VIEW) return true;
  /* A screen this build does not have is not a way into anything, even
     holding a row that names it. Rows outlive their screens — a view
     renamed in navigation.js leaves the old key behind in
     Person_Menu_Visible — and the alternative is that one of those
     stale rows silently becomes a grant again the day somebody reuses
     the name for something else. Checked BEFORE the grant is looked up,
     so the order cannot be reversed by accident. */
  const area = findArea(view);
  if (!area) return false;
  const item = area.items.find((i) => i.view === view);
  if (!item) return false;

  if (item.built) return grantSet(keys).has(String(view));
  /* A placeholder, which holds nothing — allowed as far as the area it
     belongs to is. */
  return areaVisible(keys, area);
}

/* Does this person have any grant in this area?

   What decides whether the area exists for them at all: its square on
   the landing page, its menu, and whether its placeholders are worth
   showing. Built items only — an area of nothing but coming-soon
   screens is not somewhere to be sent. */
export function areaVisible(keys, area) {
  const set = grantSet(keys);
  return area.items.some((i) => i.built && set.has(String(i.view)));
}

/* The areas to offer on the landing page. */
export const visibleAreas = (keys) => AREAS.filter((a) => areaVisible(keys, a));

/* The items to show in an area's menu: what is granted, plus the
   placeholders, in the order navigation.js lists them. */
export function grantedItems(keys, area) {
  const set = grantSet(keys);
  return area.items.filter((i) => (i.built ? set.has(String(i.view)) : true));
}

/* Where an area opens. The first screen in it the person actually has,
   not simply the first built one — otherwise choosing Design sends
   somebody who may only have the canvas to the projects list and a
   refusal. Null if they have nothing here, which the landing page is
   already not offering. */
export function firstGrantedView(keys, area) {
  const set = grantSet(keys);
  const item = area.items.find((i) => i.built && set.has(String(i.view)));
  return item ? item.view : null;
}

/* Every view this person may be in, which is what a remembered view is
   checked against on reload.

   This is the one that matters most on the day a grant is REVOKED. The
   shell restores whatever view somebody was last on, so without this
   the canvas goes on opening for them after the tick comes off — until
   they happen to navigate away. */
export const allowedViews = (keys) =>
  [HOME_VIEW, ...AREAS.flatMap((a) => a.items.map((i) => i.view))]
    .filter((v) => isGranted(keys, v));

/* Has this person been given anything at all?

   Asked so the landing page can say "nothing has been granted to this
   account yet, ask the office" instead of showing an empty grid, which
   looks like a page that failed to load. */
export const hasAnyGrant = (keys) => visibleAreas(keys).length > 0;
