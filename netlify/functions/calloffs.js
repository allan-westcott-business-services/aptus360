import { supabase, json, fail, withAuth } from "./_supabase.js";

/* Call-offs: a request to come and do a piece of work on a site.

   One submission, with rows underneath saying which pieces — and which
   table those rows live in depends on the work type's Selection_Mode.
   Three tables rather than one with mostly-null columns, because a run
   of trench, a plot and a lighting column are different things. */

const SUB_COLS = [
  "Submission_ID", "Status", "Project_ID",
  "Customer_ID", "Customer_Name", "Branch_ID", "Branch_Name",
  "Contract_ID", "AP_Number", "Site_Name", "Site_Address",
  "Work_Type_ID", "Contact_Name", "Contact_Phone", "Contact_Company",
  "Preferred_Date", "Alternative_Date",
  "Obstruction_Free", "Ground_Unmade", "Line_Level_Required",
  "Notes", "GIS_Data", "Created_By", "Created_At",
  /* Half-days to excavate and lay every section on this call-off, from
     the drawing at the moment it was raised (0159). Written once and
     not recomputed: a call-off is a request for work as it was
     understood on the day, and an estimate that moved would silently
     lengthen a booking a team had already been given. */
  "Estimated_Half_Days",
  /* The machine this call-off was estimated on (0178), and whether it
     is the visit that energises the substation (0180).

     Both written once at raise time and read back with the rest: a
     call-off is a request for work as it was understood on the day, and
     a machine or a phase that changed afterwards would move a booking
     somebody had already been given. */
  "Dig_Rate_ID", "Needs_Energisation",
].join(",");

const WRITABLE = new Set(SUB_COLS.split(",")
  .filter((c) => c !== "Submission_ID" && c !== "Created_At"));

const pick = (o) => Object.fromEntries(
  Object.entries(o || {}).filter(([k]) => WRITABLE.has(k)));

/* Where each mode's rows live, and what identifies one.

   Held in one place so a mode cannot be handled one way on the way in
   and another on the way out. */
export const CHILD = {
  Span: {
    table: "Mains_Call_Off_Span",
    key: "Span_ID",
    cols: ["Plots", "D_or_P", "Energisation_Date", "Estimated_Length_m",
      "Sort_Order", "From_Node_ID", "To_Node_ID", "Off_Site",
      /* Per section, so a call-off split between two teams can give
         each the length of what it covers rather than the whole job.
         Nothing reads it yet — stored because it is free to keep now
         and impossible to recover once the drawing has moved on. */
      "Estimated_Half_Days",
      /* Where the run starts and ends, and the plots it serves, as
         fields rather than inside the sentence Plots holds (0174). The
         work instruction shows each separately. */
      "From_Label", "To_Label", "Plot_List",
      /* What is laid along this section, as one line, from the drawing
         when the call-off was raised (0160). Display only: the sizes a
         gang needs to read. Which utilities the call-off covers is
         recorded properly elsewhere and this is not that. */
      "Contents"],
  },
  PlotList: {
    table: "Service_Call_Off_Plot",
    key: "Service_Plot_ID",
    cols: ["Plot", "Energisation_Date", "Sort_Order"],
    /* A plot's utilities and when each is wanted live — 0136. Gas,
       water and electric on one plot go live on different days, so the
       date belongs here and not on the plot. The plot's own date stays
       as the fallback for a utility with no row.

       Written after its parent, since the rows need the plot's id. */
    grandchild: {
      table: "Service_Call_Off_Plot_Utility",
      parentKey: "Service_Plot_ID",
      from: "Utilities",
      cols: ["Utility_ID", "Energisation_Date"],
    },
  },
  ColumnList: {
    table: "Street_Light_Call_Off",
    key: "Street_Light_Call_Off_ID",
    cols: ["Street_Light_ID", "Energisation_Date", "Sort_Order"],
  },
};

