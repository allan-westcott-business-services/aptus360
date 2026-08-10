import { useState, useEffect, useMemo } from "react";
import { listCallOffs, createCallOff, deleteCallOff } from "../../api/calloffs.js";
import { openCallOff } from "../../lib/callOffIntent.js";
import { getLookups } from "../../api/lookups.js";
import { todayMs, toISO } from "../planning/timeline.js";
import { listPlots } from "../../api/plots.js";
import { getProject } from "../../api/projects.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import {
  validate, energisationFloor, dayAfter, toItems, servicePenalty,
  SERVICE_MIN_PLOTS, byUtilityColumn,
} from "./rules.js";
import PlotPicker from "../shared/PlotPicker.jsx";
import { parseIds } from "../poc/interimPlots.js";

/* Call-offs: asking for a piece of work to be done on a site.

   One submission says who is asking and when they want it; the rows
   underneath say which pieces of work. Which kind of row depends on the
   work type — a run of trench, a plot, or a lighting column — and the
   form follows that rather than showing all three and letting somebody
   fill in the wrong one. */

const BLANK_ROW = {
  Span: { Plots: "", From_Plot: "", To_Plot: "", D_or_P: "", Energisation_Date: "", Estimated_Length_m: "" },
  PlotList: { Plot: "", Energisation_Date: "" },
  ColumnList: { Street_Light_ID: "", Energisation_Date: "" },
};

/* Yes, no, or nobody has said. Three states rather than a checkbox,
   because "not asked" and "no" mean different things to whoever turns
   up on site. */
const YN = [["", "\u2014"], ["Yes", "Yes"], ["No", "No"]];

/* Which field is the id, and which is the number a person reads.

   The plots endpoint returns Plot_ID and Plot_Number; the GIS features
   use plot_id and plot_number for the same thing. Written once, at
   module scope, because ItemRows reading the lower case spelling while
   the picker above read both is exactly what emptied the trench section
   dropdowns: every plot rendered as an option with an undefined key and
   an empty label, so the list looked like a project with no plots. */
const plotIdOf = (p) => Number(p.Plot_ID ?? p.plot_id);
const plotLabelOf = (p) => String(p.Plot_Number ?? p.plot_number ?? plotIdOf(p));


