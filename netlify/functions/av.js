import { supabase, json, fail } from "./_supabase.js";

const APP = "AV_Application_ID,Project_ID,Utility_ID,AV_Status_ID,Application_Ref,Submitted_Date,Plot_Count,Notes";
const QUOT = "AV_Quotation_ID,AV_Application_ID,IDNO_ID,Quotation_Status_ID,Asset_Value,Quotation_Ref,Date_Received,Valid_Until_Date,Accepted,Notes";

const clean = (o) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v]));

export default async function handler(req, context) {
  const db = supabase();
  const projectId = context?.params?.projectId;
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") || "application";
  const id = url.searchParams.get("id");

  try {
    if (req.method === "GET") {
      const { data: apps, error } = await db.from("AV_Application")
        .select(APP).eq("Project_ID", projectId).order("Utility_ID");
      if (error) throw error;
      const ids = (apps || []).map((a) => a.AV_Application_ID);
      let quotations = [];
      if (ids.length) {
        const { data, error: qErr } = await db.from("AV_Quotation")
          .select(QUOT).in("AV_Application_ID", ids).order("AV_Quotation_ID");
        if (qErr) throw qErr;
        quotations = data || [];
      }
      return json({ applications: apps || [], quotations });
    }

    /* Creating an application also creates one quotation slot per selected
       IDNO — a slot with no value yet, waiting to be filled when they come
       back. That's what makes "3 of 5 quotations received" answerable. */
    if (req.method === "POST" && kind === "application") {
      const { idno_ids = [], ...body } = await req.json();
      const { data: app, error } = await db.from("AV_Application")
        .insert(clean({ ...body, Project_ID: Number(projectId) })).select(APP).single();
      if (error && error.code === "23505") {
        return json({ error: "This project already has an asset value application for that utility." }, 409);
      }
      if (error) throw error;

      if (idno_ids.length) {
        const { data: pending } = await db.from("Quotation_Status")
          .select("Quotation_Status_ID").eq("Quotation_Status", "Pending").maybeSingle();
        const slots = idno_ids.map((i) => ({
          AV_Application_ID: app.AV_Application_ID,
          IDNO_ID: Number(i),
          Quotation_Status_ID: pending?.Quotation_Status_ID ?? null,
        }));
        const { error: sErr } = await db.from("AV_Quotation").insert(slots);
        if (sErr) {
          // Don't leave an application with no one to quote it
          await db.from("AV_Application").delete().eq("AV_Application_ID", app.AV_Application_ID);
          throw sErr;
        }
      }
      return json(app, 201);
    }

    if (req.method === "PATCH") {
      if (!id) return json({ error: "id required" }, 400);
      const body = clean(await req.json());
      const table = kind === "quotation" ? "AV_Quotation" : "AV_Application";
      const pk = kind === "quotation" ? "AV_Quotation_ID" : "AV_Application_ID";
      const { data, error } = await db.from(table).update(body).eq(pk, id)
        .select(kind === "quotation" ? QUOT : APP).single();
      if (error) throw error;
      return json(data);
    }

    if (req.method === "POST" && kind === "slot") {
      const body = clean(await req.json());
      const { data, error } = await db.from("AV_Quotation").insert(body).select(QUOT).single();
      if (error && error.code === "23505") {
        return json({ error: "That operator already has a quotation slot." }, 409);
      }
      if (error) throw error;
      return json(data, 201);
    }

    if (req.method === "DELETE") {
      if (!id) return json({ error: "id required" }, 400);
      const table = kind === "quotation" ? "AV_Quotation" : "AV_Application";
      const pk = kind === "quotation" ? "AV_Quotation_ID" : "AV_Application_ID";
      const { error } = await db.from(table).delete().eq(pk, id);
      if (error) throw error;
      return json({ deleted: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/projects/:projectId/av" };
