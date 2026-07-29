import { supabase, json, fail } from "./_supabase.js";

/* The AV register: every plot that has earned an asset value payment,
   next to the invoice line that claimed it. Reads the 0060 view, so the
   "earned" and "claimed" rules live in one place rather than being
   restated by whoever asks. */
const STATUSES = ["Draft", "Issued", "Exported", "Paid", "Cancelled"];

export default async function handler(req) {
  const db = supabase();
  const url = new URL(req.url);

  try {
    if (req.method === "GET") {
      const projectId = url.searchParams.get("project");
      let q = db.from("AV_Register").select("*");
      if (projectId) q = q.eq("project_id", Number(projectId));
      /* The whole book is a few thousand rows at most — one page rather
         than the original's parallel paginator, which existed because it
         was reading raw invoice lines rather than a view. */
      const { data, error } = await q.limit(20000);
      if (error) throw error;
      return json({ rows: data || [] });
    }

    /* Bulk status change. The screen's whole purpose is working through
       a list, so moving twenty invoices at once is the normal case, not
       the exception. */
    if (req.method === "PATCH") {
      const { invoice_ids = [], Status } = await req.json();
      if (!invoice_ids.length) return json({ error: "No invoices selected" }, 400);
      if (!STATUSES.includes(Status)) {
        return json({ error: `Status must be one of ${STATUSES.join(", ")}` }, 400);
      }
      const { data, error } = await db.from("AV_Invoice")
        .update({ Status, Updated_At: new Date().toISOString() })
        .in("AV_Invoice_ID", invoice_ids)
        .select("AV_Invoice_ID,Status");
      if (error) throw error;
      return json({ updated: (data || []).length, rows: data || [] });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) { return fail(e, 400); }
}

export const config = { path: "/api/av-register" };
