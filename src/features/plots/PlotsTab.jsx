import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import AddPlotsForm from "./AddPlotsForm.jsx";
import { getLookups } from "../../api/lookups.js";
import { listPlots, deletePlot } from "../../api/plots.js";
import { getProject, updateProject } from "../../api/projects.js";
import { bulkUpdatePlots, bulkDeletePlots } from "../../api/plots.js";
import { useTableLayout, TABLE_CSS } from "../../lib/useTableLayout.js";
import FilterCell, { blankFilter, isActive, rowPasses, FILTER_CSS } from "../../components/FilterCell.jsx";
import Select from "../../components/Select.jsx";

/* "10" sorts after "9", not before — Plot_Number is text because of 43A
   and B1, so compare the numeric prefix when both rows have one. */
function naturalCompare(a, b) {
  const re = /^(\d+)(.*)$/;
  const ma = re.exec(a);
  const mb = re.exec(b);
  if (ma && mb) {
    const diff = Number(ma[1]) - Number(mb[1]);
    return diff !== 0 ? diff : ma[2].localeCompare(mb[2]);
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}


/* Same palette as the original app's Property Config admin and plot badges.
   Three-bed is the odd one out: black text, because the yellow is too light
   to carry white. */
const BED_COLORS = {
  1: { bg: "#7c3aed", fg: "#fff" },
  2: { bg: "#65a30d", fg: "#fff" },
  3: { bg: "#eab308", fg: "#000" },
  4: { bg: "#dc2626", fg: "#fff" },
  5: { bg: "#0ea5e9", fg: "#fff" },
  6: { bg: "#39467B", fg: "#fff" },
};
const BED_FALLBACK = { bg: "#6b7280", fg: "#fff" };

/* Bedroom mix across the project. Counts of zero are omitted; plots with no
   bedroom value collect under "Unspecified". Hovering a pill breaks that
   bedroom count down by house type, highest first. */
function BedroomSummary({ plots, configFor, typeName }) {
  if (!plots.length) return null;

  const groups = {};
  plots.forEach((p) => {
    const cfg = configFor(p.Property_Config_ID);
    const beds = cfg?.Bedrooms == null ? "null" : Number(cfg.Bedrooms);
    const type = cfg?.Property_Type_ID ?? "null";
    if (!groups[beds]) groups[beds] = { total: 0, byType: {} };
    groups[beds].total++;
    groups[beds].byType[type] = (groups[beds].byType[type] || 0) + 1;
  });

  const bedKeys = Object.keys(groups)
    .filter((k) => k !== "null")
    .map(Number)
    .sort((a, b) => a - b);

  const totalKva = plots.reduce((sum, p) => sum + (Number(p.KVA_Load) || 0), 0);
  const missingKva = plots.filter((p) => p.KVA_Load == null || p.KVA_Load === "").length;

  const Tooltip = ({ g }) => (
    <span className="bed-tooltip">
      <span className="bed-tooltip-title">Configuration Breakdown</span>
      {Object.entries(g.byType)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => (
          <span className="bed-tooltip-row" key={type}>
            <span className="lbl">{type === "null" ? "Unspecified" : typeName(Number(type))}</span>
            <span className="val">{count}</span>
          </span>
        ))}
    </span>
  );

  const pill = (key, label, count, colour, g) => (
    <span className="bed-pill" key={key} style={{ background: colour.bg, color: colour.fg }}>
      <span>{label}</span>
      <span className="bed-count">{count}</span>
      <Tooltip g={g} />
    </span>
  );

  return (
    <div className="bed-summary">
      {bedKeys.map((beds) =>
        pill(beds, `${beds} Bed`, groups[beds].total, BED_COLORS[beds] || BED_FALLBACK, groups[beds])
      )}
      {groups["null"] && pill("none", "Unspecified", groups["null"].total, BED_FALLBACK, groups["null"])}
      {totalKva > 0 && (
        <span
          className="bed-pill load"
          title={`Sum of the kVA column across ${plots.length - missingKva} plot${
            plots.length - missingKva === 1 ? "" : "s"
          }`}
        >
          <span>Total Load</span>
          <span className="bed-count">{totalKva.toFixed(2)} kVA</span>
        </span>
      )}
      {missingKva > 0 && (
        <span className="bed-missing">
          {missingKva} plot{missingKva === 1 ? "" : "s"} excluded &mdash; no kVA
        </span>
      )}
    </div>
  );
}

