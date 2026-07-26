import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { getLookups } from "../../api/lookups.js";
import { listPoc, createPoc, updatePoc, deletePoc } from "../../api/poc.js";
import { listPlots } from "../../api/plots.js";
import { getProject } from "../../api/projects.js";
import { utilityById, UTILITIES } from "../../lib/utilities.js";
import { useTableLayout, TABLE_CSS } from "../../lib/useTableLayout.js";

/* POC applications, following the original app.

   The important behaviour is the fan-out: selecting three operators
   creates three applications, not one. They quote separately and move at
   different speeds, so each needs its own status, reference and dates. */

/* Only these three have a point of connection to apply for — street
   lighting scopes don't. */
const POC_UTILITIES = [1, 2, 3];

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
  const [plots, setPlots] = useState([]);
  const [project, setProject] = useState(null);

  function blank() {
    return {
      Utility_ID: "", idno_ids: [], dno_id: "", POC_Type_ID: "", POC_Status_ID: "",
      Site_Name: "", Site_Address: "", Applicant_Company: "", Applicant_Company_Address: "",
      Non_Residential_kVA: "",
      Application_Date: "", Expected_Rx_Date: "", Applicant_Person_ID: "",
      Business_Address: "", Plot_Count: "", Requested_kVA: "", Contingency_Load: "",
      Quote_Reference: "", Quote_Date: "", Valid_Until_Date: "",
      Connection_Type: "", Distance_m: "", Estimated_Cost: "", Notes: "",
    };
  }

  async function load() {
    try {
      const [lk, res, plotRes, proj] = await Promise.all([
        getLookups(), listPoc(projectId), listPlots(projectId), getProject(projectId),
      ]);
      setLookups(lk);
      setRows(res.rows || []);
      setPlots(plotRes.rows || []);
      setProject(proj);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  /* Site and plot figures come from the project, so the form opens filled
     in rather than asking for what's already known. */
  function openForm() {
    const base = plots.reduce((sum, p) => sum + (Number(p.KVA_Load) || 0), 0);
    setF({
      ...blank(),
      Site_Name: project?.Site_Name ?? "",
      Site_Address: project?.Site_Address ?? "",
      Plot_Count: plots.length || "",
      Requested_kVA: base ? base.toFixed(1) : "",
      Applicant_Company: "Aptus Utilities",
      POC_Type_ID: lookups?.pocTypes?.[0]?.POC_Type_ID ?? "",
    });
    setShowForm(true);
  }
  const idnoName = (id) => (lookups?.idnos || []).find((x) => x.IDNO_ID === id)?.IDNO_Name ?? "\u2014";
  const dnoName = (id) => (lookups?.dnos || []).find((x) => x.DNO_ID === id)?.DNO_Name ?? "\u2014";
  const providerName = (r) => (r.DNO_ID ? dnoName(r.DNO_ID) : idnoName(r.IDNO_ID));
  const typeName = (id) => (lookups?.pocTypes || []).find((x) => x.POC_Type_ID === id)?.POC_Type ?? "\u2014";
  const statusName = (id) => (lookups?.pocStatuses || []).find((x) => x.POC_Status_ID === id)?.POC_Status ?? "\u2014";

  const grouped = useMemo(() => {
    const g = {};
    rows.forEach((r) => (g[r.Utility_ID] = g[r.Utility_ID] || []).push(r));
    return g;
  }, [rows]);

  async function save() {
    if (!f.Utility_ID) return setError("Choose a utility.");
    if (!f.idno_ids.length && !f.dno_id) return setError("Select at least one provider.");
    setSaving(true);
    try {
      const res = await createPoc(projectId, {
        ...f,
        Utility_ID: Number(f.Utility_ID),
        POC_Status_ID: f.POC_Status_ID ? Number(f.POC_Status_ID) : null,
        POC_Type_ID: f.POC_Type_ID ? Number(f.POC_Type_ID) : null,
        Applicant_Person_ID: f.Applicant_Person_ID ? Number(f.Applicant_Person_ID) : null,
      });
      const n = res.rows?.length ?? (f.idno_ids.length + (f.dno_id ? 1 : 0));
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
    if (!window.confirm(`Delete the ${providerName(row)} application?`)) return;
    try {
      await deletePoc(projectId, row.POC_Application_ID);
      setRows((r) => r.filter((x) => x.POC_Application_ID !== row.POC_Application_ID));
    } catch (e) { setError(e.message); }
  }

  const baseKva = plots.reduce((sum, p) => sum + (Number(p.KVA_Load) || 0), 0);
  const totalKva =
    Number(f.Requested_kVA || 0) + Number(f.Non_Residential_kVA || 0) + Number(f.Contingency_Load || 0);
  const providerCount = f.idno_ids.length + (f.dno_id ? 1 : 0);

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
        <button className="btn accent" onClick={() => (showForm ? setShowForm(false) : openForm())}>
          {showForm ? "Cancel" : "+ New application"}
        </button>
      </div>

      {flash && <Banner kind="ok">{flash}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}

      {showForm && (
        <div className="poc-form">
          <p className="panel-label">New POC application</p>

          <div className="poc-grid">
            <div className="fld span2"><label>Site name</label>
              <input value={f.Site_Name} onChange={(e) => set("Site_Name")(e.target.value)} /></div>
            <div className="fld span3"><label>Site address</label>
              <input value={f.Site_Address} onChange={(e) => set("Site_Address")(e.target.value)} /></div>
            <div className="fld"><label># Plots</label>
              <input type="number" value={f.Plot_Count} onChange={(e) => set("Plot_Count")(e.target.value)} /></div>

            <div className="fld span2"><label>Applicant company</label>
              <input value={f.Applicant_Company} onChange={(e) => set("Applicant_Company")(e.target.value)} /></div>
            <div className="fld span4"><label>Applicant company address</label>
              <input value={f.Applicant_Company_Address}
                onChange={(e) => set("Applicant_Company_Address")(e.target.value)} /></div>

            <div className="fld span2"><label>Applicant representative</label>
              <select value={f.Applicant_Person_ID} onChange={(e) => set("Applicant_Person_ID")(e.target.value)}>
                <option value="">&mdash;</option>
                {(lookups.people || []).map((p) => (
                  <option key={p.Person_ID} value={p.Person_ID}>{p.Person_Name}</option>
                ))}
              </select></div>
            <div className="fld span2"><label>Application date</label>
              <input type="date" value={f.Application_Date} onChange={(e) => set("Application_Date")(e.target.value)} /></div>
            <div className="fld span2"><label>Expected response date</label>
              <input type="date" value={f.Expected_Rx_Date} onChange={(e) => set("Expected_Rx_Date")(e.target.value)} /></div>

            <div className="fld"><label>POC type</label>
              <select value={f.POC_Type_ID} onChange={(e) => set("POC_Type_ID")(e.target.value)}>
                {(lookups.pocTypes || []).map((t) => (
                  <option key={t.POC_Type_ID} value={t.POC_Type_ID}>{t.POC_Type}</option>
                ))}
              </select></div>
            <div className="fld"><label>Utility <span className="req">*</span></label>
              <select value={f.Utility_ID} onChange={(e) => set("Utility_ID")(e.target.value)}>
                <option value="">&mdash;</option>
                {UTILITIES.filter((u) => POC_UTILITIES.includes(u.id)).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select></div>
            <div className="fld"><label>Requested kVA load</label>
              <input type="number" step="0.1" value={f.Requested_kVA}
                onChange={(e) => set("Requested_kVA")(e.target.value)} />
              <p className="hint">
                {plots.length
                  ? `base ${baseKva.toFixed(1)} + contingency ${Number(f.Contingency_Load || 0).toFixed(1)} from ${plots.length} plot(s)`
                  : "no plots on this project yet"}
              </p></div>
            <div className="fld"><label>Non-residential</label>
              <input type="number" step="0.1" value={f.Non_Residential_kVA}
                onChange={(e) => set("Non_Residential_kVA")(e.target.value)} />
              <p className="hint">
                {Number(f.Non_Residential_kVA || 0) > 0 ? "included in total" : "no non-residential supplies linked"}
              </p></div>
            <div className="fld"><label>Total</label>
              <input className="kva-total" value={totalKva.toFixed(1)} disabled /></div>
            <div className="fld"><label>Contingency load</label>
              <input type="number" step="0.1" value={f.Contingency_Load}
                onChange={(e) => set("Contingency_Load")(e.target.value)} /></div>

            <div className="fld span6">
              <label>
                Provider (IDNO or DNO) <span className="req">*</span>
                <span className="lbl-note">
                  {" "}({(lookups.idnos || []).length} IDNOs &mdash; multiple allowed,
                  {" "}{(lookups.dnos || []).length} DNOs &mdash; pick at most one)
                </span>
              </label>
              <div className="provider-list">
                {(lookups.idnos || []).map((i) => (
                  <label key={`i${i.IDNO_ID}`} className={f.idno_ids.includes(i.IDNO_ID) ? "prov on" : "prov"}>
                    <input type="checkbox" checked={f.idno_ids.includes(i.IDNO_ID)}
                      onChange={() => toggleIdno(i.IDNO_ID)} />
                    <span className="badge idno">IDNO</span>
                    {i.IDNO_Name}
                  </label>
                ))}
                {(lookups.dnos || []).map((d, di) => (
                  <label key={`d${d.DNO_ID}`}
                    className={[
                      "prov",
                      String(f.dno_id) === String(d.DNO_ID) ? "on" : "",
                      di === 0 ? "first-dno" : "",
                    ].filter(Boolean).join(" ")}>
                    <input type="radio" name="dno" checked={String(f.dno_id) === String(d.DNO_ID)}
                      onChange={() => set("dno_id")(String(d.DNO_ID))} />
                    <span className="badge dno">DNO</span>
                    {d.DNO_Name}
                  </label>
                ))}
              </div>
              {f.dno_id && (
                <button className="clear-dno" onClick={() => set("dno_id")("")}>Clear DNO selection</button>
              )}
              {providerCount > 1 && (
                <p className="hint">
                  Creates {providerCount} separate applications &mdash; each provider quotes
                  independently.
                </p>
              )}
            </div>

            <div className="fld span6"><label>Notes</label>
              <textarea rows={2} value={f.Notes} onChange={(e) => set("Notes")(e.target.value)} /></div>
          </div>

          <div className="poc-actions">
            <button className="btn accent" disabled={saving} onClick={save}>
              {saving ? "Saving\u2026" : providerCount > 1
                ? `Save ${providerCount} applications` : "Save application"}
            </button>
            <button className="btn ghost" onClick={() => { setShowForm(false); setF(blank()); }}>Cancel</button>
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
                        <td className="op-name">
                          <span className={`badge ${r.DNO_ID ? "dno" : "idno"}`}>{r.DNO_ID ? "DNO" : "IDNO"}</span>
                          {" "}{providerName(r)}
                        </td>
                        <td><span className="ptype">{typeName(r.POC_Type_ID)}</span></td>
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
.poc-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
.poc-grid .span2 { grid-column: span 2; }
.poc-grid .span3 { grid-column: span 3; }
.poc-grid .span4 { grid-column: span 4; }
.poc-grid .span6 { grid-column: span 6; }
.lbl-note { font-weight: 400; text-transform: none; letter-spacing: 0; font-size: 10.5px; color: var(--muted); }
.kva-total { font-weight: 700; color: var(--accent); background: var(--accent-light) !important; }
.provider-list { border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--white); max-height: 210px; overflow-y: auto; }
.prov { display: flex; align-items: center; gap: 12px; padding: 9px 12px; margin: 0;
  font-size: 12.5px; font-weight: 500; text-transform: none; letter-spacing: 0;
  color: var(--text); cursor: pointer; border-bottom: 1px solid var(--border); }
.prov:last-child { border-bottom: none; }
.prov:nth-child(even) { background: #fafbfc; }
.prov:hover { background: var(--accent-light); }
.prov.on { background: var(--accent-light); font-weight: 600; }
/* A visible divider between the multi-select IDNOs and the pick-one DNOs */
.prov.first-dno { border-top: 2px solid var(--border); }
/* Don't set width here — that's what was collapsing the checkbox to a
   sliver. Size comes from the global input rules; only scale it up. */
.prov input[type="checkbox"] { width: 18px; height: 18px; border-radius: 5px; border-width: 2px; }
.prov input[type="radio"] { width: 18px; height: 18px; border-width: 2px; }
.prov input[type="checkbox"]:checked::after { left: 5px; top: 1.5px; width: 5px; height: 9px; }
.badge { font-size: 9px; font-weight: 700; letter-spacing: .05em; border-radius: 4px;
  padding: 2px 6px; flex: none; }
.badge.idno { background: var(--accent); color: #fff; }
.badge.dno { background: #7c3aed; color: #fff; }
.clear-dno { background: none; border: none; color: var(--accent); font: 600 11.5px inherit;
  cursor: pointer; padding: 5px 0 0; }
.poc-actions { display: flex; gap: 8px; margin-top: 16px; }
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
