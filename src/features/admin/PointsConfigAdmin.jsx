import { useState, useEffect } from "react";
import Banner from "../../components/Banner.jsx";
import { adminList, adminCreate, adminUpdate, adminDelete } from "../../api/admin.js";

/* Points configuration.

   Two tiers. Tender points come from a plot-count band plus one rule per
   utility on the project; design points come from a second band, per
   scope. Electric scales with the base points, everything else is flat —
   which is why the rule table carries a toggle rather than just a number. */

const TABS = [
  { id: "bands", label: "Tender Bands", table: "Tender_Points_Band", pk: "Band_ID" },
  { id: "rules", label: "Tender Rules", table: "Tender_Points_Rule", pk: "Rule_ID" },
  { id: "design", label: "Design Bands", table: "Base_Points_Band", pk: "Band_ID" },
];

const num = (v) => (v === "" || v == null ? null : Number(v));

export default function PointsConfigAdmin() {
  const [tab, setTab] = useState("bands");
  const [data, setData] = useState({});
  const [utilities, setUtilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(120);

  async function loadAll() {
    try {
      const res = await Promise.all(TABS.map((t) => adminList(t.table)));
      const next = {};
      TABS.forEach((t, i) => { next[t.id] = res[i].rows || []; });
      setData(next);
      const u = await adminList("Utility");
      setUtilities(u.rows || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadAll(); }, []);

  const meta = TABS.find((t) => t.id === tab);
  const rows = data[tab] || [];

  const setCell = (id, col, v) =>
    setData((d) => ({ ...d, [tab]: (d[tab] || []).map((r) => (r[meta.pk] === id ? { ...r, [col]: v } : r)) }));

  async function commit(id, col, v) {
    try { await adminUpdate(meta.table, id, { [col]: v }); setError(""); }
    catch (e) { setError(e.message); await loadAll(); }
  }
  async function addRow(seed) {
    try { await adminCreate(meta.table, seed); await loadAll(); }
    catch (e) { setError(e.message); }
  }
  async function delRow(id) {
    if (!window.confirm("Delete this row?")) return;
    try { await adminDelete(meta.table, id, meta.pk); await loadAll(); }
    catch (e) { setError(e.message); }
  }

  const cell = (r, col, type = "text") => (
    <input className={type === "number" ? "pc-in num" : "pc-in"} type={type}
      step={type === "number" ? "any" : undefined} value={r[col] ?? ""}
      onChange={(e) => setCell(r[meta.pk], col, e.target.value)}
      onBlur={(e) => commit(r[meta.pk], col, type === "number" ? num(e.target.value) : e.target.value)} />
  );

  /* Bands are only correct if they're contiguous — a gap means a plot
     count that scores nothing, and nobody notices until it happens. */
  const gaps = (list) => {
    const sorted = [...list].sort((a, b) => (a.Plot_From ?? 0) - (b.Plot_From ?? 0));
    const out = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1], cur = sorted[i];
      if (Number(cur.Plot_From) > Number(prev.Plot_To) + 1) {
        out.push(`${Number(prev.Plot_To) + 1}\u2013${Number(cur.Plot_From) - 1}`);
      } else if (Number(cur.Plot_From) <= Number(prev.Plot_To)) {
        out.push(`overlap at ${cur.Plot_From}`);
      }
    }
    return out;
  };

  const bandFor = (list, n) =>
    list.find((b) => n >= Number(b.Plot_From) && n <= Number(b.Plot_To));

  if (loading) return <div className="loading">Loading points configuration&hellip;</div>;

  const issues = tab !== "rules" ? gaps(rows) : [];

  return (
    <div>
      <style>{CSS}</style>
      <h2 className="admin-title">Points Configuration</h2>
      <p className="pc-note">
        Tender points come from a plot-count band plus a rule per utility. Design points
        come from a second band, scored per scope.
      </p>

      {error && <Banner kind="error">{error}</Banner>}

      <div className="pc-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "pc-tab on" : "pc-tab"} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {issues.length > 0 && (
        <Banner kind="warn">
          Band coverage has {issues.length === 1 ? "a gap" : "gaps"}: {issues.join(", ")}.
          A plot count falling in a gap scores nothing.
        </Banner>
      )}

      {tab === "rules" ? (
        <>
          <table className="pc-table">
            <thead>
              <tr><th>Key</th><th>Label</th><th className="mid">Scales with base</th>
                <th>Points</th><th>Sort</th><th className="mid">Active</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.Rule_ID}>
                  <td className="mono">{cell(r, "Rule_Key")}</td>
                  <td>{cell(r, "Label")}</td>
                  <td className="mid">
                    <input type="checkbox" checked={!!r.Scales_With_Base_Points}
                      onChange={(e) => { setCell(r.Rule_ID, "Scales_With_Base_Points", e.target.checked);
                        commit(r.Rule_ID, "Scales_With_Base_Points", e.target.checked); }} />
                  </td>
                  <td>{r.Scales_With_Base_Points
                    ? <span className="pc-na">from band</span>
                    : cell(r, "Points", "number")}</td>
                  <td>{cell(r, "Sort_Order", "number")}</td>
                  <td className="mid">
                    <input type="checkbox" checked={r.Is_Active !== false}
                      onChange={(e) => { setCell(r.Rule_ID, "Is_Active", e.target.checked);
                        commit(r.Rule_ID, "Is_Active", e.target.checked); }} />
                  </td>
                  <td className="mid"><button className="pc-x" onClick={() => delRow(r.Rule_ID)}>&#10005;</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="pc-hint">
            <strong>Rule_Key</strong> is what the calculation matches on &mdash; a utility name,
            or <code>Street Lighting</code> and <code>Budget</code>, which key off Quote Type.
            Rename the Label freely; changing the Key breaks the match.
          </p>
          <button className="pc-add" onClick={() => addRow({ Rule_Key: "New", Label: "New rule", Points: 1 })}>
            + Add rule
          </button>
        </>
      ) : (
        <>
          <table className="pc-table">
            <thead>
              <tr><th>Plots from</th><th>Plots to</th><th>Points</th>
                {tab === "design" && <th>Utility</th>}<th>Sort</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[meta.pk]} className={bandFor(rows, preview) === r ? "hit" : ""}>
                  <td>{cell(r, "Plot_From", "number")}</td>
                  <td>{cell(r, "Plot_To", "number")}</td>
                  <td>{cell(r, "Points", "number")}</td>
                  {tab === "design" && (
                    <td>
                      <select className="pc-in" value={r.Utility_ID ?? ""}
                        onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null;
                          setCell(r[meta.pk], "Utility_ID", v); commit(r[meta.pk], "Utility_ID", v); }}>
                        <option value="">All utilities</option>
                        {utilities.map((u) => (
                          <option key={u.Utility_ID} value={u.Utility_ID}>{u.Utility}</option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td>{cell(r, "Sort_Order", "number")}</td>
                  <td className="mid"><button className="pc-x" onClick={() => delRow(r[meta.pk])}>&#10005;</button></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pc-preview">
            <span className="pc-lbl">Try a plot count</span>
            <input type="number" value={preview} onChange={(e) => setPreview(Number(e.target.value))} />
            <span className="pc-result">
              {(() => {
                const b = bandFor(rows, preview);
                return b ? `${b.Points} points` : "no band covers this";
              })()}
            </span>
          </div>

          <button className="pc-add" onClick={() => addRow({ Plot_From: 1, Plot_To: 50, Points: 1 })}>
            + Add band
          </button>
        </>
      )}
    </div>
  );
}

