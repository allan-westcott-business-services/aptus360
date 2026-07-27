import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { adminList, adminCreate, adminUpdate, adminDelete } from "../../api/admin.js";

/* Electric Specs — the LV design data.

   Always-editable inline inputs rather than click-to-edit cells: several
   of these tabs, the impedance matrix especially, read as a grid and
   click-to-edit makes filling one in tedious. Edits save on blur. */

const TABS = [
  { id: "trans",   label: "Transformer Size" },
  { id: "imp",     label: "Impedances" },
  { id: "types",   label: "Cable Types" },
  { id: "sizes",   label: "Cable Specs" },
  { id: "joints",  label: "Joints" },
  { id: "voltage", label: "Voltage Rating" },
  { id: "cons",    label: "House Type Consumption" },
  { id: "vd",      label: "Volt Drop Limits" },
];

const TABLE_FOR = {
  trans: ["Electric_Transformer_Size", "Transformer_Size_ID"],
  types: ["Electric_Cable_Type", "Cable_Type_ID"],
  sizes: ["Electric_Cable_Size", "Cable_Size_ID"],
  imp: ["Electric_Impedance", "Impedance_ID"],
  joints: ["Electric_Joint", "Joint_ID"],
  voltage: ["Voltage_Rating", "Voltage_Rating_ID"],
  cons: ["House_Type_Consumption", "Consumption_ID"],
  vd: ["Electric_VD_Setting", "VD_Setting_ID"],
};

const num = (v) => (v === "" || v == null ? null : Number(v));

