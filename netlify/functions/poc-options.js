import { supabase, json, fail } from "./_supabase.js";

const OPT = "Option_ID,POC_Application_ID,Option_Name,Interactive,Date_Received,Consumption_kVA,Selected,Notes";
const QUOT = "Quotation_ID,Option_ID,Quotation_Ref,Quotation_Status_ID,Estimated_Cost,Date_Received,Valid_Until_Date,Voltage_Rating_ID,Distance_m,Notes";

const nullEmpty = (o) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v]));

export default async function handler(req, context) {
  const db = supabase();
  const appId = context?.params?.appId;
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") || "option";
  const id = url.searchParams.get("id");

  try {
    if (req.method === "GET") {
      const { data: options, error } = await db
        .from("POC_Option").select(OPT).eq("POC_Application_ID", appId).order("Option_ID");
      if (error) throw error;
      const ids = (options || []).map((o) => o.Option_ID);
      let quotations = [];
      if (ids.length) {
        const { data, error: qErr } = await db
          .from("POC_Quotation").select(QUOT).in("Option_ID", ids).order("Quotation_ID");
        if (qErr) throw qErr;
        quotations = data || [];
      }
      return json({ options: options || [], quotations });
    }

    if (req.method === "POST") {
      const body = nullEmpty(await req.json());
      const table = kind === "quotation" ? "POC_Quotation" : "POC_Option";
      const row = kind === "quotation" ? body : { ...body, POC_Application_ID: Number(appId) };
      const { data, error } = await db.from(table).insert(row)
        .select(kind === "quotation" ? QUOT : OPT).single();
      if (error) throw error;
      return json(data, 201);
    }

    if (req.method === "PATCH") {
      if (!id) return json({ error: "id required" }, 400);
      const body = nullEmpty(await req.json());
      const table = kind === "quotation" ? "POC_Quotation" : "POC_Option";
      const pk = kind === "quotation" ? "Quotation_ID" : "Option_ID";
      const { data, error } = await db.from(table).update(body).eq(pk, id)
        .select(kind === "quotation" ? QUOT : OPT).single();
      if (error) throw error;
      return json(data);
    }

    if (req.method === "DELETE") {
      if (!id) return json({ error: "id required" }, 400);
      const table = kind === "quotation" ? "POC_Quotation" : "POC_Option";
      const pk = kind === "quotation" ? "Quotation_ID" : "Option_ID";
      const { error } = await db.from(table).delete().eq(pk, id);
      if (error) throw error;
      return json({ deleted: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/poc/:appId/options" };
