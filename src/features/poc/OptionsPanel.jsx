import { useState, useEffect } from "react";
import Banner from "../../components/Banner.jsx";
import { getLookups } from "../../api/lookups.js";
import { listOptions, saveOption, saveQuotation, removeOption, removeQuotation } from "../../api/pocOptions.js";
import PlotAssignment from "./PlotAssignment.jsx";

/* Options and quotations returned by a network operator.

   An operator may come back with several connection options — different
   points of connection, different reinforcement routes — each priced by
   one or more quotations. Exactly one option ends up accepted, which is
   enforced by a database trigger rather than trusted to this screen. */

const money = (n) => (n == null || n === "" ? "\u2014" : `£${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
const fmt = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "\u2014");

export default function OptionsPanel({ appId, projectId, providerName, onChanged }) {
  const [lookups, setLookups] = useState(null);
  const [options, setOptions] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addingOption, setAddingOption] = useState(false);
  const [optDraft, setOptDraft] = useState({ Option_Name: "", Date_Received: "", Consumption_kVA: "", Interactive: false });
  const [quotFor, setQuotFor] = useState(null);
  const [quotDraft, setQuotDraft] = useState(blankQuot());
  const [assigning, setAssigning] = useState(null);

  function blankQuot() {
    return { Quotation_Ref: "", Quotation_Status_ID: "", Estimated_Cost: "",
      Date_Received: "", Valid_Until_Date: "", Voltage_Rating_ID: "", Distance_m: "" };
  }

  async function load() {
    try {
      const [lk, res] = await Promise.all([getLookups(), listOptions(appId)]);
      setLookups(lk);
      setOptions(res.options || []);
      setQuotations(res.quotations || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [appId]);

  const quotsFor = (optId) => quotations.filter((q) => q.Option_ID === optId);
  const statusName = (id) => (lookups?.quotationStatuses || []).find((s) => s.Quotation_Status_ID === id)?.Quotation_Status ?? "\u2014";
  const voltName = (id) => (lookups?.voltageRatings || []).find((v) => v.Voltage_Rating_ID === id)?.Voltage_Rating ?? "\u2014";

  async function addOption() {
    if (!optDraft.Option_Name.trim()) return setError("Give the option a name.");
    try {
      await saveOption(appId, { ...optDraft, Option_Name: optDraft.Option_Name.trim() });
      setOptDraft({ Option_Name: "", Date_Received: "", Consumption_kVA: "", Interactive: false });
      setAddingOption(false);
      await load();
      onChanged && onChanged();
    } catch (e) { setError(e.message); }
  }

  async function select(o) {
    try {
      await saveOption(appId, { Selected: true }, o.Option_ID);
      await load();
      onChanged && onChanged();
    } catch (e) { setError(e.message); }
  }

  async function addQuotation(optId) {
    try {
      await saveQuotation(appId, { ...quotDraft, Option_ID: optId });
      setQuotDraft(blankQuot());
      setQuotFor(null);
      await load();
      onChanged && onChanged();
    } catch (e) { setError(e.message); }
  }

  async function delOption(o) {
    if (!window.confirm(`Delete "${o.Option_Name}" and its quotations?`)) return;
    try { await removeOption(appId, o.Option_ID); await load(); onChanged && onChanged(); }
    catch (e) { setError(e.message); }
  }

  async function delQuot(q) {
    if (!window.confirm("Delete this quotation?")) return;
    try { await removeQuotation(appId, q.Quotation_ID); await load(); onChanged && onChanged(); }
    catch (e) { setError(e.message); }
  }

  if (loading) return <div className="opt-loading">Loading options&hellip;</div>;

  return (
    <div className="opt-panel">
      <style>{CSS}</style>
      {error && <Banner kind="error">{error}</Banner>}

      <div className="opt-head">
        <span className="opt-title">Options from {providerName}</span>
        <button className="btn ghost sm" onClick={() => setAddingOption((a) => !a)}>
          {addingOption ? "Cancel" : "+ Add option"}
        </button>
      </div>

      {addingOption && (
        <div className="opt-form">
          <div className="of-grid">
            <div className="fld span2"><label>Option name</label>
              <input value={optDraft.Option_Name} placeholder="e.g. Option A — LV from Kirkstall Rd"
                onChange={(e) => setOptDraft((d) => ({ ...d, Option_Name: e.target.value }))} /></div>
            <div className="fld"><label>Date received</label>
              <input type="date" value={optDraft.Date_Received}
                onChange={(e) => setOptDraft((d) => ({ ...d, Date_Received: e.target.value }))} /></div>
            <div className="fld"><label>Consumption kVA</label>
              <input type="number" step="0.1" value={optDraft.Consumption_kVA}
                onChange={(e) => setOptDraft((d) => ({ ...d, Consumption_kVA: e.target.value }))} /></div>
            <div className="fld chk"><label className="inline">
              <input type="checkbox" checked={optDraft.Interactive}
                onChange={(e) => setOptDraft((d) => ({ ...d, Interactive: e.target.checked }))} />
              Interactive
            </label></div>
          </div>
          <button className="btn accent sm" onClick={addOption}>Add option</button>
        </div>
      )}

      {options.length === 0 ? (
        <p className="opt-none">No options recorded yet.</p>
      ) : (
        options.map((o) => {
          const qs = quotsFor(o.Option_ID);
          const total = qs.reduce((sum, q) => sum + (Number(q.Estimated_Cost) || 0), 0);
          return (
            <div className={o.Selected ? "opt-card selected" : "opt-card"} key={o.Option_ID}>
              <div className="oc-head">
                <span className="oc-name">
                  {o.Option_Name}
                  {o.Interactive && <span className="tag">Interactive</span>}
                  {o.Selected && <span className="tag accepted">Accepted</span>}
                </span>
                <span className="oc-meta">
                  Received {fmt(o.Date_Received)}
                  {o.Consumption_kVA ? ` · ${o.Consumption_kVA} kVA` : ""}
                  {qs.length ? ` · ${money(total)}` : ""}
                </span>
                <span className="oc-actions">
                  {!o.Selected && (
                    <button className="btn ghost sm" onClick={() => select(o)}>Accept</button>
                  )}
                  <button className="row-del" onClick={() => delOption(o)} title="Delete option">&#10005;</button>
                </span>
              </div>

              {qs.length > 0 && (
                <table className="quot-table">
                  <thead>
                    <tr><th>Quote ref</th><th>Status</th><th>Voltage</th><th>Received</th>
                      <th>Valid until</th><th className="num">Distance</th><th className="num">Cost</th><th /></tr>
                  </thead>
                  <tbody>
                    {qs.map((q) => (
                      <tr key={q.Quotation_ID}>
                        <td className="mono">{q.Quotation_Ref || "\u2014"}</td>
                        <td>{statusName(q.Quotation_Status_ID)}</td>
                        <td>{voltName(q.Voltage_Rating_ID)}</td>
                        <td>{fmt(q.Date_Received)}</td>
                        <td>{fmt(q.Valid_Until_Date)}</td>
                        <td className="num">{q.Distance_m != null ? `${q.Distance_m} m` : "\u2014"}</td>
                        <td className="num strong">{money(q.Estimated_Cost)}</td>
                        <td className="num nowrap">
                          <button className="row-edit"
                            onClick={() => setAssigning(assigning === q.Quotation_ID ? null : q.Quotation_ID)}
                            title="Assign plots">Plots</button>
                          <button className="row-del" onClick={() => delQuot(q)} title="Delete">&#10005;</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {assigning && qs.some((q) => q.Quotation_ID === assigning) && (
                <PlotAssignment
                  projectId={projectId}
                  quotationId={assigning}
                  optionId={o.Option_ID}
                  siblingQuotations={qs}
                  onClose={() => setAssigning(null)}
                  onSaved={load}
                />
              )}

              {quotFor === o.Option_ID ? (
                <div className="quot-form">
                  <div className="qf-grid">
                    <div className="fld"><label>Quote ref</label>
                      <input value={quotDraft.Quotation_Ref}
                        onChange={(e) => setQuotDraft((d) => ({ ...d, Quotation_Ref: e.target.value }))} /></div>
                    <div className="fld"><label>Status</label>
                      <select value={quotDraft.Quotation_Status_ID}
                        onChange={(e) => setQuotDraft((d) => ({ ...d, Quotation_Status_ID: e.target.value }))}>
                        <option value="">&mdash;</option>
                        {(lookups.quotationStatuses || []).map((s) => (
                          <option key={s.Quotation_Status_ID} value={s.Quotation_Status_ID}>{s.Quotation_Status}</option>
                        ))}
                      </select></div>
                    <div className="fld"><label>Voltage</label>
                      <select value={quotDraft.Voltage_Rating_ID}
                        onChange={(e) => setQuotDraft((d) => ({ ...d, Voltage_Rating_ID: e.target.value }))}>
                        <option value="">&mdash;</option>
                        {(lookups.voltageRatings || []).map((v) => (
                          <option key={v.Voltage_Rating_ID} value={v.Voltage_Rating_ID}>{v.Voltage_Rating}</option>
                        ))}
                      </select></div>
                    <div className="fld"><label>Cost</label>
                      <input type="number" step="0.01" value={quotDraft.Estimated_Cost}
                        onChange={(e) => setQuotDraft((d) => ({ ...d, Estimated_Cost: e.target.value }))} /></div>
                    <div className="fld"><label>Received</label>
                      <input type="date" value={quotDraft.Date_Received}
                        onChange={(e) => setQuotDraft((d) => ({ ...d, Date_Received: e.target.value }))} /></div>
                    <div className="fld"><label>Valid until</label>
                      <input type="date" value={quotDraft.Valid_Until_Date}
                        onChange={(e) => setQuotDraft((d) => ({ ...d, Valid_Until_Date: e.target.value }))} /></div>
                    <div className="fld"><label>Distance (m)</label>
                      <input type="number" value={quotDraft.Distance_m}
                        onChange={(e) => setQuotDraft((d) => ({ ...d, Distance_m: e.target.value }))} /></div>
                    <div className="fld btns">
                      <button className="btn accent sm" onClick={() => addQuotation(o.Option_ID)}>Add</button>
                      <button className="btn ghost sm" onClick={() => { setQuotFor(null); setQuotDraft(blankQuot()); }}>Cancel</button>
                    </div>
                  </div>
                </div>
              ) : (
                <button className="add-quot" onClick={() => setQuotFor(o.Option_ID)}>+ Add quotation</button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

const CSS = `
.opt-panel { background: var(--bg); border-top: 1px solid var(--border); padding: 14px 16px; }
.opt-loading { padding: 18px; color: var(--muted); font-size: 12.5px; }
.opt-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.opt-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: var(--accent); }
.btn.sm { padding: 4px 11px; font-size: 11.5px; }
.opt-none { font-size: 12.5px; color: var(--muted); margin: 0; font-style: italic; }
.opt-form, .quot-form { background: var(--white); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 12px; margin-bottom: 10px; }
.of-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 10px; }
.of-grid .span2 { grid-column: span 2; }
.qf-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.qf-grid .btns { display: flex; gap: 6px; align-items: flex-end; }
.fld.chk { display: flex; align-items: flex-end; }
label.inline { display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 500;
  text-transform: none; letter-spacing: 0; color: var(--text); margin: 0 0 6px; cursor: pointer; }

