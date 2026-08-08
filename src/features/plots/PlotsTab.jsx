import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import AddPlotsForm from "./AddPlotsForm.jsx";
import { getLookups } from "../../api/lookups.js";
import { listPlots, deletePlot } from "../../api/plots.js";
import { getProject, updateProject } from "../../api/projects.js";
import { generateConnections } from "../../api/connections.js";
import { listDevelopers, assignPlots } from "../../api/developers.js";
import { bulkUpdatePlots, bulkDeletePlots } from "../../api/plots.js";
import { useTableLayout } from "../../lib/useTableLayout.js";
import { RESIDENTIAL_UTILITIES as UTILS } from "../../lib/utilities.js";
import FilterCell, { blankFilter, isActive, rowPasses, FILTER_CSS } from "../../components/FilterCell.jsx";
import Select from "../../components/Select.jsx";
import { heatPumpLabel, heatPumpShort, sourceTakesHeatPump, kvaSourceText } from "../../lib/heatPump.js";
import HeatPumpPicker from "../../components/HeatPumpPicker.jsx";

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

  /* The working load, not the override. KVA_Resolved carries whatever
     the database settled on — the plot's own figure if someone entered
     one, otherwise the house type's, keyed on bedrooms and heat source
     together. A plot missing either lookup has none, and that is what
     "missing" now counts: plots with no load from any source, rather
     than plots with an empty override column, which is nearly all of
     them and told nobody anything. */
  const kvaOf = (p) => (p.KVA_Resolved ?? p.KVA_Load);
  const totalKva = plots.reduce((sum, p) => sum + (Number(kvaOf(p)) || 0), 0);
  const missingKva = plots.filter((p) => kvaOf(p) == null || kvaOf(p) === "").length;

  /* The average across the plots that have a figure, and what the whole
     site comes to at that rate.

     The total on its own is the sum of what is known, which on a scheme
     part way through specifying reads low and gives no hint that it is
     low — a site of two hundred plots with forty specified shows a fifth
     of its real demand and looks like an answer.

     Projecting the average over every plot is not a design figure and
     must not be mistaken for one. It is what the site is likely to come
     to, for sizing a POC application before every house type is settled,
     and it is labelled as an estimate for that reason.

     Only where something is actually missing. With every plot specified
     the projection and the total are the same number, and showing both
     invites the question of why they differ. */
  const knownCount = plots.length - missingKva;
  const avgKva = knownCount > 0 ? totalKva / knownCount : 0;
  const projectedKva = avgKva * plots.length;

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
      {missingKva > 0 && knownCount > 0 && (
        <span
          className="bed-pill load est"
          title={`${avgKva.toFixed(2)} kVA average across the ${knownCount} plot${
            knownCount === 1 ? "" : "s"
          } that have a figure, applied to all ${plots.length}`}
        >
          <span>Estimated Total</span>
          <span className="bed-count">{projectedKva.toFixed(2)} kVA</span>
        </span>
      )}
      {knownCount > 0 && (
        <span className="bed-avg" title="Total load divided by the plots that have one">
          {avgKva.toFixed(2)} kVA average per plot
        </span>
      )}
      {missingKva > 0 && (
        <span className="bed-missing">
          {missingKva} plot{missingKva === 1 ? "" : "s"} without a kVA figure
          {" \u2014 the estimate assumes they match the rest"}
        </span>
      )}
    </div>
  );
}

