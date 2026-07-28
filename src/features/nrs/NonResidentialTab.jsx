import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { getLookups } from "../../api/lookups.js";
import { listNrs, saveNrs, deleteNrs } from "../../api/nrs.js";
import { UTILITIES, utilityById } from "../../lib/utilities.js";
import { useTableLayout } from "../../lib/useTableLayout.js";
import FilterCell, { blankFilter, rowPasses, FILTER_CSS } from "../../components/FilterCell.jsx";

/* Non-residential supplies: anything on site that isn't a dwelling —
   pumping stations, feeder pillars, temporary builder's supplies. They
   carry their own load and are quoted alongside plots, which is why the
   kVA total here matters as much as the plot total. */

const COLS = [
  { key: "ref",     label: "Supply ref",  width: 130, type: "text",  raw: (r) => r.Supply_Ref || "" },
  { key: "desc",    label: "Description", width: 200, type: "text",  raw: (r) => r.Description || "" },
  { key: "subtype", label: "Type",        width: 150, type: "multi", raw: (r) => r.NRS_Sub_Type_ID },
  { key: "utility", label: "Utility",     width: 140, type: "multi", raw: (r) => r.Utility_ID },
  { key: "kva",     label: "kVA",         width: 90,  type: "num",   align: "right", raw: (r) => r.Requested_kVA ?? null },
  { key: "mpan",    label: "MPAN",        width: 150, type: "text",  raw: (r) => r.MPAN || "" },
  { key: "operator",label: "Operator",    width: 150, type: "multi", raw: (r) => r.IDNO_ID },
  { key: "slp",     label: "SLP",         width: 58,  type: "bool",  align: "center", raw: (r) => !!r.Self_Lay_Provider },
  { key: "act",     label: "",            width: 78,  type: "none",  align: "center", raw: () => "" },
];

const blankRow = () => ({
  Supply_Ref: "", Description: "", NRS_Sub_Type_ID: "", Utility_ID: "",
  Requested_kVA: "", MPAN: "", Address: "", IDNO_ID: "", Date_Received: "",
  Self_Lay_Provider: false, Notes: "",
});

