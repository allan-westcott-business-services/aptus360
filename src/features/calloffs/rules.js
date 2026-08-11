/* What makes a call-off valid, kept apart from the form.

   The rules have edges — a duplicate plot across two rows, a date before
   the one asked for, a service call-off too small to be worth a visit —
   and each has a right answer that is easier to state here than to read
   out of a component. They are also the part somebody will want to check
   without a browser.

   Nothing here throws. A half-finished call-off is an ordinary state to
   be in while filling one in; the form asks for what is missing rather
   than refusing to hold it. */

/* Below this many plots, a service call-off carries a charge: a visit
   costs what it costs whether it connects four houses or one.

   Both figures come from the original. They belong in a table
   eventually — they are commercial terms and will change — and are here
   until somebody says where. */
export const SERVICE_MIN_PLOTS = 4;
export const SERVICE_SHORTFALL_CHARGE = 250;

export function servicePenalty(plotCount, {
  min = SERVICE_MIN_PLOTS, charge = SERVICE_SHORTFALL_CHARGE,
} = {}) {
  const short = Math.max(0, min - Number(plotCount || 0));
  return { short, charge: short * charge, applies: short > 0 };
}

/* Everything wrong with a call-off, as a list.

   All of it rather than the first: someone filling in eight rows should
   be told about all eight problems, not made to save eight times. */
/* ── The earliest anything can be asked to go live ──

   Nothing is energised before the trench it runs in is closed. So the
   floor is the day the excavation and lay finishes, and the date
   offered is the day after that.

   ── Which date, and when there isn't one ──

   The dig's end date, where a booking for it exists. That is the real
   answer and it only exists once somebody has planned the work.

   A call-off being raised has no bookings at all — the whole point of
   raising it is to ask for them — so there the preferred date stands in.
   It is what the customer asked for and the earliest anything on this
   call-off could begin, which makes it the right floor for a form that
   cannot know better yet.

   The two are named apart in the message, because "before the dig
   finishes" and "before the visit" are different objections and a
   planner reading the second should not think the first was checked. */
export function energisationFloor(form = {}, opts = {}) {
  const { assignments = [], taskTypes = [] } = opts;

  const digIds = new Set(taskTypes
    .filter((t) => {
      const n = String(t.Task_Type_Name || "").toLowerCase().trim();
      return n.startsWith("excav") || n.startsWith("lay");
    })
    .map((t) => Number(t.Task_Type_ID)));

  let ends = null;
  for (const a of assignments) {
    if (!digIds.has(Number(a.Task_Type_ID))) continue;
    if (form.Submission_ID != null
      && Number(a.Submission_ID) !== Number(form.Submission_ID)) continue;
    /* The latest, where the dig is split across teams: the trench is
       not closed until the last of them has finished. */
    if (!ends || a.End_Date > ends) ends = a.End_Date;
  }

  if (ends) return { date: ends, why: "excavation and lay finishes", kind: "dig" };
  if (form.Preferred_Date) {
    return { date: form.Preferred_Date, why: "the visit is booked for", kind: "preferred" };
  }
  return null;
}

/* The day after a date. Nothing may go live *on* the day the trench
   closes, so the date offered is the next one. */