export default function ElectricSpecsAdmin() {
  const [tab, setTab] = useState("trans");
  const [data, setData] = useState({});
  const [heatSources, setHeatSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    try {
      const keys = Object.keys(TABLE_FOR);
      const res = await Promise.all(keys.map((k) => adminList(TABLE_FOR[k][0])));
      const next = {};
      keys.forEach((k, i) => { next[k] = res[i].rows || []; });
      setData(next);
      const hs = await adminList("Heat_Source");
      setHeatSources(hs.rows || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadAll(); }, []);

  const [table, pk] = TABLE_FOR[tab];
  const rows = data[tab] || [];

  /* Optimistic locally, written on blur — typing across a grid shouldn't
     fire a request per keystroke. */
  const setCell = (id, col, value) =>
    setData((d) => ({
      ...d,
      [tab]: (d[tab] || []).map((r) => (r[pk] === id ? { ...r, [col]: value } : r)),
    }));

  async function commit(id, col, value) {
    setSaving(true);
    try { await adminUpdate(table, id, { [col]: value }); setError(""); }
    catch (e) { setError(e.message); await loadAll(); }
    finally { setSaving(false); }
  }

  async function addRow(seed = {}) {
    try { await adminCreate(table, seed); await loadAll(); }
    catch (e) { setError(e.message); }
  }
  async function delRow(id) {
    if (!window.confirm("Delete this row?")) return;
    try { await adminDelete(table, id, pk); await loadAll(); }
    catch (e) { setError(e.message); }
  }

  const cell = (r, col, type = "text") => (
    <input
      className={type === "number" ? "es-in num" : "es-in"}
      type={type}
      step={type === "number" ? "any" : undefined}
      value={r[col] ?? ""}
      onChange={(e) => setCell(r[pk], col, e.target.value)}
      onBlur={(e) => commit(r[pk], col, type === "number" ? num(e.target.value) : e.target.value)}
    />
  );

  const pick = (r, col, options, valKey, labelKey) => (
    <select className="es-in" value={r[col] ?? ""}
      onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; setCell(r[pk], col, v); commit(r[pk], col, v); }}>
      <option value="">&mdash;</option>
      {options.map((o) => <option key={o[valKey]} value={o[valKey]}>{o[labelKey]}</option>)}
    </select>
  );

  const cableLabel = (id) => {
    const c = (data.sizes || []).find((x) => x.Cable_Size_ID === id);
    if (!c) return "\u2014";
    const t = (data.types || []).find((x) => x.Cable_Type_ID === c.Cable_Type_ID);
    return `${t ? t.Cable_Type + " " : ""}${c.Size_Label}`;
  };

  const COLUMNS = useMemo(() => ({
    trans: [["Rating_kVA", "Rating kVA", "number"], ["Label", "Label"], ["Sort_Order", "Sort", "number"]],
    types: [["Cable_Type", "Cable type"], ["Cable_Code", "Code"], ["Sort_Order", "Sort", "number"]],
    joints: [["Joint_Type", "Joint type"], ["Joint_Code", "Code"], ["Description", "Description"], ["Sort_Order", "Sort", "number"]],
    voltage: [["Voltage_Rating", "Rating"], ["Sort_Order", "Sort", "number"]],
  }), []);

  if (loading) return <div className="loading">Loading electric specs&hellip;</div>;

  return (
    <div>
      <style>{CSS}</style>
      <div className="es-head">
        <h2 className="admin-title">Electric Specs</h2>
        {saving && <span className="es-saving">Saving&hellip;</span>}
      </div>
      <p className="es-note">
        LV design data. Separate from the shared cable table because these carry
        electrical properties &mdash; rating, fuse, volt drop, loop impedance.
      </p>

      {error && <Banner kind="error">{error}</Banner>}

      <div className="es-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "es-tab on" : "es-tab"} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* simple lookups share one renderer */}
      {COLUMNS[tab] && (
        <>
          <table className="es-table">
            <thead>
              <tr>{COLUMNS[tab].map(([, label]) => <th key={label}>{label}</th>)}<th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[pk]}>
                  {COLUMNS[tab].map(([col, , type]) => <td key={col}>{cell(r, col, type)}</td>)}
                  <td className="mid"><button className="es-x" onClick={() => delRow(r[pk])}>&#10005;</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="es-add" onClick={() => addRow({})}>+ Add row</button>
        </>
      )}

      {tab === "sizes" && (
        <>
          <table className="es-table">
            <thead>
              <tr><th>Cable type</th><th>Size</th><th>CSA mm&sup2;</th><th>Rating A</th>
                <th>mV/A/m</th><th>R &#8486;/km</th><th>X &#8486;/km</th><th>Sort</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[pk]}>
                  <td>{pick(r, "Cable_Type_ID", data.types || [], "Cable_Type_ID", "Cable_Type")}</td>
                  <td>{cell(r, "Size_Label")}</td>
                  <td>{cell(r, "CSA_mm2", "number")}</td>
                  <td>{cell(r, "Rating_Amps", "number")}</td>
                  <td>{cell(r, "Volt_Drop_mV_A_m", "number")}</td>
                  <td>{cell(r, "Resistance_Ohms_km", "number")}</td>
                  <td>{cell(r, "Reactance_Ohms_km", "number")}</td>
                  <td>{cell(r, "Sort_Order", "number")}</td>
                  <td className="mid"><button className="es-x" onClick={() => delRow(r[pk])}>&#10005;</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="es-add" onClick={() => addRow({ Size_Label: "New size" })}>+ Add cable size</button>
        </>
      )}

      {tab === "imp" && (
        <>
          <p className="es-hint">
            Loop impedance and volt drop for a cable size against a transformer and fuse
            rating &mdash; one row per combination the sizing check needs.
          </p>
          <table className="es-table">
            <thead>
              <tr><th>Cable</th><th>Transformer</th><th>Fuse A</th>
                <th>Loop Z &#8486;</th><th>Volt drop %</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[pk]}>
                  <td>{pick(r, "Cable_Size_ID", (data.sizes || []).map((c) => ({ ...c, _l: cableLabel(c.Cable_Size_ID) })), "Cable_Size_ID", "_l")}</td>
                  <td>{pick(r, "Transformer_Size_ID", data.trans || [], "Transformer_Size_ID", "Label")}</td>
                  <td>{cell(r, "Fuse_Rating_Amps", "number")}</td>
                  <td>{cell(r, "Loop_Impedance_Ohms", "number")}</td>
                  <td>{cell(r, "Volt_Drop_Pct", "number")}</td>
                  <td className="mid"><button className="es-x" onClick={() => delRow(r[pk])}>&#10005;</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="es-add" onClick={() => addRow({})}>+ Add impedance row</button>
        </>
      )}

      {tab === "cons" && (
        <>
          <p className="es-hint">
            Load per dwelling by bedrooms and heat source &mdash; what turns a plot
            schedule into a demand figure.
          </p>
          <table className="es-table">
            <thead>
              <tr><th>Bedrooms</th><th>Heat source</th><th>Consumption kVA</th><th>Notes</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[pk]}>
                  <td>{cell(r, "Bedrooms", "number")}</td>
                  <td>{pick(r, "Heat_Source_ID", heatSources, "Heat_Source_ID", "Heat_Source")}</td>
                  <td>{cell(r, "Consumption_kVA", "number")}</td>
                  <td>{cell(r, "Notes")}</td>
                  <td className="mid"><button className="es-x" onClick={() => delRow(r[pk])}>&#10005;</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="es-add" onClick={() => addRow({ Bedrooms: 3 })}>+ Add consumption row</button>
        </>
      )}

      {tab === "vd" && (
        <div className="vd-panel">
          <p className="es-hint">
            One settings row feeding the end-of-line loop impedance and volt drop check.
          </p>
          {(rows[0] ? [rows[0]] : []).map((r) => (
            <div className="vd-grid" key={r[pk]}>
              <label className="vd-check">
                <input type="checkbox" checked={!!r.Unbalanced}
                  onChange={(e) => { setCell(r[pk], "Unbalanced", e.target.checked); commit(r[pk], "Unbalanced", e.target.checked); }} />
                Unbalanced
              </label>
              <div className="fld"><label>Max loop &#8486;</label>{cell(r, "Max_Loop_Ohms", "number")}</div>
              <div className="fld"><label>Max volt drop %</label>{cell(r, "Max_Volt_Drop_Pct", "number")}</div>
              <div className="fld"><label>Unbalanced constant</label>{cell(r, "Unbalanced_Constant", "number")}</div>
              <div className="fld"><label>Distributed load factor</label>{cell(r, "Distributed_Load_Factor", "number")}</div>
              <div className="fld"><label>RAG amber %</label>{cell(r, "RAG_Amber_Pct", "number")}</div>
            </div>
          ))}
          {rows.length === 0 && (
            <button className="es-add" onClick={() => addRow({})}>+ Create settings row</button>
          )}
        </div>
      )}
    </div>
  );
}