export default function NonResidentialTab({ projectId }) {
  const layout = useTableLayout("nrs", COLS);
  const [lookups, setLookups] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [f, setF] = useState(blankRow());
  const [saving, setSaving] = useState(false);
  const [sort, setSort] = useState({ key: "ref", dir: "asc" });
  const [filters, setFilters] = useState({});
  const [openFilter, setOpenFilter] = useState(null);

  async function load() {
    try {
      const [lk, res] = await Promise.all([getLookups(), listNrs(projectId)]);
      setLookups(lk);
      setRows(res.rows || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const subTypeName = (id) => (lookups?.nrsSubTypes || []).find((s) => s.NRS_Sub_Type_ID === id)?.Label ?? "\u2014";
  const idnoName = (id) => (lookups?.idnos || []).find((i) => i.IDNO_ID === id)?.IDNO_Name ?? "\u2014";

  const filterOptions = (key) => {
    if (key === "subtype") return (lookups?.nrsSubTypes || []).map((s) => ({ id: s.NRS_Sub_Type_ID, label: s.Label }));
    if (key === "utility") return UTILITIES.map((u) => ({ id: u.id, label: u.name }));
    if (key === "operator") return (lookups?.idnos || []).map((i) => ({ id: i.IDNO_ID, label: i.IDNO_Name }));
    return [];
  };

  const shown = useMemo(() => {
    const out = rows.filter((r) => rowPasses(r, COLS.filter((c) => c.type !== "none"), filters));
    const col = COLS.find((c) => c.key === sort.key);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      if (!col) return 0;
      const va = col.raw(a), vb = col.raw(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
  }, [rows, filters, sort]);

  const totalKva = shown.reduce((s, r) => s + (Number(r.Requested_kVA) || 0), 0);
  const noKva = shown.filter((r) => r.Requested_kVA == null || r.Requested_kVA === "").length;

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  function edit(r) {
    setEditingId(r.NRS_ID);
    setF({ ...blankRow(), ...r });
    setShowForm(true);
  }

  async function save() {
    if (!f.Utility_ID) return setError("Choose a utility.");
    setSaving(true);
    try {
      await saveNrs(projectId, {
        ...f,
        Utility_ID: Number(f.Utility_ID),
        NRS_Sub_Type_ID: f.NRS_Sub_Type_ID ? Number(f.NRS_Sub_Type_ID) : null,
        IDNO_ID: f.IDNO_ID ? Number(f.IDNO_ID) : null,
      }, editingId);
      setF(blankRow());
      setEditingId(null);
      setShowForm(false);
      setError("");
      await load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function remove(r) {
    if (!window.confirm(`Delete ${r.Supply_Ref || r.Description || "this supply"}?`)) return;
    try { await deleteNrs(projectId, r.NRS_ID); await load(); }
    catch (e) { setError(e.message); }
  }

  if (loading) return <div className="loading">Loading supplies&hellip;</div>;

  return (
    <div>
      <style>{CSS}</style>

      <div className="tab-head">
        <div>
          <h3>Non-residential supplies <span className="count">{rows.length}</span></h3>
          <p className="tab-sub">
            Anything on site that isn&rsquo;t a dwelling. Quoted alongside plots, so their
            load counts toward the total.
          </p>
        </div>
        <button className="btn accent"
          onClick={() => { if (showForm) { setShowForm(false); setEditingId(null); } else { setF(blankRow()); setEditingId(null); setShowForm(true); } }}>
          {showForm ? "Cancel" : "+ Add supply"}
        </button>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      {rows.length > 0 && (
        <div className="nrs-summary">
          <span className="nrs-pill">
            {shown.length} suppl{shown.length === 1 ? "y" : "ies"} &middot; {totalKva.toFixed(1)} kVA
          </span>
          {noKva > 0 && (
            <span className="nrs-warn">{noKva} with no load recorded</span>
          )}
        </div>
      )}

      {showForm && (
        <div className="nrs-form">
          <p className="panel-label">{editingId ? "Edit supply" : "New supply"}</p>
          <div className="nrs-grid">
            <div className="fld"><label>Supply ref</label>
              <input value={f.Supply_Ref} onChange={(e) => set("Supply_Ref")(e.target.value)} /></div>
            <div className="fld span2"><label>Description</label>
              <input value={f.Description} placeholder="e.g. Pumping station, north-east corner"
                onChange={(e) => set("Description")(e.target.value)} /></div>
            <div className="fld"><label>Type</label>
              <select value={f.NRS_Sub_Type_ID} onChange={(e) => set("NRS_Sub_Type_ID")(e.target.value)}>
                <option value="">&mdash;</option>
                {(lookups.nrsSubTypes || []).map((s) => (
                  <option key={s.NRS_Sub_Type_ID} value={s.NRS_Sub_Type_ID}>{s.Label}</option>
                ))}
              </select>
              {(lookups.nrsSubTypes || []).length === 0 && (
                <p className="hint">None configured &mdash; add them in Admin.</p>
              )}</div>

            <div className="fld"><label>Utility <span className="req">*</span></label>
              <select value={f.Utility_ID} onChange={(e) => set("Utility_ID")(e.target.value)}>
                <option value="">&mdash;</option>
                {UTILITIES.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select></div>
            <div className="fld"><label>Requested kVA</label>
              <input type="number" step="0.1" value={f.Requested_kVA}
                onChange={(e) => set("Requested_kVA")(e.target.value)} /></div>
            <div className="fld"><label>MPAN</label>
              <input className="mono" value={f.MPAN} onChange={(e) => set("MPAN")(e.target.value)} /></div>
            <div className="fld"><label>Operator</label>
              <select value={f.IDNO_ID} onChange={(e) => set("IDNO_ID")(e.target.value)}>
                <option value="">&mdash;</option>
                {(lookups.idnos || []).map((i) => (
                  <option key={i.IDNO_ID} value={i.IDNO_ID}>{i.IDNO_Name}</option>
                ))}
              </select></div>

            <div className="fld span2"><label>Address</label>
              <input value={f.Address} onChange={(e) => set("Address")(e.target.value)} /></div>
            <div className="fld"><label>Date received</label>
              <input type="date" value={f.Date_Received} onChange={(e) => set("Date_Received")(e.target.value)} /></div>
            <div className="fld chk"><label className="inline">
              <input type="checkbox" checked={!!f.Self_Lay_Provider}
                onChange={(e) => set("Self_Lay_Provider")(e.target.checked)} />
              Self lay provider
            </label></div>

            <div className="fld span4"><label>Notes</label>
              <textarea rows={2} value={f.Notes} onChange={(e) => set("Notes")(e.target.value)} /></div>
          </div>
          <div className="nrs-actions">
            <button className="btn accent" disabled={saving} onClick={save}>
              {saving ? "Saving\u2026" : editingId ? "Save changes" : "Add supply"}
            </button>
            <button className="btn ghost" onClick={() => { setShowForm(false); setEditingId(null); setF(blankRow()); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No non-residential supplies</p>
          <p>Add pumping stations, feeder pillars, temporary supplies and the like.</p>
        </div>
      ) : (
        <div className="dt-wrap">
          <table className="dt">
            <colgroup>{COLS.map((c) => <col key={c.key} style={{ width: layout.widths[c.key] }} />)}</colgroup>
            <thead>
              <tr className="head-row">
                {COLS.map((c) => (
                  <th key={c.key} style={{ textAlign: c.align || "left" }} {...layout.reorderProps(c.key)}
                      onClick={() => c.type !== "none" && toggleSort(c.key)}>
                    {c.label}
                    {sort.key === c.key && <span className="arrow">{sort.dir === "asc" ? "\u25B2" : "\u25BC"}</span>}
                    <span className="resizer" draggable={false}
                        onDragStart={(e) => e.preventDefault()}
                        onMouseDown={(e) => layout.startResize(e, c.key)} />
                  </th>
                ))}
              </tr>
              <tr className="filter-row" onClick={(e) => e.stopPropagation()}>
                {COLS.map((c) => (
                  <th key={c.key}>
                    {c.type !== "none" && (
                      <FilterCell col={c} value={filters[c.key] ?? blankFilter(c.type)}
                        onChange={(v) => setFilters((x) => ({ ...x, [c.key]: v }))}
                        options={c.type === "multi" ? filterOptions(c.key) : null}
                        open={openFilter === c.key}
                        setOpen={(o) => setOpenFilter(o ? c.key : null)} />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={COLS.length} className="no-rows">No supplies match these filters.</td></tr>
              ) : shown.map((r) => {
                const u = utilityById(r.Utility_ID);
                return (
                  <tr key={r.NRS_ID}>
                    <td className="mono ref">{r.Supply_Ref || "\u2014"}</td>
                    <td>{r.Description || "\u2014"}</td>
                    <td>{subTypeName(r.NRS_Sub_Type_ID)}</td>
                    <td>
                      <span className="dot" style={{ background: u?.colour ?? "#94a3b8" }} />
                      {u?.name ?? "\u2014"}
                    </td>
                    <td className="num">{r.Requested_kVA ?? "\u2014"}</td>
                    <td className="mono">{r.MPAN || "\u2014"}</td>
                    <td>{idnoName(r.IDNO_ID)}</td>
                    <td className="mid">{r.Self_Lay_Provider ? <span className="tick">&#10003;</span> : ""}</td>
                    <td className="mid nowrap">
                      <button className="row-edit" onClick={() => edit(r)}>Edit</button>
                      <button className="row-del" onClick={() => remove(r)} title="Delete">&#10005;</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const CSS = FILTER_CSS + `
.tab-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.tab-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.tab-head .count { font-size: 11px; font-weight: 700; background: var(--accent-light); color: var(--accent);
  border-radius: 20px; padding: 2px 8px; margin-left: 6px; vertical-align: middle; }
.tab-sub { margin: 3px 0 0; font-size: 12.5px; color: var(--muted); max-width: 70ch; }
.nrs-summary { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.nrs-pill { background: var(--accent); color: #fff; border-radius: 999px; padding: 4px 14px;
  font-size: 12px; font-weight: 700; }
.nrs-warn { font-size: 11.5px; color: #a16207; font-weight: 600; }
.nrs-form { border: 1.5px solid var(--border); border-radius: 12px; background: #f8f9fb;
  padding: 18px; margin-bottom: 18px; }
.nrs-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.nrs-grid .span2 { grid-column: span 2; }
.nrs-grid .span4 { grid-column: span 4; }
.fld.chk { display: flex; align-items: flex-end; }
label.inline { display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 500;
  text-transform: none; letter-spacing: 0; color: var(--text); margin: 0 0 6px; cursor: pointer; }
.nrs-actions { display: flex; gap: 8px; margin-top: 14px; }
.dt .num { text-align: right; }
.dt .mid { text-align: center; }
.dt .ref { color: var(--accent); font-weight: 600; }
.nowrap { white-space: nowrap; }
.mono { font-family: ui-monospace, Menlo, monospace; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
.tick { color: #059669; font-weight: 700; }
.row-edit { background: none; border: none; cursor: pointer; color: var(--accent);
  font: 600 11.5px inherit; padding: 2px 6px; border-radius: 4px; }
.row-edit:hover { background: var(--accent-light); }
.row-del { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 11px;
  padding: 2px 5px; border-radius: 4px; }
.row-del:hover { background: #fef2f2; color: #ef4444; }
.empty { text-align: center; padding: 48px 20px; border: 1px dashed var(--border);
  border-radius: var(--radius); background: var(--bg); }
.empty-title { margin: 0 0 4px; font-size: 14px; font-weight: 700; color: var(--text); }
.empty p { margin: 0; font-size: 12.5px; color: var(--muted); }
`;
