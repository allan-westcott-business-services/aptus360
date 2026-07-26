import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { getLookups } from "../../api/lookups.js";
import { listPoc, createPoc, updatePoc, deletePoc } from "../../api/poc.js";
import { utilityById, UTILITIES } from "../../lib/utilities.js";
import { useTableLayout, TABLE_CSS } from "../../lib/useTableLayout.js";

/* POC applications, following the original app.

   The important behaviour is the fan-out: selecting three operators
   creates three applications, not one. They quote separately and move at
   different speeds, so each needs its own status, reference and dates. */

const POC_TYPES = ["Budget", "Firm", "Interim"];

const COLS = [
  { key: "utility",  label: "Utility",   width: 160 },
  { key: "operator", label: "Operator",  width: 150 },
  { key: "type",     label: "Type",      width: 96 },
  { key: "status",   label: "Status",    width: 130 },
  { key: "applied",  label: "Applied",   width: 118 },
  { key: "expected", label: "Expected",  width: 118 },
  { key: "kva",      label: "kVA",       width: 84, align: "right" },
  { key: "plots",    label: "Plots",     width: 74, align: "right" },
  { key: "quoteref", label: "Quote ref", width: 140 },
  { key: "cost",     label: "Est. cost", width: 110, align: "right" },
  { key: "act",      label: "",          width: 42, align: "center" },
];

const fmt = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "\u2014");
const money = (n) => (n == null || n === "" ? "\u2014" : `£${Number(n).toLocaleString()}`);

