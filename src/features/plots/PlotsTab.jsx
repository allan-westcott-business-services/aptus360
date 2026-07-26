import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import AddPlotsForm from "./AddPlotsForm.jsx";
import { getLookups } from "../../api/lookups.js";
import { listPlots, deletePlot } from "../../api/plots.js";

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
function BedroomSummary({ plots, houseTypeName }) {
  if (!plots.length) return null;

  const groups = {};
  plots.forEach((p) => {
    const beds = p.Bedrooms == null || p.Bedrooms === "" ? "null" : Number(p.Bedrooms);
    const type = p.House_Type_ID ?? "null";
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
            <span className="lbl">{type === "null" ? "Unspecified" : houseTypeName(Number(type))}</span>
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

export default function PlotsTab({ projectId, projectRef }) {
  const [mode, setMode] = useState("list");
  const [plots, setPlots] = useState([]);
  const [lookups, setLookups] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [lk, res] = await Promise.all([getLookups(), listPlots(projectId)]);
      setLookups(lk);
      setPlots(res.rows || []);
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

  const houseTypeName = (id) =>
    (lookups?.houseTypes || []).find((h) => h.House_Type_ID === id)?.House_Type ?? "\u2014";
  const heatPumpName = (id) =>
    (lookups?.heatPumpModels || []).find((m) => m.Heat_Pump_Model_ID === id)?.Model ?? "\u2014";

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

      <BedroomSummary plots={plots} houseTypeName={houseTypeName} />

      {plots.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No plots yet</p>
          <p>Add them individually or as a numbered range.</p>
          <button className="btn accent" onClick={() => setMode("add")}>
            + Add plots
          </button>
        </div>
      ) : (
        <div className="plot-table-wrap">
          <table className="plot-table">
            <thead>
              <tr>
                <th>Plot ref</th>
                <th>Plot</th>
                <th>House type</th>
                <th className="num">Beds</th>
                <th className="num">kVA</th>
                <th>Heat pump</th>
                <th className="mid">PV</th>
                <th className="mid">SLP</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.Plot_ID}>
                  <td className="mono ref">{p.Plot_Ref || "\u2014"}</td>
                  <td className="mono">{p.Plot_Number}</td>
                  <td>{houseTypeName(p.House_Type_ID)}</td>
                  <td className="num">{p.Bedrooms ?? "\u2014"}</td>
                  <td className="num">{p.KVA_Load ?? "\u2014"}</td>
                  <td>{heatPumpName(p.Heat_Pump_Model_ID)}</td>
                  <td className="mid">{p.PV ? <span className="tick">&#10003;</span> : ""}</td>
                  <td className="mid">{p.Self_Lay_Provider ? <span className="tick">&#10003;</span> : ""}</td>
                  <td className="mid">
                    <button className="row-del" onClick={() => remove(p)} aria-label={`Remove plot ${p.Plot_Number}`}>
                      &#10005;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const CSS = `
.tab-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; margin-bottom: 14px;
}
.tab-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.tab-head .count {
  font-size: 11px; font-weight: 700; background: var(--accent-light);
  color: var(--accent); border-radius: 20px; padding: 2px 8px; margin-left: 6px;
  vertical-align: middle;
}
.tab-sub { margin: 3px 0 0; font-size: 12.5px; color: var(--muted); }

.empty {
  text-align: center; padding: 48px 20px; border: 1px dashed var(--border);
  border-radius: var(--radius); background: var(--bg);
}
.empty-title { margin: 0 0 4px; font-size: 14px; font-weight: 700; color: var(--text); }
.empty p { margin: 0 0 14px; font-size: 12.5px; color: var(--muted); }

.plot-table-wrap {
  border: 1px solid var(--border); border-radius: var(--radius);
  overflow: auto; max-height: 62vh;
}
.plot-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.plot-table th {
  position: sticky; top: 0; z-index: 1;
  background: var(--accent); color: #fff; text-align: left;
  font-size: 10.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; padding: 8px 10px; white-space: nowrap;
}
.plot-table td { padding: 7px 10px; border-top: 1px solid var(--border); }
.plot-table tbody tr:nth-child(even) { background: #fafbfc; }
.plot-table tbody tr:hover { background: var(--accent-light); }
.plot-table .num { text-align: right; }
.plot-table .mid { text-align: center; }
.plot-table .ref { color: var(--accent); font-weight: 600; }
.tick { color: #059669; font-weight: 700; }
.row-del {
  background: none; border: none; cursor: pointer; color: var(--muted);
  font-size: 11px; padding: 2px 5px; border-radius: 4px;
}
.row-del:hover { background: #fef2f2; color: #ef4444; }

.bed-summary {
  display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;
  align-items: center; margin: 0 0 16px;
}
.bed-pill {
  position: relative; display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700;
  white-space: nowrap; cursor: default;
}
.bed-pill.load { background: var(--accent); color: #fff; }
.bed-count {
  background: rgba(255,255,255,.3); border-radius: 999px;
  padding: 1px 7px; font-size: 11.5px;
}
.bed-missing { font-size: 11.5px; color: var(--muted); font-weight: 600; }

.bed-tooltip {
  position: absolute; bottom: calc(100% + 7px); left: 50%; transform: translateX(-50%);
  display: none; flex-direction: column; gap: 3px; z-index: 30;
  background: #1a1d23; color: #f1f5f9; border-radius: 7px; padding: 9px 11px;
  min-width: 168px; box-shadow: 0 6px 18px rgba(0,0,0,.28);
  font-size: 11.5px; font-weight: 500; text-align: left;
}
.bed-pill:hover .bed-tooltip { display: flex; }
.bed-tooltip::after {
  content: ""; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
  border: 5px solid transparent; border-top-color: #1a1d23;
}
.bed-tooltip-title {
  font-size: 9.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .07em; opacity: .65; padding-bottom: 4px;
  border-bottom: 1px solid rgba(255,255,255,.15); margin-bottom: 2px;
}
.bed-tooltip-row { display: flex; justify-content: space-between; gap: 14px; }
.bed-tooltip-row .val { font-weight: 700; }
`;
