import { supabase, withAuth, json, fail } from "./_supabase.js";

/* The reasons a job could not be done, as an operative may give them.

   Office-only ones are left out here rather than hidden on the tablet.
   A list the screen filters is a list somebody can post around; a list
   the server never sends is one that does not exist as far as the
   tablet is concerned — and the abort endpoint refuses them again
   anyway, because a screen is not a permission. */
export default withAuth(async function handler() {
  const db = supabase();
  try {
    const { data, error } = await db
      .from("Field_Abort_Reason")
      .select("Reason_Code,Label,Needs_Note")
      .eq("Is_Active", true)
      .eq("Office_Only", false)
      .order("Sort_Order");
    if (error) throw error;
    return json({ reasons: data || [] });
  } catch (e) {
    return fail(e);
  }
});

export const config = { path: "/api/field/reasons" };
