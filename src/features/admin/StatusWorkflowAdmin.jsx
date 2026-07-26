import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { adminList, adminCreate, adminDelete } from "../../api/admin.js";

/* Status workflow: which statuses may follow which, per quote type.

   The original app kept this map in JavaScript (STATUS_RULES) and only the
   guards in the database, so adding a status meant a deploy. Here both are
   tables, and this grid edits them. */
export default function StatusWorkflowAdmin() {
  const [statuses, setStatuses] = useState([]);
  const [quoteTypes, setQuoteTypes] = useState([]);
  const [transitions, setTransitions] = useState([]);
  const [guards, setGuards] = useState([]);
  const [designStatuses, setDesignStatuses] = useState([]);
  const [qt, setQt] = useState("");           // "" = rules for all quote types
  const [from, setFrom] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);

  async function load() {
    try {
      const [st, q, tr, gd, ds] = await Promise.all([
        adminList("Project_Status"), adminList("Quote_Type"),
        adminList("Status_Transition"), adminList("Status_Transition_Guard"),
        adminList("Design_Status"),
      ]);
      setStatuses((st.rows || []).filter((s) => s.Stage === "Tender"));
      setQuoteTypes(q.rows || []);
      setTransitions(tr.rows || []);
      setGuards(gd.rows || []);
      setDesignStatuses(ds.rows || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const ordered = useMemo(
    () => [...statuses].sort((a, b) => (a.Sort_Order ?? 0) - (b.Sort_Order ?? 0)),
    [statuses]
  );

  useEffect(() => {
    if (!from && ordered.length) setFrom(String(ordered[0].Project_Status_ID));
  }, [ordered, from]);

  const rowFor = (toId) =>
    transitions.find(
      (t) =>
        String(t.From_Status_ID) === String(from) &&
        String(t.To_Status_ID) === String(toId) &&
        String(t.Quote_Type_ID ?? "") === String(qt)
    );

  async function toggle(toId) {
    const key = `${from}:${toId}`;
    setBusy(key);
    try {
      const existing = rowFor(toId);
      if (existing) {
        await adminDelete("Status_Transition", existing.Transition_ID, "Transition_ID");
        setTransitions((t) => t.filter((x) => x.Transition_ID !== existing.Transition_ID));
      } else {
        const created = await adminCreate("Status_Transition", {
          From_Status_ID: Number(from),
          To_Status_ID: Number(toId),
          Quote_Type_ID: qt === "" ? null : Number(qt),
          Is_Active: true,
        });
        setTransitions((t) => [...t, created]);
      }
      setError("");
    } catch (e) { setError(e.message); await load(); }
    finally { setBusy(null); }
  }

  const statusName = (id) =>
    statuses.find((s) => String(s.Project_Status_ID) === String(id))?.Status ?? `#${id}`;
  const designName = (id) =>
    designStatuses.find((d) => String(d.Design_Status_ID) === String(id))?.Status ?? `#${id}`;

  async function removeGuard(g) {
    if (!window.confirm("Delete this guard?")) return;
    try {
      await adminDelete("Status_Transition_Guard", g.Guard_ID, "Guard_ID");
      setGuards((x) => x.filter((y) => y.Guard_ID !== g.Guard_ID));
    } catch (e) { setError(e.message); }
  }

  if (loading) return <div className="loading">Loading workflow&hellip;</div>;

  const allowedCount = ordered.filter((s) => rowFor(s.Project_Status_ID)).length;

  return (
    <div>
      <style>{CSS}</style>
      <h2 className="admin-title">Status Workflow</h2>
      {error && <Banner kind="error">{error}</Banner>}

      <div className="wf-pickers">
        <div className="fld">
          <label>Quote type</label>
          <select value={qt} onChange={(e) => setQt(e.target.value)}>
            <option value="">All quote types</option>
            {quoteTypes.map((q) => (
              <option key={q.Quote_Type_ID} value={q.Quote_Type_ID}>{q.Quote_Type}</option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label>When the status is</label>
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {ordered.map((s) => (
              <option key={s.Project_Status_ID} value={s.Project_Status_ID}>{s.Status}</option>
            ))}
          </select>
        </div>
        <p className="wf-note">
          {qt === ""
            ? "Rules here apply to every quote type unless that type has its own."
            : `Rules for ${quoteTypes.find((q) => String(q.Quote_Type_ID) === qt)?.Quote_Type} only — these replace the general rules.`}
        </p>
      </div>

      <p className="panel-label">
        Can move to &mdash; {allowedCount} of {ordered.length} permitted
      </p>

      <div className="wf-grid">
        {ordered.map((s) => {
          const on = !!rowFor(s.Project_Status_ID);
          const self = String(s.Project_Status_ID) === String(from);
          const key = `${from}:${s.Project_Status_ID}`;
          return (
            <button
              key={s.Project_Status_ID}
              className={`wf-cell${on ? " on" : ""}${self ? " self" : ""}`}
              disabled={self || busy === key}
              onClick={() => toggle(s.Project_Status_ID)}
              title={self ? "A status can't transition to itself" : undefined}
            >
              <span className={on ? "box on" : "box"}>{on ? "\u2713" : ""}</span>
              <span className="wf-name">{s.Status}</span>
              {s.Is_Terminal && <span className="wf-term">terminal</span>}
            </button>
          );
        })}
      </div>

      <p className="panel-label wf-guards-label">
        Guards &mdash; extra conditions checked on top of the rules above
      </p>
      {guards.length === 0 ? (
        <div className="empty">No guards defined.</div>
      ) : (
        <ul className="wf-guards">
          {guards.map((g) => (
            <li key={g.Guard_ID}>
              <div>
                <strong>{statusName(g.Target_Status_ID)}</strong>
                <span className="wf-gtype">{g.Guard_Type}</span>
                <span className="wf-gids">
                  {(g.Condition_Status_IDs || []).map(designName).join(", ") || "\u2014"}
                </span>
                {g.Description && <p className="wf-gdesc">{g.Description}</p>}
              </div>
              <button className="cmt-del" onClick={() => removeGuard(g)} title="Delete">&#10005;</button>
            </li>
          ))}
        </ul>
      )}
      <p className="wf-foot">
        Changes take effect immediately &mdash; the database rejects any transition not
        listed here, so the rules hold for the API and bulk edits too.
      </p>
    </div>
  );
}

const CSS = `
.wf-pickers { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap;
  border: 1px solid var(--border); border-radius: var(--radius); background: #f8f9fb;
  padding: 14px; margin-bottom: 18px; }
.wf-pickers .fld { min-width: 200px; }
.wf-note { font-size: 11.5px; color: var(--muted); margin: 0; flex: 1; min-width: 240px; }
.wf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(212px, 1fr)); gap: 6px; }
.wf-cell { display: flex; align-items: center; gap: 9px; background: var(--white);
  border: 1px solid var(--border); border-radius: 7px; padding: 9px 11px; cursor: pointer;
  font: 500 13px inherit; color: var(--text); text-align: left; }
.wf-cell:hover:not(:disabled) { background: var(--bg); }
.wf-cell.on { background: #ecfdf5; border-color: #a7f3d0; }
.wf-cell.self { opacity: .4; cursor: not-allowed; }
.wf-cell:disabled { cursor: not-allowed; }
.box { flex: none; width: 19px; height: 19px; border-radius: 5px; border: 1.5px solid var(--border);
  background: var(--white); display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: transparent; }
.box.on { background: #059669; border-color: #059669; color: #fff; }
.wf-name { flex: 1; }
.wf-term { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  color: var(--muted); background: var(--bg); border: 1px solid var(--border);
  border-radius: 4px; padding: 1px 5px; }
.wf-guards-label { margin-top: 26px !important; }
.wf-guards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.wf-guards li { display: flex; align-items: flex-start; gap: 10px; border: 1px solid var(--border);
  border-radius: var(--radius); padding: 10px 12px; font-size: 12.5px; }
.wf-guards li > div { flex: 1; }
.wf-gtype { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; color: var(--accent);
  background: var(--accent-light); border-radius: 4px; padding: 1px 6px; margin: 0 7px; }
.wf-gids { color: var(--muted); font-size: 11.5px; }
.wf-gdesc { margin: 4px 0 0; font-size: 11.5px; color: var(--muted); }
.wf-foot { font-size: 11.5px; color: var(--muted); margin-top: 16px; }
.empty { text-align: center; padding: 26px; color: var(--muted); font-size: 12.5px;
  border: 1px dashed var(--border); border-radius: var(--radius); }
`;