export default function POCApplicationsTab({ projectId }) {
  const layout = useTableLayout("poc", COLS);
  const [lookups, setLookups] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState(blank());

  function blank() {
    return {
      Utility_ID: "", idno_ids: [], POC_Type: "Firm", POC_Status_ID: "",
      Application_Date: "", Expected_Rx_Date: "", Applicant_Person_ID: "",
      Business_Address: "", Plot_Count: "", Requested_kVA: "", Contingency_Load: "",
      Quote_Reference: "", Quote_Date: "", Valid_Until_Date: "",
      Connection_Type: "", Distance_m: "", Estimated_Cost: "", Notes: "",
    };
  }

  async function load() {
    try {
      const [lk, res] = await Promise.all([getLookups(), listPoc(projectId)]);
      setLookups(lk);
      setRows(res.rows || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const idnoName = (id) => (lookups?.idnos || []).find((x) => x.IDNO_ID === id)?.IDNO_Name ?? "\u2014";
  const statusName = (id) => (lookups?.pocStatuses || []).find((x) => x.POC_Status_ID === id)?.POC_Status ?? "\u2014";

  const grouped = useMemo(() => {
    const g = {};
    rows.forEach((r) => (g[r.Utility_ID] = g[r.Utility_ID] || []).push(r));
    return g;
  }, [rows]);

  async function save() {
    if (!f.Utility_ID) return setError("Choose a utility.");
    if (!f.idno_ids.length) return setError("Select at least one network operator.");
    setSaving(true);
    try {
      const res = await createPoc(projectId, {
        ...f,
        Utility_ID: Number(f.Utility_ID),
        POC_Status_ID: f.POC_Status_ID ? Number(f.POC_Status_ID) : null,
        Applicant_Person_ID: f.Applicant_Person_ID ? Number(f.Applicant_Person_ID) : null,
      });
      const n = res.rows?.length ?? f.idno_ids.length;
      setFlash(`${n} application${n === 1 ? "" : "s"} created \u2014 one per operator`);
      setTimeout(() => setFlash(""), 3000);
      setF(blank());
      setShowForm(false);
      await load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function patch(row, key, value) {
    setRows((r) => r.map((x) => (x.POC_Application_ID === row.POC_Application_ID ? { ...x, [key]: value } : x)));
    try { await updatePoc(projectId, row.POC_Application_ID, { [key]: value }); }
    catch (e) { setError(e.message); await load(); }
  }

  async function remove(row) {
    if (!window.confirm(`Delete the ${idnoName(row.IDNO_ID)} application?`)) return;
    try {
      await deletePoc(projectId, row.POC_Application_ID);
      setRows((r) => r.filter((x) => x.POC_Application_ID !== row.POC_Application_ID));
    } catch (e) { setError(e.message); }
  }

  if (loading) return <div className="loading">Loading applications&hellip;</div>;

  const toggleIdno = (id) =>
    setF((p) => ({
      ...p,
      idno_ids: p.idno_ids.includes(id) ? p.idno_ids.filter((x) => x !== id) : [...p.idno_ids, id],
    }));

  return (
    <div>
      <style>{CSS}</style>

      <div className="tab-head">
        <div>
          <h3>POC applications <span className="count">{rows.length}</span></h3>
          <p className="tab-sub">
            Point of connection applications, one per network operator.
          </p>
        </div>
        <button className="btn accent" onClick={() => setShowForm((x) => !x)}>
          {showForm ? "Cancel" : "+ New application"}
        </button>
      </div>

      {flash && <Banner kind="ok">{flash}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}

      {showForm && (
        <div className="poc-form">
          <p className="panel-label">New application</p>
          <div className="poc-grid">
            <div className="fld">
              <label>Utility <span className="req">*</span></label>
              <select value={f.Utility_ID} onChange={(e) => set("Utility_ID")(e.target.value)}>
                <option value="">&mdash; Select &mdash;</option>
                {UTILITIES.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="fld">
              <label>Type</label>
              <select value={f.POC_Type} onChange={(e) => set("POC_Type")(e.target.value)}>
                {POC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="fld">
              <label>Status</label>
              <select value={f.POC_Status_ID} onChange={(e) => set("POC_Status_ID")(e.target.value)}>
                <option value="">&mdash;</option>
                {(lookups.pocStatuses || []).map((s) => (
                  <option key={s.POC_Status_ID} value={s.POC_Status_ID}>{s.POC_Status}</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label>Applicant</label>
              <select value={f.Applicant_Person_ID} onChange={(e) => set("Applicant_Person_ID")(e.target.value)}>
                <option value="">&mdash;</option>
                {(lookups.people || []).map((p) => (
                  <option key={p.Person_ID} value={p.Person_ID}>{p.Person_Name}</option>
                ))}
              </select>
            </div>

            <div className="fld span4">
              <label>Network operators <span className="req">*</span></label>
              <div className="op-picker">
                {(lookups.idnos || []).map((i) => (
                  <label key={i.IDNO_ID} className={f.idno_ids.includes(i.IDNO_ID) ? "op on" : "op"}>
                    <input type="checkbox" checked={f.idno_ids.includes(i.IDNO_ID)}
                      onChange={() => toggleIdno(i.IDNO_ID)} />
                    {i.IDNO_Name}
                  </label>
                ))}
              </div>
              {f.idno_ids.length > 1 && (
                <p className="hint">
                  Creates {f.idno_ids.length} separate applications &mdash; each operator quotes
                  independently.
                </p>
              )}
            </div>

            <div className="fld"><label>Application date</label>
              <input type="date" value={f.Application_Date} onChange={(e) => set("Application_Date")(e.target.value)} /></div>
            <div className="fld"><label>Expected response</label>
              <input type="date" value={f.Expected_Rx_Date} onChange={(e) => set("Expected_Rx_Date")(e.target.value)} /></div>
            <div className="fld"><label>Plot count</label>
              <input type="number" value={f.Plot_Count} onChange={(e) => set("Plot_Count")(e.target.value)} /></div>
            <div className="fld"><label>Requested kVA</label>
              <input type="number" step="0.1" value={f.Requested_kVA} onChange={(e) => set("Requested_kVA")(e.target.value)} /></div>

            <div className="fld"><label>Contingency load</label>
              <input type="number" step="0.1" value={f.Contingency_Load} onChange={(e) => set("Contingency_Load")(e.target.value)} /></div>
            <div className="fld"><label>Connection type</label>
              <input value={f.Connection_Type} onChange={(e) => set("Connection_Type")(e.target.value)} /></div>
            <div className="fld"><label>Distance (m)</label>
              <input type="number" value={f.Distance_m} onChange={(e) => set("Distance_m")(e.target.value)} /></div>
            <div className="fld"><label>Estimated cost</label>
              <input type="number" step="0.01" value={f.Estimated_Cost} onChange={(e) => set("Estimated_Cost")(e.target.value)} /></div>

            <div className="fld"><label>Quote reference</label>
              <input value={f.Quote_Reference} onChange={(e) => set("Quote_Reference")(e.target.value)} /></div>
            <div className="fld"><label>Quote date</label>
              <input type="date" value={f.Quote_Date} onChange={(e) => set("Quote_Date")(e.target.value)} /></div>
            <div className="fld"><label>Valid until</label>
              <input type="date" value={f.Valid_Until_Date} onChange={(e) => set("Valid_Until_Date")(e.target.value)} /></div>
            <div className="fld"><label>Business address</label>
              <input value={f.Business_Address} onChange={(e) => set("Business_Address")(e.target.value)} /></div>

            <div className="fld span4"><label>Notes</label>
              <textarea rows={2} value={f.Notes} onChange={(e) => set("Notes")(e.target.value)} /></div>
          </div>
          <div className="poc-actions">
            <button className="btn ghost" onClick={() => { setShowForm(false); setF(blank()); }}>Cancel</button>
            <button className="btn accent" disabled={saving} onClick={save}>
              {saving ? "Creating\u2026" : f.idno_ids.length > 1
                ? `Create ${f.idno_ids.length} applications` : "Create application"}
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No applications yet</p>
          <p>Apply to one or more network operators for a point of connection.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([utilId, list]) => {
          const u = utilityById(Number(utilId));
          return (
            <div className="poc-group" key={utilId}>
              <p className="poc-group-title">
                <span className="dot" style={{ background: u?.colour }} />
                {u?.name ?? "Utility"} <span className="count">{list.length}</span>
              </p>
              <div className="dt-wrap">
                <table className="dt">
                  <colgroup>{COLS.map((c) => <col key={c.key} style={{ width: layout.widths[c.key] }} />)}</colgroup>
                  <thead>
                    <tr className="head-row">
                      {COLS.map((c) => (
                        <th key={c.key} style={{ textAlign: c.align || "left" }}>
                          {c.label}
                          <span className="resizer" onMouseDown={(e) => layout.startResize(e, c.key)} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.POC_Application_ID}>
                        <td>{u?.name}</td>
                        <td className="op-name">{idnoName(r.IDNO_ID)}</td>
                        <td><span className={`ptype ${String(r.POC_Type || "").toLowerCase()}`}>{r.POC_Type || "\u2014"}</span></td>
                        <td>
                          <select className="inline-sel" value={r.POC_Status_ID ?? ""}
                            onChange={(e) => patch(r, "POC_Status_ID", e.target.value ? Number(e.target.value) : null)}>
                            <option value="">&mdash;</option>
                            {(lookups.pocStatuses || []).map((s) => (
                              <option key={s.POC_Status_ID} value={s.POC_Status_ID}>{s.POC_Status}</option>
                            ))}
                          </select>
                        </td>
                        <td>{fmt(r.Application_Date)}</td>
                        <td>{fmt(r.Expected_Rx_Date)}</td>
                        <td className="num">{r.Requested_kVA ?? "\u2014"}</td>
                        <td className="num">{r.Plot_Count ?? "\u2014"}</td>
                        <td className="mono">{r.Quote_Reference || "\u2014"}</td>
                        <td className="num">{money(r.Estimated_Cost)}</td>
                        <td className="mid">
                          <button className="row-del" onClick={() => remove(r)} title="Delete">&#10005;</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

const CSS = TABLE_CSS + `
.tab-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.tab-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.tab-head .count, .poc-group-title .count { font-size: 11px; font-weight: 700; background: var(--accent-light);
  color: var(--accent); border-radius: 20px; padding: 2px 8px; margin-left: 6px; vertical-align: middle; }
.tab-sub { margin: 3px 0 0; font-size: 12.5px; color: var(--muted); }
.poc-form { border: 1.5px solid var(--border); border-radius: 12px; background: #f8f9fb;
  padding: 18px; margin-bottom: 20px; }
.poc-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.poc-grid .span4 { grid-column: span 4; }
.poc-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.op-picker { display: flex; flex-wrap: wrap; gap: 6px; }
.op { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 400;
  text-transform: none; letter-spacing: 0; color: var(--text); background: var(--white);
  border: 1px solid var(--border); border-radius: 6px; padding: 6px 11px; margin: 0; cursor: pointer; }
.op.on { border-color: var(--accent); background: var(--accent-light); color: var(--accent); font-weight: 600; }
.poc-group { margin-bottom: 18px; }
.poc-group-title { display: flex; align-items: center; gap: 7px; margin: 0 0 6px;
  font-size: 12.5px; font-weight: 700; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.ptype { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  border-radius: 4px; padding: 2px 6px; background: var(--bg); border: 1px solid var(--border); color: var(--muted); }
.ptype.firm { background: var(--ok-bg); color: var(--ok-text); border-color: var(--ok-border); }
.ptype.interim { background: var(--warn-bg); color: var(--warn-text); border-color: var(--warn-border); }
.inline-sel { width: 100%; font-size: 12px; padding: 3px 5px; border-radius: 5px; }
.op-name { font-weight: 600; }
.dt .num { text-align: right; }
.dt .mid { text-align: center; }
.mono { font-family: ui-monospace, Menlo, monospace; }
.row-del { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 11px;
  padding: 2px 5px; border-radius: 4px; }
.row-del:hover { background: #fef2f2; color: #ef4444; }
.empty { text-align: center; padding: 48px 20px; border: 1px dashed var(--border);
  border-radius: var(--radius); background: var(--bg); }
.empty-title { margin: 0 0 4px; font-size: 14px; font-weight: 700; color: var(--text); }
.empty p { margin: 0; font-size: 12.5px; color: var(--muted); }
`;
