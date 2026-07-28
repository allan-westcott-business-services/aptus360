import { supabase, json, fail } from "./_supabase.js";

const INV = "AV_Invoice_ID,Project_ID,Utility_ID,IDNO_ID,AV_Agreement_Type_ID,Invoice_Number,Contract_Number,Invoice_Date,Due_Date,Net_Value,VAT_Rate,VAT_Value,Gross_Value,Status,Source_File,Raised_By,Notes";

export default async function handler(req, context) {
  const db = supabase();
  const url = new URL(req.url);
  const op = url.searchParams.get("op");

  try {
    if (req.method === "GET") {
      const projectId = url.searchParams.get("project_id");
      let q = db.from("AV_Invoice").select(`${INV},AV_Invoice_Line(AV_Invoice_Line_ID,Plot_ID,Plot_Ref,Description,Net_Value)`);
      if (projectId) q = q.eq("Project_ID", projectId);
      const { data, error } = await q.order("AV_Invoice_ID", { ascending: false }).limit(500);
      if (error) throw error;
      return json({ rows: data || [] });
    }

    /* Resolve the contract references found in the file against projects,
       and return their plots. The file decides which project a row belongs
       to — there is no picker — so this is what turns an AP number into
       something invoiceable. */
    if (req.method === "POST" && op === "resolve") {
      const { contracts = [] } = await req.json();
      if (!contracts.length) return json({ projects: [], plots: [] });

      const wanted = contracts.map((c) => String(c).trim().toUpperCase()).filter(Boolean);

      const { data: projects, error: pErr } = await db.from("Project")
        .select("Project_ID,Project_Ref,Contract_Number,Site_Name,Revision,Project_Status_ID")
        .in("Contract_Number", wanted);
      if (pErr) throw pErr;

      const ids = (projects || []).map((p) => p.Project_ID);
      let plots = [];
      if (ids.length) {
        const { data, error } = await db.from("Plot")
          .select("Plot_ID,Project_ID,Plot_Number,Plot_Ref")
          .in("Project_ID", ids);
        if (error) throw error;
        plots = data || [];
      }

      /* Everything already invoiced for these projects, so the preview can
         mark rows rather than letting them fail on the unique index. */
      let invoiced = [];
      if (ids.length) {
        const { data } = await db.from("AV_Invoice_Line")
          .select("Plot_ID,Plot_Ref,Utility_ID,AV_Invoice!inner(Invoice_Number,Project_ID,Status)")
          .in("AV_Invoice.Project_ID", ids);
        invoiced = (data || []).filter((l) => l.AV_Invoice?.Status !== "Cancelled");
      }

      return json({ projects: projects || [], plots, invoiced });
    }

    if (req.method === "POST" && op === "check") {
      const { project_id, utility_id } = await req.json();
      const { data, error } = await db.rpc("av_invoiced_plots", {
        p_project: Number(project_id),
        p_utility: utility_id ? Number(utility_id) : null,
      });
      if (error) throw error;
      return json({ invoiced: data || [] });
    }

    /* One invoice per group, written as a unit: header, then lines, then
       a number. A half-written invoice would be worse than none, so a
       failed line set removes the header it belonged to. */
    if (req.method === "POST" && op === "generate") {
      const { groups = [], assign_numbers = true, raised_by = null, source_file = null } =
        await req.json();
      if (!groups.length) return json({ error: "Nothing selected" }, 400);

      const made = [];
      const failed = [];

      for (const g of groups) {
        let invoiceId = null;
        try {
          let number = null;
          if (assign_numbers && g.contract_number) {
            const { data: n, error: nErr } = await db.rpc("av_next_invoice_number", {
              p_contract: g.contract_number,
            });
            if (nErr) throw nErr;
            number = n;
          }

          const { data: inv, error: iErr } = await db.from("AV_Invoice").insert({
            Project_ID: Number(g.project_id),
            Utility_ID: g.utility_id ? Number(g.utility_id) : null,
            IDNO_ID: g.idno_id ? Number(g.idno_id) : null,
            AV_Agreement_Type_ID: g.agreement_type_id ? Number(g.agreement_type_id) : null,
            Invoice_Number: number,
            Contract_Number: g.contract_number || null,
            Invoice_Date: g.invoice_date || new Date().toISOString().slice(0, 10),
            VAT_Rate: g.vat_rate ?? 20,
            Status: "Draft",
            Source_File: source_file,
            Raised_By: raised_by,
          }).select(INV).single();
          if (iErr) throw iErr;
          invoiceId = inv.AV_Invoice_ID;

          const lines = (g.lines || []).map((l, i) => ({
            AV_Invoice_ID: invoiceId,
            Plot_ID: l.plot_id ? Number(l.plot_id) : null,
            Plot_Ref: String(l.plot_ref),
            Description: l.description || null,
            Net_Value: Number(l.net_value) || 0,
            Source_Row: l.source_row ?? i + 1,
          }));
          if (lines.length) {
            const { error: lErr } = await db.from("AV_Invoice_Line").insert(lines);
            if (lErr) throw lErr;
          }

          const { data: fresh } = await db.from("AV_Invoice")
            .select(INV).eq("AV_Invoice_ID", invoiceId).single();
          made.push(fresh || inv);
        } catch (e) {
          if (invoiceId) {
            await db.from("AV_Invoice").delete().eq("AV_Invoice_ID", invoiceId);
          }
          failed.push({
            group: g.key,
            error: e.code === "23505"
              ? "One or more plots are already invoiced for this utility."
              : (e.message || String(e)),
          });
        }
      }

      return json({ created: made, failed });
    }

    if (req.method === "PATCH") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "id required" }, 400);
      const body = await req.json();
      const allowed = ["Status", "Invoice_Date", "Due_Date", "Notes", "Raised_By", "VAT_Rate"];
      const changes = Object.fromEntries(
        Object.entries(body).filter(([k]) => allowed.includes(k))
      );
      const { data, error } = await db.from("AV_Invoice")
        .update(changes).eq("AV_Invoice_ID", id).select(INV).single();
      if (error) throw error;
      return json(data);
    }

    if (req.method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "id required" }, 400);
      const { data: inv } = await db.from("AV_Invoice")
        .select("Status").eq("AV_Invoice_ID", id).maybeSingle();
      if (inv && inv.Status !== "Draft") {
        return json({ error: "Only draft invoices can be deleted — cancel it instead." }, 409);
      }
      const { error } = await db.from("AV_Invoice").delete().eq("AV_Invoice_ID", id);
      if (error) throw error;
      return json({ deleted: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/av-invoices" };
