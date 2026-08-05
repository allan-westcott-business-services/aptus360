import { useState, useEffect, useMemo } from "react";
import { listCallOffs, createCallOff, deleteCallOff } from "../../api/calloffs.js";
import { getLookups } from "../../api/lookups.js";
import { listPlots } from "../../api/plots.js";
import { getProject } from "../../api/projects.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { validate, toItems, servicePenalty, SERVICE_MIN_PLOTS } from "./rules.js";

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

export default function CallOffsTab({ projectId }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [lookups, setLookups] = useState(null);
  const [plots, setPlots] = useState([]);
  const [project, setProject] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [penalty, setPenalty] = useState(null);

  const [f, setF] = useState({});
  const [items, setItems] = useState([]);

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

  const problems = useMemo(
    () => (open ? validate({ ...f, Project_ID: projectId }, items, mode) : []),
    [open, f, items, mode, projectId],
  );

  function openForm() {
    setF({
      Work_Type_ID: workTypes[0]?.Work_Type_ID ?? "",
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
  useEffect(() => { setItems([]); }, [mode]);

  async function save(acceptedCharge) {
    if (problems.length) return;

    /* A service call-off for fewer than four plots costs the same visit
       as one for four. The charge is shown and accepted rather than
       applied quietly. */
    if (mode === "PlotList" && !acceptedCharge) {
      const p = servicePenalty(items.length);
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
        Contact_Phone: f.Contact_Phone || "N/A",
        Created_By: user?.email ?? null,
        items: toItems(items, mode),
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
            <div className="fld">
              <label htmlFor="co-pref">Preferred date</label>
              <input id="co-pref" type="date" value={f.Preferred_Date}
                onChange={(e) => set("Preferred_Date")(e.target.value)} />
            </div>
            <div className="fld">
              <label htmlFor="co-alt">Alternative date</label>
              <input id="co-alt" type="date" value={f.Alternative_Date}
                onChange={(e) => set("Alternative_Date")(e.target.value)} />
            </div>
            <div className="fld">
              <label htmlFor="co-contact">Contact</label>
              <input id="co-contact" value={f.Contact_Name}
                onChange={(e) => set("Contact_Name")(e.target.value)} />
            </div>
            <div className="fld">
              <label htmlFor="co-company">Company</label>
              <input id="co-company" value={f.Contact_Company}
                onChange={(e) => set("Contact_Company")(e.target.value)} />
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

          <ItemRows mode={mode} items={items} plots={plots}
            setRow={setRow}
            onAdd={() => setItems((rs) => [...rs, { ...BLANK_ROW[mode] }])}
            onRemove={(i) => setItems((rs) => rs.filter((_, j) => j !== i))} />

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
                {`${items.length} plot${items.length === 1 ? "" : "s"} \u2014 `}
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
          <div className="co-row-main">
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
            <button className="btn ghost sm" onClick={() => remove(r.Submission_ID)}>
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
                <option key={p.plot_id} value={p.plot_number}>{p.plot_number}</option>
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
                  <option key={p.plot_id} value={p.plot_number}>{p.plot_number}</option>
                ))}
              </select>
              <select value={r.To_Plot}
                onChange={(e) => setRow(i, "To_Plot")(e.target.value)}>
                <option value="">To…</option>
                {plots.map((p) => (
                  <option key={p.plot_id} value={p.plot_number}>{p.plot_number}</option>
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

          <button className="co-x" onClick={() => onRemove(i)} aria-label="Remove row">
            &times;
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
.co-actions { display: flex; justify-content: flex-end; gap: 9px; }
.co-row { border: 1px solid var(--border); border-radius: 9px; padding: 11px 14px;
  margin-bottom: 9px; background: var(--white); }
.co-row-main { display: flex; align-items: center; gap: 12px; font-size: 12.5px; }
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