const COLS = (cfg, typeName, hpName) => [
  { key: "sel",    label: "",             width: 38,  type: "none" },
  { key: "ref",    label: "Plot ref",     width: 140, type: "text",  raw: (p) => p.Plot_Ref || "" },
  { key: "num",    label: "Plot",         width: 80,  type: "text",  raw: (p) => p.Plot_Number },
  { key: "type",   label: "House type",   width: 190, type: "multi", raw: (p) => p.Property_Config_ID },
  { key: "beds",   label: "Beds",         width: 74,  type: "num",   align: "right", raw: (p) => cfg(p.Property_Config_ID)?.Bedrooms ?? null },
  { key: "kva",    label: "kVA",          width: 82,  type: "num",   align: "right", raw: (p) => p.KVA_Load ?? null },
  { key: "hp",     label: "Heat pump",    width: 170, type: "multi", raw: (p) => p.Heat_Pump_Model_ID },
  { key: "pv",     label: "PV",           width: 60,  type: "bool",  align: "center", raw: (p) => !!p.PV },
  { key: "slp",    label: "SLP",          width: 60,  type: "bool",  align: "center", raw: (p) => !!p.Self_Lay_Provider },
  { key: "act",    label: "",             width: 44,  type: "none" },
];

export default function PlotsTab({ projectId, projectRef }) {
  const [sort, setSort] = useState({ key: "num", dir: "asc" });
  const [filters, setFilters] = useState({});
  const [openFilter, setOpenFilter] = useState(null);
  const [selected, setSelected] = useState([]);
  const [bulk, setBulk] = useState({ Property_Config_ID: "", Heat_Pump_Model_ID: "", KVA_Load: "", PV: "", Self_Lay_Provider: "" });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [mode, setMode] = useState("list");
  const [plots, setPlots] = useState([]);
  const [lookups, setLookups] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [defaults, setDefaults] = useState({ Default_Heat_Source_ID: "", Heat_Pump_Model_ID: "" });
  const [savedDefaults, setSavedDefaults] = useState({});
  const [savingDefaults, setSavingDefaults] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [lk, res, proj] = await Promise.all([
        getLookups(), listPlots(projectId), getProject(projectId),
      ]);
      setLookups(lk);
      setPlots(res.rows || []);
      const d = {
        Default_Heat_Source_ID: proj.Default_Heat_Source_ID ?? "",
        Heat_Pump_Model_ID: proj.Heat_Pump_Model_ID ?? "",
      };
      setDefaults(d);
      setSavedDefaults(d);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const sorted = useMemo(
    () => [...plots].sort((a, b) => naturalCompare(a.Plot_Number, b.Plot_Number)),
    [plots]
  );

  const configFor = (id) =>
    (lookups?.propertyConfigs || []).find((c) => c.Property_Config_ID === id) || null;
  const typeName = (id) =>
    (lookups?.propertyTypes || []).find((t) => t.Property_Type_ID === id)?.Property_Type ?? "\u2014";
  const heatPumpName = (id) =>
    (lookups?.heatPumpModels || []).find((m) => m.Heat_Pump_Model_ID === id)?.Model ?? "\u2014";

  const defaultsDirty =
    defaults.Default_Heat_Source_ID !== savedDefaults.Default_Heat_Source_ID ||
    defaults.Heat_Pump_Model_ID !== savedDefaults.Heat_Pump_Model_ID;

  async function saveDefaults() {
    setSavingDefaults(true);
    try {
      await updateProject(projectId, {
        Default_Heat_Source_ID: defaults.Default_Heat_Source_ID || null,
        Heat_Pump_Model_ID: defaults.Heat_Pump_Model_ID || null,
      });
      setSavedDefaults({ ...defaults });
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingDefaults(false);
    }
  }

  const hpName = (id) =>
    (lookups?.heatPumpModels || []).find((m) => m.Heat_Pump_Model_ID === id)?.Model ?? "\u2014";

  const columns = useMemo(() => COLS(configFor, typeName, hpName), [lookups]);
  const layout = useTableLayout("plots", columns);

  const filterOptions = (key) => {
    if (key === "type")
      return (lookups?.propertyConfigs || []).map((c) => ({
        id: c.Property_Config_ID,
        label: `${c.Code} \u2014 ${c.Bedrooms} Bed ${typeName(c.Property_Type_ID)}`,
      }));
    if (key === "hp")
      return (lookups?.heatPumpModels || []).map((m) => ({ id: m.Heat_Pump_Model_ID, label: m.Model }));
    return [];
  };

  const shown = useMemo(() => {
    const out = plots.filter((p) => rowPasses(p, columns.filter((c) => c.type !== "none"), filters));
    const col = columns.find((c) => c.key === sort.key);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      if (!col) return 0;
      const va = col.raw(a), vb = col.raw(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return naturalCompare(String(va), String(vb)) * dir;
    });
  }, [plots, filters, sort, columns]);

  const allSelected = shown.length > 0 && shown.every((p) => selected.includes(p.Plot_ID));

  const hasBulk = Object.values(bulk).some((v) => v !== "");

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  async function applyBulk() {
    const changes = {};
    if (bulk.Property_Config_ID) changes.Property_Config_ID = Number(bulk.Property_Config_ID);
    if (bulk.Heat_Pump_Model_ID) changes.Heat_Pump_Model_ID = Number(bulk.Heat_Pump_Model_ID);
    if (bulk.KVA_Load !== "") changes.KVA_Load = Number(bulk.KVA_Load);
    if (bulk.PV) changes.PV = bulk.PV === "y";
    if (bulk.Self_Lay_Provider) changes.Self_Lay_Provider = bulk.Self_Lay_Provider === "y";
    setBulkBusy(true);
    try {
      await bulkUpdatePlots(projectId, selected, changes);
      setBulk({ Property_Config_ID: "", Heat_Pump_Model_ID: "", KVA_Load: "", PV: "", Self_Lay_Provider: "" });
      setSelected([]);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function deleteSelected() {
    if (!window.confirm(`Delete ${selected.length} plot${selected.length === 1 ? "" : "s"}?`)) return;
    setBulkBusy(true);
    try {
      await bulkDeletePlots(projectId, selected);
      setSelected([]);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function remove(plot) {
    if (!window.confirm(`Remove plot ${plot.Plot_Number}?`)) return;
    try {
      await deletePlot(projectId, plot.Plot_ID);
      setPlots((p) => p.filter((x) => x.Plot_ID !== plot.Plot_ID));
    } catch (e) {
      setError(e.message);
    }
  }

  if (mode === "add") {
    return (
      <AddPlotsForm
        projectId={projectId}
        projectRef={projectRef}
        existingNumbers={plots.map((p) => String(p.Plot_Number))}
        onDone={() => {
          setMode("list");
          load();
        }}
      />
    );
  }

  if (loading) return <div className="loading">Loading plots&hellip;</div>;

  return (
    <div>
      <style>{CSS}</style>

      <div className="tab-head">
        <div>
          <h3>
            Plots <span className="count">{plots.length}</span>
          </h3>
          <p className="tab-sub">Every plot on this site, with its connection attributes.</p>
        </div>
        <button className="btn accent" onClick={() => setMode("add")}>
          + Add plots
        </button>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      <div className="plot-defaults">
        <span className="pd-label">Plot defaults</span>
        <div className="pd-field">
          <label>Heat source</label>
          <Select
            value={defaults.Default_Heat_Source_ID}
            onChange={(v) => setDefaults((d) => ({ ...d, Default_Heat_Source_ID: v }))}
          >
            <option value="">&mdash; none &mdash;</option>
            {(lookups?.heatSources || []).map((h) => (
              <option key={h.Heat_Source_ID} value={h.Heat_Source_ID}>{h.Heat_Source}</option>
            ))}
          </Select>
        </div>
        <div className="pd-field">
          <label>Heat pump model</label>
          <Select
            value={defaults.Heat_Pump_Model_ID}
            onChange={(v) => setDefaults((d) => ({ ...d, Heat_Pump_Model_ID: v }))}
          >
            <option value="">&mdash; none &mdash;</option>
            {(lookups?.heatPumpModels || []).map((m) => (
              <option key={m.Heat_Pump_Model_ID} value={m.Heat_Pump_Model_ID}>{m.Model}</option>
            ))}
          </Select>
        </div>
        <button className="btn accent pd-save" disabled={!defaultsDirty || savingDefaults} onClick={saveDefaults}>
          {savingDefaults ? "Saving\u2026" : defaultsDirty ? "Save" : "Saved"}
        </button>
        <span className="pd-note">Applies where a plot has no value of its own.</span>
      </div>

      <BedroomSummary plots={plots} configFor={configFor} typeName={typeName} />

      {plots.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No plots yet</p>
          <p>Add them individually or as a numbered range.</p>
          <button className="btn accent" onClick={() => setMode("add")}>
            + Add plots
          </button>
        </div>
      ) : (
        <>
          {selected.length > 0 && (
            <div className="bulk-bar">
              <span className="bulk-count">{selected.length} selected</span>
              <select value={bulk.Property_Config_ID}
                onChange={(e) => setBulk((b) => ({ ...b, Property_Config_ID: e.target.value }))}>
                <option value="">House type&hellip;</option>
                {(lookups?.propertyConfigs || []).map((c) => (
                  <option key={c.Property_Config_ID} value={c.Property_Config_ID}>
                    {c.Code} — {c.Bedrooms} Bed {typeName(c.Property_Type_ID)}
                  </option>
                ))}
              </select>
              <select value={bulk.Heat_Pump_Model_ID}
                onChange={(e) => setBulk((b) => ({ ...b, Heat_Pump_Model_ID: e.target.value }))}>
                <option value="">Heat pump&hellip;</option>
                {(lookups?.heatPumpModels || []).map((m) => (
                  <option key={m.Heat_Pump_Model_ID} value={m.Heat_Pump_Model_ID}>{m.Model}</option>
                ))}
              </select>
              <input type="number" step="0.1" placeholder="kVA" className="bulk-kva"
                value={bulk.KVA_Load} onChange={(e) => setBulk((b) => ({ ...b, KVA_Load: e.target.value }))} />
              <select value={bulk.PV} onChange={(e) => setBulk((b) => ({ ...b, PV: e.target.value }))}>
                <option value="">PV&hellip;</option><option value="y">PV: Yes</option><option value="n">PV: No</option>
              </select>
              <select value={bulk.Self_Lay_Provider}
                onChange={(e) => setBulk((b) => ({ ...b, Self_Lay_Provider: e.target.value }))}>
                <option value="">SLP&hellip;</option><option value="y">SLP: Yes</option><option value="n">SLP: No</option>
              </select>
              <button className="btn accent" disabled={bulkBusy || !hasBulk} onClick={applyBulk}>
                {bulkBusy ? "Applying\u2026" : "Apply"}
              </button>
              <button className="btn ghost danger" disabled={bulkBusy} onClick={deleteSelected}>Delete</button>
              <button className="bulk-x" onClick={() => setSelected([])} title="Clear selection">&#10005;</button>
            </div>
          )}

          <div className="dt-wrap">
            <table className="dt">
              <colgroup>
                {layout.visible.map((c) => <col key={c.key} style={{ width: layout.widths[c.key] }} />)}
              </colgroup>
              <thead>
                <tr className="head-row">
                  {layout.visible.map((c) => (
                    <th key={c.key} style={{ textAlign: c.align || "left" }}
                        onClick={() => c.type !== "none" && toggleSort(c.key)}>
                      {c.key === "sel" ? (
                        <input type="checkbox" checked={allSelected}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setSelected(e.target.checked ? shown.map((p) => p.Plot_ID) : [])} />
                      ) : (<>
                        {c.label}
                        {sort.key === c.key && <span className="arrow">{sort.dir === "asc" ? "\u25B2" : "\u25BC"}</span>}
                      </>)}
                      <span className="resizer" onMouseDown={(e) => layout.startResize(e, c.key)} />
                    </th>
                  ))}
                </tr>
                <tr className="filter-row" onClick={(e) => e.stopPropagation()}>
                  {layout.visible.map((c) => (
                    <th key={c.key}>
                      {c.type !== "none" && (
                        <FilterCell col={c} value={filters[c.key] ?? blankFilter(c.type)}
                          onChange={(v) => setFilters((f) => ({ ...f, [c.key]: v }))}
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
                  <tr><td colSpan={layout.visible.length} className="no-rows">No plots match these filters.</td></tr>
                ) : shown.map((p) => {
                  const c = configFor(p.Property_Config_ID);
                  const on = selected.includes(p.Plot_ID);
                  return (
                    <tr key={p.Plot_ID} className={on ? "row-sel" : ""}>
                      {layout.visible.map((col) => (
                        <td key={col.key} style={{ textAlign: col.align || "left" }}>
                          {col.key === "sel" ? (
                            <input type="checkbox" checked={on}
                              onChange={() => setSelected((s) => on ? s.filter((x) => x !== p.Plot_ID) : [...s, p.Plot_ID])} />
                          ) : col.key === "ref" ? <span className="mono ref">{p.Plot_Ref || "\u2014"}</span>
                            : col.key === "num" ? <span className="mono">{p.Plot_Number}</span>
                            : col.key === "type" ? (c ? <><span className="code-chip">{c.Code}</span> {typeName(c.Property_Type_ID)}</> : "\u2014")
                            : col.key === "beds" ? (c?.Bedrooms ?? "\u2014")
                            : col.key === "kva" ? (p.KVA_Load ?? "\u2014")
                            : col.key === "hp" ? hpName(p.Heat_Pump_Model_ID)
                            : col.key === "pv" ? (p.PV ? <span className="tick">&#10003;</span> : "")
                            : col.key === "slp" ? (p.Self_Lay_Provider ? <span className="tick">&#10003;</span> : "")
                            : (
                              <button className="row-del" onClick={() => remove(p)} aria-label={`Remove plot ${p.Plot_Number}`}>
                                &#10005;
                              </button>
                            )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const CSS = TABLE_CSS + FILTER_CSS + `
.tab-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; margin-bottom: 14px;
}
.tab-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.tab-head .count {
  font-size: 11px; font-weight: 700; background: var(--accent-light);
  color: var(--accent); border-radius: 20px; padding: 2px 8px; margin-left: 6px; vertical-align: middle;
}
.tab-sub { margin: 3px 0 0; font-size: 12.5px; color: var(--muted); }

.plot-defaults {
  display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap;
  border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--bg); padding: 10px 14px; margin-bottom: 16px;
}
.pd-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em;
  color: var(--accent); align-self: center; }
.pd-field { min-width: 168px; }
.pd-field label { display: block; font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: .06em; color: var(--muted); margin-bottom: 3px; }
.pd-save { padding: 6px 14px; font-size: 12.5px; }
.pd-note { font-size: 11px; color: var(--muted); margin-left: auto; align-self: center; }

.bulk-bar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  background: var(--accent); color: #fff; border-radius: var(--radius);
  padding: 9px 12px; margin-bottom: 10px;
}
.bulk-count { font-size: 12px; font-weight: 700; white-space: nowrap; }
.bulk-bar select, .bulk-bar input { width: auto; min-width: 118px; font-size: 12px; padding: 5px 8px; }
.bulk-kva { width: 78px !important; min-width: 0 !important; }
.bulk-bar .btn { padding: 5px 13px; font-size: 12.5px; }
.bulk-bar .btn.ghost.danger { color: #b91c1c; }
.bulk-x { background: none; border: none; color: #fff; cursor: pointer; font-size: 12px; margin-left: auto; }
.dt tbody tr.row-sel { background: #fff7ed !important; }

.empty { text-align: center; padding: 48px 20px; border: 1px dashed var(--border);
  border-radius: var(--radius); background: var(--bg); }
.empty-title { margin: 0 0 4px; font-size: 14px; font-weight: 700; color: var(--text); }
.empty p { margin: 0 0 14px; font-size: 12.5px; color: var(--muted); }
.mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
.dt .ref { color: var(--accent); font-weight: 600; }
.tick { color: #059669; font-weight: 700; }
.code-chip { font-family: ui-monospace, Menlo, monospace; font-weight: 700; font-size: 11px;
  background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; }
.row-del { background: none; border: none; cursor: pointer; color: var(--muted);
  font-size: 11px; padding: 2px 5px; border-radius: 4px; }
.row-del:hover { background: #fef2f2; color: #ef4444; }

.bed-summary { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;
  align-items: center; margin: 0 0 16px; }
.bed-pill { position: relative; display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700;
  white-space: nowrap; cursor: default; }
.bed-pill.load { background: var(--accent); color: #fff; }
.bed-count { background: rgba(255,255,255,.3); border-radius: 999px; padding: 1px 7px; font-size: 11.5px; }
.bed-missing { font-size: 11.5px; color: var(--muted); font-weight: 600; }
.bed-tooltip { position: absolute; bottom: calc(100% + 7px); left: 50%; transform: translateX(-50%);
  display: none; flex-direction: column; gap: 3px; z-index: 30; background: #1a1d23; color: #f1f5f9;
  border-radius: 7px; padding: 9px 11px; min-width: 168px; box-shadow: 0 6px 18px rgba(0,0,0,.28);
  font-size: 11.5px; font-weight: 500; text-align: left; }
.bed-pill:hover .bed-tooltip { display: flex; }
.bed-tooltip::after { content: ""; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
  border: 5px solid transparent; border-top-color: #1a1d23; }
.bed-tooltip-title { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em;
  opacity: .65; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,.15); margin-bottom: 2px; }
.bed-tooltip-row { display: flex; justify-content: space-between; gap: 14px; }
.bed-tooltip-row .val { font-weight: 700; }
`;
