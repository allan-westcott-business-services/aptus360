import { supabase, json, fail } from "./_supabase.js";

/* Setting when each utility on a plot is wanted live.

   0136 moved this off the plot and onto the plot's utilities, because
   gas, water and electric do not go live together. This is where those
   rows are written from the call-off panel — the screen somebody
   actually works in once a call-off exists, as opposed to the form it
   was raised on.

   ── The whole set, not one row at a time ──

   A PUT of every utility for one plot. The alternative is a call per
   cell, which means a half-saved plot whenever the network hiccups in
   the middle, and a panel that has to work out which cells got through.

   A utility with no date is deleted rather than stored as null. Null
   and absent would mean the same thing — nobody has asked for a date —
   and keeping both invites the question of which one wins.

   ── The floor is checked here too ──

   Nothing can be energised before the trench it runs in is closed. The
   panel refuses it first, with the same wording; this refuses it again,
   because this endpoint is reachable without the panel and a date
   before the dig is finished is not a preference, it is impossible. */

const isoDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || "").slice(0, 10));

export default async function handler(req, context) {
  const db = supabase();
  const plotId = Number(context?.params?.plotId);

  try {
    if (req.method !== "PUT" && req.method !== "POST") {
      return json({ error: "Not found" }, 404);
    }
    if (!plotId) return json({ error: "A plot is required." }, 400);

    const body = await req.json();
    const wanted = Array.isArray(body.utilities) ? body.utilities : [];

    const { data: plot, error: plotErr } = await db
      .from("Service_Call_Off_Plot")
      .select("Service_Plot_ID,Submission_ID,Plot")
      .eq("Service_Plot_ID", plotId)
      .single();
    if (plotErr) throw plotErr;

    /* ── The earliest anything here may go live ──

       The day the excavation and lay finishes, where it is booked. The
       latest of them where the dig is split across teams: the trench is
       not closed until the last gang is off it.

       Where nothing is booked yet the call-off's preferred date stands
       in, which is the same fallback the form applies — see
       energisationFloor in features/calloffs/rules.js. */
    const { data: digs } = await db
      .from("Call_Off_Assignment")
      .select("End_Date,Task_Type_ID,Task_Type(Task_Type_Name)")
      .eq("Submission_ID", plot.Submission_ID);

    let floor = null;
    for (const a of digs || []) {
      const name = String(a.Task_Type?.Task_Type_Name || "").toLowerCase().trim();
      if (!name.startsWith("excav") && !name.startsWith("lay")) continue;
      if (!floor || a.End_Date > floor) floor = a.End_Date;
    }
    let why = "excavation and lay finishes";
    if (!floor) {
      const { data: sub } = await db
        .from("Mains_Call_Off_Submission")
        .select("Preferred_Date").eq("Submission_ID", plot.Submission_ID).single();
      floor = sub?.Preferred_Date || null;
      why = "the visit is booked for";
    }

    const rows = [];
    for (const u of wanted) {
      const utilityId = Number(u?.Utility_ID);
      if (!utilityId) continue;
      const date = String(u?.Energisation_Date || "").slice(0, 10);
      /* No date means no row — see above. */
      if (!date) continue;
      if (!isoDay(date)) {
        return json({ error: `"${date}" is not a date.` }, 400);
      }
      if (floor && date <= floor) {
        return json({
          error: `Plot ${plot.Plot} cannot go live on or before the day `
            + `${why} (${floor}).`,
        }, 400);
      }
      rows.push({
        Service_Plot_ID: plotId,
        Utility_ID: utilityId,
        Energisation_Date: date,
      });
    }

    /* Replaced wholesale: what is sent is what the plot has. Deleting
       first rather than upserting and then removing the difference,
       because the difference is exactly the thing that goes wrong when
       a utility is cleared. */
    const { error: delErr } = await db
      .from("Service_Call_Off_Plot_Utility")
      .delete().eq("Service_Plot_ID", plotId);
    if (delErr) throw delErr;

    if (rows.length) {
      const { error: insErr } = await db
        .from("Service_Call_Off_Plot_Utility").insert(rows);
      if (insErr) throw insErr;
    }

    return json({ Service_Plot_ID: plotId, Utilities: rows, floor });
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/calloffs/plots/:plotId/energisation" };
