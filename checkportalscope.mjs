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

// 6. The access lookup selects what the scoping reads, tolerates more
//    than one row, and does not care about the case of the audience.
{
  const portalFn = readFileSync("./netlify/functions/portal.js", "utf8");
  const at = portalFn.indexOf("async function accessFor(db, user)");
  const fn = at >= 0 ? portalFn.slice(at, portalFn.indexOf("\n}", at)) : "";
  /* Comments stripped before anything is asserted about the CODE. The
     first version of this failed on the word "maybeSingle" inside the
     comment explaining why maybeSingle was removed — a check that reads
     prose as instructions will always end up arguing with the
     explanation of itself. */
  const code = fn
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  if (!fn) {
    fail("the access lookup cannot be found where it was");
  } else {
    /* Every column the scoping reads must be on the select list. A
       column not selected comes back undefined and goes quiet: without
       Project_ID here, a contact scoped to one site is silently widened
       to their whole branch. */
    for (const col of ["Project_ID", "Branch_ID", "Organisation_ID",
      "Customer_ID", "Audience", "Is_Active"]) {
      if (!new RegExp(`${col}`).test(code.slice(0, code.indexOf(".ilike")))) {
        fail(`${col} is not selected, so the scoping reads undefined and `
          + "quietly widens what the account can see");
      }
    }

    /* More than one row for an address is a reasonable thing to have —
       a contact at two branches is the case the sign-in was rebuilt
       around — and `maybeSingle` FAILS on it, which reads as a broken
       account rather than a duplicate record. */
    if (/maybeSingle\(\)/.test(code)) {
      fail("the lookup uses maybeSingle, so an address with two portal "
        + "records fails to sign in at all");
    }
    if (!/rank\(a\) - rank\(b\)/.test(code)) {
      fail("with several records, the narrowest scope does not win — the "
        + "narrower one is the deliberate one");
    }

    /* And an audience of "Developer" is the same audience as
       "developer". The app routes on an exact match. */
    if (!/toLowerCase\(\)/.test(code.slice(code.indexOf("return {")))) {
      fail("the audience is returned as typed, so a capitalised one routes "
        + "nowhere and lands in the staff app");
    }
  }
}

// 7. Giving portal access to an address that can ALREADY sign in.
//
//    Creating an auth user fails when one exists, and one often does:
//    a staff member given access to a client's site, a contact set up
//    for another audience, anybody ever invited. The whole request then
//    failed and NOTHING was recorded — which reads exactly like success,
//    because the person can still sign in, with their old credentials,
//    landing wherever an account with no portal record lands.
{
  const fn = readFileSync("./netlify/functions/portal-accounts.js", "utf8");
  const code = fn
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  if (!/listUsers/.test(code)) {
    fail("the endpoint does not look for an existing sign-in, so giving "
      + "portal access to anybody who already has one fails outright and "
      + "records nothing");
  }
  if (!/let authUser = already/.test(code)) {
    fail("an existing sign-in is not reused, so the request still tries to "
      + "create one");
  }
  /* And the rollback only removes what this request made. Deleting an
     account that existed before would take somebody's staff login away
     because a portal record failed to insert. */
  if (!/authUser\?\.id && !already/.test(code)) {
    fail("a failed insert deletes an auth user that existed beforehand, "
      + "which takes away a login this request did not create");
  }
}

// 8. A CONTACT is a portal identity, and staff are not.
//
//    Somebody recording a contact against a branch has already said
//    who they are, which company and which office. Asking for it again
//    as a "portal account" is how the two came apart: a contact was
//    added, the portal knew nothing of them, and signing in put them
//    where an account with no record goes.
{
  const portalFn = readFileSync("./netlify/functions/portal.js", "utf8");
  const at = portalFn.indexOf("async function contactAccessFor(db, user)");
  const fn = at >= 0 ? portalFn.slice(at, portalFn.indexOf("\n}\n", at)) : "";
  const code = fn.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  if (!fn) {
    fail("a contact is not read as a portal identity, so adding somebody to "
      + "a branch still grants nothing");
  } else {
    /* Staff first, and it must RETURN rather than merely note it: many
       of our own people are contacts on an organisation, and reading
       that as portal access would take a staff member out of the
       application and into a client portal. */
    if (!/from\("Person"\)[\s\S]{0,200}return null/.test(code)) {
      fail("a staff member listed as a contact is treated as a portal "
        + "account, which takes them out of the application");
    }
    /* Narrowest scope wins, as everywhere else. */
    if (!/rank\(a\) - rank\(b\)/.test(code)) {
      fail("a contact with several records does not resolve to the "
        + "narrowest scope");
    }
    /* The audience comes from what the ORGANISATION is, from the view
       the rest of the app reads. */
    if (!/Organisation_By_Role/.test(code)) {
      fail("the audience is decided from something other than the role "
        + "view, so \"is this a DNO\" gets a second answer");
    }
    /* And an organisation with no portal-serving role is not a portal
       account: guessing would show a subcontractor a developer's
       schemes. */
    if (!/if \(!audience\) return null/.test(code)) {
      fail("an organisation with no portal role still yields an account");
    }
  }

  /* ── Contacts and stakeholders are the SOURCE ──

     Access comes from being a contact of an organisation, of one of its
     branches, or a stakeholder on a project. Portal_Access is read
     after them, as a legacy grant for accounts made before this, and
     nothing creates one as the route in any more.

     This case said the opposite a moment ago — that the explicit grant
     wins — and was withdrawn at the user's direction: two lists to keep
     in step is what nobody does, and it is exactly how a contact came
     to be added while the portal knew nothing about them. */
  if (!/contactAccessFor\(db, user\)\)\s*\n?\s*\?\? \(await accessFor/.test(portalFn)) {
    fail("the contact list is not the first source of access, so somebody "
      + "recorded as a contact still needs a second record made for them");
  }

  /* A stakeholder on a project is the third source, and the narrowest:
     they see that scheme whatever else they are. */
  if (!/from\("Project_Contact"\)/.test(portalFn)) {
    fail("a stakeholder named on a project gets no access, so the list "
      + "somebody maintains while running a job decides nothing");
  }
  {
    const at2 = portalFn.indexOf('.from("Project_Contact")');
    const around = portalFn.slice(at2 - 1200, at2 + 800);
    if (!/Project_ID: p2\.Project_ID/.test(around)) {
      fail("a stakeholder is not scoped to the project they are named on");
    }
  }
  /* A stakeholder names no company, so the audience comes from the
     SCHEME's developer — and a scheme with none recorded yields
     nothing rather than a portal opened on a guess. */
  if (!/from\("Project_Developer"\)[\s\S]{0,300}Organisation_Branch_ID/.test(portalFn)) {
    fail("a stakeholder's portal is decided without reference to the "
      + "scheme's developer");
  }

  const sql = readFileSync("./supabase/migrations/0224_contact_scope.sql", "utf8");
  for (const col of ["Organisation_ID", "Project_ID"]) {
    if (!new RegExp(`ADD COLUMN IF NOT EXISTS "${col}"`).test(sql)) {
      fail(`a contact cannot be scoped by ${col}`);
    }
  }
  /* Existing branch contacts get their organisation filled in, or a
     contact of a branch would not be found by an organisation-level
     lookup. */
  if (!/UPDATE "Organisation_Contact"/.test(sql)) {
    fail("existing branch contacts are left without an organisation");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Portal scopes: organisation, branch, one site \u2014 narrowest wins.");
process.exit(bad ? 1 : 0);