const COLS = (cfg, typeName, hpName) => [
  { key: "sel",    label: "",             width: 38,  type: "none" },
  { key: "ref",    label: "Plot ref",     width: 140, type: "text",  raw: (p) => p.Plot_Ref || "" },
  { key: "num",    label: "Plot",         width: 80,  type: "text",  raw: (p) => p.Plot_Number },
  /* The code alone. It is what the house type is called on the drawing,
     in the schedule and by everyone on site, and the long description
     took a third of the table to repeat what the code already says. The
     full name is still on the filter list and in the editor. */
  { key: "type",   label: "House type",   width: 110, type: "multi", raw: (p) => p.Property_Config_ID },
  { key: "dev",    label: "Developer",    width: 170, type: "multi", raw: (p) => p.Project_Developer_ID },
  { key: "heat",   label: "Heat source",  width: 150, type: "multi", raw: (p) => p.Heat_Source_ID },
  { key: "kva",    label: "kVA",          width: 82,  type: "num",   align: "right", raw: (p) => p.KVA_Resolved ?? p.KVA_Load ?? null },
  /* Gas beside electric, and read the same way: the resolved figure
     where the function returns one, the plot's own override otherwise.
     Blank on a plot that takes no gas, which is most of an all-electric
     site and not a gap — the source column on the placement list is
     what tells those two apart. */
  { key: "gaskw",  label: "Gas kW",       width: 82,  type: "num",   align: "right", raw: (p) => p.Gas_Load_Resolved ?? p.Gas_Load_kW ?? null },
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
  const [bulk, setBulk] = useState({ Property_Config_ID: "", Heat_Source_ID: "", Heat_Pump_Model_ID: "", KVA_Load: "", PV: "", Self_Lay_Provider: "" });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [mode, setMode] = useState("list");
  const [plots, setPlots] = useState([]);
  const [lookups, setLookups] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [defaults, setDefaults] = useState({ Default_Heat_Source_ID: "", Heat_Pump_Model_ID: "" });

  /* Changing the source away from ASHP clears the model rather than
     hiding it with a value still set: a field nobody can see is a field
     nobody can correct, and it would save silently. */
  const setDefaultSource = (v) => setDefaults((d) => ({
    ...d,
    Default_Heat_Source_ID: v,
    Heat_Pump_Model_ID: sourceTakesHeatPump(v, lookups?.heatSources || [])
      ? d.Heat_Pump_Model_ID : "",
  }));
  const setBulkSource = (v) => setBulk((b) => ({
    ...b,
    Heat_Source_ID: v,
    Heat_Pump_Model_ID: sourceTakesHeatPump(v, lookups?.heatSources || [])
      ? b.Heat_Pump_Model_ID : "",
  }));
  const [savedDefaults, setSavedDefaults] = useState({});
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [genUtils, setGenUtils] = useState([]);
  const [genOpen, setGenOpen] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [genMsg, setGenMsg] = useState("");
  const [developers, setDevelopers] = useState([]);
  const [bulkDev, setBulkDev] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [lk, res, proj, devs] = await Promise.all([
        getLookups(), listPlots(projectId), getProject(projectId), listDevelopers(projectId),
      ]);
      setDevelopers(devs.rows || []);
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
    heatPumpShort((lookups?.heatPumpModels || []).find((m) => m.Heat_Pump_Model_ID === id))
    || "\u2014";

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

  const devName = (id) => {
    const d = developers.find((x) => x.Project_Developer_ID === id);
    if (!d) return "\u2014";
    const b = (lookups?.branches || []).find((x) => x.Branch_ID === d.Branch_ID);
    return b ? (b.Branch_Dropdown || b.Branch_Name) : "\u2014";
  };

  const hpName = (id) =>
    heatPumpShort((lookups?.heatPumpModels || []).find((m) => m.Heat_Pump_Model_ID === id))
    || "\u2014";

  const hsName = (id) =>
    (lookups?.heatSources || []).find((h) => String(h.Heat_Source_ID) === String(id))?.Heat_Source
    || null;
  const columns = useMemo(() => COLS(configFor, typeName, hpName), [lookups]);
  const layout = useTableLayout("plots", columns);

  const filterOptions = (key) => {
    if (key === "type")
      /* The code alone, matching the column. The filter list and the
         cells should read the same, or picking one to find the other
         means translating between two names for the same thing. */
      return (lookups?.propertyConfigs || []).map((c) => ({
        id: c.Property_Config_ID,
        label: c.Code,
      }));
    if (key === "hp")
      return (lookups?.heatPumpModels || [])
        .map((m) => ({ id: m.Heat_Pump_Model_ID, label: heatPumpLabel(m) }));
    if (key === "heat")
      return (lookups?.heatSources || []).map((h) => ({ id: h.Heat_Source_ID, label: h.Heat_Source }));
    if (key === "dev")
      return developers.map((d) => ({ id: d.Project_Developer_ID, label: devName(d.Project_Developer_ID) }));
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

    /* "__default" clears the plot's own value so it follows the project
       default again — a plot needs a way back to inheriting, not just a
       way to depart from it. */
    if (bulk.Heat_Source_ID === "__default") {
      changes.Heat_Source_ID = null;
      changes.Heat_Pump_Model_ID = null;
    } else if (bulk.Heat_Source_ID) {
      changes.Heat_Source_ID = Number(bulk.Heat_Source_ID);
      /* A heat pump model only means anything on a heat pump plot.
         Switching to gas and leaving the model behind is how a plot ends
         up costed for both — the same rule FeatureEditor applies. */
      const hs = (lookups?.heatSources || [])
        .find((h) => String(h.Heat_Source_ID) === String(bulk.Heat_Source_ID));
      if (!/pump|ashp|gshp|wshp/i.test(hs?.Heat_Source || "")) changes.Heat_Pump_Model_ID = null;
    }

    if (bulk.Heat_Pump_Model_ID) changes.Heat_Pump_Model_ID = Number(bulk.Heat_Pump_Model_ID);
    if (bulk.KVA_Load !== "") changes.KVA_Load = Number(bulk.KVA_Load);
    if (bulk.PV) changes.PV = bulk.PV === "y";
    if (bulk.Self_Lay_Provider) changes.Self_Lay_Provider = bulk.Self_Lay_Provider === "y";
    setBulkBusy(true);
    try {
      if (bulkDev) {
        await assignPlots(projectId, selected, bulkDev === "none" ? null : Number(bulkDev));
        setBulkDev("");
      }
      if (Object.keys(changes).length) await bulkUpdatePlots(projectId, selected, changes);
      setBulk({ Property_Config_ID: "", Heat_Source_ID: "", Heat_Pump_Model_ID: "", KVA_Load: "", PV: "", Self_Lay_Provider: "" });
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

  /* Connections are tracked on the Plot Connections page, but they're
     created from here — this is where the plots are. */
  async function generateConns() {
    if (!genUtils.length) return setError("Choose at least one utility.");
    setGenBusy(true);
    try {
      const eligible = plots.filter((p) => !p.Self_Lay_Provider).map((p) => p.Plot_ID);
      const res = await generateConnections(projectId, eligible, genUtils);
      setGenMsg(`${res.created ?? 0} connection${res.created === 1 ? "" : "s"} created — see Plot Connections in the sidebar.`);
      setTimeout(() => setGenMsg(""), 5000);
      setGenOpen(false);
      setGenUtils([]);
    } catch (e) { setError(e.message); }
    finally { setGenBusy(false); }
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
        defaultHeatSourceId={defaults.Default_Heat_Source_ID}
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
        <div className="ph-actions">
          <button className="btn ghost" onClick={() => setGenOpen((g) => !g)}>
            {genOpen ? "Cancel" : "Generate connections"}
          </button>
          <button className="btn accent" onClick={() => setMode("add")}>+ Add plots</button>
        </div>
      </div>

      {error && <Banner kind="error">{error}</Banner>}
      {genMsg && <Banner kind="ok">{genMsg}</Banner>}

      {genOpen && (
        <div className="gen-panel">
          <p className="panel-label">Generate connections</p>
          <p className="hint">
            Creates a connection record for every plot against each utility chosen.
            Existing ones are left alone and self-lay plots are skipped. Street lighting
            isn&rsquo;t listed &mdash; it has no plot connections and is tracked separately.
          </p>
          <div className="util-pick">
            {UTILS.map((u) => (
              <label key={u.id} className={genUtils.includes(u.id) ? "up on" : "up"}>
                <input type="checkbox" checked={genUtils.includes(u.id)}
                  onChange={() => setGenUtils((g) => g.includes(u.id) ? g.filter((x) => x !== u.id) : [...g, u.id])} />
                <span className="udot" style={{ background: u.colour }} />
                {u.name}
              </label>
            ))}
          </div>
          <button className="btn accent" disabled={genBusy || !genUtils.length} onClick={generateConns}>
            {genBusy ? "Generating\u2026" : "Generate"}
          </button>
        </div>
      )}

      <div className="plot-defaults">
        <span className="pd-label">Plot defaults</span>
        <div className="pd-field">
          <label>Heat source</label>
          <Select
            value={defaults.Default_Heat_Source_ID}
            onChange={setDefaultSource}
          >
            <option value="">&mdash; none &mdash;</option>
            {(lookups?.heatSources || []).map((h) => (
              <option key={h.Heat_Source_ID} value={h.Heat_Source_ID}>{h.Heat_Source}</option>
            ))}
          </Select>
        </div>
        {/* Only where it means something. The register is the MCS list of
            air source units, so asking which heat pump a gas boiler is
            would be a question with no answer — and a field sitting there
            implies there is one. */}
        {sourceTakesHeatPump(defaults.Default_Heat_Source_ID, lookups?.heatSources || []) && (
          <div className="pd-field">
            <label>Heat pump model</label>
            <HeatPumpPicker
              models={lookups?.heatPumpModels || []}
              value={defaults.Heat_Pump_Model_ID}
              onChange={(v) => setDefaults((d) => ({ ...d, Heat_Pump_Model_ID: v }))}
            />
          </div>
        )}
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
              <select value={bulk.Heat_Source_ID}
                onChange={(e) => setBulkSource(e.target.value)}>
                <option value="">Heat source&hellip;</option>
                {(lookups?.heatSources || []).map((h) => (
                  <option key={h.Heat_Source_ID} value={h.Heat_Source_ID}>{h.Heat_Source}</option>
                ))}
                <option value="__default">&mdash; Use project default &mdash;</option>
              </select>
              {/* Its own panel rather than another control in the row:
                  the register has 1,255 entries and choosing one is two
                  or three steps, which a bar of single selects cannot
                  hold. */}
              {sourceTakesHeatPump(bulk.Heat_Source_ID, lookups?.heatSources || []) && (
                <div className="bulk-hp">
                  <HeatPumpPicker
                    models={lookups?.heatPumpModels || []}
                    value={bulk.Heat_Pump_Model_ID}
                    onChange={(v) => setBulk((b) => ({ ...b, Heat_Pump_Model_ID: v }))}
                  />
                </div>
              )}
              <input type="number" step="0.1" placeholder="kVA" className="bulk-kva"
                value={bulk.KVA_Load} onChange={(e) => setBulk((b) => ({ ...b, KVA_Load: e.target.value }))} />
              <select value={bulk.PV} onChange={(e) => setBulk((b) => ({ ...b, PV: e.target.value }))}>
                <option value="">PV&hellip;</option><option value="y">PV: Yes</option><option value="n">PV: No</option>
              </select>
              <select value={bulk.Self_Lay_Provider}
                onChange={(e) => setBulk((b) => ({ ...b, Self_Lay_Provider: e.target.value }))}>
                <option value="">SLP&hellip;</option><option value="y">SLP: Yes</option><option value="n">SLP: No</option>
              </select>
              {developers.length > 1 && (
                <select value={bulkDev} onChange={(e) => setBulkDev(e.target.value)}>
                  <option value="">Developer&hellip;</option>
                  {developers.map((d) => (
                    <option key={d.Project_Developer_ID} value={d.Project_Developer_ID}>
                      {devName(d.Project_Developer_ID)}
                    </option>
                  ))}
                  <option value="none">&mdash; Unassign &mdash;</option>
                </select>
              )}
              <button className="btn accent" disabled={bulkBusy || (!hasBulk && !bulkDev)} onClick={applyBulk}>
                {bulkBusy ? "Applying\u2026" : "Apply"}
              </button>
              <button className="btn delete" disabled={bulkBusy} onClick={deleteSelected}>Delete</button>
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
                    <th key={c.key} {...layout.reorderProps(c.key)}
                        onClick={() => c.type !== "none" && toggleSort(c.key)}>
                      {c.key === "sel" ? (
                        <input type="checkbox" checked={allSelected}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setSelected(e.target.checked ? shown.map((p) => p.Plot_ID) : [])} />
                      ) : (<>
                        {c.label}
                        {sort.key === c.key && <span className="arrow">{sort.dir === "asc" ? "\u25B2" : "\u25BC"}</span>}
                      </>)}
                      <span className="resizer" draggable={false}
                        onDragStart={(e) => e.preventDefault()}
                        onMouseDown={(e) => layout.startResize(e, c.key)} />
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
                            : col.key === "type" ? (c
                                ? <span className="code-chip"
                                    title={`${c.Bedrooms} Bed ${typeName(c.Property_Type_ID)}`}>
                                    {c.Code}
                                  </span>
                                : "\u2014")
                            : col.key === "dev" ? devName(p.Project_Developer_ID)
                            /* A plot with none of its own follows the project
                               default, which is what the design will actually
                               use — showing a dash would hide a real value. */
                            : col.key === "heat" ? (
                                hsName(p.Heat_Source_ID)
                                || (hsName(savedDefaults.Default_Heat_Source_ID)
                                    ? <span className="inherited"
                                        title="From the project default, not set on this plot">
                                        {hsName(savedDefaults.Default_Heat_Source_ID)}
                                      </span>
                                    : "\u2014")
                              )
                            : col.key === "kva" ? (
                                (p.KVA_Resolved ?? p.KVA_Load) == null
                                  ? <span className="kva-unset" title="No load: set a heat source, or enter a figure on the plot">&#8212;</span>
                                  : <span title={kvaSourceText(p.KVA_Source)}>
                                      {p.KVA_Resolved ?? p.KVA_Load}
                                      {p.KVA_Source === "entered" && <span className="kva-own">*</span>}
                                    </span>
                              )
                            : col.key === "gaskw" ? (
                                /* Three states, not two. A plot on air
                                   source correctly has no gas figure
                                   and reads as blank; a gas plot with
                                   nobody having set one is a gap that
                                   sizes every main upstream of it light,
                                   and it gets the dash and the warning.
                                   Showing both as "—" is what would let
                                   the second go unnoticed. */
                                (p.Gas_Load_Resolved ?? p.Gas_Load_kW) == null
                                  ? (p.Gas_Load_Source === "no gas"
                                    ? <span className="gas-none" title="Not a gas plot">&nbsp;</span>
                                    : <span className="kva-unset" title="No gas load: set one on the house type, or enter a figure on the plot">&#8212;</span>)
                                  : <span title={p.Gas_Load_Source === "entered"
                                    ? "Entered on this plot" : "From the house type"}>
                                      {p.Gas_Load_Resolved ?? p.Gas_Load_kW}
                                      {p.Gas_Load_Source === "entered" && <span className="kva-own">*</span>}
                                    </span>
                              )
                            : col.key === "hp" ? hpName(p.Heat_Pump_Model_ID)
                            : col.key === "pv" ? (p.PV ? <span className="tick">&#10003;</span> : "")
                            : col.key === "slp" ? (p.Self_Lay_Provider ? <span className="tick">&#10003;</span> : "")
                            : (
                              <button className="btn delete sm" onClick={() => remove(p)}
                                aria-label={`Delete plot ${p.Plot_Number}`}>
                                Delete
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

const CSS = FILTER_CSS + `
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

/* .ph-actions is in styles.css — one spec for every page toolbar. */
.gen-panel { border: 1.5px solid var(--border); border-radius: 12px; background: #f8f9fb;
  padding: 16px; margin-bottom: 16px; }
.util-pick { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 12px; }
.up { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 400;
  text-transform: none; letter-spacing: 0; color: var(--text); background: var(--white);
  border: 1px solid var(--border); border-radius: 6px; padding: 7px 12px; margin: 0; cursor: pointer; }
.up.on { border-color: var(--accent); background: var(--accent-light); color: var(--accent); font-weight: 600; }
.udot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.bulk-bar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  background: var(--accent); color: #fff; border-radius: var(--radius);
  padding: 9px 12px; margin-bottom: 10px;
}
.bulk-count { font-size: 12px; font-weight: 700; white-space: nowrap; }
.bulk-bar select, .bulk-bar input:not([type=checkbox]) { width: auto; min-width: 118px; font-size: 12px; padding: 5px 8px; }
.bulk-hp { min-width: 250px; }
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
.inherited { color: var(--muted); font-style: italic; }
.tick { color: #059669; font-weight: 700; }
.kva-unset { color: #b45309; font-weight: 600; }
/* A plot that takes no gas. Empty rather than dashed: a dash in this
   column means "should have a figure and hasn't", and the two must not
   look the same. */
.gas-none { display: inline-block; }
.kva-own { color: var(--muted); font-size: 10px; margin-left: 2px; }
.code-chip { font-family: ui-monospace, Menlo, monospace; font-weight: 700; font-size: 11px;
  background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; }

.bed-summary { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;
  align-items: center; margin: 0 0 16px; }
.bed-pill { position: relative; display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700;
  white-space: nowrap; cursor: default; }
.bed-pill.load { background: var(--accent); color: #fff; }
.bed-count { background: rgba(255,255,255,.3); border-radius: 999px; padding: 1px 7px; font-size: 11.5px; }
/* The estimate is deliberately quieter than the total: it is the one
   figure on this row that is not a fact, and it should not be the one
   the eye lands on first. */
.bed-pill.est { border-style: dashed; opacity: .92; }
.bed-avg { font-size: 11.5px; color: var(--muted); font-weight: 600; }
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
