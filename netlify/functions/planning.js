import { supabase, json, fail } from "./_supabase.js";

/* Everything the Planning board draws, in one request.

   ── Why one endpoint and not eight ──

   The board needs submissions, assignments, the days under them, the
   phases each work type involves, teams, regions, projects and people.
   Fetched separately from the browser that is eight round trips before
   anything appears, on a screen somebody opens to answer "what is on
   this week" — and eight chances for one of them to be slow.

   They are also useless apart. A bar cannot be drawn without its
   submission, its phase and its team, so a partial answer is not a
   partial board, it is a board with holes in it. One endpoint means one
   failure and one error to report.

   ── What it does not do ──

   No date filtering. The board pages back and forth through the
   schedule, jumps to the next call-off in either direction, and changes
   its window between one week and two months — every one of those would
   be another request against a range the caller has already got. The
   whole schedule is a few thousand rows; the window is a rendering
   decision and stays in the browser.

   The one bound is on closed work: a business three years in has more
   completed call-offs than live ones, and none of them are being
   planned. Complete and withdrawn submissions are dropped, and with
   them every assignment that hangs off one.

   ── Tolerated absences ──

   Call_Off_Work_Day and Call_Off_Status arrive in migrations that may
   not have been run, and Person."Planner_Colour" in 0132. Each is asked
   for separately and an error is taken as "not there yet" rather than
   failing the board: an assignment with no day breakdown still has a
   start and an end, and a schedule drawn without colours is a schedule.
   The same tolerance the call-offs panel already applies to them. */

const SUB_COLS = [
  "Submission_ID", "Status", "Project_ID", "Contract_ID", "AP_Number",
  "Site_Name", "Customer_Name", "Work_Type_ID", "Preferred_Date",
].join(",");

const ASGN_COLS = [
  "Assignment_ID", "Submission_ID", "Task_Type_ID", "Team_ID", "Span_ID",
  "Start_Date", "End_Date", "Plot_Range", "Status",
  /* Which weekend halves this booking works — 0133. The board shows it
     on the panel behind a bar, and a drag has to respect it. */
  "Sat_AM", "Sat_PM", "Sun_AM", "Sun_PM",
].join(",");

/* Submissions nobody is planning. Held here rather than imported from
   calloff-status.js so this endpoint states the rule it applies. */
const CLOSED = ["Complete", "Withdrawn (Customer)", "Withdrawn (Aptus)"];