export default function CallOffsTab({ projectId }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [lookups, setLookups] = useState(null);
  const [plots, setPlots] = useState([]);
  const [project, setProject] = useState(null);

  /* Today, as the picker wants it. Computed per render rather than
     held in state: a form left open overnight would otherwise still
     refuse this morning. */
  const todayISO = () => toISO(todayMs());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [penalty, setPenalty] = useState(null);

  const [f, setF] = useState({});
  const [items, setItems] = useState([]);

  /* Plots are chosen from a grid rather than a dropdown per row.

     A service call-off is usually a run of plots — a phase, a terrace —
     and picking twenty from twenty dropdowns is twenty chances to pick
     the same one twice. The same panel the interim POC application uses,
     so the two behave alike and the rules are shared rather than
     written again.

     Held as a comma-separated list, which is the shape the picker works
     in; the rows are derived from it so a plot cannot be selected in the
     grid and missing from what is saved. */
  const [plotIds, setPlotIds] = useState("");
  /* Energisation dates, keyed plot then utility — 0136.

     Gas, water and electric on one plot go live on different days, so a
     single date per plot cannot say what is being asked for. The shape
     is `{ [plotId]: { [utilityId]: "2026-08-21" } }`. */
  const [plotDates, setPlotDates] = useState({});

  async function load() {
    try {
      const [res, lk, plotRes, proj] = await Promise.all([
        listCallOffs(projectId),
        getLookups(),
        listPlots(projectId).catch(() => ({ rows: [] })),
        getProject(projectId).catch(() => null),
      ]);
      setRows(res.rows || []);
      setLookups(lk);
      setPlots(plotRes.rows || []);
      setProject(proj);
      setError("");
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  /* Only the types that can be called off. A type with no selection mode
     is internal — jointing — and has no form to fill in. */
  const workTypes = useMemo(
    () => (lookups?.workTypes || []).filter((w) => w.Selection_Mode),
    [lookups],
  );

  const mode = useMemo(() => workTypes
    .find((w) => Number(w.Work_Type_ID) === Number(f.Work_Type_ID))?.Selection_Mode ?? null,
  [workTypes, f.Work_Type_ID]);

  /* How a plot is identified, in one place.

     The picker had its own rule for this and so did the code reading the
     selection back — and when the two disagreed about which field was
     the id, every chip lit up and nothing was selected. One definition,
     passed to the picker and used here, so they cannot differ.

     Both spellings because the plots endpoint and the GIS features use
     different cases for the same field. */

  /* The chosen plots as rows, in the order they appear on the project
     rather than the order they were clicked — a call-off reads better
     as a list somebody can check off than as a record of the picking. */
  /* The utilities a call-off can ask about.

     Every utility the system knows, rather than only those already on
     the plot: a call-off is a request for work that has not happened
     yet, and a plot with no gas row today is exactly the plot somebody
     may be asking for gas on. Lighting is left out — a column has its
     own call-off mode and its own date. */
  /* The company a call-off is raised on behalf of: the customer branch
     the project belongs to.

     Read from the project rather than typed. It is not a fact about
     this call-off — it is a fact about the project, and a box somebody
     can type a different answer into is a box that will eventually
     disagree with the project it was raised under. */
  const branchName = useMemo(() => {
    if (!project?.Branch_ID) return "";
    const b = (lookups?.branches || [])
      .find((x) => Number(x.Branch_ID) === Number(project.Branch_ID));
    return b?.Branch_Dropdown || b?.Branch_Name || "";
  }, [project, lookups]);

  const utilities = useMemo(
    () => (lookups?.utilities || [])
      .filter((u) => !u.Is_Lighting)
      .slice()
      .sort(byUtilityColumn),
    [lookups],
  );

  const plotRows = useMemo(() => {
    const chosen = new Set(parseIds(plotIds));
    return plots
      .filter((p) => chosen.has(plotIdOf(p)))
      .map((p) => {
        const mine = plotDates[plotIdOf(p)] || {};
        return {
          Plot: plotLabelOf(p),
          /* The plot-level date is no longer set here. It stays in the
             schema as the fallback for call-offs raised before 0136,
             and writing it as well would give a plot two answers. */
          Energisation_Date: "",
          Utilities: utilities
            .filter((u) => mine[u.Utility_ID])
            .map((u) => ({
              Utility_ID: u.Utility_ID,
              Utility: u.Utility,
              Energisation_Date: mine[u.Utility_ID],
            })),
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotIds, plots, plotDates, utilities]);

  /* Whichever the mode collects. */
  const rowsForMode = mode === "PlotList" ? plotRows : items;

  const problems = useMemo(
    () => (open
      ? validate({ ...f, Project_ID: projectId }, rowsForMode, mode,
        /* No bookings exist yet on a call-off being raised, so the
           floor falls back to the preferred date — see
           energisationFloor. Passed all the same, so this call site
           does not have to know that. */
        { assignments: [], taskTypes: [] })
      : []),
    [open, f, rowsForMode, mode, projectId],
  );

  /* The earliest anything here may be asked to go live, and the date
     offered — the day after. One answer, used by the grid below for
     both its `min` and the value it fills in. */
  const energFloor = useMemo(
    () => energisationFloor({ ...f, Project_ID: projectId }, {}),
    [f, projectId],
  );
  const energDefault = energFloor ? dayAfter(energFloor.date) : "";

  function openForm() {
    setF({
      Work_Type_ID: workTypes[0]?.Work_Type_ID ?? "",
      /* Which utilities are in this call-off. Blank rather than every
         one ticked: a gang told "electric, gas and water" when only the
         gas is being laid has been told something wrong, and a form
         that guesses is a form whose answer nobody checks. */
      utility_ids: [],
      Contact_Name: user?.user_metadata?.full_name || user?.email?.split("@")[0] || "",
      Contact_Company: "",
      Preferred_Date: "",
      Alternative_Date: "",
      Obstruction_Free: "",
      Ground_Unmade: "",
      Line_Level_Required: "",
      Notes: "",
    });
    setItems([]);
    setPenalty(null);
    setOpen(true);
  }

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const setRow = (i, k) => (v) =>
    setItems((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  /* Rows start blank for the mode in hand. Changing the work type clears
     them, because a plot row is not a trench row with different labels
     and carrying one over would leave half a row behind. */
  useEffect(() => { setItems([]); setPlotIds(""); setPlotDates({}); }, [mode]);


  async function save(acceptedCharge) {
    if (problems.length) return;

    /* A service call-off for fewer than four plots costs the same visit
       as one for four. The charge is shown and accepted rather than
       applied quietly. Only when raising one: the visit has already
       been charged for by the time somebody is correcting the notes. */
    if (mode === "PlotList" && !acceptedCharge) {
      const p = servicePenalty(plotRows.length);
      if (p.applies) { setPenalty(p); return; }
    }

    setBusy(true);
    try {
      const res = await createCallOff(projectId, {
        ...f,
        Project_ID: projectId,
        Selection_Mode: mode,
        Site_Name: project?.Site_Name ?? null,
        Site_Address: project?.Site_Address ?? null,
        /* From the project, not the form: the box is read only
           and sending f.Contact_Company would save the empty
           string the blank form starts with. */
        Contact_Company: branchName || null,
        Contact_Phone: f.Contact_Phone || "N/A",
        Created_By: user?.email ?? null,
        items: toItems(rowsForMode, mode),
      });
      setOpen(false);
      setPenalty(null);
      await load();
      /* The endpoint saves the submission before its rows and says so if
         the rows failed — a submission with none is recoverable. */
      setError(res?.warning || "");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function remove(id) {
    if (!window.confirm("Delete this call-off and everything on it?")) return;
    try { await deleteCallOff(projectId, id); await load(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div className="co">
      <style>{CSS}</style>

      <div className="co-head">
        <div>
          <h3>Call-offs</h3>
          <p className="hint">
            Asking for work to be done on site. What each one lists depends
            on its work type.
          </p>
        </div>
        {!open && (
          <button className="btn accent" onClick={openForm}
            disabled={!workTypes.length}>New call-off</button>
        )}
      </div>

      {error && <p className="co-err">{error}</p>}

      {open && (
        <div className="co-form">
          <div className="co-grid">
            <div className="fld">
              <label htmlFor="co-wt">Work type</label>
              <select id="co-wt" value={f.Work_Type_ID}
                onChange={(e) => set("Work_Type_ID")(e.target.value)}>
                {workTypes.map((w) => (
                  <option key={w.Work_Type_ID} value={w.Work_Type_ID}>
                    {w.Work_Type_Name}
                  </option>
                ))}
              </select>
            </div>
            {/* More than one, because E/G in a single trench is the
                ordinary case rather than the exception. */}
            <div className="fld span2">
              <label>Utilities in this call-off</label>
              <div className="co-utils">
                {utilities.map((u) => (
                  <label className="co-util" key={u.Utility_ID}>
                    <input type="checkbox"
                      checked={f.utility_ids.includes(Number(u.Utility_ID))}
                      onChange={(e) => set("utility_ids")(e.target.checked
                        ? [...f.utility_ids, Number(u.Utility_ID)]
                        : f.utility_ids.filter((x) => x !== Number(u.Utility_ID)))} />
                    {u.Utility}
                  </label>
                ))}
              </div>
              {!f.utility_ids.length && (
                <p className="hint">none chosen yet</p>
              )}
            </div>

            <div className="fld">
              <label htmlFor="co-pref">Preferred date</label>
              {/* Today at the earliest. A call-off is a request to come
                  and do work; asking for last Tuesday is a typo rather
                  than an intention, and the picker refusing it is
                  cheaper than a planner noticing later.

                  min rather than validating on save: the days are greyed
                  out in the picker, so the rule is visible before it is
                  broken. */}
              <input id="co-pref" type="date" value={f.Preferred_Date}
                min={todayISO()}
                onChange={(e) => set("Preferred_Date")(e.target.value)} />
            </div>
            <div className="fld">
              <label htmlFor="co-alt">Alternative date</label>
              <input id="co-alt" type="date" value={f.Alternative_Date}
                min={f.Preferred_Date || todayISO()}
                onChange={(e) => set("Alternative_Date")(e.target.value)} />
            </div>
            <div className="fld">
              <label htmlFor="co-contact">Contact</label>
              <input id="co-contact" value={f.Contact_Name}
                onChange={(e) => set("Contact_Name")(e.target.value)} />
            </div>
            <div className="fld">
              <label htmlFor="co-company">Company</label>
              <input id="co-company" value={branchName} readOnly
                title="The customer branch this project belongs to" />
              {!branchName && (
                <p className="hint">no customer branch on this project</p>
              )}
            </div>
          </div>

          {/* What the gang will find when they arrive. Asked rather than
              assumed: a wasted visit costs more than three questions. */}
          <div className="co-grid">
            {[
              ["Obstruction_Free", "Obstruction free"],
              ["Ground_Unmade", "Ground unmade"],
              ["Line_Level_Required", "Line and level required"],
            ].map(([k, label]) => (
              <div className="fld" key={k}>
                <label htmlFor={`co-${k}`}>{label}</label>
                <select id={`co-${k}`} value={f[k]}
                  onChange={(e) => set(k)(e.target.value)}>
                  {YN.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </div>
            ))}
          </div>

          {mode === "PlotList" ? (
            <>
              <PlotPicker plots={plots} value={plotIds} onChange={setPlotIds}
                idOf={plotIdOf} labelOf={plotLabelOf}
                label="Plots on this call-off"
                note={`Fewer than ${SERVICE_MIN_PLOTS} carries a charge.`} />

              {/* A date per plot, for the ones that need one.

                  Most call-offs energise together and leave these blank;
                  a phase handed over in stages does not. Shown only for
                  the plots chosen, so the list is as long as the job. */}
              {plotRows.length > 0 && (
                <details className="co-dates">
                  <summary>Energisation dates &mdash; optional</summary>
                  {/* A date per utility per plot, because they do not go
                      live together: the electric weeks ahead so the site
                      has power, the gas when the meter is fitted.

                      Left blank means no date is being asked for, which
                      is what most call-offs want — the row only exists
                      once somebody types one. */}
                  <p className="co-date-note">
                    Gas, water and electric can go live on different days.
                    {energFloor && (
                      <> Nothing before {energDefault}, the day after{" "}
                        {energFloor.why}.</>
                    )}
                  </p>
                  <table className="co-date-table">
                    <thead>
                      <tr>
                        <th>Plot</th>
                        {utilities.map((u) => (
                          <th key={u.Utility_ID}>
                            <span className="co-date-dot"
                              style={{ background: u.Colour || "#94a3b8" }} />
                            {u.Utility}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {plots
                        .filter((p) => parseIds(plotIds).includes(plotIdOf(p)))
                        .map((p) => (
                          <tr key={plotIdOf(p)}>
                            <th scope="row">{plotLabelOf(p)}</th>
                            {utilities.map((u) => (
                              <td key={u.Utility_ID}>
                                <input type="date"
                                  aria-label={`${plotLabelOf(p)} ${u.Utility} energisation`}
                                  /* Nothing on or before the day the
                                     trench closes. The picker says so
                                     rather than the form saying it
                                     afterwards. */
                                  min={energDefault || undefined}
                                  value={plotDates[plotIdOf(p)]?.[u.Utility_ID] ?? ""}
                                  onFocus={(e) => {
                                    /* Filled in on first use rather
                                       than up front: a grid that opens
                                       with a date in every cell is a
                                       grid that says every utility has
                                       been asked for, when nobody has
                                       asked for any of them yet. */
                                    if (e.target.value || !energDefault) return;
                                    setPlotDates((d) => ({
                                      ...d,
                                      [plotIdOf(p)]: {
                                        ...(d[plotIdOf(p)] || {}),
                                        [u.Utility_ID]: energDefault,
                                      },
                                    }));
                                  }}
                                  onChange={(e) => setPlotDates((d) => ({
                                    ...d,
                                    [plotIdOf(p)]: {
                                      ...(d[plotIdOf(p)] || {}),
                                      [u.Utility_ID]: e.target.value,
                                    },
                                  }))} />
                              </td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </details>
              )}
            </>
          ) : (
            <ItemRows mode={mode} items={items} plots={plots}
              setRow={setRow}
              onAdd={() => setItems((rs) => [...rs, { ...BLANK_ROW[mode] }])}
              onRemove={(i) => setItems((rs) => rs.filter((_, j) => j !== i))} />
          )}

          <div className="fld">
            <label htmlFor="co-notes">Notes</label>
            <textarea id="co-notes" rows={2} value={f.Notes}
              onChange={(e) => set("Notes")(e.target.value)} />
          </div>

          {/* Everything wrong at once, so eight problems are not found
              across eight attempts to save. */}
          {problems.length > 0 && (
            <ul className="co-problems">
              {problems.map((p, i) => (
                <li key={i}>{p.row ? `Row ${p.row}: ` : ""}{p.text}</li>
              ))}
            </ul>
          )}

          {penalty && (
            <div className="co-penalty">
              <strong>
                {`${plotRows.length} plot${plotRows.length === 1 ? "" : "s"} \u2014 `}
                {`${penalty.short} under the minimum of ${SERVICE_MIN_PLOTS}.`}
              </strong>
              <p>
                {`A charge of \u00a3${penalty.charge} applies. Add more plots, `}
                or accept the charge to carry on.
              </p>
              <div className="co-actions">
                <button className="btn ghost" onClick={() => setPenalty(null)}>
                  Add more plots
                </button>
                <button className="btn accent" disabled={busy}
                  onClick={() => save(true)}>
                  {`Accept \u00a3${penalty.charge} and submit`}
                </button>
              </div>
            </div>
          )}

          <div className="co-actions">
            <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn accent"
              disabled={busy || problems.length > 0 || !!penalty}
              onClick={() => save(false)}>
              {busy ? "Saving\u2026" : "Submit call-off"}
            </button>
          </div>
        </div>
      )}

      {!rows.length && !open && (
        <p className="hint co-none">No call-offs on this project yet.</p>
      )}

      {rows.map((r) => (
        <div className="co-row" key={r.Submission_ID}>
          {/* The row opens the call-off. A button rather than a div with
              a click on it, so it is reachable by keyboard and reads as
              something that can be opened. */}
          <button className="co-row-main"
            onClick={() => openCallOff({ submissionId: r.Submission_ID })}
            title={`Open call-off #${r.Submission_ID}`}>
            <strong>#{r.Submission_ID}</strong>
            <span className="co-wt">{r.Work_Type?.Work_Type_Name ?? "\u2014"}</span>
            <span className={`co-status s-${String(r.Status || "").replace(/\W+/g, "").toLowerCase()}`}>
              {r.Status}
            </span>
            <span className="co-when">
              {r.Preferred_Date}
              {r.Alternative_Date ? ` (or ${r.Alternative_Date})` : ""}
            </span>
            <span className="co-count">
              {`${r.items?.length ?? 0} ${
                r.Selection_Mode === "ColumnList" ? "column" : r.Selection_Mode === "Span" ? "section" : "plot"
              }${(r.items?.length ?? 0) === 1 ? "" : "s"}`}
            </span>
            {/* What it covers, where somebody looking down the list
                expects to see it. */}
            <span className="co-utils-chips">
              {(r.utility_ids || []).map((id) => {
                const u = utilities.find((x) => Number(x.Utility_ID) === Number(id));
                return u ? (
                  <span className="co-uchip" key={id}>
                    {/* A dot in the utility's colour rather than a pill
                        filled with it. The utility colours are chosen to
                        be told apart on a drawing, and at that strength
                        they shout across a list \u2014 and white on the
                        water green is barely readable. */}
                    <i style={{ background: u.Colour || "var(--muted)" }} />
                    {u.Utility}
                  </span>
                ) : null;
              })}
            </span>
          </button>

          <div className="co-row-acts">
            {/* To the call-off page, not to a form here. That page has
                the team assignments, the trench table and the status
                trail on it \u2014 this tab is a list. */}
            <button className="btn ghost sm"
              onClick={() => openCallOff({ submissionId: r.Submission_ID })}>
              Open
            </button>
            <button className="btn delete sm" onClick={() => remove(r.Submission_ID)}>
              Delete
            </button>
          </div>
          {!!r.items?.length && (
            <div className="co-items">
              {r.items.map((it, i) => (
                <span className="co-chip" key={i}>
                  {r.Selection_Mode === "PlotList" ? it.Plot
                    : r.Selection_Mode === "ColumnList" ? `Col ${it.Street_Light_ID}`
                      : it.Plots}
                  {it.Energisation_Date ? ` \u00b7 ${it.Energisation_Date}` : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* The rows, which are a different thing in each mode.

   Kept as one component with three shapes rather than three components:
   the add, remove and energisation-date behaviour is identical, and only
   the middle column differs. */
function ItemRows({ mode, items, plots, setRow, onAdd, onRemove }) {
  if (!mode) return null;

  const label = mode === "ColumnList" ? "Columns"
    : mode === "PlotList" ? "Plots" : "Trench sections";

  return (
    <div className="co-items-edit">
      <div className="co-items-head">
        <strong>{label}</strong>
        <button className="btn ghost sm" onClick={onAdd}>Add row</button>
      </div>

      {!items.length && (
        <p className="hint">Nothing added yet.</p>
      )}

      {items.map((r, i) => (
        <div className="co-item-row" key={i}>
          <span className="co-n">{i + 1}</span>

          {mode === "PlotList" && (
            <select value={r.Plot} onChange={(e) => setRow(i, "Plot")(e.target.value)}>
              <option value="">Choose a plot…</option>
              {plots.map((p) => (
                <option key={plotIdOf(p)} value={plotLabelOf(p)}>{plotLabelOf(p)}</option>
              ))}
            </select>
          )}

          {mode === "ColumnList" && (
            <input placeholder="Column id" value={r.Street_Light_ID}
              onChange={(e) => setRow(i, "Street_Light_ID")(e.target.value)} />
          )}

          {mode === "Span" && (
            <>
              <select value={r.From_Plot}
                onChange={(e) => setRow(i, "From_Plot")(e.target.value)}>
                <option value="">From…</option>
                {plots.map((p) => (
                  <option key={plotIdOf(p)} value={plotLabelOf(p)}>{plotLabelOf(p)}</option>
                ))}
              </select>
              <select value={r.To_Plot}
                onChange={(e) => setRow(i, "To_Plot")(e.target.value)}>
                <option value="">To…</option>
                {plots.map((p) => (
                  <option key={plotIdOf(p)} value={plotLabelOf(p)}>{plotLabelOf(p)}</option>
                ))}
              </select>
              <select value={r.D_or_P} onChange={(e) => setRow(i, "D_or_P")(e.target.value)}>
                <option value="">D/P</option>
                <option value="D">D</option>
                <option value="P">P</option>
              </select>
              <input type="number" placeholder="m" className="co-len"
                value={r.Estimated_Length_m}
                onChange={(e) => setRow(i, "Estimated_Length_m")(e.target.value)} />
            </>
          )}

          <input type="date" value={r.Energisation_Date}
            title="Energisation date"
            onChange={(e) => setRow(i, "Energisation_Date")(e.target.value)} />

          <button className="btn delete sm" onClick={() => onRemove(i)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

const CSS = `
.co-head { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
.co-head > div { flex: 1; }
.co-head h3 { margin: 0 0 3px; font-size: 16px; }
.co-err { color: #b91c1c; font-size: 12.5px; font-weight: 600; margin: 0 0 12px; }
.co-none { margin: 20px 0; }
.co-form { border: 1px solid var(--border); border-radius: 10px; padding: 16px;
  background: var(--white); margin-bottom: 18px; }
.co-utils { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 4px 0 2px; }
.co-util { display: inline-flex; align-items: center; gap: 6px; font-size: 13px;
  cursor: pointer; }
.co-util input { cursor: pointer; }

.co-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px; margin-bottom: 12px; }
.co-items-edit { border-top: 1px solid var(--border); padding-top: 12px;
  margin: 6px 0 12px; }
.co-items-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.co-items-head strong { flex: 1; font-size: 12.5px; }
.co-item-row { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; }
.co-n { width: 20px; font: 700 11px inherit; color: var(--muted); }
.co-item-row select, .co-item-row input { font: 500 12px inherit; padding: 5px 7px;
  border: 1px solid var(--border); border-radius: 6px; }
.co-len { width: 74px; }
.co-x { background: none; border: none; cursor: pointer; color: var(--muted);
  font-size: 17px; line-height: 1; padding: 0 4px; }
.co-x:hover { color: #b91c1c; }
.co-problems { margin: 0 0 12px; padding-left: 18px; color: #b45309;
  font-size: 12px; font-weight: 600; }
.co-penalty { border: 1px solid #fcd34d; background: #fffbeb; border-radius: 8px;
  padding: 12px 14px; margin-bottom: 12px; }
.co-penalty strong { display: block; color: #92400e; font-size: 13px; }
.co-penalty p { margin: 5px 0 10px; font-size: 12px; color: #92400e; }
.co-dates { margin: 0 0 12px; }
.co-dates summary { cursor: pointer; font: 600 12px inherit; color: var(--accent); }
.co-date-note { margin: 4px 0 8px; font-size: 11px; color: var(--muted); }
.co-date-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.co-date-table th { text-align: left; font-weight: 700; padding: 4px 8px 4px 0;
  white-space: nowrap; }
.co-date-table thead th { font-size: 10px; text-transform: uppercase;
  letter-spacing: .05em; color: var(--muted); border-bottom: 1px solid var(--border); }
.co-date-table tbody th { font-weight: 600; }
.co-date-table td { padding: 3px 8px 3px 0; }
.co-date-table input { width: 100%; min-width: 128px; }
.co-date-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%;
  margin-right: 5px; vertical-align: middle; }
.co-date-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 7px; margin-top: 9px; }
.co-date { display: flex; align-items: center; gap: 7px; font: 600 11.5px inherit; }
.co-date > span { width: 40px; color: var(--muted); }
.co-date input { flex: 1; font: 500 11.5px inherit; padding: 4px 6px;
  border: 1px solid var(--border); border-radius: 5px; }
.co-actions { display: flex; justify-content: flex-end; gap: 9px; }
.co-editing { font-size: 12.5px; color: var(--accent); background: var(--accent-light);
  border-radius: 8px; padding: 8px 10px; margin: 0 0 12px; }
.co-row-acts { display: flex; gap: 6px; align-items: center; padding-right: 10px; }
.co-utils-chips { display: inline-flex; gap: 4px; }
.co-uchip { display: inline-flex; align-items: center; gap: 4px;
  font: 600 11px inherit; color: var(--muted); }
.co-uchip i { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }

.co-row { border: 1px solid var(--border); border-radius: 9px;
  margin-bottom: 9px; background: var(--white); }
/* The row splits into the part that opens it and the part that acts on
   it, so Delete is not inside the thing that opens the call-off. */
.co-row > .co-row-main, .co-row > .co-row-acts { display: inline-flex; }
.co-row { display: flex; align-items: flex-start; flex-wrap: wrap; }
.co-row-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px;
  font-size: 12.5px; text-align: left; padding: 11px 14px; border: 0;
  background: none; font-family: inherit; color: inherit; cursor: pointer;
  border-radius: 9px; }
.co-row-main:hover { background: var(--bg); }
.co-row-main:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.co-row-acts { align-self: center; }
.co-items { flex-basis: 100%; padding: 0 14px 11px; }
.co-wt { font-weight: 600; }
.co-status { font: 700 10.5px inherit; padding: 2px 8px; border-radius: 20px;
  background: var(--bg); color: var(--muted); }
.co-status.s-pendingreview { background: #fef3c7; color: #92400e; }
.co-when { color: var(--muted); }
.co-count { margin-left: auto; color: var(--muted); }
.co-items { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
.co-chip { font: 600 11px inherit; padding: 2px 8px; border-radius: 5px;
  background: var(--bg); border: 1px solid var(--border); }
`;