.opt-card { background: var(--white); border: 1px solid var(--border); border-left: 3px solid var(--border);
  border-radius: var(--radius); padding: 11px 13px; margin-bottom: 8px; }
.opt-card.selected { border-left-color: #059669; background: #f6fefb; }
.oc-head { display: flex; align-items: center; gap: 12px; }
.oc-name { font-size: 13px; font-weight: 700; flex: 1; display: flex; align-items: center; gap: 7px; }
.oc-meta { font-size: 11.5px; color: var(--muted); }
.oc-actions { display: flex; align-items: center; gap: 6px; }
.tag { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; color: var(--muted); }
.tag.accepted { background: var(--ok-bg); color: var(--ok-text); border-color: var(--ok-border); }

.quot-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 9px; }
.quot-table th { text-align: left; font-size: 9.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; color: var(--muted); padding: 4px 7px; border-bottom: 1px solid var(--border); }
.quot-table td { padding: 5px 7px; border-bottom: 1px solid var(--border); }
.quot-table tr:last-child td { border-bottom: none; }
.quot-table .num { text-align: right; }
.quot-table .strong { font-weight: 700; }
.mono { font-family: ui-monospace, Menlo, monospace; }
.row-edit { background: none; border: none; cursor: pointer; color: var(--accent);
  font: 600 11px inherit; padding: 2px 6px; border-radius: 4px; }
.row-edit:hover { background: var(--accent-light); }
.nowrap { white-space: nowrap; }
.add-quot { background: none; border: none; color: var(--accent); font: 600 11.5px inherit;
  cursor: pointer; padding: 7px 0 0; }
.row-del { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 11px;
  padding: 2px 5px; border-radius: 4px; }
.row-del:hover { background: #fef2f2; color: #ef4444; }
`;
