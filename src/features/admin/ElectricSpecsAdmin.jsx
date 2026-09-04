import { useState, useEffect, useMemo } from "react";
import SpecTable from "./SpecTable.jsx";
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
  /* The register sits here rather than in the sidebar: a heat pump's
     rated load is electric design data, and it was the only lookup in
     the app with 1,255 rows sitting among tables of five. */
  { id: "hp",      label: "Heat Pump Models" },
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
  hp: ["Heat_Pump_Model", "Heat_Pump_Model_ID"],
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

  const cableLabel = (id) => {
    const c = (data.sizes || []).find((x) => x.Cable_Size_ID === id);
    if (!c) return "\u2014";
    const t = (data.types || []).find((x) => x.Cable_Type_ID === c.Cable_Type_ID);
    return `${t ? t.Cable_Type + " " : ""}${c.Size_Label}`;
  };

  /* Every tab's columns in one place. Width is a starting point; the
     table remembers what anyone drags it to. */
  const SPEC_COLUMNS = useMemo(() => ({
    trans: [
      { key: "Rating_kVA", label: "Rating kVA", type: "number", width: 110 },
      { key: "Label", label: "Label", width: 150 },
      { key: "Loop_Impedance_Ohm", label: "Loop Z \u2126", type: "number", width: 110 },
      { key: "Sort_Order", label: "Sort", type: "number", width: 70 },
    ],
    types: [
      { key: "Cable_Type", label: "Cable type", width: 200 },
      { key: "Cable_Code", label: "Code", width: 90 },
      { key: "Usage_Type", label: "Usage", width: 100 },
      { key: "Voltage_Rating_ID", label: "Voltage", type: "select", width: 100,
        options: (data.voltage || []).map((v) => ({
          value: v.Voltage_Rating_ID, label: v.Voltage_Rating })) },
      { key: "Sort_Order", label: "Sort", type: "number", width: 70 },
    ],
    sizes: [
      { key: "Cable_Type_ID", label: "Cable type", type: "select", width: 180,
        options: (data.types || []).map((t) => ({
          value: t.Cable_Type_ID, label: t.Cable_Type })) },
      /* Whose Usage this size inherits.

         Usage lives on the cable TYPE, and it decides which sizes the
         drawing offers for a main and which for a service. From this
         table there was no way to see it, so the answer to "why is that
         cable not in the menu" meant crossing to Cable Types and
         matching rows by name. Read-only, because it belongs to the
         type and is edited there. */
      { key: "Usage_Type", label: "Usage", width: 100, from: "Cable Types",
        value: (r) => (data.types || [])
          .find((t) => t.Cable_Type_ID === r.Cable_Type_ID)?.Usage_Type ?? "" },
      { key: "Size_Label", label: "Size", width: 90 },
      { key: "Material", label: "Material", width: 110 },
      { key: "CSA_mm2", label: "CSA mm\u00B2", type: "number", width: 90 },
      { key: "Rating_Amps", label: "Rating A", type: "number", width: 90 },
      { key: "Preferred_Fuse_A", label: "Fuse A", type: "number", width: 85 },
      /* How much comes on one drum. A run longer than this is jointed at
         each multiple, so an empty cell means no drum joints are placed
         for that size — not that the drum is unlimited. */
      { key: "Drum_Length_m", label: "Drum m", type: "number", width: 90 },
      /* The two the volt drop sum reads. */
      { key: "Loop_Impedance_Ohm", label: "Loop Z \u2126/km", type: "number", width: 110 },
      { key: "Volt_Drop_Base", label: "VD base", type: "number", width: 90 },
      { key: "Volt_Drop_mV_A_m", label: "mV/A/m", type: "number", width: 90 },
      { key: "Resistance_Ohms_km", label: "R \u2126/km", type: "number", width: 90 },
      { key: "Reactance_Ohms_km", label: "X \u2126/km", type: "number", width: 90 },
      { key: "Sort_Order", label: "Sort", type: "number", width: 70 },
    ],
    imp: [
      { key: "Cable_Size_ID", label: "Cable", type: "select", width: 200,
        options: (data.sizes || []).map((c) => ({
          value: c.Cable_Size_ID, label: cableLabel(c.Cable_Size_ID) })) },
      { key: "Transformer_Size_ID", label: "Transformer", type: "select", width: 150,
        options: (data.trans || []).map((t) => ({
          value: t.Transformer_Size_ID, label: t.Label })) },
      { key: "Fuse_Rating_Amps", label: "Fuse A", type: "number", width: 90 },
      { key: "Loop_Impedance_Ohms", label: "Loop Z \u2126", type: "number", width: 110 },
      { key: "Volt_Drop_Pct", label: "Volt drop %", type: "number", width: 110 },
    ],
    joints: [
      { key: "Joint_Type", label: "Joint type", width: 180 },
      { key: "Joint_Code", label: "Code", width: 90 },
      { key: "Description", label: "Description", width: 260 },
      { key: "Sort_Order", label: "Sort", type: "number", width: 70 },
    ],
    voltage: [
      { key: "Voltage_Rating", label: "Rating", width: 140 },
      { key: "Sort_Order", label: "Sort", type: "number", width: 70 },
    ],
    hp: [
      { key: "Register_Number", label: "Register no.", width: 120 },
      { key: "Make", label: "Make", width: 160 },
      { key: "Model", label: "Model", width: 200 },
      /* Not decoration: 150 make-and-model pairs repeat and this is the
         only thing telling them apart. */
      { key: "Model_Reference", label: "Reference", width: 160 },
      { key: "Rated_Power_kVA", label: "Rated kVA", type: "number", width: 110 },
      { key: "Is_Active", label: "Active", type: "checkbox", width: 80 },
    ],
    cons: [
      { key: "Bedrooms", label: "Bedrooms", type: "number", width: 100 },
      { key: "Heat_Source_ID", label: "Heat source", type: "select", width: 160,
        options: heatSources.map((h) => ({
          value: h.Heat_Source_ID, label: h.Heat_Source })) },
      { key: "Consumption_kVA", label: "Consumption kVA", type: "number", width: 140 },
      { key: "Notes", label: "Notes", width: 260 },
    ],
  }), [data, heatSources]);   // eslint-disable-line react-hooks/exhaustive-deps

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

      {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}

      <div className="es-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "es-tab on" : "es-tab"} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* simple lookups share one renderer */}
      {tab !== "vd" && (
        <>
          <SpecTable
            /* key remounts it when the tab changes. useTableLayout builds
               its column order once, in a useState initialiser, so
               without this the order stays whatever the first tab had —
               and only columns present in both survive the mapping. That
               is why Cable Types showed one column and Impedances none.

               storageKey keeps each tab's arrangement separate; key is
               what makes the component read it. */
            key={tab}
            storageKey={`espec_${tab}`}
            columns={SPEC_COLUMNS[tab]}
            rows={rows}
            pk={pk}
            onCell={setCell}
            onCommit={commit}
            onDelete={delRow}
          />
          <button className="es-add" onClick={() => addRow({})}>+ Add row</button>
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
              {/* The tail's own allowance, on top of the mains figure.
                  The at-cut-out column is judged against the sum. */}
              <div className="fld"><label>Max service volt drop %</label>{cell(r, "Max_Service_Volt_Drop_Pct", "number")}</div>
              <div className="fld"><label>Unbalanced constant</label>{cell(r, "Unbalanced_Constant", "number")}</div>
              <div className="fld"><label>Distributed load factor</label>{cell(r, "Distributed_Load_Factor", "number")}</div>
              <div className="fld"><label>RAG amber %</label>{cell(r, "RAG_Amber_Pct", "number")}</div>
              {/* Metres of the leg's own cable charged for each plot
                  connection made on it. Read by the calculation since it
                  went in, but shown nowhere until now — so it sat at its
                  default with no way to see it, let alone change it.

                  Worth a word of its own because it is the only figure
                  here measured in metres: the others are limits and
                  coefficients, and somebody scanning the row would
                  reasonably read this as one too. */}
              <div className="fld">
                <label>Joint equivalent length (m)</label>
                {cell(r, "Joint_Equivalent_M", "number")}
                <span className="fld-hint">
                  Charged per plot connection, in metres of that leg&rsquo;s own
                  cable. Moves loop impedance and volt drop together. Zero
                  switches it off.
                </span>
              </div>
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
.es-in { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1.5px solid var(--border);
  border-radius: 6px; font-size: 13px; font-family: inherit; }
.es-in.num { text-align: right; }
.es-in:focus { border-color: var(--accent); outline: none; }
.es-x { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 11px;
  padding: 3px 6px; border-radius: 4px; }
.es-x:hover { background: #fef2f2; color: #ef4444; }
.es-add { margin-top: 10px; background: none; border: 1px dashed var(--border); border-radius: 6px;
  padding: 8px 14px; cursor: pointer; font: 600 12.5px inherit; color: var(--accent); }
.es-add:hover { background: var(--accent-light); }
.vd-panel { max-width: 640px; }
/* Top-aligned rather than bottom. One field now carries a line of hint
   beneath it, and on end-alignment that cell's extra height pushed its
   input out of line with the rest of the row. */
.vd-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; align-items: start; }
.vd-grid .fld-hint { display: block; margin-top: 4px; font-size: 11px; line-height: 1.35;
  color: var(--muted); text-transform: none; letter-spacing: 0; font-weight: 400; }
.vd-check { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600;
  text-transform: none; letter-spacing: 0; color: var(--text); margin: 0 0 8px; cursor: pointer; }
`;
