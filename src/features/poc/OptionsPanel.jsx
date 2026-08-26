import { useState, useEffect } from "react";
import Banner from "../../components/Banner.jsx";
import { getLookups } from "../../api/lookups.js";
import { listOptions, saveOption, saveQuotation, removeOption, removeQuotation } from "../../api/pocOptions.js";
import PlotAssignment from "./PlotAssignment.jsx";
import EntityNotes from "../../components/EntityNotes.jsx";

/* Options and quotations returned by a network operator.

   An operator may come back with several connection options — different
   points of connection, different reinforcement routes — each priced by
   one or more quotations. Exactly one option ends up accepted, which is
   enforced by a database trigger rather than trusted to this screen. */

const money = (n) => (n == null || n === "" ? "\u2014" : `£${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
const fmt = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "\u2014");

export default function OptionsPanel({ appId, projectId, utilityId = null, providerName, onChanged }) {
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
  const [activeOption, setActiveOption] = useState(null);
  const [activeQuot, setActiveQuot] = useState(null);
  const [editOpt, setEditOpt] = useState(null);
  const [editQuot, setEditQuot] = useState(null);
  const [notesFor, setNotesFor] = useState(null);   // "option" | "quotation" | null
  /* Compare options on their cheapest quote or their dearest. Totalling
     the quotations was misleading — an operator's three quotes are
     alternatives, not a bill, so adding them up describes nothing. */
  const [costBasis, setCostBasis] = useState("min");   // "min" | "max"

  function blankQuot() {
    return { Quotation_Ref: "", Quotation_Status_ID: "", Estimated_Cost: "",
      Date_Received: "", Valid_Until_Date: "", Voltage_Rating_ID: "", Distance_m: "" };
  }

  async function load() {
    try {
      const [lk, res] = await Promise.all([getLookups(), listOptions(appId)]);
      setLookups(lk);
      const opts = res.options || [];
      setOptions(opts);
      setQuotations(res.quotations || []);
      setActiveOption((cur) => {
        if (cur && opts.some((o) => o.Option_ID === cur)) return cur;
        return (opts.find((o) => o.Selected) || opts[0])?.Option_ID ?? null;
      });
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [appId]);

  const quotsFor = (optId) => quotations.filter((q) => q.Option_ID === optId);

  /* The cheapest or dearest quotation on an option, and the figure to show. */
  const extremeQuot = (optId) => {
    const priced = quotsFor(optId).filter((q) => q.Estimated_Cost != null && q.Estimated_Cost !== "");
    if (!priced.length) return null;
    return priced.reduce((best, q) =>
      costBasis === "min"
        ? (Number(q.Estimated_Cost) < Number(best.Estimated_Cost) ? q : best)
        : (Number(q.Estimated_Cost) > Number(best.Estimated_Cost) ? q : best));
  };
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
      {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}

      <div className="opt-head">
        <span className="opt-title">Options from {providerName}</span>
        <span className="cost-toggle" title="Which quotation each option is judged on">
          {[["min", "Lowest"], ["max", "Highest"]].map(([k, label]) => (
            <button key={k} className={costBasis === k ? "ct on" : "ct"}
              onClick={() => setCostBasis(k)}>{label}</button>
          ))}
        </span>
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
        <>
          {/* Options as pills rather than stacked cards: an operator can
              return several and stacking them buries the one you care
              about. One row of pills, one detail panel. */}
          <div className="pill-row">
            {options.map((o) => {
              const qs = quotsFor(o.Option_ID);
              const best = extremeQuot(o.Option_ID);
              const on = activeOption === o.Option_ID;
              return (
                <button key={o.Option_ID}
                  className={["pill", on ? "on" : "", o.Selected ? "accepted" : ""].filter(Boolean).join(" ")}
                  onClick={() => { setActiveOption(o.Option_ID); setActiveQuot(null); }}
                  title={best
                    ? `${costBasis === "min" ? "Lowest" : "Highest"} of ${qs.length} quotation${qs.length === 1 ? "" : "s"}`
                    : "No priced quotations yet"}>
                  {o.Selected && <span className="pill-tick">&#10003;</span>}
                  {o.Option_Name}
                  {best && <span className="pill-badge">{money(best.Estimated_Cost)}</span>}
                  {qs.length > 1 && <span className="pill-n">{qs.length}</span>}
                </button>
              );
            })}
          </div>

          {options.filter((o) => o.Option_ID === activeOption).map((o) => {
            const qs = quotsFor(o.Option_ID);
            const best = extremeQuot(o.Option_ID);
            const active = qs.find((q) => q.Quotation_ID === activeQuot) || best || qs[0] || null;
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
                    {o.Consumption_kVA ? ` \u00B7 ${o.Consumption_kVA} kVA` : ""}
                  </span>
                  <span className="oc-actions">
                    {!o.Selected && <button className="btn ghost sm" onClick={() => select(o)}>Accept</button>}
                    <button className={editOpt ? "btn ghost sm" : "btn edit sm"}
                      onClick={() => setEditOpt(editOpt ? null : { ...o })}>
                      {editOpt ? "Cancel" : "Edit"}
                    </button>
                    {/* Accent while the notes are open, ghost while they
                        are not: the shared styles have no toggled state,
                        and a pressed button that looks exactly like an
                        unpressed one is what .row-edit.on existed to
                        avoid. */}
                    <button className={notesFor === "option" ? "btn accent sm" : "btn ghost sm"}
                      onClick={() => setNotesFor(notesFor === "option" ? null : "option")}>
                      Notes
                    </button>
                    <button className="btn delete sm" onClick={() => delOption(o)}>Delete</button>
                  </span>
                </div>

                {editOpt && (
                  <div className="edit-form">
                    <div className="ef-grid">
                      <div className="fld span2"><label>Option name</label>
                        <input value={editOpt.Option_Name || ""}
                          onChange={(e) => setEditOpt((d) => ({ ...d, Option_Name: e.target.value }))} /></div>
                      <div className="fld"><label>Date received</label>
                        <input type="date" value={editOpt.Date_Received || ""}
                          onChange={(e) => setEditOpt((d) => ({ ...d, Date_Received: e.target.value }))} /></div>
                      <div className="fld"><label>Consumption kVA</label>
                        <input type="number" step="0.1" value={editOpt.Consumption_kVA ?? ""}
                          onChange={(e) => setEditOpt((d) => ({ ...d, Consumption_kVA: e.target.value }))} /></div>
                      <div className="fld"><label className="inline">
                        <input type="checkbox" checked={!!editOpt.Interactive}
                          onChange={(e) => setEditOpt((d) => ({ ...d, Interactive: e.target.checked }))} />
                        Interactive</label></div>
                      <div className="fld"><button className="btn accent sm" onClick={async () => {
                        try {
                          await saveOption(appId, {
                            Option_Name: editOpt.Option_Name,
                            Date_Received: editOpt.Date_Received || null,
                            Consumption_kVA: editOpt.Consumption_kVA === "" ? null : editOpt.Consumption_kVA,
                            Interactive: !!editOpt.Interactive,
                          }, editOpt.Option_ID);
                          setEditOpt(null); await load();
                        } catch (e) { setError(e.message); }
                      }}>Save option</button></div>
                    </div>
                  </div>
                )}

                {notesFor === "option" && (
                  <EntityNotes entityType="POC_Option" entityId={o.Option_ID} />
                )}

                {qs.length > 0 && (
                  <div className="pill-row sub">
                    {qs.map((q) => {
                      const on = (active && active.Quotation_ID === q.Quotation_ID);
                      const isBest = best && best.Quotation_ID === q.Quotation_ID && qs.length > 1;
                      return (
                        <button key={q.Quotation_ID}
                          className={["pill", "sm", on ? "on" : "", isBest ? "best" : ""].filter(Boolean).join(" ")}
                          onClick={() => setActiveQuot(q.Quotation_ID)}
                          title={isBest ? (costBasis === "min" ? "Lowest quotation" : "Highest quotation") : undefined}>
                          {isBest && <span className="pill-tick">{costBasis === "min" ? "\u2193" : "\u2191"}</span>}
                          {q.Quotation_Ref || `Quote #${q.Quotation_ID}`}
                          <span className="pill-badge">{money(q.Estimated_Cost)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {active && (
                  <div className="quot-detail">
                    <div className="qd-grid">
                      <div><span className="qd-lbl">Status</span>{statusName(active.Quotation_Status_ID)}</div>
                      <div><span className="qd-lbl">Voltage</span>{voltName(active.Voltage_Rating_ID)}</div>
                      <div><span className="qd-lbl">Received</span>{fmt(active.Date_Received)}</div>
                      <div><span className="qd-lbl">Valid until</span>{fmt(active.Valid_Until_Date)}</div>
                      <div><span className="qd-lbl">Distance</span>{active.Distance_m != null ? `${active.Distance_m} m` : "\u2014"}</div>
                      <div className="qd-cost"><span className="qd-lbl">Cost</span>{money(active.Estimated_Cost)}</div>
                    </div>
                    <div className="qd-actions">
                      <button className={assigning === active.Quotation_ID ? "btn accent sm" : "btn ghost sm"}
                        onClick={() => setAssigning(assigning === active.Quotation_ID ? null : active.Quotation_ID)}>
                        Assign plots
                      </button>
                      <button className={editQuot ? "btn ghost sm" : "btn edit sm"}
                        onClick={() => setEditQuot(editQuot ? null : { ...active })}>
                        {editQuot ? "Cancel" : "Edit"}
                      </button>
                      <button className={notesFor === "quotation" ? "btn accent sm" : "btn ghost sm"}
                        onClick={() => setNotesFor(notesFor === "quotation" ? null : "quotation")}>
                        Notes
                      </button>
                      <button className="btn delete sm" onClick={() => delQuot(active)}>Delete</button>
                    </div>
                  </div>
                )}

                {editQuot && (
                  <div className="edit-form">
                    <div className="ef-grid">
                      <div className="fld"><label>Quote ref</label>
                        <input value={editQuot.Quotation_Ref || ""}
                          onChange={(e) => setEditQuot((d) => ({ ...d, Quotation_Ref: e.target.value }))} /></div>
                      <div className="fld"><label>Status</label>
                        <select value={editQuot.Quotation_Status_ID ?? ""}
                          onChange={(e) => setEditQuot((d) => ({ ...d, Quotation_Status_ID: e.target.value }))}>
                          <option value="">&mdash;</option>
                          {(lookups.quotationStatuses || []).map((x) => (
                            <option key={x.Quotation_Status_ID} value={x.Quotation_Status_ID}>{x.Quotation_Status}</option>
                          ))}
                        </select></div>
                      <div className="fld"><label>Voltage</label>
                        <select value={editQuot.Voltage_Rating_ID ?? ""}
                          onChange={(e) => setEditQuot((d) => ({ ...d, Voltage_Rating_ID: e.target.value }))}>
                          <option value="">&mdash;</option>
                          {(lookups.voltageRatings || []).map((v) => (
                            <option key={v.Voltage_Rating_ID} value={v.Voltage_Rating_ID}>{v.Voltage_Rating}</option>
                          ))}
                        </select></div>
                      <div className="fld"><label>Cost</label>
                        <input type="number" step="0.01" value={editQuot.Estimated_Cost ?? ""}
                          onChange={(e) => setEditQuot((d) => ({ ...d, Estimated_Cost: e.target.value }))} /></div>
                      <div className="fld"><label>Received</label>
                        <input type="date" value={editQuot.Date_Received || ""}
                          onChange={(e) => setEditQuot((d) => ({ ...d, Date_Received: e.target.value }))} /></div>
                      <div className="fld"><label>Valid until</label>
                        <input type="date" value={editQuot.Valid_Until_Date || ""}
                          onChange={(e) => setEditQuot((d) => ({ ...d, Valid_Until_Date: e.target.value }))} /></div>
                      <div className="fld"><label>Distance (m)</label>
                        <input type="number" value={editQuot.Distance_m ?? ""}
                          onChange={(e) => setEditQuot((d) => ({ ...d, Distance_m: e.target.value }))} /></div>
                      <div className="fld"><button className="btn accent sm" onClick={async () => {
                        try {
                          const { Quotation_ID, Option_ID, ...changes } = editQuot;
                          await saveQuotation(appId, changes, Quotation_ID);
                          setEditQuot(null); await load();
                        } catch (e) { setError(e.message); }
                      }}>Save quotation</button></div>
                    </div>
                  </div>
                )}

                {notesFor === "quotation" && active && (
                  <EntityNotes entityType="POC_Quotation" entityId={active.Quotation_ID} />
                )}

                {assigning && qs.some((q) => q.Quotation_ID === assigning) && (
                  <PlotAssignment
                    projectId={projectId}
                    /* Passed through rather than fetched again here: the
                       application row above already has it, and a second
                       read would be a second answer to one question. */
                    utilityId={utilityId}
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
                          {(lookups.quotationStatuses || []).map((x) => (
                            <option key={x.Quotation_Status_ID} value={x.Quotation_Status_ID}>{x.Quotation_Status}</option>
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
          })}
        </>
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

/* Pill tabs, matching the segmented look used elsewhere in the app. */
.pill-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.pill-row.sub { margin: 10px 0 0; }
.pill { display: inline-flex; align-items: center; gap: 7px; background: var(--white);
  border: 1px solid var(--border); border-radius: 999px; padding: 6px 14px; cursor: pointer;
  font: 600 12.5px inherit; color: var(--muted); }
.pill:hover { border-color: var(--accent); color: var(--accent); }
.pill.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.pill.accepted:not(.on) { border-color: #a7f3d0; background: var(--ok-bg); color: var(--ok-text); }
.pill.sm { padding: 4px 11px; font-size: 11.5px; }
.pill-tick { font-weight: 700; }
.cost-toggle { display: inline-flex; border: 1px solid var(--border); border-radius: 999px;
  overflow: hidden; margin-left: auto; margin-right: 8px; }
.ct { background: var(--white); border: none; padding: 4px 12px; cursor: pointer;
  font: 600 11.5px inherit; color: var(--muted); }
.ct.on { background: var(--accent); color: #fff; }
.pill.best:not(.on) { border-color: var(--accent); color: var(--accent); }
.pill-n { background: var(--border); color: var(--muted); border-radius: 999px;
  padding: 0 6px; font-size: 10px; font-weight: 700; }
.pill.on .pill-n { background: rgba(255,255,255,.25); color: #fff; }
.pill-badge { background: rgba(0,0,0,.09); border-radius: 999px; padding: 1px 7px; font-size: 11px; }
.pill.on .pill-badge { background: rgba(255,255,255,.25); }

.edit-form { border: 1px solid var(--accent); border-radius: var(--radius);
  background: var(--accent-light); padding: 12px; margin-top: 10px; }
.ef-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; align-items: end; }
.ef-grid .span2 { grid-column: span 2; }
.ef-grid label.inline { display: flex; align-items: center; gap: 7px; font-size: 12px;
  font-weight: 500; text-transform: none; letter-spacing: 0; color: var(--text); margin: 0 0 6px; }
.quot-detail { display: flex; align-items: center; gap: 14px; margin-top: 10px;
  border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px; background: var(--bg); }
.qd-grid { flex: 1; display: flex; flex-wrap: wrap; gap: 18px; font-size: 12.5px; }
.qd-lbl { display: block; font-size: 9.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: var(--muted); margin-bottom: 2px; }
.qd-cost { font-weight: 700; color: var(--accent); }
.qd-actions { display: flex; gap: 4px; }

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
.nowrap { white-space: nowrap; }
.add-quot { background: none; border: none; color: var(--accent); font: 600 11.5px inherit;
  cursor: pointer; padding: 7px 0 0; }
`;
