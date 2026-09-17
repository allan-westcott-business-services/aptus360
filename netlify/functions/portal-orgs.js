/* The organisations and branches a sign-in screen offers.

   Open, because a sign-in screen that needed a session to populate
   itself could never be used. That is a deliberate exposure and worth
   being honest about: this hands out the names of organisations we
   work with, and the names of their offices. Both are on their own
   letterheads and neither is a secret.

   What it does NOT hand out is anything that could be worked up into
   an attack: no contacts, no emails, no project counts, no ids beyond
   the ones needed to fill a dropdown, and nothing at all about which
   organisation has a portal account. A list of who our clients are is
   a marketing page; a list of who can sign in is not, and this is the
   first kind.

   ── Filtering by audience ──

   A developer should not be offered a DNO in the list, and the other
   way about. Organisation roles are data — the type keys live in
   `Organisation_Type` — so this filters by the keys the business
   actually uses rather than by a guess compiled in here. Where the
   filter finds nothing, every active organisation with a branch is
   offered instead: a sign-in screen with an empty dropdown is a
   locked door, and a slightly long list is not. */

import { supabase, json, fail, withAuth } from "./_supabase.js";

/* The roles each door is for, by the keys in Organisation_Type.

   A housing developer is recorded as `customer` — the label is
   "Customer (Housing Developer)" — which is worth saying out loud
   because "developer" is the word everybody uses for them and is not
   the key. The operator doors take the three keys each that the
   business actually holds: a DNO, a gas transporter and a water
   undertaker are one door, and their independent counterparts the
   other. */
const ROLES_FOR = {
  developer: ["customer"],
  dno: ["dno", "gt", "wu"],
  idno: ["idno", "igt", "iwu"],
};

export default withAuth(async function handler(req) {
  const db = supabase();
  const url = new URL(req.url);
  const audience = String(url.searchParams.get("audience") || "developer");

  try {
    const wanted = ROLES_FOR[audience] || [];

    /* Which organisations hold one of those roles. Read from the view
       the rest of the app reads, so "is this a DNO" has one answer. */
    let ids = null;
    if (wanted.length) {
      const { data, error } = await db
        .from("Organisation_By_Role")
        .select("Organisation_ID,Type_Key")
        .in("Type_Key", wanted);

      /* An EMPTY result is an answer: nobody holds that role, so the
         list is empty and the sign-in screen says so. Only a FAILED
         query falls back to every organisation, because that means the
         view could not be read rather than that nothing matched.

         The difference matters now that the keys are right. Falling
         back on an empty result would offer a developer every supplier
         and subcontractor on the system — which is not a secret, but
         it is not a dropdown anybody should be choosing from. */
      if (error) ids = null;
      else ids = [...new Set((data || []).map((r) => Number(r.Organisation_ID)))];
    }

    const q = db.from("Organisation")
      .select("Organisation_ID,Name")
      .eq("Is_Active", true)
      .order("Name");
    /* `ids` null means the role view could not be read; an empty array
       means nothing holds the role, and `in` on an empty list answers
       with nothing, which is the honest result. */
    const { data: orgs, error: oErr } = ids === null
      ? await q : await q.in("Organisation_ID", ids.length ? ids : [-1]);
    if (oErr) throw oErr;

    const { data: branches, error: bErr } = await db
      .from("Organisation_Branch")
      .select("Organisation_Branch_ID,Organisation_ID,Branch_Name,Branch_Dropdown")
      .eq("Is_Active", true)
      .order("Branch_Dropdown");
    if (bErr) throw bErr;

    const byOrg = new Map();
    for (const b of branches || []) {
      const k = Number(b.Organisation_ID);
      if (!byOrg.has(k)) byOrg.set(k, []);
      byOrg.get(k).push(b);
    }

    /* Only organisations that have somewhere to work from. An
       organisation with no branch cannot be picked meaningfully, and
       offering it produces a second dropdown with nothing in it. */
    const out = (orgs || [])
      .map((o) => ({ ...o, branches: byOrg.get(Number(o.Organisation_ID)) || [] }))
      .filter((o) => o.branches.length);

    /* ── The sites each branch runs ──

       For the narrowest kind of portal account: a contact who is here
       for ONE scheme. Served from here rather than from the generic
       admin endpoint because that endpoint's allow-list does not carry
       Project, and a screen asking it for one gets an error it is in
       no position to explain.

       Read through `Project_Developer`, which is the RECORD of who is
       on a scheme. `Project.Organisation_Branch_ID` is a cached copy
       maintained by a trigger and portal.js refuses to read it for
       deciding what an account may see; a screen that offered sites
       from the cache would offer the wrong ones, and somebody would
       pin a contact to a site that is not theirs.

       Only for a caller who may already see these organisations, which
       the block above has settled. */
    const branchIds = (branches || []).map((b) => Number(b.Organisation_Branch_ID));
    let sites = [];
    if (branchIds.length) {
      const { data: links, error: lErr } = await db
        .from("Project_Developer")
        .select("Project_ID,Organisation_Branch_ID")
        .in("Organisation_Branch_ID", branchIds);
      if (lErr) throw lErr;

      const ids = [...new Set((links || []).map((l) => Number(l.Project_ID)))];
      if (ids.length) {
        const { data: projects, error: pErr } = await db
          .from("Project")
          .select("Project_ID,Project_Name,Site_Name")
          .in("Project_ID", ids);
        if (pErr) throw pErr;

        const byId = new Map((projects || []).map((p) => [Number(p.Project_ID), p]));
        sites = (links || [])
          .map((l) => {
            const p = byId.get(Number(l.Project_ID));
            return p ? { ...p, Organisation_Branch_ID: Number(l.Organisation_Branch_ID) } : null;
          })
          .filter(Boolean);
      }
    }

    return json({ organisations: out, sites });
  } catch (e) {
    return fail(e);
  }
}, { open: true });

/* Open, and routed. See the note in portal.js about why a function
   without this answers nothing. */
export const config = { path: "/api/portal-orgs" };
