import { supabase, json, fail, withAuth } from "./_supabase.js";

/* Reference generation belongs on the server: two estimators creating a
   project at the same moment must not be handed the same ref. */
export default withAuth(async function handler() {
  try {
    const db = supabase();
    const now = new Date();
    const prefix = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;

    const { data, error } = await db
      .from("Project")
      .select("Project_Ref")
      .like("Project_Ref", `${prefix}.%`)
      .order("Project_Ref", { ascending: false })
      .limit(1);
    if (error) throw error;

    let next = 1;
    if (data && data.length) {
      const tail = String(data[0].Project_Ref).split(".")[1] || "0";
      const parsed = parseInt(tail, 10);
      if (!Number.isNaN(parsed)) next = parsed + 1;
    }

    return json({ ref: `${prefix}.${String(next).padStart(3, "0")}` });
  } catch (e) {
    return fail(e);
  }
});

export const config = { path: "/api/next-project-ref" };
