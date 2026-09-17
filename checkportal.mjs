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

/* The columns PROJECT_COLS asks for.

   Taken from the QUOTED parts only. The first version captured
   everything between the `=` and the `;`, which swallowed a comment
   that sits inside the constant and reported its prose as column
   names — a check failing on its own explanation, for the second time
   this session. */
const projectColumns = (() => {
  const raw = (portal.match(/const PROJECT_COLS = ([\s\S]*?);/) || ["", ""])[1];
  /* Comments stripped FIRST. The comment inside this constant contains
     a quoted phrase of its own, and a check that read it reported "to
     come" as a database column \u2014 the same self-inflicted failure as
     the version before it, one layer down. */
  const stmt = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...stmt.matchAll(/"([^"]*)"/g)]
    .flatMap((m) => m[1].split(","))
    .map((x) => x.trim())
    .filter(Boolean);
})();
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
    for (const col of projectColumns) {
      if (!known.has(col)) {
        fail(`the portal asks a project for "${col}", which is not a column `
          + "it has \u2014 the query fails at run time, for whoever opens the "
          + "page");
      }
    }
  }

  /* ── Scoping reads the RECORD, never the cache ──

     `Project.Organisation_Branch_ID` is a cached copy of the main
     developer, maintained by a trigger, and on the live data it has
     drifted: eleven unrelated schemes all carry branch 17. Using it
     would show one developer another developer's projects.

     A denormalised convenience column is fine for a screen that staff
     can see is wrong. It is not fit to decide who may see what. */
  if (/from\("Project"\)\.select\("Project_ID"\)[\s\S]{0,80}Organisation_Branch_ID/.test(portal)) {
    fail("a developer's sites are found through Project's CACHED branch "
      + "column, which has drifted on live data \u2014 authorisation must read "
      + "Project_Developer, which is the record");
  }
  if (!/from\("Project_Developer"\)\.select\("Project_ID"\)/.test(portal)) {
    fail("sites are not found through Project_Developer at all");
  }
}

// 17. The dates come from where the system already knows them.
//
//     Four sources, given by the business:
//       enquiry          Project.Date_Received
//       poc_applied      POC_Application.Application_Date
//       poc_quoted       POC_Option / POC_Quotation Date_Received
//       outline design   Project_Scope.Actual_Date, PER UTILITY
{
  /* ── Read from, therefore selected ──

     `Date_Received` was derived from and never SELECTED, so the field
     arrived undefined and the enquiry stage showed "to come" on every
     site. Recurring fault 4 in a new place: a column absent from a
     function's select list is neither saved nor returned, and the
     symptom is silence rather than an error.

     So every field the code reads off a project row must be in the
     list it asked for. */
  {
    const read = [...portal.matchAll(/proj\.data\?\.([A-Za-z_]+)/g)].map((m) => m[1]);
    for (const field of new Set(read)) {
      if (!projectColumns.includes(field)) {
        fail(`the portal reads "${field}" off a project but never selects it, `
          + "so it arrives undefined and whatever depends on it goes quiet");
      }
    }
  }

  for (const [what, needle] of [
    ["the enquiry date", /Date_Received/],
    ["the POC application date", /from\("POC_Application"\)/],
    ["the options received", /from\("POC_Option"\)/],
    ["the quotations received", /from\("POC_Quotation"\)/],
    ["the outline design dates", /from\("Project_Scope"\)/],
  ]) {
    if (!needle.test(portal)) fail(`${what} is not read from the system`);
  }

  /* Outline design is per utility. A single date would have to mean
     "all of them" or "any of them" and could not say which \u2014 and a
     developer with gas and electric on one site is owed both. */
  if (!/outline_design_\$\{sc\.Utility_ID\}/.test(portal)) {
    fail("outline design is one date for the whole site rather than one "
      + "per utility, so it cannot say which utility is designed");
  }

  /* Options and quotations are shown WHOLE, not collapsed to a date.
     Three options arriving and one being chosen is the part a
     developer is waiting on. */
  if (!/quotations:/.test(portal)) {
    fail("quotations are collapsed away, so a developer cannot see what "
      + "arrived or which option was chosen");
  }
  /* Shown inside the progress TREE now, not as a section of its own:
     an option is a stage of the POC, and reading it beside the
     application it came from is the point. Re-anchored rather than
     dropped \u2014 the property is still that a developer can see every
     option and every quotation. */
  const dev = readFileSync("./src/features/portal/DeveloperPortal.jsx", "utf8");
  if (!/detail\.pre/.test(dev)) {
    fail("the portal does not render the progress tree");
  }
  if (!/const pocNodes = poc\.map/.test(portal)) {
    fail("the POC options and quotations are not built into the tree, so "
      + "a developer cannot see what arrived or which was chosen");
  }
  if (!/o\.selected \? " \(chosen\)" : ""/.test(portal)) {
    fail("the chosen option is not marked as chosen");
  }

  /* Quotations have no project on them, so the tie to this site is
     through the options \u2014 which are already proved. Filtering must
     happen, or one site's page would list another's quotations. */
  if (!/mineOptions\.has\(Number\(x\.Option_ID\)\)/.test(portal)) {
    fail("quotations are not tied back to this site's own options");
  }

  /* Where the system knows, the system wins: a hand-entered date that
     disagrees was typed before the system knew. */
  if (!/d\?\.achievedOn \?\? m\?\.Achieved_On/.test(portal)) {
    fail("a hand-entered date outranks the system's own, which shows the "
      + "older answer");
  }
}

