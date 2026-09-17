/* What a portal contact may see.

   Three scopes, widest to narrowest:

     organisation, no branch   every site of every branch
     organisation and branch   that branch's sites only
     a project                 that site, and nothing else

   The one that matters most is the narrowest, because it is the one a
   plausible misreading breaks. A row scoped to a project ALSO names
   the organisation the project belongs to — that is who the contact
   is — and reading that as a grant too would turn the narrowest scope
   into the widest. Nobody notices until a site manager mentions a
   scheme they should never have heard of.

   Read statically: the resolver is a Netlify function over Supabase,
   and standing one up here would test the mock rather than the rule.
   What the rule IS, though, is worth pinning. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const portal = readFileSync("./netlify/functions/portal.js", "utf8");

/* The resolver, from `mine` to the end of it. */
const mine = (() => {
  const at = portal.indexOf("async function mine(db, access)");
  if (at < 0) return "";
  const end = portal.indexOf("\n}", at);
  return end > at ? portal.slice(at, end) : "";
})();

// 1. A project scope is answered FIRST and returns only that project.
{
  if (!mine) {
    fail("the resolver cannot be found where it was \u2014 this check needs "
      + "re-anchoring, not deleting");
  } else {
    if (!/access\.Project_ID != null\) return \[Number\(access\.Project_ID\)\]/
      .test(mine)) {
      fail("a contact pinned to one site is not resolved to that site alone");
    }
    /* Before the organisation pass, not merely present: if the
       organisation ran first the project row would collect every site
       of the group on its way past. */
    const proj = mine.indexOf("access.Project_ID != null");
    const org = mine.indexOf("access.Organisation_ID != null");
    const cust = mine.indexOf("access.Customer_ID != null");
    if (proj < 0 || (org >= 0 && proj > org) || (cust >= 0 && proj > cust)) {
      fail("the project scope is applied after the organisation or customer "
        + "one, so a contact pinned to a site collects the whole group's "
        + "sites on the way past");
    }
  }
}

// 2. Branch scope narrows; no branch means the whole organisation.
{
  if (!/access\.Branch_ID != null \? \[Number\(access\.Branch_ID\)\] : null/
    .test(portal)) {
    fail("a branch no longer narrows an account to that branch");
  }
  if (!/Organisation_Branch[\s\S]{0,200}eq\("Organisation_ID", access\.Organisation_ID\)/
    .test(portal)) {
    fail("an account with no branch does not widen to every branch of its "
      + "organisation");
  }
}

// 3. Sites are found through the RECORD, never the cached column.
//
//    Project.Organisation_Branch_ID is maintained by a trigger and has
//    drifted on live data. portal.js already says so at length; this
//    keeps it true.
{
  if (/from\("Project"\)[\s\S]{0,200}Organisation_Branch_ID/.test(portal)) {
    fail("the resolver reads Project's cached branch column, which has "
      + "drifted on live data and would show one developer another's sites");
  }
  if (!/from\("Project_Developer"\)/.test(portal)) {
    fail("the resolver no longer reads Project_Developer, which is the "
      + "record of who is on a scheme");
  }
}

// 4. The screen offers sites from the same source the resolver uses.
//    A list offered from somewhere else can offer a site the contact
//    would then not be able to see — or worse, one that is not theirs.
{
  const orgsFn = readFileSync("./netlify/functions/portal-orgs.js", "utf8");
  if (!/from\("Project_Developer"\)/.test(orgsFn)) {
    fail("the sites offered when creating an account do not come from "
      + "Project_Developer, so the list offered and the list granted can "
      + "disagree");
  }

  const screen = readFileSync(
    "./src/features/admin/PortalAccountsAdmin.jsx", "utf8");
  if (!/id="pa-project"/.test(screen)) {
    fail("there is no way to scope an account to a single site");
  }
  if (!/projectId: draft\.projectId \|\| null/.test(screen)) {
    fail("the chosen site is not sent when the account is created");
  }
  /* Choosing a different organisation or branch clears the site: a site
     of one branch is not a site of another. */
  const clears = (screen.match(/projectId: ""/g) || []).length;
  if (clears < 2) {
    fail("changing the organisation or the branch keeps a site chosen under "
      + "the previous one");
  }
  /* And a failure to load the lists is SAID. An empty dropdown reads as
     "there are none", which is a different thing from "that request was
     refused" and wants something different done about it. */
  if (!/loadError/.test(screen)) {
    fail("a failed lookup is swallowed and shows as an empty dropdown");
  }

  const sql = readFileSync(
    "./supabase/migrations/0223_portal_project_scope.sql", "utf8");
  if (!/ADD COLUMN IF NOT EXISTS "Project_ID"/.test(sql)) {
    fail("Portal_Access cannot hold a single-site scope");
  }
}

// 5. And what they are attached to is shown once they are in.
//
//    The sign-in no longer asks which branch they are at, so the portal
//    has to say. A contact for a whole group sees their offices with
//    the sites under each; one branch or one site needs no headings,
//    and a single heading over a single list is furniture.
{
  const portalFn = readFileSync("./netlify/functions/portal.js", "utf8");
  if (!/branchName: branchNames\.get/.test(portalFn)) {
    fail("a site does not carry the branch it belongs to, so the portal "
      + "cannot show somebody what they are attached to");
  }
  /* From the record, not the cached column \u2014 a wrong label here would
     tell a developer that somebody else's office runs their scheme. */
  const at = portalFn.indexOf("const branchOf = new Map()");
  const block = at >= 0 ? portalFn.slice(at - 800, at) : "";
  if (block && !/from\("Project_Developer"\)/.test(block)) {
    fail("the branch label is read from somewhere other than "
      + "Project_Developer");
  }

  const ui = readFileSync("./src/features/portal/DeveloperPortal.jsx", "utf8");
  if (!/byBranch\.length > 1/.test(ui)) {
    fail("the portal does not group by branch, or groups even when there "
      + "is only one \u2014 a single heading over a single list is furniture");
  }
  if (!/const siteCard/.test(ui)) {
    fail("the grouped and flat lists draw their own cards, so the one "
      + "nobody looks at will drift from the one they do");
  }
  /* A site whose branch is not recorded is grouped, not dropped: a
     scheme somebody can see, missing from the page with nothing to say
     why, is the worst outcome here. */
  if (!/"Other sites"/.test(ui)) {
    fail("a site with no branch recorded is dropped from the list");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Portal scopes: organisation, branch, one site \u2014 narrowest wins.");
process.exit(bad ? 1 : 0);