export default withAuth(async function handler(req, context) {
  const db = supabase();
  const projectId = context?.params?.projectId;
  const id = new URL(req.url).searchParams.get("id");

  try {

    /* ── GET: every call-off on a project, with its rows ── */
    if (req.method === "GET") {
      const { data: subs, error } = await db
        .from("Mains_Call_Off_Submission")
        .select(`${SUB_COLS},Work_Type(Work_Type_ID,Work_Type_Name,Selection_Mode)`)
        .eq("Project_ID", projectId)
        .order("Submission_ID", { ascending: false });
      if (error) throw error;

      /* The rows for each submission, from whichever table its mode
         uses. Fetched per table rather than per submission: three
         queries whatever the list length, instead of one per row. */
      const ids = (subs || []).map((s) => s.Submission_ID);
      const kids = {};
      if (ids.length) {
        for (const [mode, spec] of Object.entries(CHILD)) {
          const { data } = await db
            .from(spec.table)
            .select(`${spec.key},Submission_ID,${spec.cols.join(",")}`)
            .in("Submission_ID", ids)
            .order("Sort_Order");
          kids[mode] = data || [];

          /* The per-utility dates hanging off those rows, in one query
             for the whole page rather than one per plot.

             Tolerated missing: 0136 may not have been run, and a
             call-off list that fails to load because a table is absent
             is worse than one showing the plot-level dates it has
             always shown. */
          const gspec = spec.grandchild;
          if (gspec && kids[mode].length) {
            const { data: gkids } = await db
              .from(gspec.table)
              .select(`${gspec.parentKey},${gspec.cols.join(",")}`)
              .in(gspec.parentKey, kids[mode].map((k) => k[spec.key]));
            const byParent = new Map();
            for (const g of gkids || []) {
              const k = g[gspec.parentKey];
              if (!byParent.has(k)) byParent.set(k, []);
              byParent.get(k).push(g);
            }
            kids[mode] = kids[mode].map((k) => ({
              ...k, [gspec.from]: byParent.get(k[spec.key]) || [],
            }));
          }
        }
      }

      /* Which utilities each call-off covers (0146). One query for the
         page rather than one per call-off, the same as the rows. */
      let utils = [];
      if (ids.length) {
        const { data } = await db.from("Call_Off_Utility")
          .select("Submission_ID,Utility_ID").in("Submission_ID", ids);
        utils = data || [];
      }

      const rows = (subs || []).map((s) => {
        const mode = s.Work_Type?.Selection_Mode ?? null;
        const mine = mode
          ? (kids[mode] || []).filter((k) => k.Submission_ID === s.Submission_ID)
          : [];
        return {
          ...s,
          Selection_Mode: mode,
          items: mine,
          utility_ids: utils
            .filter((u) => u.Submission_ID === s.Submission_ID)
            .map((u) => Number(u.Utility_ID)),
        };
      });

      return json({ rows });
    }

    /* ── POST: a new call-off, with its rows ── */
    if (req.method === "POST") {
      const body = await req.json();
      const { items = [], Selection_Mode: mode, utility_ids = [], ...sub } = body;

      const { data: created, error } = await db
        .from("Mains_Call_Off_Submission")
        .insert(pick(sub))
        .select(SUB_COLS)
        .single();
      if (error) throw error;

      /* The utilities this call-off covers. Written after the
         submission and reported separately if they fail, for the same
         reason the rows are: losing a whole call-off because a tick box
         did not save would be the wrong trade. */
      if (utility_ids.length) {
        const { error: uErr } = await db.from("Call_Off_Utility").insert(
          [...new Set(utility_ids.map(Number))]
            .map((Utility_ID) => ({ Submission_ID: created.Submission_ID, Utility_ID })));
        if (uErr) {
          return json({
            ...created,
            warning: `Saved as #${created.Submission_ID}, but the utilities failed: ${uErr.message}`,
          });
        }
      }

      /* The rows, in the table the mode calls for.

         Written after the submission and reported separately if they
         fail: a submission with no rows is recoverable by editing, and
         losing the whole thing because one row was malformed is not. */
      const spec = CHILD[mode];
      /* The rows that get inserted, declared out here so the response
         can name them.

         They were const inside the block below, and the return that
         reports them is outside it — which threw "kids is not defined"
         on every call-off raised. Nothing caught it because the failure
         is at the point of raising, not at build time. */
      let saved = [];

      if (spec && items.length) {
        const payload = items.map((r, i) => {
          const out = { Submission_ID: created.Submission_ID, Sort_Order: i };
          for (const c of spec.cols) if (c !== "Sort_Order") out[c] = r[c] ?? null;
          return out;
        });
        const { data: kids, error: kidErr } = await db
          .from(spec.table).insert(payload).select();
        saved = kids || [];
        if (kidErr) {
          return json({
            ...created,
            warning: `Saved as #${created.Submission_ID}, but the rows failed: ${kidErr.message}`,
          });
        }

        /* The per-utility dates under each row.

           Matched back to their parent by position, which is safe
           because insert returns what it inserted in the order it was
           given — and the alternative, matching on the plot's text, is
           exactly the sort of join that breaks on a plot called "12a".

           Reported rather than thrown, like the rows above: a call-off
           saved without its per-utility dates is recoverable by
           editing, and losing the whole submission over one of them is
           not. */
        const gspec = spec.grandchild;
        if (gspec && kids?.length) {
          const rows = [];
          items.forEach((r, i) => {
            const parent = kids[i];
            if (!parent) return;
            for (const u of r[gspec.from] || []) {
              if (u?.Utility_ID == null) continue;
              const out = { [gspec.parentKey]: parent[spec.key] };
              for (const c of gspec.cols) out[c] = u[c] ?? null;
              rows.push(out);
            }
          });
          if (rows.length) {
            const { error: gErr } = await db.from(gspec.table).insert(rows);
            if (gErr) {
              return json({
                ...created,
                warning: `Saved as #${created.Submission_ID}, but the per-utility `
                  + `energisation dates failed: ${gErr.message}`,
              });
            }
          }
        }
      }

      /* The rows that were inserted, with their ids.

         Only the submission came back, so a caller that wanted to
         attach something to a span — a picture of it for the work
         instruction — had no way to name one. The ids exist here and
         were being thrown away.

         Named `items` to match what was sent, so the caller can line
         them up with what it asked for. */
      return json({ ...created, items: saved });
    }

    /* ── PATCH: the submission, and what its dates invalidate ── */
    if (req.method === "PATCH" && id) {
      const body = await req.json();

      const { data, error } = await db
        .from("Mains_Call_Off_Submission")
        .update(pick(body))
        .eq("Submission_ID", id)
        .select(SUB_COLS)
        .single();
      if (error) throw error;

      /* Utilities, when the caller sent them.

         Absent means "not editing them" and leaves what is there; an
         empty array means "none of them" and clears it. Treating the
         two the same would wipe the utilities every time somebody
         changed the site name. */
      if (Array.isArray(body.utility_ids)) {
        const wanted = [...new Set(body.utility_ids.map(Number))];
        await db.from("Call_Off_Utility").delete().eq("Submission_ID", id);
        if (wanted.length) {
          await db.from("Call_Off_Utility")
            .insert(wanted.map((Utility_ID) => ({ Submission_ID: Number(id), Utility_ID })));
        }
      }

      /* ── Energisation dates the new visit dates have overtaken ──

         Nothing can go live before the work that makes it live. Move a
         call-off from July to October and a September energisation date
         is no longer a request, it is a leftover — and a leftover on a
         date field is worse than a blank one, because it still looks
         like somebody meant it.

         So they are removed rather than flagged. A date that cannot
         happen is not a date, and leaving it on screen with a warning
         beside it invites everyone after to assume somebody else has
         looked at it.

         ── On or before, and both dates ──

         Both, because either could be the day the gang arrives, and a
         date that is impossible under one of them is not a date anybody
         can rely on. The later of the two is therefore the floor.

         On the day counts as too early: the trench is being dug that
         day, not energised.

         ── Only when the dates actually moved ──

         A patch that sets a status or a contact name should not touch
         anything. Checked against what was there rather than against
         what was sent, so re-saving the same date changes nothing. */
      let clearedDates = 0;
      const touched = ["Preferred_Date", "Alternative_Date"]
        .some((k) => k in body);

      if (touched) {
        const floor = [data.Preferred_Date, data.Alternative_Date]
          .filter(Boolean)
          .sort()
          .pop() || null;

        if (floor) {
          const { data: plots } = await db
            .from("Service_Call_Off_Plot")
            .select("Service_Plot_ID")
            .eq("Submission_ID", id);
          const plotIds = (plots || []).map((p) => p.Service_Plot_ID);

          if (plotIds.length) {
            /* Counted before they go, so the panel can say how many and
               for which plots rather than "some dates were removed". */
            const { data: doomed } = await db
              .from("Service_Call_Off_Plot_Utility")
              .select("Service_Plot_Utility_ID")
              .in("Service_Plot_ID", plotIds)
              .lte("Energisation_Date", floor);
            clearedDates = (doomed || []).length;

            if (clearedDates) {
              await db.from("Service_Call_Off_Plot_Utility")
                .delete()
                .in("Service_Plot_ID", plotIds)
                .lte("Energisation_Date", floor);
            }
          }

          /* The plot-level fallback from before 0136 goes the same way.
             It is the same promise on a coarser grain, and leaving it
             while clearing the per-utility rows would have a call-off
             saying two different things. */
          const { data: stale } = await db
            .from("Service_Call_Off_Plot")
            .select("Service_Plot_ID")
            .eq("Submission_ID", id)
            .lte("Energisation_Date", floor);
          if ((stale || []).length) {
            clearedDates += stale.length;
            await db.from("Service_Call_Off_Plot")
              .update({ Energisation_Date: null })
              .eq("Submission_ID", id)
              .lte("Energisation_Date", floor);
          }
        }
      }

      return json({ ...data, clearedDates });
    }

    /* ── DELETE: the submission, and its rows with it ── */
    if (req.method === "DELETE" && id) {
      const { error } = await db
        .from("Mains_Call_Off_Submission")
        .delete()
        .eq("Submission_ID", id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    return fail(e, 400);
  }
});

export const config = { path: "/api/projects/:projectId/calloffs" };
