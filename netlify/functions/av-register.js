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

    /* The project view: invoices with their lines. Two selects rather
       than an embedded join, because the lines carry a connected date
       that comes from the plot's connection record, not from the line. */
    if (req.method === "GET" && url.searchParams.get("view") === "invoices") {
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

    /* Editing one invoice, or one line. Column lists rather than a
       spread, so a field added to the table has to be brought in
       deliberately instead of becoming writable by accident. */
    if (req.method === "POST" && url.searchParams.get("op") === "invoice") {
      const { AV_Invoice_ID, ...body } = await req.json();
      const cols = ["Invoice_Number", "D365_Number", "Invoice_Date", "Due_Date",
        "Document_Type", "Status", "Raised_By", "Notes", "PDF_Path",
        "Net_Value", "VAT_Rate", "VAT_Value", "Gross_Value"];
      const patch = Object.fromEntries(
        Object.entries(body).filter(([k]) => cols.includes(k)).map(([k, v]) => [k, v === "" ? null : v])
      );
      if (!Object.keys(patch).length) return json({ error: "Nothing to change" }, 400);
      patch.Updated_At = new Date().toISOString();
      const { data, error } = await db.from("AV_Invoice")
        .update(patch).eq("AV_Invoice_ID", AV_Invoice_ID).select("*").single();
      if (error) throw error;
      return json(data);
    }

    if (req.method === "POST" && url.searchParams.get("op") === "line") {
      const { AV_Invoice_Line_ID, ...body } = await req.json();
      const cols = ["Plot_Ref", "Description", "Notes", "Net_Value"];
      const patch = Object.fromEntries(
        Object.entries(body).filter(([k]) => cols.includes(k)).map(([k, v]) => [k, v === "" ? null : v])
      );
      if (!Object.keys(patch).length) return json({ error: "Nothing to change" }, 400);
      const { data, error } = await db.from("AV_Invoice_Line")
        .update(patch).eq("AV_Invoice_Line_ID", AV_Invoice_Line_ID).select("*").single();
      if (error) throw error;
      return json(data);
    }

    if (req.method === "DELETE") {
      const invoiceId = url.searchParams.get("invoice");
      const lineId = url.searchParams.get("line");
      if (invoiceId) {
        /* Lines go with it: AV_Invoice_Line cascades on the foreign key,
           so this is one delete rather than two. */
        const { error } = await db.from("AV_Invoice").delete().eq("AV_Invoice_ID", invoiceId);
        if (error) throw error;
        return json({ deleted: true });
      }
      if (lineId) {
        const { error } = await db.from("AV_Invoice_Line").delete().eq("AV_Invoice_Line_ID", lineId);
        if (error) throw error;
        return json({ deleted: true });
      }
      return json({ error: "Nothing identified to delete" }, 400);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) { return fail(e, 400); }
}

export const config = { path: "/api/av-register" };
