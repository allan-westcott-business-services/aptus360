/* Admin, one tab at a time.

   ── What was asked for ──

   "I want to give access to some Admin features to some users without
   giving them access to all."

   Menu access grants SCREENS, and Admin is one screen with forty-nine
   tabs behind it — House Types, Dig Rates, VAT, People & Roles, Portal
   Accounts. One tick gave somebody all of it, including the two tabs
   that hand out access itself: People & Roles grants menu access, and
   Portal Accounts creates logins for people outside the business. An
   engineer who maintains pipe sizes should not inherit either.

   ── The same mechanism, one level down ──

   A tab is granted exactly as a screen is: a row in Person_Menu_Visible
   whose Menu_Key is `admin:` and the tab's key, so

     admin:Dig_Rate

   No new table, no new idea, and the Menu Access panel grows a nested
   list rather than a second concept. The prefix is what keeps the two
   apart in one column, and it is a prefix rather than a suffix so the
   admin grants sort together and `startsWith` is the whole test.

   ── The Admin screen follows from its tabs ──

   Granting a tab grants Admin. The alternative is two ticks for one
   decision — the screen AND the tab — and the failure is silent and
   baffling: somebody ticks Dig Rates, the person still has no Admin
   button, and nothing on screen says why. So `admin` as a screen means
   "has at least one tab", and the plain `admin` key is still honoured
   for anybody holding it from before this existed.

   ── Three tabs reachable another way ──

   Organisations, Teams and Enquiry Sheets are also screens in their own
   right — Business Development and Operations list them — and those
   menu items are granted as any other screen. Somebody can have
   Organisations without Admin. That is not a hole: it is the same
   screen either way, and which menu it hangs in is a question about
   whose job it is, not about what they may see. */

import { ADMIN_TABLES } from "./adminTables.js";

export const ADMIN_VIEW = "admin";
export const ADMIN_PREFIX = "admin:";

/* The grantable tabs, in the order the Admin page lists them. Derived
   from the registry the page itself renders from, so a tab added there
   is grantable without touching this file — the alternative is a second
   list to remember, and the one nobody remembers is the tab nobody can
   be given. */
export const adminTabs = () =>
  ADMIN_TABLES.filter((t) => t.key).map((t) => ({ key: t.key, label: t.label }));

/* The same, under the registry's own headings, for a panel that would
   otherwise be forty-nine ticks in a column. A heading with nothing
   under it is dropped rather than drawn empty. */
export function adminGroups() {
  const out = [];
  for (const t of ADMIN_TABLES) {
    if (t.separator || t.group) out.push({ label: t.label, tabs: [] });
    else if (t.key) {
      if (!out.length) out.push({ label: "Admin", tabs: [] });
      out[out.length - 1].tabs.push({ key: t.key, label: t.label });
    }
  }
  return out.filter((g) => g.tabs.length);
}

export const adminKeyFor = (tabKey) => ADMIN_PREFIX + tabKey;

const asSet = (keys) => new Set([].concat(keys ?? []).map(String));

/* Has this person been given any part of Admin at all? What decides
   whether the Admin screen exists for them. */
export const hasAnyAdminTab = (keys) =>
  [...asSet(keys)].some((k) => k.startsWith(ADMIN_PREFIX));

export const canAdminTab = (keys, tabKey) =>
  asSet(keys).has(adminKeyFor(tabKey));

/* The tabs to show, in the page's own order. */
export const grantedAdminTabs = (keys) =>
  adminTabs().filter((t) => canAdminTab(keys, t.key));

/* And the first of them, which is where the Admin screen opens. Null
   where they have none — the screen is not offered at all then. */
export function firstAdminTab(keys) {
  const t = grantedAdminTabs(keys)[0];
  return t ? t.key : null;
}
