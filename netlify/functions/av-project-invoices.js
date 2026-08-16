import { supabase, json, fail, withAuth } from "./_supabase.js";

/* Invoices for one project, with the plot lines they are made of.

   Its own file rather than a branch inside av-register. That endpoint
   already had an unconditional `if (method === "GET")`, so a second GET
   branch below it could never run — it returned the register's shape
   instead and the invoice list came back empty, with no error to say so.
   Four previous occurrences of that are in the handover; a file per
   endpoint is the fix that was adopted, and this is why. */
export default withAuth(async function handler(req) {
  const db = supabase();
  const url = new URL(req.url);

  try {
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

      const projectId = url.searchParams.get("project");
      if (!projectId) return json({ error: "A project is required." }, 400);
      const [inv, lines] = await Promise.all([
        db.from("AV_Invoice_Detail").select("*")
          .eq("Project_ID", Number(projectId)).order("Invoice_Date", { ascending: false }),
        db.from("AV_Invoice_Line_Detail").select("*")
          .eq("Project_ID", Number(projectId)).order("AV_Invoice_Line_ID"),
      ]);
      if (inv.error) throw inv.error;
      if (lines.error) throw lines.error;
      return json({ invoices: inv.data || [], lines: lines.data || [] });

  } catch (e) { return fail(e, 400); }
});

export const config = { path: "/api/av-project-invoices" };