export default async function handler(req) {
  const db = supabase();
  try {
    if (req.method !== "GET") return json({ error: "Not found" }, 404);

    const [subsRes, wtRes, ttRes, wttRes, teamRes, regionRes, subRegionRes, projRes,
      teamRegionRes, teamCraftRes, craftRes] =
      await Promise.all([
        db.from("Mains_Call_Off_Submission").select(SUB_COLS)
          .not("Status", "in", `(${CLOSED.map((s) => `"${s}"`).join(",")})`)
          .order("Preferred_Date"),
        db.from("Work_Type").select("Work_Type_ID,Work_Type_Name,Display_Order")
          .order("Display_Order"),
        db.from("Task_Type").select("Task_Type_ID,Task_Type_Name,Craft_ID,Display_Order")
          .order("Display_Order"),
        db.from("Work_Type_Task_Type")
          .select("Work_Type_ID,Task_Type_ID,Display_Order").order("Display_Order"),
        db.from("Team").select("Team_ID,Team_Name,Active").order("Team_Name"),
        db.from("Region").select("Region_ID,Region").order("Sort_Order"),
        db.from("Sub_Region").select("Sub_Region_ID,Sub_Region,Region_ID").order("Sub_Region"),
        db.from("Project")
          /* Sub_Region_ID is here for the sub region view level. A level
             whose value is not in the payload groups every row under
             "no sub region", which reads as the data being empty rather
             than as the column never having been asked for. */
          .select("Project_ID,Project_Ref,Display_Ref,Site_Name,Region_ID,Sub_Region_ID,Project_Manager_ID"),
        /* What each team is set up for. Sent with the board because
           dropping a booking on another lane has to be answered the
           moment it is dropped — fetching it then would mean a bar
           hanging under the cursor waiting for a round trip. Both
           tables are small: a row per team per region and per craft. */
        db.from("Team_Region").select("Team_ID,Region_ID"),
        db.from("Team_Craft").select("Team_ID,Craft_ID"),
        db.from("Craft").select("Craft_ID,Craft_Name").order("Sort_Order"),
      ]);

    for (const r of [subsRes, wtRes, ttRes, wttRes, teamRes, regionRes,
      subRegionRes, projRes]) {
      if (r.error) throw r.error;
    }

    /* People, with their planner colour where 0132 has run.
       Asked for again without it rather than left empty on failure: the
       manager's *name* is what the group is labelled with, and a board
       reading "PM #7" because a colour column is missing would be a
       worse answer than a board with no colours. */
    let people = [];
    let peopleHaveColours = true;
    {
      const withColour = await db.from("Person")
        .select("Person_ID,Person_Name,Planner_Colour").order("Person_Name");
      if (withColour.error) {
        peopleHaveColours = false;
        const plain = await db.from("Person")
          .select("Person_ID,Person_Name").order("Person_Name");
        people = plain.data || [];
      } else {
        people = withColour.data || [];
      }
    }

    const submissions = subsRes.data || [];
    const subIds = submissions.map((s) => s.Submission_ID);

    /* Only the assignments belonging to a submission still in play.
       Fetching every assignment and filtering here would carry three
       years of finished work across the wire to be thrown away. */
    let assignments = [];
    if (subIds.length) {
      const { data, error } = await db.from("Call_Off_Assignment")
        .select(ASGN_COLS).in("Submission_ID", subIds).order("Start_Date");
      if (error) throw error;
      assignments = data || [];
    }

    /* The days under each assignment: which half of which day, and
       whether it is off site. This is what makes a bar half a day wide
       rather than a whole one, so it is worth its own query — but an
       assignment without them is still drawn from its start and end. */
    let workDays = [];
    if (assignments.length) {
      const { data } = await db.from("Call_Off_Work_Day")
        .select("Work_Day_ID,Assignment_ID,Work_Date,Part,Off_Site")
        .in("Assignment_ID", assignments.map((a) => a.Assignment_ID))
        .order("Work_Date");
      workDays = data || [];
    }

    /* The colours a team's work can be in. Absent until 0116 has run,
       and the board falls back to the phase colour. */
    const { data: statuses } = await db.from("Call_Off_Status")
      .select("Call_Off_Status_ID,Status,Colour,Display_Order,Is_Active")
      .order("Display_Order");

    /* What follows what — 0134. Sent with the board because moving a
       booking has to move its dependents in the same gesture, and
       fetching the rules at that moment would mean a bar hanging under
       the cursor. Tolerated missing, like the rest: a board with no
       dependency rules is a board where nothing cascades. */
    const { data: dependencies } = await db.from("Task_Dependency")
      .select("Task_Dependency_ID,Predecessor_Task_Type_ID,Successor_Task_Type_ID,"
        + "Dependency_Type_ID,Work_Type_ID,Lag_Halves,Is_Active");
    const { data: dependencyTypes } = await db.from("Dependency_Type")
      .select("Dependency_Type_ID,Dependency_Type,Kind,Lag_Halves,Sort_Order,Is_Active")
      .order("Sort_Order");

    /* Which utilities each project has an agreement for. The original
       classified these by keyword on the agreement type's name because
       that was all it had; here the agreement carries Utility_ID, so
       the strip on each bar is read rather than guessed. */
    const { data: agreements } = await db.from("AV_Agreement")
      .select("Project_ID,Utility_ID");
    const { data: utilities } = await db.from("Utility")
      .select("Utility_ID,Utility,Colour,Sort_Order").order("Sort_Order");

    return json({
      submissions,
      assignments,
      workDays,
      workTypes: wtRes.data || [],
      taskTypes: ttRes.data || [],
      workTypeTasks: wttRes.data || [],
      teams: teamRes.data || [],
      regions: regionRes.data || [],
      subRegions: subRegionRes.data || [],
      projects: projRes.data || [],
      /* Tolerated missing, like the rest: 0114 may not have been run,
         and a board that cannot say which teams cover which regions is
         still a board. Cross-lane drops are refused rather than
         allowed when it is absent — see the drop handler. */
      teamRegions: teamRegionRes.error ? [] : (teamRegionRes.data || []),
      teamCrafts: teamCraftRes.error ? [] : (teamCraftRes.data || []),
      crafts: craftRes.error ? [] : (craftRes.data || []),
      teamRulesKnown: !teamRegionRes.error,
      people,
      peopleHaveColours,
      statuses: statuses || [],
      dependencies: (dependencies || []).filter((d) => d.Is_Active !== false),
      dependencyTypes: dependencyTypes || [],
      agreements: agreements || [],
      utilities: utilities || [],
    });
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/planning" };
