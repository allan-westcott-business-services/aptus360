import { supabase, json, fail, withAuth } from "./_supabase.js";

/* Plot assignment for a quotation. Replacing the whole set in one call
   rather than adding and removing individually — the picker works on a
   selection, and a partial failure mid-way would leave it inconsistent. */
export default withAuth(async function handler(req, context) {
  const db = supabase();
  const quotationId = context?.params?.quotationId;

  try {
    if (req.method === "GET") {
      const { data, error } = await db
        .from("POC_Quotation_Plot").select("Quotation_Plot_ID,Quotation_ID,Option_ID,Plot_ID")
        .eq("Quotation_ID", quotationId);
      if (error) throw error;
      return json({ rows: data || [] });
    }

    if (req.method === "PUT") {
      const { plot_ids = [], option_id } = await req.json();

      const { error: delErr } = await db
        .from("POC_Quotation_Plot").delete().eq("Quotation_ID", quotationId);
      if (delErr) throw delErr;

      if (!plot_ids.length) return json({ rows: [], count: 0 });

      const rows = plot_ids.map((id) => ({
        Quotation_ID: Number(quotationId),
        Option_ID: Number(option_id),
        Plot_ID: Number(id),
      }));
      const { data, error } = await db.from("POC_Quotation_Plot").insert(rows).select();
      // 23505 = the (Option_ID, Plot_ID) unique index: taken by a sibling
      if (error && error.code === "23505") {
        return json({ error: "One or more plots are already assigned to another quotation in this option." }, 409);
      }
      if (error) throw error;
      return json({ rows: data, count: data.length });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
});

export const config = { path: "/api/quotations/:quotationId/plots" };
