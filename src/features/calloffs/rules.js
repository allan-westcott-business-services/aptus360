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
export function validate(form, items, mode) {
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

  /* An energisation date before the visit is a request to switch
     something on before it exists. */
  items.forEach((r, i) => {
    if (r.Energisation_Date && form.Preferred_Date
      && r.Energisation_Date < form.Preferred_Date) {
      say(i + 1, "Energisation date is before the preferred date.");
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
    Plots: String(r.Plots ?? "").trim()
      || [r.From_Plot, r.To_Plot].filter(Boolean).join(" \u2013 ") || null,
    D_or_P: clean(r.D_or_P),
    Energisation_Date: clean(r.Energisation_Date),
    Estimated_Length_m: r.Estimated_Length_m === "" || r.Estimated_Length_m == null
      ? null : Number(r.Estimated_Length_m),
  }));
}
