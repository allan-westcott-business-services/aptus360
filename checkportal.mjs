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
import { readFileSync } from "node:fs";

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

console.log(bad ? `\n${bad} problem(s)`
  : "The door grants nothing; the portal scopes everything server-side.");
process.exit(bad ? 1 : 0);
