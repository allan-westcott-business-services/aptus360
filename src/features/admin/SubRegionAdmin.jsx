import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import Select from "../../components/Select.jsx";
import { adminList, adminCreate, adminDelete } from "../../api/admin.js";

/* Sub regions, grouped under their parent region. The generic editor
   can't render a foreign key as a dropdown, so this gets its own screen. */
export default function SubRegionAdmin() {
  const [regions, setRegions] = useState([]);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ Region_ID: "", Sub_Region: "", Sort_Order: "" });

  async function load() {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([adminList("Region"), adminList("Sub_Region")]);
      setRegions(r.rows || []);
      setSubs(s.rows || []);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    const g = {};
    subs.forEach((s) => (g[s.Region_ID] = g[s.Region_ID] || []).push(s));
    return g;
  }, [subs]);

  async function add() {
    if (!draft.Region_ID) return setError("Choose a region.");
    if (!draft.Sub_Region.trim()) return setError("Enter a sub region name.");
    try {
      await adminCreate("Sub_Region", {
        Region_ID: Number(draft.Region_ID),
        Sub_Region: draft.Sub_Region.trim(),
        Sort_Order: draft.Sort_Order === "" ? 0 : Number(draft.Sort_Order),
      });
      setDraft({ Region_ID: draft.Region_ID, Sub_Region: "", Sort_Order: "" });
      setError("");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(s) {
    if (!window.confirm(`Delete ${s.Sub_Region}?`)) return;
    try {
      await adminDelete("Sub_Region", s.Sub_Region_ID, "Sub_Region_ID");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <div className="loading">Loading regions&hellip;</div>;

  return (
    <div>
      <style>{CSS}</style>
      <h2 className="admin-title">Region &amp; Sub Region</h2>
      {error && <Banner kind="error">{error}</Banner>}

      <div className="add-panel">
        <p className="panel-label">Add a sub region</p>
        <div className="sr-add">
          <div className="fld">
            <label>Region <span className="req">*</span></label>
            <Select value={draft.Region_ID} onChange={(v) => setDraft((d) => ({ ...d, Region_ID: v }))}>
              <option value="">&mdash; Select &mdash;</option>
              {regions.map((r) => (
                <option key={r.Region_ID} value={r.Region_ID}>{r.Region}</option>
              ))}
            </Select>
          </div>
          <div className="fld">
            <label>Sub region <span className="req">*</span></label>
            <input value={draft.Sub_Region}
              onChange={(e) => setDraft((d) => ({ ...d, Sub_Region: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && add()} />
          </div>
          <div className="fld">
            <label>Sort order</label>
            <input type="number" value={draft.Sort_Order}
              onChange={(e) => setDraft((d) => ({ ...d, Sort_Order: e.target.value }))} />
          </div>
          <button className="btn accent" onClick={add}>+ Add</button>
        </div>
      </div>

      <p className="panel-label">
        {regions.length} region{regions.length === 1 ? "" : "s"} &middot;{" "}
        {subs.length} sub region{subs.length === 1 ? "" : "s"}
      </p>

      {regions.length === 0 ? (
        <div className="empty">No regions yet. Add them under Region first.</div>
      ) : (
        regions.map((r) => {
          const list = (grouped[r.Region_ID] || []).sort(
            (a, b) => (a.Sort_Order ?? 0) - (b.Sort_Order ?? 0) || a.Sub_Region.localeCompare(b.Sub_Region)
          );
          return (
            <div className="region-block" key={r.Region_ID}>
              <div className="region-head">
                <span className="region-name">{r.Region}</span>
                <span className="region-count">{list.length}</span>
              </div>
              {list.length === 0 ? (
                <p className="no-subs">No sub regions</p>
              ) : (
                <div className="sub-chips">
                  {list.map((s) => (
                    <span className="sub-chip" key={s.Sub_Region_ID}>
                      {s.Sub_Region}
                      <button onClick={() => remove(s)} title="Delete">&#10005;</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

const CSS = `
.sr-add { display: grid; grid-template-columns: 1fr 1.4fr 100px auto; gap: 12px; align-items: end; }
.region-block { border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; margin-bottom: 10px; }
.region-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.region-name { font-size: 13px; font-weight: 700; }
.region-count {
  font-size: 10.5px; font-weight: 700; background: var(--accent-light); color: var(--accent);
  border-radius: 20px; padding: 1px 8px;
}
.no-subs { margin: 0; font-size: 12px; color: var(--muted); font-style: italic; }
.sub-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.sub-chip {
  display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px;
  background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 4px 9px;
}
.sub-chip button {
  background: none; border: none; cursor: pointer; color: var(--muted); font-size: 10px; padding: 0;
}
.sub-chip button:hover { color: #ef4444; }
`;
