/* The client portal, and the door in front of it.

   Most of what matters here is not what the screens look like but what
   they cannot do. A portal is an outside account inside the system, so
   the properties worth holding are:

     the square somebody presses grants NOTHING;
     identity comes from the verified token, never from a request;
     a project id from a portal caller is checked against their own
       sites before anything is read;
     a storage path is composed by the server, never accepted from the
       caller.

   Static, because these are shapes of code rather than behaviours a
   pure function can be handed. That is a real limitation and it is
   written down: these cases prove the guards are PRESENT, not that
   they are sufficient. A penetration test proves the second thing. */
import { readFileSync, readdirSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const portal = readFileSync("./netlify/functions/portal.js", "utf8");
const app = readFileSync("./src/App.jsx", "utf8");
const landing = readFileSync("./src/features/portal/AudienceLanding.jsx", "utf8");
const dev = readFileSync("./src/features/portal/DeveloperPortal.jsx", "utf8");
const sql = readFileSync("./supabase/migrations/0218_portal.sql", "utf8");

// 1. The door offers the four audiences and grants none of them.
{
  for (const name of ["Aptus Staff & Contractors", "Client Developer",
    "DNO", "IDNO"]) {
    if (!landing.includes(name)) fail(`the door does not offer "${name}"`);
  }
  if (/audience.*grant|setAudience.*Shell/.test(landing)) {
    fail("the landing page decides what somebody gets");
  }
  /* What routes is the ACCOUNT's audience, asked of the server. */
  if (!/http\.get\("\/portal\/me"\)/.test(app)) {
    fail("the app never asks the server who the account belongs to, so the "
      + "square pressed at the door would be what decides");
  }
  if (!/who\.audience === "developer"/.test(app)) {
    fail("the portal is chosen by something other than the account's own "
      + "audience");
  }
  if (!/who\.audience === "dno" \|\| who\.audience === "idno"/.test(app)) {
    fail("a network owner falls through to the staff app, which would show "
      + "them every developer's scheme");
  }
}

// 2. Identity comes from the token. A body carrying an email, a
//    customer or an audience is a body somebody can edit.
{
  if (!/withAuth\(async function handler\(req, context, user\)/.test(portal)) {
    fail("the endpoint does not take the verified user");
  }
  if (!/String\(user\?\.email \|\| ""\)/.test(portal)) {
    fail("the caller's identity is not read from the token");
  }
  const bodyReads = [...portal.matchAll(/body\?\.(\w+)/g)].map((m) => m[1]);
  for (const key of ["email", "audience", "customerId", "customer",
    "organisationId"]) {
    if (bodyReads.includes(key)) {
      fail(`the endpoint reads "${key}" from the request body \u2014 identity `
        + "and scope must come from the token");
    }
  }
}

// 3. A project id from a portal caller is proved before it is used.
{
  if (!/allowed\.includes\(projectId\)/.test(portal)) {
    fail("a project id from the caller is not checked against their own "
      + "sites before anything is read");
  }
  /* And refused as NOT FOUND, so nobody can learn which project numbers
     exist by watching which ones come back forbidden. */
  if (!/"No such site\."\s*\},\s*404/.test(portal)) {
    fail("a refused site is reported as forbidden rather than missing, "
      + "which lets somebody enumerate project numbers");
  }
  /* Every read of a document is tied to the project as well as the id,
     or an id from another site would answer. */
  const docReads = portal.match(/from\("Portal_Document"\)[\s\S]{0,400}?;/g) || [];
  for (const r of docReads) {
    if (/Portal_Document_ID/.test(r) && !/eq\("Project_ID", projectId\)/.test(r)) {
      fail("a document is read or written by id without tying it to the "
        + "project the caller was proved to own");
      break;
    }
  }
}

// 4. Storage paths are composed by the server.
//
//    A path from a body is a path somebody can point at another site's
//    folder — both on the way out and on the way back in.
{
  if (!/const path = `project-\$\{projectId\}\/doc-\$\{id\}\//.test(portal)) {
    fail("the upload path is not composed from the proved project and row");
  }
  if (!/path\.startsWith\(`project-\$\{projectId\}\/doc-\$\{id\}\/`\)/.test(portal)) {
    fail("a path handed back after an upload is accepted without checking "
      + "it is the one this endpoint would have issued");
  }
  if (!/createSignedUrl\(doc\.Storage_Path, \d+\)/.test(portal)) {
    fail("downloads are not signed and short-lived");
  }
}

// 5. A developer may only send what was ASKED for, and may only mark
//    what was sent TO them.
{
  if (!/Direction !== "from_developer"/.test(portal)) {
    fail("a developer can upload against a document we sent them");
  }
  if (!/eq\("Direction", "to_developer"\)/.test(portal)) {
    fail("a developer can mark their own upload as reviewed");
  }
}

// 6. The database says who may exist and what they must be scoped to.
{
  if (!/CHECK\s*\n?\s*\("Audience" IN \('staff','developer','dno','idno'\)\)/.test(sql)) {
    fail("the audience column accepts anything");
  }
  if (!/"Audience" = 'staff'\s*\n?\s*OR "Customer_ID" IS NOT NULL OR "Organisation_ID" IS NOT NULL/.test(sql)) {
    fail("a non-staff portal account can exist with nothing to scope it to, "
      + "which is an account that could only be given everything");
  }
  if (!/portal_email_once UNIQUE \("Email"\)/.test(sql)) {
    fail("one email could have two portal records, and which one answers "
      + "would be luck");
  }
}

// 7. The portal shows the whole sequence, not only what has happened.
//
//    A list of what has happened cannot tell a developer what is still
//    to come, which is most of what they want to know.
{
  if (!/Milestone_Type/.test(portal) || !/byKey/.test(portal)) {
    fail("the site view lists only the milestones already reached");
  }
  if (!/waitingOnYou/.test(portal) || !/waitingOnYou/.test(dev)) {
    fail("nothing tells a developer how many things are waiting on them, "
      + "which is the one number they act on");
  }
  /* And it says where the dates come from, because somebody acting on
     one deserves to know. */
  if (!/Dates are updated by us/.test(dev)) {
    fail("the portal does not say where its dates come from");
  }
}

// 8. A site with no link to the account shows nothing, and says so
//    rather than looking broken.
{
  if (!/No sites are linked to your account yet/.test(dev)) {
    fail("an account with no sites gets a blank page rather than a reason");
  }
}

// 9. The door is not remembered across a reload.
//
//    It was, and somebody who had once pressed a square was taken
//    straight to a sign-in screen ever after, with no way back short
//    of clearing their storage.
{
  if (/recallOneOf\("portalDoor"/.test(app)) {
    fail("the chosen door is restored on reload, so the landing page can "
      + "never be seen again");
  }
  if (!/onBack=\{/.test(app)) {
    fail("there is no way back to the door from a sign-in screen");
  }
}

// 10. A portal sign-in asks for the organisation and branch, because
//     that is how this business records a contact — but neither is a
//     credential, and neither is sent anywhere as a claim.
{
  const login = readFileSync("./src/features/portal/PortalLogin.jsx", "utf8");
  if (!/Your organisation/.test(login) || !/Your branch/.test(login)) {
    fail("the portal sign-in does not ask for organisation and branch");
  }
  /* The sign-in call carries the credential and nothing else. An
     organisation sent with it would be a claim somebody could edit. */
  if (!/signIn\(email\.trim\(\), password\)/.test(login)) {
    fail("the portal sign-in sends something other than the credential");
  }
  if (/signIn\([^)]*org/i.test(login)) {
    fail("the chosen organisation is passed as part of signing in, which "
      + "would make this form the security boundary");
  }

  const orgs = readFileSync("./netlify/functions/portal-orgs.js", "utf8");

  /* The keys are the ones in Organisation_Type, not the words people
     use. A housing developer is recorded as `customer`; "developer" is
     what everybody calls them and is not a key. */
  if (!/developer: \["customer"\]/.test(orgs)) {
    fail("the developer door does not filter on the customer role, which "
      + "is how a housing developer is actually recorded");
  }
  for (const key of ["dno", "gt", "wu", "idno", "igt", "iwu"]) {
    if (!new RegExp(`"${key}"`).test(orgs)) {
      fail(`the operator doors do not offer the ${key} role`);
    }
  }
  /* An empty result is an answer, not a reason to offer everything.
     Falling back on empty would put every supplier and subcontractor
     in a developer's dropdown. */
  if (!/if \(error\) ids = null;/.test(orgs)) {
    fail("an empty role result falls back to every organisation, which "
      + "offers a developer the whole address book");
  }
  if (!/\{ open: true \}/.test(orgs)) {
    fail("the organisation list needs a session, so a sign-in screen could "
      + "never fill its own dropdowns");
  }
  /* Open, so it must be thin: names and branches, nothing about who
     has an account. */
  for (const leak of ["Portal_Access", "Email", "Contact"]) {
    if (new RegExp(`select\\([^)]*${leak}`).test(orgs)) {
      fail(`the open organisation list exposes ${leak}`);
    }
  }
}

// 11. Creating an account creates BOTH halves, and rolls back.
//
//     An auth user with no record signs in and sees nothing; a record
//     with no auth user is an invitation nobody can accept.
{
  const acc = readFileSync("./netlify/functions/portal-accounts.js", "utf8");
  if (!/auth\.admin\.(createUser|inviteUserByEmail)/.test(acc)) {
    fail("no account is created in Supabase authentication");
  }
  if (!/from\("Portal_Access"\)\.insert/.test(acc)) {
    fail("no portal record is written, so the account would sign in and "
      + "see nothing");
  }
  if (!/auth\.admin\.deleteUser/.test(acc)) {
    fail("a failed record leaves an orphan auth user behind — half an "
      + "account is worse than none");
  }
  /* Staff only. This endpoint runs with the key that can create any
     account at all. */
  if (!/caller\.Audience !== "staff"/.test(acc)) {
    fail("a portal account can create portal accounts");
  }
  if (!/inviteUserByEmail/.test(acc)) {
    fail("there is no way to invite somebody to choose their own password");
  }
}

// 12. And there is a SCREEN for it, not just an endpoint.
//
//     An endpoint with no form means onboarding a client by hand-rolled
//     HTTP request, which nobody should be doing to set up an account.
{
  let screen = "";
  try {
    screen = readFileSync("./src/features/admin/PortalAccountsAdmin.jsx", "utf8");
  } catch { /* reported below */ }

  if (!screen) {
    fail("there is no Portal Accounts screen, so creating a client login "
      + "means sending a raw request by hand");
  } else {
    if (!/http\.post\("\/portal-accounts"/.test(screen)) {
      fail("the screen does not create accounts through the endpoint that "
        + "makes both halves");
    }
    /* Switching off, not deleting: an account that uploaded documents
       and approved things is part of a site's history. */
    if (/adminDelete/.test(screen)) {
      fail("the screen deletes portal accounts, which orphans the documents "
        + "and approvals they are attributed to");
    }
    if (!/Is_Active: row\.Is_Active === false/.test(screen)) {
      fail("there is no way to switch an account off");
    }
  }

  const tables = readFileSync("./src/lib/adminTables.js", "utf8");
  if (!/special: "portalaccounts"/.test(tables)) {
    fail("the screen is not in the admin menu, so nobody can reach it");
  }
}

// 13. Every endpoint declares its ROUTE.
//
//     Netlify routes a function by `export const config = { path }`
//     inside it, not by its filename — netlify.toml says so. A function
//     without one exists, deploys, and answers nothing.
//
//     That is exactly how this went wrong: the sign-in screen asked for
//     the organisations, got a 404, and showed "None listed", which
//     reads as an empty database. Hours could go into looking at the
//     data for a fault that was a missing line of routing.
//
//     Checked across ALL functions rather than just the portal's,
//     because the next one added will have the same hole and the same
//     silent symptom.
{
  const dir = "./netlify/functions";
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".js") && !f.startsWith("_"));
  for (const f of files) {
    const src = readFileSync(`${dir}/${f}`, "utf8");
    if (!/export const config\s*=\s*\{[^}]*path/.test(src)) {
      fail(`${f} declares no route, so nothing can reach it \u2014 it will `
        + "deploy cleanly and answer 404");
    }
  }
}

// 14. An unreachable list is not an empty one, and the screen says
//     which. The first version reported a 404 as "None listed".
{
  const login = readFileSync("./src/features/portal/PortalLogin.jsx", "utf8");
  if (!/listFailed/.test(login)) {
    fail("a failed request for the organisations is shown as an empty list, "
      + "which sends everybody looking at the database instead of the route");
  }
}

// 15. A failed identity call does NOT fall through to the staff app.
//
//     It did, and while the endpoint was unreachable every account —
//     developer included — landed in the full application. A routing
//     fault became an access fault. Refusing to route beats guessing:
//     the worst case is a staff member seeing "try again"; the other
//     way round is somebody outside the business seeing every project.
{
  if (!/audience: null, failed: e\.message/.test(app)) {
    fail("a failed /portal/me is treated as \"no record\", which routes an "
      + "outside account into the staff application");
  }
  if (!/who\.failed/.test(app)) {
    fail("nothing acts on a failed identity check, so it still falls "
      + "through to whatever comes next");
  }
  /* And the failure is NAMED, so somebody can tell their IT what
     happened rather than reporting "it went to the wrong page". */
  if (!/\{who\.failed\}/.test(app)) {
    fail("the reason is swallowed, leaving a blank refusal");
  }
}

// 16. Every column the portal asks a project for is a real one.
//
//     `Project_Name` and `Project_Number` were invented \u2014 a project is
//     known by its Site_Name and Display_Ref \u2014 and Postgres only says
//     so at RUN time, to whoever happened to open the page. Checked
//     against the list the projects endpoint maintains, which is the
//     nearest thing this repo has to a schema.
{
  const proj = readFileSync("./netlify/functions/projects.js", "utf8");
  const declared = (proj.match(/const PROJECT_COLUMNS = \[([\s\S]*?)\]/) || ["", ""])[1];
  const known = new Set([...declared.matchAll(/"([A-Za-z_]+)"/g)].map((m) => m[1]));

  if (known.size < 10) {
    fail("the project column list cannot be read, so this check cannot "
      + "do its job \u2014 re-anchor it rather than deleting it");
  } else {
    const asked = (portal.match(/const PROJECT_COLS = "([^;]*);/) || ["", ""])[1];
    for (const col of asked.match(/[A-Za-z_]+/g) || []) {
      if (col.length < 4 || col === "PROJECT_COLS") continue;
      if (!known.has(col)) {
        fail(`the portal asks a project for "${col}", which is not a column `
          + "it has \u2014 the query fails at run time, for whoever opens the "
          + "page");
      }
    }
  }

  /* And a developer's sites are found BOTH ways: a project names its
     developer's branch directly, and Project_Developer names them on
     schemes with more than one. Either alone leaves sites out. */
  if (!/from\("Project"\)\.select\("Project_ID"\)\s*\n?\s*\.in\("Organisation_Branch_ID"/.test(portal)) {
    fail("sites are not found by the project's own branch, so a scheme "
      + "recorded the ordinary way would be invisible to its developer");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The door grants nothing; the portal scopes everything server-side.");
process.exit(bad ? 1 : 0);
