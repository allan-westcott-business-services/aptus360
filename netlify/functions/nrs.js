import { supabase, json, fail, withAuth } from "./_supabase.js";

const COLS = [
  "NRS_ID","Project_ID","Utility_ID","NRS_Sub_Type_ID","Supply_Ref","Description",
  "Address","MPAN","Requested_kVA","IDNO_ID","Date_Received","Self_Lay_Provider","Notes",
].join(",");

const WRITABLE = new Set(COLS.split(",").filter((c) => c !== "NRS_ID"));
const pick = (o) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => WRITABLE.has(k)).map(([k, v]) => [k, v === "" ? null : v]));


/* The utilities a supply takes, as a set.

   0196 moved this off the record and into NRS_Utility, because the
   answer is a set and a column can only hold one of them: a pumping
   station takes a three-phase supply AND a water connection, and under
   the single column it could only ever say one of the two.

   Read and written here rather than by a view, so a supply and its
   utilities arrive and leave together — a screen that saves the record
   and then the set has a moment where the two disagree, and a failure
   between them leaves a supply claiming utilities it does not have.

   The old Utility_ID column is still selected and no longer written by
   anything. It is left standing so a deploy can be rolled back; the
   drop statement is at the foot of 0196. */
async function utilitiesFor(db, ids) {
  if (!ids.length) return new Map();
  const { data, error } = await db.from("NRS_Utility")
    .select("NRS_ID,Utility_ID").in("NRS_ID", ids);
  if (error) throw error;
  const out = new Map();
  for (const r of data || []) {
    if (!out.has(r.NRS_ID)) out.set(r.NRS_ID, []);
    out.get(r.NRS_ID).push(r.Utility_ID);
  }
  return out;
}

const withUtilities = (row, map) =>
  ({ ...row, Utility_IDs: map.get(row.NRS_ID) || [] });

/* Replaced wholesale rather than merged: the set IS the answer, and
   working out which rows to add and which to remove from a partial
   patch is how a supply ends up with a utility nobody ticked. Absent
   means "not changing it"; an empty array means "none". */
async function setUtilities(db, nrsId, ids) {
  if (!Array.isArray(ids)) return;
  const wanted = [...new Set(ids.map(Number).filter((n) => Number.isFinite(n)))];
  const { error: delErr } = await db.from("NRS_Utility").delete().eq("NRS_ID", nrsId);
  if (delErr) throw delErr;
  if (!wanted.length) return;
  const { error } = await db.from("NRS_Utility")
    .insert(wanted.map((Utility_ID) => ({ NRS_ID: nrsId, Utility_ID })));
  if (error) throw error;
}

export default withAuth(async function handler(req, context) {
  const db = supabase();
  const projectId = context?.params?.projectId;
  const id = new URL(req.url).searchParams.get("id");

  try {
    if (req.method === "GET") {
      const { data, error } = await db.from("Non_Residential_Supply")
        .select(COLS).eq("Project_ID", projectId).order("NRS_ID");
      if (error) throw error;
      const rows = data || [];
      const map = await utilitiesFor(db, rows.map((r) => r.NRS_ID));
      return json({ rows: rows.map((r) => withUtilities(r, map)) });
    }
    if (req.method === "POST") {
      const body = await req.json();
      const { data, error } = await db.from("Non_Residential_Supply")
        .insert(pick({ ...body, Project_ID: Number(projectId) })).select(COLS).single();
      if (error) throw error;
      await setUtilities(db, data.NRS_ID, body.Utility_IDs);
      return json({ ...data, Utility_IDs: body.Utility_IDs || [] }, 201);
    }
    if (req.method === "PATCH") {
      if (!id) return json({ error: "id required" }, 400);
      const body = await req.json();
      const { data, error } = await db.from("Non_Residential_Supply")
        .update(pick(body)).eq("NRS_ID", id).select(COLS).single();
      if (error) throw error;
      await setUtilities(db, data.NRS_ID, body.Utility_IDs);
      const map = await utilitiesFor(db, [data.NRS_ID]);
      return json(withUtilities(data, map));
    }
    if (req.method === "DELETE") {
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await db.from("Non_Residential_Supply").delete().eq("NRS_ID", id);
      if (error) throw error;
      return json({ deleted: true });
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
});

export const config = { path: "/api/projects/:projectId/nrs" };
