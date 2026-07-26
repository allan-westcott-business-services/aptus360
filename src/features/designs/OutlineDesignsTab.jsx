import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { getLookups } from "../../api/lookups.js";
import { getProject } from "../../api/projects.js";
import { updateScope, createScope, deleteScope } from "../../api/scopes.js";
import { UTILITIES, utilityById } from "../../lib/utilities.js";
import { peopleWithRole, ROLE, isDesignComplete } from "../../lib/constants.js";

/* Outline designs as an editable table — one row per scope.

   Only design fields are editable here. Commercial state (won/lost,
   secured date, quote values) lives on the Details tab: two screens
   writing the same columns is how a record ends up disagreeing with
   itself. The API enforces this too, not just the UI. */

const EDITABLE = [
  "Designer_ID", "Design_Status_ID", "Design_Checked_By", "POC_Status_ID",
  "Target_Date", "Actual_Date", "Revision", "Carried_Forward", "External_Design",
];

export default function OutlineDesignsTab({ projectId }) {
  const [lookups, setLookups] = useState(null);
  const [scopes, setScopes] = useState([]);
  const [original, setOriginal] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const [lk, proj] = await Promise.all([getLookups(), getProject(projectId)]);
      setLookups(lk);
      const rows = proj.scopes || [];
      setScopes(rows);
      setOriginal(Object.fromEntries(rows.map((r) => [r.Project_Scope_ID, { ...r }])));
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  const setField = (id, key, value) =>
    setScopes((s) => s.map((x) => (x.Project_Scope_ID === id ? { ...x, [key]: value } : x)));

  const dirty = useMemo(
    () => scopes.filter((s) => {
      const o = original[s.Project_Scope_ID];
      return o && EDITABLE.some((k) => (s[k] ?? null) !== (o[k] ?? null));
    }),
    [scopes, original]
  );

  async function saveAll() {
    setSaving(true);
    try {
      for (const s of dirty) {
        await updateScope(s.Project_Scope_ID, Object.fromEntries(EDITABLE.map((k) => [k, s[k]])));
      }
      setOriginal(Object.fromEntries(scopes.map((r) => [r.Project_Scope_ID, { ...r }])));
      setFlash(`${dirty.length} design${dirty.length === 1 ? "" : "s"} saved`);
      setTimeout(() => setFlash(""), 2400);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function addScope(utilityId) {
    setAdding(false);
    try { await createScope(projectId, utilityId); await load(); }
    catch (e) { setError(e.message); }
  }

  async function removeScope(s) {
    const u = utilityById(s.Utility_ID);
    if (!window.confirm(`Remove the ${u?.name} design?`)) return;
    try {
      await deleteScope(s.Project_Scope_ID);
      setScopes((x) => x.filter((r) => r.Project_Scope_ID !== s.Project_Scope_ID));
    } catch (e) { setError(e.message); }
  }

  if (loading) return <div className="loading">Loading designs&hellip;</div>;

  const designers = peopleWithRole(lookups.people, ROLE.DESIGNER);
  const checkers = peopleWithRole(lookups.people, ROLE.DESIGN_CHECKER);
  const used = new Set(scopes.map((s) => s.Utility_ID));
  const available = UTILITIES.filter((u) => !used.has(u.id));
  const today = new Date().toISOString().slice(0, 10);

  const complete = scopes.filter((s) => isDesignComplete(lookups.designStatuses, s.Design_Status_ID));
  const allDone = scopes.length > 0 && complete.length === scopes.length;

  const isDirty = (id) => dirty.some((d) => d.Project_Scope_ID === id);

  return (
    <div onClick={() => setAdding(false)}>
      <style>{CSS}</style>

      <div className="tab-head">
        <div>
          <h3>Outline designs <span className="count">{scopes.length}</span></h3>
          <p className="tab-sub">
            Design fields only &mdash; commercial state is on the Details tab.
          </p>
        </div>
        <div className="od-tools" onClick={(e) => e.stopPropagation()}>
          {available.length > 0 && (
            <div className="add-wrap">
              <button className="btn ghost" onClick={() => setAdding((a) => !a)}>+ Add design</button>
              {adding && (
                <div className="add-menu">
                  {available.map((u) => (
                    <button key={u.id} onClick={() => addScope(u.id)}>
                      <span className="dot" style={{ background: u.colour }} />
                      {u.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button className="btn accent" disabled={!dirty.length || saving} onClick={saveAll}>
            {saving ? "Saving\u2026" : dirty.length ? `Save ${dirty.length} change${dirty.length === 1 ? "" : "s"}` : "Saved"}
          </button>
        </div>
      </div>

      {flash && <Banner kind="ok">{flash}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}

      <Banner kind={allDone ? "ok" : "muted"}>
        <strong>Good to go:</strong>{" "}
        {scopes.length === 0 ? "no designs on this project yet."
          : allDone ? "every design is complete."
          : `${complete.length} of ${scopes.length} designs complete.`}{" "}
        <span className="derived">Derived &mdash; not editable</span>
      </Banner>

      {scopes.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No designs yet</p>
          <p>Add the utilities this project needs.</p>
        </div>
      ) : (
        <div className="od-wrap">
          <table className="od-table">
            <thead>
              <tr>
                <th className="w-scope">Scope</th>
                <th className="w-sel">Designer</th>
                <th className="w-sel">Design status</th>
                <th className="w-rev">Rev</th>
                <th className="w-date">Target</th>
                <th className="w-date">Actual</th>
                <th className="w-sel">POC status</th>
                <th className="w-sel">Checked by</th>
                <th className="w-flag">Ext</th>
                <th className="w-flag">C/F</th>
                <th className="w-act" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {scopes.map((s) => {
                const u = utilityById(s.Utility_ID);
                const done = isDesignComplete(lookups.designStatuses, s.Design_Status_ID);
                const overdue = s.Target_Date && !s.Actual_Date && String(s.Target_Date).slice(0, 10) < today;
                return (
                  <tr key={s.Project_Scope_ID} className={isDirty(s.Project_Scope_ID) ? "dirty" : ""}>
                    <td className="scope-cell" style={{ borderLeftColor: u?.colour }}>
                      <span className="scope-name">{u?.name ?? "Scope"}</span>
                      {done && <span className="badge done">Done</span>}
                      {overdue && <span className="badge late">Late</span>}
                    </td>
                    <td>
                      <select value={s.Designer_ID ?? ""}
                        onChange={(e) => setField(s.Project_Scope_ID, "Designer_ID", e.target.value ? Number(e.target.value) : null)}>
                        <option value="">&mdash;</option>
                        {designers.map((p) => <option key={p.Person_ID} value={p.Person_ID}>{p.Person_Name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={s.Design_Status_ID ?? ""}
                        onChange={(e) => setField(s.Project_Scope_ID, "Design_Status_ID", e.target.value ? Number(e.target.value) : null)}>
                        <option value="">&mdash;</option>
                        {(lookups.designStatuses || []).map((d) => (
                          <option key={d.Design_Status_ID} value={d.Design_Status_ID}>{d.Status}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input type="number" min="0" value={s.Revision ?? 0}
                        onChange={(e) => setField(s.Project_Scope_ID, "Revision", Number(e.target.value))} />
                    </td>
                    <td>
                      <input type="date" className={overdue ? "late-date" : ""} value={s.Target_Date || ""}
                        onChange={(e) => setField(s.Project_Scope_ID, "Target_Date", e.target.value)} />
                    </td>
                    <td>
                      <input type="date" value={s.Actual_Date || ""}
                        onChange={(e) => setField(s.Project_Scope_ID, "Actual_Date", e.target.value)} />
                    </td>
                    <td>
                      <select value={s.POC_Status_ID ?? ""}
                        onChange={(e) => setField(s.Project_Scope_ID, "POC_Status_ID", e.target.value ? Number(e.target.value) : null)}>
                        <option value="">&mdash;</option>
                        {(lookups.pocStatuses || []).map((x) => (
                          <option key={x.POC_Status_ID} value={x.POC_Status_ID}>{x.POC_Status}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select value={s.Design_Checked_By ?? ""}
                        onChange={(e) => setField(s.Project_Scope_ID, "Design_Checked_By", e.target.value ? Number(e.target.value) : null)}>
                        <option value="">&mdash;</option>
                        {(checkers.length ? checkers : lookups.people).map((p) => (
                          <option key={p.Person_ID} value={p.Person_ID}>{p.Person_Name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="mid">
                      <input type="checkbox" checked={!!s.External_Design}
                        onChange={(e) => setField(s.Project_Scope_ID, "External_Design", e.target.checked)} />
                    </td>
                    <td className="mid">
                      <input type="checkbox" checked={!!s.Carried_Forward}
                        onChange={(e) => setField(s.Project_Scope_ID, "Carried_Forward", e.target.checked)} />
                    </td>
                    <td className="mid">
                      <button className="row-del" onClick={() => removeScope(s)} title="Remove design">
                        &#10005;
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dirty.length > 0 && (
        <p className="unsaved">
          {dirty.length} row{dirty.length === 1 ? "" : "s"} with unsaved changes.
        </p>
      )}
    </div>
  );
}

const CSS = `
.od-tools { display: flex; gap: 8px; align-items: flex-start; }
.add-wrap { position: relative; }
.add-menu {
  position: absolute; right: 0; top: 100%; margin-top: 4px; z-index: 20;
  background: var(--white); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: 0 6px 20px rgba(0,0,0,.12); padding: 6px; min-width: 210px;
}
.add-menu button {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  background: none; border: none; border-radius: 5px; padding: 7px 9px;
  cursor: pointer; font: 500 12.5px inherit; color: var(--text);
}
.add-menu button:hover { background: var(--bg); }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; display: inline-block; }

.od-wrap { border: 1px solid var(--border); border-radius: var(--radius); overflow: auto; }
.od-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.od-table th {
  position: sticky; top: 0; z-index: 1; background: var(--accent); color: #fff;
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  padding: 8px 8px; text-align: left; white-space: nowrap;
}
.od-table td { padding: 4px 6px; border-top: 1px solid var(--border); vertical-align: middle; }
.od-table tbody tr:nth-child(even) { background: #fafbfc; }
.od-table tbody tr.dirty { background: #fffbeb; }
.od-table tbody tr.dirty td { border-top-color: #fde68a; }
.od-table select, .od-table input[type=date], .od-table input[type=number] {
  width: 100%; font-size: 12px; padding: 4px 6px; border-radius: 5px;
}
.od-table input[type=checkbox] { width: auto; height: 16px; }
.od-table .mid { text-align: center; }
.late-date { border-color: #fca5a5 !important; background: #fef2f2 !important; }

.w-scope { min-width: 190px; }
.w-sel   { min-width: 132px; }
.w-rev   { width: 62px; }
.w-date  { width: 132px; }
.w-flag  { width: 44px; text-align: center !important; }
.w-act   { width: 38px; }

.scope-cell {
  border-left: 3px solid var(--muted); font-weight: 600;
  display: flex; align-items: center; gap: 6px; min-height: 34px;
}
.scope-name { flex: 1; }
.badge {
  font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  border-radius: 4px; padding: 1px 5px; flex: none;
}
.badge.done { background: var(--ok-bg); color: var(--ok-text); border: 1px solid var(--ok-border); }
.badge.late { background: var(--err-bg); color: var(--err-text); border: 1px solid var(--err-border); }
.row-del { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 11px; padding: 3px 5px; border-radius: 4px; }
.row-del:hover { background: #fef2f2; color: #ef4444; }
.unsaved { font-size: 11.5px; color: #92400e; font-weight: 600; margin-top: 10px; }
`;