const CSS = `
.es-head { display: flex; align-items: center; gap: 12px; }
.es-saving { font-size: 11.5px; color: var(--muted); }
.es-note { font-size: 12.5px; color: var(--muted); margin: -10px 0 14px; max-width: 74ch; }
.es-hint { font-size: 12px; color: var(--muted); margin: 0 0 10px; max-width: 74ch; }
.es-tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 14px; }
.es-tab { background: none; border: none; border-bottom: 2px solid transparent; padding: 7px 13px;
  margin-bottom: -1px; cursor: pointer; font: 600 12.5px inherit; color: var(--muted); white-space: nowrap; }
.es-tab:hover { color: var(--text); }
.es-tab.on { color: var(--accent); border-bottom-color: var(--accent); }
.es-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.es-table th { padding: 8px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; color: var(--muted); border-bottom: 2px solid var(--border);
  text-align: left; white-space: nowrap; }
.es-table td { padding: 4px 6px; border-bottom: 1px solid var(--border); }
.es-in { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1.5px solid var(--border);
  border-radius: 6px; font-size: 13px; font-family: inherit; }
.es-in.num { text-align: right; }
.es-in:focus { border-color: var(--accent); outline: none; }
.es-table .mid { text-align: center; }
.es-x { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 11px;
  padding: 3px 6px; border-radius: 4px; }
.es-x:hover { background: #fef2f2; color: #ef4444; }
.es-add { margin-top: 10px; background: none; border: 1px dashed var(--border); border-radius: 6px;
  padding: 8px 14px; cursor: pointer; font: 600 12.5px inherit; color: var(--accent); }
.es-add:hover { background: var(--accent-light); }
.vd-panel { max-width: 640px; }
.vd-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; align-items: end; }
.vd-check { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600;
  text-transform: none; letter-spacing: 0; color: var(--text); margin: 0 0 8px; cursor: pointer; }
`;
