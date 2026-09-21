/* The project history records who made the change.

   Reported from use: the History tab's "By" column was empty.

   ── Why the endpoint has to say ──

   Every Netlify function uses the SERVICE key, so the database never
   sees the signed-in user and a trigger cannot find out who it is.
   The function does know. So every save sets `Updated_By` on the row,
   settled server-side from the login, and the trigger records it.

   Two things this holds hardest:

     1. The name comes from the SERVER, never the request body, or
        anybody could write somebody else's name into the history.
     2. A missing column never costs a save. After a week of saves
        failing on columns that were not there, an attribution column
        arriving before its migration is not allowed to do the same. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const shared = readFileSync("./netlify/functions/_supabase.js", "utf8");
const projects = readFileSync("./netlify/functions/projects.js", "utf8");
let sql = "";
try { sql = readFileSync("./supabase/migrations/0234_project_history_who.sql", "utf8"); }
catch { /* reported below */ }
const body = sql.replace(/--[^\n]*/g, "");

// 1. One rule for naming a person, the one the comments use.
{
  if (!/export async function whoIs\(user\)/.test(shared)) {
    fail("there is no shared way to name the signed-in user, so each endpoint "
      + "will invent its own");
  }
  const at = shared.indexOf("export async function whoIs");
  const fn = shared.slice(at, at + 700);
  if (!/from\("Person"\)[\s\S]{0,80}ilike\("Email", email\)/.test(fn)) {
    fail("the name is not looked up on the Person record by login email");
  }
  /* The email where no Person matches: a poor name but a real one. */
  if (!/data\?\.Person_Name \|\| email/.test(fn)) {
    fail("a login with no Person record is recorded as nobody");
  }
}

// 2. Every project save stamps it, from the server.
{
  const at = projects.indexOf('req.method === "PATCH" && id');
  const block = at < 0 ? "" : projects.slice(at, at + 2400);
  if (!block) fail("the project PATCH has moved");
  else {
    if (!/const who = await whoIs\(user\)/.test(block)) {
      fail("a project save does not say who made it");
    }
    /* After onlyColumns, and not from the body. */
    if (!/\{ \.\.\.onlyColumns\(nullEmpty\(changes\)\), Updated_By: who \}/.test(block)) {
      fail("Updated_By is not set after the column filter, so a request body "
        + "could put somebody else's name in the history");
    }
    if (!/if \(error && \/Updated_By\/\.test\(error\.message/.test(block)) {
      fail("a save fails outright if the Updated_By column is not there yet \u2014 "
        + "the fault of the whole week, in a new place");
    }
  }
  if (!/async function handler\(req, context, user\)/.test(projects)) {
    fail("the projects handler does not take the user withAuth passes it");
  }
}

// 3. The trigger records it, and does not record it as a change.
{
  if (!sql) fail("0234 is missing, so the history still has no name");
  else {
    if (!/ADD COLUMN IF NOT EXISTS "Updated_By" text/.test(body)) {
      fail("0234 does not add Updated_By");
    }
    if (!/who := NULLIF\(n ->> 'Updated_By', ''\);/.test(body)) {
      fail("the trigger does not read who off the row");
    }
    if (!/"Changed_By"\)\s*\n\s*VALUES \(NEW\."Project_ID", k, o ->> k, n ->> k, who\)/.test(body)) {
      fail("the trigger does not write Changed_By");
    }
    /* Updated_By is the WHO, not a thing that changed. Recorded as a
       field it fills the tab with "Updated By: Jane \u2192 John" every
       time two people take turns. */
    if (!/k IN \('Updated_At', 'Created_At', 'Updated_By'\)/.test(body)) {
      fail("Updated_By is itself recorded as a changed field");
    }
    /* Still names no columns: 0233's reason for existing. */
    if (/"Customer_ID"|"Branch_ID"/.test(body)) {
      fail("the trigger names a dropped column again");
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The history says who, settled by the server and never at the cost of a save.");
process.exit(bad ? 1 : 0);