const CSS = `
.pc-note { font-size: 12.5px; color: var(--muted); margin: -10px 0 14px; max-width: 74ch; }
.pc-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 14px; }
.pc-tab { background: none; border: none; border-bottom: 2px solid transparent; padding: 7px 14px;
  margin-bottom: -1px; cursor: pointer; font: 600 12.5px inherit; color: var(--muted); }
.pc-tab.on { color: var(--accent); border-bottom-color: var(--accent); }
.pc-table { width: 100%; border-collapse: collapse; font-size: 12.5px; max-width: 720px; }
.pc-table th { padding: 8px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; color: var(--muted); border-bottom: 2px solid var(--border); text-align: left; }
.pc-table td { padding: 4px 6px; border-bottom: 1px solid var(--border); }
.pc-table tr.hit { background: var(--accent-light); }
.pc-table .mid { text-align: center; }
.pc-in { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1.5px solid var(--border);
  border-radius: 6px; font-size: 13px; font-family: inherit; }
.pc-in.num { text-align: right; }
.pc-in:focus { border-color: var(--accent); outline: none; }
.mono .pc-in { font-family: ui-monospace, Menlo, monospace; }
.pc-na { font-size: 11.5px; color: var(--muted); font-style: italic; }
.pc-x { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 11px;
  padding: 3px 6px; border-radius: 4px; }
.pc-x:hover { background: #fef2f2; color: #ef4444; }
.pc-add { margin-top: 10px; background: none; border: 1px dashed var(--border); border-radius: 6px;
  padding: 8px 14px; cursor: pointer; font: 600 12.5px inherit; color: var(--accent); }
.pc-add:hover { background: var(--accent-light); }
.pc-hint { font-size: 11.5px; color: var(--muted); margin: 10px 0 0; max-width: 74ch; }
.pc-hint code { font-family: ui-monospace, Menlo, monospace; background: var(--bg);
  border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; }
.pc-preview { display: flex; align-items: center; gap: 10px; margin-top: 14px;
  background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 9px 13px; max-width: 720px; }
.pc-lbl { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.pc-preview input { width: 90px; font-size: 12.5px; padding: 5px 8px; }
.pc-result { font-size: 13px; font-weight: 700; color: var(--accent); }
`;
