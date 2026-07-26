import { useState, useEffect } from "react";
import Banner from "../../components/Banner.jsx";
import { getLookups } from "../../api/lookups.js";
import { listAv, createAvApplication, updateAv, addAvSlot, deleteAv } from "../../api/av.js";
import { listPlots } from "../../api/plots.js";
import { UTILITIES, utilityById } from "../../lib/utilities.js";

/* Asset Value.

   One application per utility, sent to several IDNOs at once. Each gets a
   quotation slot that starts empty — that's what makes "3 of 5 received"
   answerable. Accepting one rejects the rest, which the database enforces
   because the losing operators get a formal rejection. */

const money = (n) => (n == null || n === "" ? "\u2014" : `£${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
const fmt = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "\u2014");

export default function AssetValueTab({ projectId }) {
  const [lookups, setLookups] = useState(null);
  const [apps, setApps] = useState([]);
  const [quots, setQuots] = useState([]);
  const [plotCount, setPlotCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ Utility_ID: "", Application_Ref: "", Submitted_Date: "", idno_ids: [] });
  const [addSlotFor, setAddSlotFor] = useState(null);

  async function load() {
    try {
      const [lk, res, plots] = await Promise.all([getLookups(), listAv(projectId), listPlots(projectId)]);
      setLookups(lk);
      setApps(res.applications || []);
      setQuots(res.quotations || []);
      setPlotCount((plots.rows || []).length);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const quotsFor = (appId) => quots.filter((q) => q.AV_Application_ID === appId);
  const idnoName = (id) => (lookups?.idnos || []).find((i) => i.IDNO_ID === id)?.IDNO_Name ?? "\u2014";
  const avStatus = (id) => (lookups?.avStatuses || []).find((s) => s.AV_Status_ID === id);
  const qStatusName = (id) => (lookups?.quotationStatuses || []).find((s) => s.Quotation_Status_ID === id)?.Quotation_Status ?? "Pending";

  const usedUtilities = new Set(apps.map((a) => a.Utility_ID));

  async function create() {
    if (!f.Utility_ID) return setError("Choose a utility.");
    if (!f.idno_ids.length) return setError("Select at least one IDNO to quote.");
    setSaving(true);
    try {
      await createAvApplication(projectId, {
        ...f,
        Utility_ID: Number(f.Utility_ID),
        Plot_Count: plotCount || null,
        AV_Status_ID: (lookups.avStatuses || []).find((s) => s.AV_Status === "Submitted")?.AV_Status_ID ?? null,
      });
      setF({ Utility_ID: "", Application_Ref: "", Submitted_Date: "", idno_ids: [] });
      setShowForm(false);
      await load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function patchQuot(q, changes) {
    setQuots((x) => x.map((y) => (y.AV_Quotation_ID === q.AV_Quotation_ID ? { ...y, ...changes } : y)));
    try { await updateAv(projectId, "quotation", q.AV_Quotation_ID, changes); }
    catch (e) { setError(e.message); await load(); }
  }

  async function accept(q) {
    const acceptedId = (lookups.quotationStatuses || []).find((s) => s.Quotation_Status === "Accepted")?.Quotation_Status_ID;
    try {
      await updateAv(projectId, "quotation", q.AV_Quotation_ID,
        { Accepted: true, Quotation_Status_ID: acceptedId ?? q.Quotation_Status_ID });
      await load();
    } catch (e) { setError(e.message); }
  }

  async function addSlot(appId, idnoId) {
    setAddSlotFor(null);
    try { await addAvSlot(projectId, { AV_Application_ID: appId, IDNO_ID: Number(idnoId) }); await load(); }
    catch (e) { setError(e.message); }
  }

  async function remove(kind, id, label) {
    if (!window.confirm(`Delete ${label}?`)) return;
    try { await deleteAv(projectId, kind, id); await load(); }
    catch (e) { setError(e.message); }
  }

  if (loading) return <div className="loading">Loading asset values&hellip;</div>;

  const toggleIdno = (id) =>
    setF((p) => ({ ...p, idno_ids: p.idno_ids.includes(id) ? p.idno_ids.filter((x) => x !== id) : [...p.idno_ids, id] }));

  return (
    <div>
      <style>{CSS}</style>

      <div className="tab-head">
        <div>
          <h3>Asset value <span className="count">{apps.length}</span></h3>
          <p className="tab-sub">
            One application per utility, quoted by several IDNOs. Accept one and the
            others are rejected.
          </p>
        </div>
        <button className="btn accent" onClick={() => setShowForm((x) => !x)}>
          {showForm ? "Cancel" : "+ New application"}
        </button>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      {showForm && (
        <div className="av-form">
          <p className="panel-label">New asset value application</p>
          <div className="av-grid">
            <div className="fld"><label>Utility <span className="req">*</span></label>
              <select value={f.Utility_ID} onChange={(e) => set("Utility_ID")(e.target.value)}>
                <option value="">&mdash;</option>
                {UTILITIES.filter((u) => !usedUtilities.has(u.id)).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <p className="hint">One application per utility</p></div>
            <div className="fld"><label>Application ref</label>
              <input value={f.Application_Ref} onChange={(e) => set("Application_Ref")(e.target.value)} /></div>
            <div className="fld"><label>Submitted</label>
              <input type="date" value={f.Submitted_Date} onChange={(e) => set("Submitted_Date")(e.target.value)} /></div>
            <div className="fld"><label>Plots</label>
              <input value={plotCount} disabled />
              <p className="hint">From the project</p></div>

            <div className="fld span4">
              <label>IDNOs to quote <span className="req">*</span></label>
              <p className="hint">Each gets a quotation slot waiting to be filled.</p>
              <div className="idno-list">
                {(lookups.idnos || []).map((i) => (
                  <label key={i.IDNO_ID} className={f.idno_ids.includes(i.IDNO_ID) ? "idno on" : "idno"}>
                    <input type="checkbox" checked={f.idno_ids.includes(i.IDNO_ID)}
                      onChange={() => toggleIdno(i.IDNO_ID)} />
                    {i.IDNO_Name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="av-actions">
            <button className="btn accent" disabled={saving} onClick={create}>
              {saving ? "Creating\u2026" : f.idno_ids.length
                ? `Create with ${f.idno_ids.length} quotation slot${f.idno_ids.length === 1 ? "" : "s"}`
                : "Create application"}
            </button>
            <button className="btn ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {apps.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No asset value applications</p>
          <p>Create one per utility and send it out to the IDNOs.</p>
        </div>
      ) : (
        apps.map((a) => {
          const u = utilityById(a.Utility_ID);
          const qs = quotsFor(a.AV_Application_ID);
          const received = qs.filter((q) => q.Asset_Value != null && q.Asset_Value !== "").length;
          const accepted = qs.find((q) => q.Accepted);
          const best = qs.filter((q) => q.Asset_Value).sort((x, y) => Number(y.Asset_Value) - Number(x.Asset_Value))[0];
          const st = avStatus(a.AV_Status_ID);
          const free = (lookups.idnos || []).filter((i) => !qs.some((q) => q.IDNO_ID === i.IDNO_ID));
          return (
            <div className="av-card" key={a.AV_Application_ID} style={{ borderLeftColor: u?.colour }}>
              <div className="ac-head">
                <span className="ac-title">
                  <span className="dot" style={{ background: u?.colour }} />
                  {u?.name ?? "Utility"}
                  {a.Application_Ref && <span className="mono ac-ref">{a.Application_Ref}</span>}
                </span>
                {st && <span className="ac-status" style={{ background: `${st.Row_Colour}1a`, color: st.Row_Colour }}>{st.AV_Status}</span>}
                <span className="ac-meta">
                  {received} of {qs.length} received
                  {best && ` · highest ${money(best.Asset_Value)}`}
                  {a.Submitted_Date && ` · sent ${fmt(a.Submitted_Date)}`}
                </span>
                <button className="row-del"
                  onClick={() => remove("application", a.AV_Application_ID, `the ${u?.name} application`)}
                  title="Delete application">&#10005;</button>
              </div>

              <table className="av-table">
                <thead>
                  <tr><th>IDNO</th><th>Status</th><th>Quote ref</th><th className="num">Asset value</th>
                    <th>Received</th><th>Valid until</th><th /></tr>
                </thead>
                <tbody>
                  {qs.length === 0 ? (
                    <tr><td colSpan={7} className="no-slots">No quotation slots &mdash; add an IDNO below.</td></tr>
                  ) : qs.map((q) => (
                    <tr key={q.AV_Quotation_ID} className={q.Accepted ? "accepted" : ""}>
                      <td className="strong">
                        {idnoName(q.IDNO_ID)}
                        {q.Accepted && <span className="tag accepted">Accepted</span>}
                      </td>
                      <td>
                        <select className="inline-sel" value={q.Quotation_Status_ID ?? ""}
                          onChange={(e) => patchQuot(q, { Quotation_Status_ID: e.target.value ? Number(e.target.value) : null })}>
                          <option value="">Pending</option>
                          {(lookups.quotationStatuses || []).map((s) => (
                            <option key={s.Quotation_Status_ID} value={s.Quotation_Status_ID}>{s.Quotation_Status}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input className="inline-in mono" value={q.Quotation_Ref || ""}
                          onChange={(e) => patchQuot(q, { Quotation_Ref: e.target.value })} />
                      </td>
                      <td className="num">
                        <input className="inline-in num" type="number" step="0.01" value={q.Asset_Value ?? ""}
                          onChange={(e) => patchQuot(q, { Asset_Value: e.target.value })} />
                      </td>
                      <td>
                        <input className="inline-in" type="date" value={q.Date_Received || ""}
                          onChange={(e) => patchQuot(q, { Date_Received: e.target.value })} />
                      </td>
                      <td>
                        <input className="inline-in" type="date" value={q.Valid_Until_Date || ""}
                          onChange={(e) => patchQuot(q, { Valid_Until_Date: e.target.value })} />
                      </td>
                      <td className="nowrap">
                        {!q.Accepted && q.Asset_Value != null && q.Asset_Value !== "" && (
                          <button className="row-edit" onClick={() => accept(q)}>Accept</button>
                        )}
                        <button className="row-del"
                          onClick={() => remove("quotation", q.AV_Quotation_ID, `the ${idnoName(q.IDNO_ID)} quotation`)}
                          title="Remove slot">&#10005;</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {free.length > 0 && (
                addSlotFor === a.AV_Application_ID ? (
                  <div className="slot-add">
                    <select defaultValue="" onChange={(e) => e.target.value && addSlot(a.AV_Application_ID, e.target.value)}>
                      <option value="">Choose an IDNO&hellip;</option>
                      {free.map((i) => <option key={i.IDNO_ID} value={i.IDNO_ID}>{i.IDNO_Name}</option>)}
                    </select>
                    <button className="row-edit" onClick={() => setAddSlotFor(null)}>Cancel</button>
                  </div>
                ) : (
                  <button className="add-slot" onClick={() => setAddSlotFor(a.AV_Application_ID)}>
                    + Add another IDNO
                  </button>
                )
              )}
              {accepted && (
                <p className="ac-foot">
                  Accepted {idnoName(accepted.IDNO_ID)} at {money(accepted.Asset_Value)} &mdash; the other
                  quotations were rejected automatically.
                </p>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

const CSS = `
.tab-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.tab-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.tab-head .count { font-size: 11px; font-weight: 700; background: var(--accent-light); color: var(--accent);
  border-radius: 20px; padding: 2px 8px; margin-left: 6px; vertical-align: middle; }
.tab-sub { margin: 3px 0 0; font-size: 12.5px; color: var(--muted); max-width: 70ch; }
.av-form { border: 1.5px solid var(--border); border-radius: 12px; background: #f8f9fb; padding: 18px; margin-bottom: 18px; }
.av-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.av-grid .span4 { grid-column: span 4; }
.av-actions { display: flex; gap: 8px; margin-top: 14px; }
.idno-list { display: flex; flex-wrap: wrap; gap: 6px; }
.idno { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 400;
  text-transform: none; letter-spacing: 0; color: var(--text); background: var(--white);
  border: 1px solid var(--border); border-radius: 6px; padding: 7px 12px; margin: 0; cursor: pointer; }
.idno.on { border-color: var(--accent); background: var(--accent-light); color: var(--accent); font-weight: 600; }

.av-card { border: 1px solid var(--border); border-left: 3px solid var(--muted);
  border-radius: var(--radius); padding: 13px 15px; margin-bottom: 12px; background: var(--white); }
.ac-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.ac-title { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 700; }
.ac-ref { font-size: 11px; font-weight: 500; color: var(--muted); }
.ac-status { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  border-radius: 4px; padding: 2px 8px; }
.ac-meta { margin-left: auto; font-size: 11.5px; color: var(--muted); }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }

.av-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.av-table th { text-align: left; font-size: 9.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; color: var(--muted); padding: 4px 7px; border-bottom: 1px solid var(--border); }
.av-table td { padding: 4px 7px; border-bottom: 1px solid var(--border); }
.av-table tr:last-child td { border-bottom: none; }
.av-table tr.accepted { background: #f6fefb; }
.av-table .num { text-align: right; }
.av-table .strong { font-weight: 700; }
.no-slots { text-align: center; color: var(--muted); font-style: italic; padding: 14px !important; }
.inline-sel, .inline-in { width: 100%; font-size: 11.5px; padding: 3px 6px; border-radius: 5px; }
.inline-in.num { text-align: right; }
.tag.accepted { margin-left: 7px; font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; background: var(--ok-bg); color: var(--ok-text);
  border: 1px solid var(--ok-border); border-radius: 4px; padding: 1px 5px; }
.add-slot, .row-edit { background: none; border: none; color: var(--accent); font: 600 11.5px inherit;
  cursor: pointer; padding: 3px 6px; border-radius: 4px; }
.add-slot { padding: 8px 0 0; }
.row-edit:hover { background: var(--accent-light); }
.slot-add { display: flex; gap: 7px; align-items: center; margin-top: 8px; }
.slot-add select { width: auto; min-width: 190px; font-size: 12px; }
.row-del { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 11px;
  padding: 2px 5px; border-radius: 4px; }
.row-del:hover { background: #fef2f2; color: #ef4444; }
.nowrap { white-space: nowrap; }
.mono { font-family: ui-monospace, Menlo, monospace; }
.ac-foot { margin: 10px 0 0; font-size: 11.5px; color: var(--ok-text); font-weight: 600; }
.empty { text-align: center; padding: 48px 20px; border: 1px dashed var(--border);
  border-radius: var(--radius); background: var(--bg); }
.empty-title { margin: 0 0 4px; font-size: 14px; font-weight: 700; color: var(--text); }
.empty p { margin: 0; font-size: 12.5px; color: var(--muted); }
`;
