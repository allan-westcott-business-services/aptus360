import { supabase, json, fail, withAuth } from "./_supabase.js";

/* Adding a utility to a project.
 *
 * `scopes.js` serves /api/scopes/:id and handles PATCH and DELETE — an
 * existing design, edited or removed. Nothing served the create, so
 * `createScope` posted to /api/projects/:projectId/scopes, no function
 * claimed the path, and the SPA redirect in netlify.toml answered with
 * index.html. The client got "Expected JSON, got: <!DOCTYPE html>",
 * which reads as a parsing fault rather than as a missing route.
 *
 * A file of its own, per the rule the rest of this folder follows: a
 * second method bolted into scopes.js under a different path is the
 * branch-ordering trap that has caught this project four times, and one
 * endpoint per file cannot fall into it.
 *
 * Only Project_ID and Utility_ID are set. Everything else on
 * Project_Scope is nullable or defaulted, and a design starts empty —
 * the designer, the dates and the operator are what the tab is for.
 * Guessing a Scope_Status_ID here would be this endpoint deciding a
 * commercial fact, which is the Details tab's to decide.
 */

export default withAuth(async function handler(req, context) {
  const db = supabase();
  const projectId = Number(context?.params?.projectId);

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!projectId) return json({ error: "Project required" }, 400);

    const body = await req.json().catch(() => ({}));
    const utilityId = Number(body?.Utility_ID);
    if (!utilityId) return json({ error: "Utility_ID required" }, 400);

    const { data, error } = await db
      .from("Project_Scope")
      .insert({ Project_ID: projectId, Utility_ID: utilityId })
      /* Three columns, not the full row. The tab reloads the project
         straight after this returns, so the row it goes on to show is
         read by projects.js and not by this — and a second copy of that
         column list here is the drift fault waiting to happen: a column
         added to one list and not the other is neither saved nor
         returned, and nothing says so. */
      .select("Project_Scope_ID,Project_ID,Utility_ID")
      .single();

    if (error) {
      /* UNIQUE (Project_ID, Utility_ID) — one design per utility per
         project. Worth its own message: the constraint name means
         nothing to somebody who has just clicked Add and can already
         see the row they were told does not exist. */
      if (error.code === "23505") {
        return json({ error: "That utility already has a design on this project." }, 409);
      }
      /* A utility id that isn't in the catalogue. */
      if (error.code === "23503") {
        return json({ error: "That isn't a utility on this system." }, 400);
      }
      throw error;
    }

    return json(data, 201);
  } catch (e) {
    return fail(e, 400);
  }
});

export const config = { path: "/api/projects/:projectId/scopes" };
