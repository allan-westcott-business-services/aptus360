import { supabase, json, fail, withAuth } from "./_supabase.js";

/* The AV register: every plot that has earned an asset value payment,
   next to the invoice line that claimed it. Reads the 0060 view, so the
   "earned" and "claimed" rules live in one place rather than being
   restated by whoever asks. */
const STATUSES = ["Draft", "Issued", "Exported", "Paid", "Cancelled"];

export default withAuth(async function handler(req) {
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

    /* Raising an invoice against a set of plots.

       Header and lines in one call: an invoice with no lines is not a
       half-finished invoice, it is a wrong one, and two round trips
       leaves that state reachable whenever the second fails.

       Raised_By is resolved here from the caller's email rather than
       taken from the browser, for the same reason comment authors are:
       the Person table is right here, and what gets stored matters more
       than what was displayed while typing. */
    if (req.method === "POST" && url.searchParams.get("op") === "raise") {
      const b = await req.json();
      if (!b.Project_ID) return json({ error: "A project is required." }, 400);
      const lines = Array.isArray(b.lines) ? b.lines.filter((l) => l.Plot_Ref) : [];
      if (!lines.length) return json({ error: "An invoice needs at least one plot." }, 400);

      let raisedBy = (b.Raised_By || "").trim() || null;
      const email = (b.Raised_By_Email || "").trim();
      if (!raisedBy && email) {
        const { data: person } = await db.from("Person")
          .select("Person_Name").ilike("Email", email).eq("Is_Active", true).maybeSingle();
        raisedBy = person?.Person_Name || email;
      }

      const net = lines.reduce((t, l) => t + Number(l.Net_Value || 0), 0);
      const rate = b.VAT_Rate == null || b.VAT_Rate === "" ? 20 : Number(b.VAT_Rate);
      const vat = Math.round(net * rate) / 100;

      const { data: inv, error: invErr } = await db.from("AV_Invoice").insert({
        Project_ID: Number(b.Project_ID),
        Utility_ID: b.Utility_ID ? Number(b.Utility_ID) : null,
        IDNO_ID: b.IDNO_ID ? Number(b.IDNO_ID) : null,
        AV_Agreement_Type_ID: b.AV_Agreement_Type_ID ? Number(b.AV_Agreement_Type_ID) : null,
        Invoice_Number: b.Invoice_Number || null,
        D365_Number: b.D365_Number || null,
        Contract_Number: b.Contract_Number || null,
        Invoice_Date: b.Invoice_Date || new Date().toISOString().slice(0, 10),
        Document_Type: b.Document_Type === "Credit" ? "Credit" : "Invoice",
        Net_Value: net,
        VAT_Rate: rate,
        VAT_Value: vat,
        Gross_Value: Math.round((net + vat) * 100) / 100,
        Status: "Draft",
        Raised_By: raisedBy,
        Notes: b.Notes || null,
      }).select("*").single();
      if (invErr) throw invErr;

      const { error: lineErr } = await db.from("AV_Invoice_Line").insert(
        lines.map((l, i) => ({
          AV_Invoice_ID: inv.AV_Invoice_ID,
          Plot_ID: l.Plot_ID ? Number(l.Plot_ID) : null,
          Plot_Ref: String(l.Plot_Ref),
          Description: l.Description || null,
          Notes: l.Notes || null,
          Net_Value: Number(l.Net_Value || 0),
          Source_Row: i + 1,
        }))
      );
      /* The header exists and its lines don't, which is exactly the
         state this call was meant to avoid — so undo it rather than
         leave an empty invoice behind. */
      if (lineErr) {
        await db.from("AV_Invoice").delete().eq("AV_Invoice_ID", inv.AV_Invoice_ID);
        throw lineErr;
      }
      return json({ ...inv, line_count: lines.length }, 201);
    }

    /* Editing one invoice, or one line. Column lists rather than a
       spread, so a field added to the table has to be brought in
       deliberately instead of becoming writable by accident. */
    if (req.method === "POST" && url.searchParams.get("op") === "invoice") {
      const { AV_Invoice_ID, ...body } = await req.json();
      /* Net, VAT and Gross are not here. Net follows the lines and the
         other two follow net and the rate, all by trigger — accepting
         them would be a request that appears to succeed while changing
         nothing, which is harder to diagnose than a rejection. VAT_Rate
         stays writable: it is an input, and the trigger recalculates
         from it. */
      const cols = ["Invoice_Number", "D365_Number", "Invoice_Date", "Due_Date",
        "Document_Type", "Status", "Raised_By", "Notes", "PDF_Path", "VAT_Rate"];
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
});

export const config = { path: "/api/av-register" };