// 18. Progress is a TREE, on two tabs, and a parent's colour is
//     computed rather than claimed.
{
  const dev = readFileSync("./src/features/portal/DeveloperPortal.jsx", "utf8");

  if (!/Pre Contract/.test(dev) || !/Site Build/.test(dev)) {
    fail("the progress page does not carry the two tabs");
  }
  if (!/function Node\(/.test(dev)) {
    fail("progress is rendered flat, so it cannot show that the POC is "
      + "half done \u2014 electric quoted, water waiting");
  }

  /* The colour comes from the server, computed by rolling children up.
     A parent that claimed to be done over an outstanding child would
     be the page lying about itself. */
  if (!/const roll = \(children\)/.test(portal)) {
    fail("a parent's state is not computed from its children");
  }
  /* Green ONLY when every child is done. An earlier version ignored
     unknown children, so a design branch with two stages recorded and
     three untracked came out green — "Outline Design complete" over an
     approval nobody has. */
  if (!/if \(done === children\.length\) return "done";/.test(portal)) {
    fail("a parent goes green while children are still unknown, which "
      + "reports a stage as complete over an approval nobody has");
  }

  /* The order the work happens in: POC before the design. */
  const preBlock = portal.slice(portal.indexOf("const pre = ["));
  const pocAt = preBlock.indexOf('node("POC"');
  const designAt = preBlock.indexOf('node("Outline Design"');
  /* Present first, THEN ordered. `indexOf` answers -1 for absent, and
     -1 is less than any real position — so an order test alone reads a
     missing section as a correctly placed one. That is the third time
     this trap has come up in this file's history; it is worth reading
     twice whenever two indexes are compared. */
  if (pocAt < 0) fail("the Pre Contract tab has no POC stage");
  else if (designAt >= 0 && pocAt > designAt) {
    fail("the design is listed above the POC, which is not the order the "
      + "work happens in");
  }
  for (const stage of ["Outline Design", "Quotation", "Contract Design"]) {
    if (!preBlock.includes(`node("${stage}"`)) {
      fail(`the Pre Contract tab has no ${stage} stage`);
    }
  }
  for (const step of ["Designer assigned", "Design started", "Design completed",
    "Sent to client", "Approved by client"]) {
    if (!portal.includes(`node("${step}"`)) {
      fail(`a design branch is missing "${step}"`);
    }
  }

  /* Undated means GREY. Red is kept for one thing: a document we have
     asked them for and not received, which genuinely is outstanding
     and which they can act on from that line. */
  if (/opts2\.unknown \? "unknown" : "waiting"/.test(portal)) {
    fail("an undated stage is shown red, which asserts \"not done\" about "
      + "something nothing records");
  }
  if (!/status: d\.Storage_Path \? "done" : "waiting"/.test(portal)) {
    fail("a document we asked for and have not received is not shown as "
      + "outstanding, so nothing on the page needs action");
  }

  /* Grey is not red. Nothing records an invoice payment yet, and red
     means "not done" \u2014 claiming that would put a developer on the
     phone about something we cannot see. */
  if (!/unknown/.test(portal) || !/pt-unknown/.test(dev)) {
    fail("a stage nothing records is shown as not done, rather than as "
      + "not known");
  }
  if (!/not recorded yet/.test(portal)) {
    fail("an unrecorded stage does not say so");
  }

  /* The action sits on the line that needs it. */
  if (!/n\.document\?\.direction === "from_developer"/.test(dev)) {
    fail("the upload action is not on the line that asks for the document");
  }

  /* The team is NAMED. "Team assigned" without the names is a date
     about strangers, and the developer's next question is who. */
  if (!/Project manager/.test(portal) || !/from\("Person"\)/.test(portal)) {
    fail("the team line does not name anybody");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The door grants nothing; the portal scopes everything server-side.");
process.exit(bad ? 1 : 0);