export function dayAfter(date) {
  const [y, m, d] = String(date || "").slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  const x = new Date(y, m - 1, d, 12);
  x.setDate(x.getDate() + 1);
  const p = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

export function validate(form, items, mode, opts = {}) {
  const out = [];
  const say = (row, text) => out.push({ row, text });

  if (!form.Project_ID) say(null, "Choose a project.");
  if (!form.Work_Type_ID) say(null, "Choose a work type.");
  if (!form.Preferred_Date) say(null, "Choose a preferred date.");
  if (!String(form.Contact_Name || "").trim()) say(null, "Give a contact name.");

  if (!items.length) {
    say(null, mode === "ColumnList" ? "Add at least one column."
      : mode === "PlotList" ? "Add at least one plot."
        : "Add at least one trench section.");
    return out;
  }

  /* ── Energisation dates ──

     Nothing may be switched on before the trench it runs in is closed:
     an energisation date on or before the floor is a request to
     energise a cable that is not in the ground.

     Checked per utility as well as per row, because a plot's gas and
     its electric can be asked for on different days and only one of
     them may be wrong. */
  const floor = energisationFloor(form, opts);
  items.forEach((r, i) => {
    const tooEarly = (date) => floor && date && date <= floor.date;
    if (tooEarly(r.Energisation_Date)) {
      say(i + 1, `Energisation date is on or before the day `
        + `${floor.why} (${floor.date}).`);
    }
    for (const u of r.Utilities || []) {
      if (tooEarly(u.Energisation_Date)) {
        say(i + 1, `${u.Utility || "A utility"} is asked to go live on or before `
          + `the day ${floor.why} (${floor.date}).`);
      }
    }
  });

  if (mode === "PlotList") {
    const seen = new Set();
    items.forEach((r, i) => {
      const plot = String(r.Plot ?? "").trim();
      if (!plot) { say(i + 1, "Pick a plot."); return; }
      /* A plot on two rows would be called off twice and visited twice. */
      if (seen.has(plot)) say(i + 1, `Plot ${plot} is on more than one row.`);
      seen.add(plot);
    });
  }

  if (mode === "ColumnList") {
    const seen = new Set();
    items.forEach((r, i) => {
      const id = r.Street_Light_ID;
      if (!id) { say(i + 1, "Pick a column."); return; }
      if (seen.has(String(id))) say(i + 1, `Column ${id} is on more than one row.`);
      seen.add(String(id));
    });
  }

  if (mode === "Span") {
    items.forEach((r, i) => {
      const from = String(r.From_Plot ?? "").trim();
      const to = String(r.To_Plot ?? "").trim();
      const plots = String(r.Plots ?? "").trim();
      /* Either a written description or both ends — one end alone
         describes nothing. */
      if (!plots) {
        if (!from || !to) say(i + 1, "Pick both a from and a to plot.");
        else if (from === to) say(i + 1, "From and to must be different plots.");
      }
    });
  }

  return out;
}

/* The rows as the endpoint wants them: the mode's own columns, in
   order, with blanks as nulls rather than empty strings. */
export function toItems(rows, mode) {
  const clean = (v) => (v === "" || v === undefined ? null : v);

  if (mode === "PlotList") {
    return rows.map((r) => ({
      Plot: String(r.Plot ?? "").trim(),
      Energisation_Date: clean(r.Energisation_Date),
    }));
  }
  if (mode === "ColumnList") {
    return rows.map((r) => ({
      Street_Light_ID: Number(r.Street_Light_ID) || null,
      Energisation_Date: clean(r.Energisation_Date),
    }));
  }
  return rows.map((r) => ({
    /* What was written, or the two ends joined — the original stores a
       description rather than a pair of ids, because that is how the
       work is described on site. */
    /* Each end named for what it is. "12 \u2013 A4" reads as two plots
       until somebody notices the letter; "Plot 12 to Span Node A4" says
       what was chosen, and a section can run either kind to either
       kind. Plot-to-plot keeps the plain "12 \u2013 16" it has always had,
       because that is how a run of plots is described on site. */
    Plots: String(r.Plots ?? "").trim() || (() => {
      const from = String(r.From_Plot ?? "").trim();
      const to = String(r.To_Plot ?? "").trim();
      if (!from && !to) return null;
      const bothPlots = (r.From_Kind ?? "plot") === "plot"
        && (r.To_Kind ?? "plot") === "plot";
      if (bothPlots) return [from, to].filter(Boolean).join(" \u2013 ") || null;
      const name = (v, kind) => (!v ? null
        : `${kind === "node" ? "Span Node" : "Plot"} ${v}`);
      return [name(from, r.From_Kind), name(to, r.To_Kind)]
        .filter(Boolean).join(" to ") || null;
    })(),
    D_or_P: clean(r.D_or_P),
    Energisation_Date: clean(r.Energisation_Date),
    Estimated_Length_m: r.Estimated_Length_m === "" || r.Estimated_Length_m == null
      ? null : Number(r.Estimated_Length_m),
  }));
}

/* ── The order the utility columns read in ──

   Gas, water, electric: the order the connections are usually made in,
   rather than the order the utilities happen to be numbered.

   Here rather than by changing Sort_Order in Admin, because that column
   orders utilities everywhere \u2014 the GIS layer list, the pipe size
   screens, the POC forms. This is a statement about these columns.

   And here rather than in a screen, because two screens draw this grid:
   the call-off tab on a project and the call-off page itself. Written
   once in each is how one of them gets changed and the other does not,
   which is exactly what happened the first time.

   Anything not named falls to the end in its own order, so a utility
   added later appears rather than disappearing. */
export const UTILITY_COLUMN_ORDER = ["Gas", "Water", "Electric"];

export function byUtilityColumn(a, b) {
  const ia = UTILITY_COLUMN_ORDER.indexOf(a.Utility);
  const ib = UTILITY_COLUMN_ORDER.indexOf(b.Utility);
  if (ia !== -1 || ib !== -1) {
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  }
  return (a.Sort_Order ?? 0) - (b.Sort_Order ?? 0);
}
