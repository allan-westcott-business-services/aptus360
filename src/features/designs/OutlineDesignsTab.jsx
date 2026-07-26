import { useState, useEffect } from "react";
import Banner from "../../components/Banner.jsx";
import Select from "../../components/Select.jsx";
import Toggle from "../../components/Toggle.jsx";
import { getLookups } from "../../api/lookups.js";
import { getProject } from "../../api/projects.js";
import { updateScope, createScope, deleteScope } from "../../api/scopes.js";
import { UTILITIES, utilityById } from "../../lib/utilities.js";
import { peopleWithRole, ROLE, isDesignComplete } from "../../lib/constants.js";

/* Outline designs — one card per scope, in the utility's colour, matching
   the per-utility tabs in the original app.

   Only design fields are editable here. Commercial state (won/lost, secured
   date, quote values) lives on the Details tab: two screens writing the same
   columns is how a record ends up disagreeing with itself. */
export default function OutlineDesignsTab({ projectId }) {
  const [lookups, setLookups] = useState(null);
  const [scopes, setScopes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [flash, setFlash] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const [lk, proj] = await Promise.all([getLookups(), getProject(projectId)]);
      setLookups(lk);
      setScopes(proj.scopes || []);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  const setField = (scopeId, key, value) =>
    setScopes((s) => s.map((x) => (x.Project_Scope_ID === scopeId ? { ...x, [key]: value } : x)));

  async function save(scope) {
    setSavingId(scope.Project_Scope_ID);
    try {
      await updateScope(scope.Project_Scope_ID, {
        Designer_ID: scope.Designer_ID,
        Design_Status_ID: scope.Design_Status_ID,
        Design_Checked_By: scope.Design_Checked_By,
        POC_Status_ID: scope.POC_Status_ID,
        Target_Date: scope.Target_Date,
        Actual_Date: scope.Actual_Date,
        Revision: scope.Revision,
        Carried_Forward: scope.Carried_Forward,
        External_Design: scope.External_Design,
      });
      setFlash(`${utilityById(scope.Utility_ID)?.name} design saved`);
      setTimeout(() => setFlash(""), 2400);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingId(null);
    }
  }

  async function addScope(utilityId) {
    setAdding(false);
    try {
      await createScope(projectId, utilityId);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function removeScope(scope) {
    const u = utilityById(scope.Utility_ID);
    if (!window.confirm(`Remove the ${u?.name} design from this project?`)) return;
    try {
      await deleteScope(scope.Project_Scope_ID);
      setScopes((s) => s.filter((x) => x.Project_Scope_ID !== scope.Project_Scope_ID));
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <div className="loading">Loading designs&hellip;</div>;

  const designers = peopleWithRole(lookups.people, ROLE.DESIGNER);
  const checkers = peopleWithRole(lookups.people, ROLE.DESIGN_CHECKER);
  const used = new Set(scopes.map((s) => s.Utility_ID));
  const available = UTILITIES.filter((u) => !used.has(u.id));

  const complete = scopes.filter((s) => isDesignComplete(lookups.designStatuses, s.Design_Status_ID));
  const allDone = scopes.length > 0 && complete.length === scopes.length;

  return (
    <div>
      <style>{CSS}</style>

      <div className="tab-head">
        <div>
          <h3>
            Outline designs <span className="count">{scopes.length}</span>
          </h3>
          <p className="tab-sub">
            One design per scope. Good to Go is reached when every design is complete.
          </p>
        </div>
        {available.length > 0 && (
          <div className="add-wrap">
            <button className="btn ghost" onClick={() => setAdding((a) => !a)}>
              + Add design
            </button>
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
      </div>

      {flash && <Banner kind="ok">{flash}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}

      <Banner kind={allDone ? "ok" : "muted"}>
        <strong>Good to go:</strong>{" "}
        {scopes.length === 0
          ? "no designs on this project yet."
          : allDone
          ? "every design is complete."
          : `${complete.length} of ${scopes.length} designs complete.`}{" "}
        <span className="derived">Derived &mdash; not editable</span>
      </Banner>

      {scopes.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No designs yet</p>
          <p>Add the utilities this project needs.</p>
        </div>
      ) : (
        <div className="design-cards">
          {scopes.map((s) => {
            const u = utilityById(s.Utility_ID);
            const done = isDesignComplete(lookups.designStatuses, s.Design_Status_ID);
            const overdue =
              s.Target_Date && !s.Actual_Date && String(s.Target_Date).slice(0, 10) < new Date().toISOString().slice(0, 10);
            return (
              <div className="design-card" key={s.Project_Scope_ID} style={{ borderTopColor: u?.colour }}>
                <div className="dc-head">
                  <span className="dc-title">
                    <span className="dot" style={{ background: u?.colour }} />
                    {u?.name ?? "Scope"}
                  </span>
                  <span className="dc-right">
                    {done && <span className="badge done">Complete</span>}
                    {overdue && <span className="badge late">Overdue</span>}
                    {s.External_Design && <span className="badge ext">External</span>}
                    <button className="dc-del" onClick={() => removeScope(s)} title="Remove design">
                      &#10005;
                    </button>
                  </span>
                </div>

                <div className="dc-grid">
                  <div className="fld">
                    <label>Designer</label>
                    <Select value={s.Designer_ID ?? ""} onChange={(v) => setField(s.Project_Scope_ID, "Designer_ID", v ? Number(v) : null)}>
                      <option value="">&mdash;</option>
                      {designers.map((p) => (
                        <option key={p.Person_ID} value={p.Person_ID}>{p.Person_Name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="fld">
                    <label>Design status</label>
                    <Select value={s.Design_Status_ID ?? ""} onChange={(v) => setField(s.Project_Scope_ID, "Design_Status_ID", v ? Number(v) : null)}>
                      <option value="">&mdash;</option>
                      {(lookups.designStatuses || []).map((d) => (
                        <option key={d.Design_Status_ID} value={d.Design_Status_ID}>{d.Status}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="fld">
                    <label>Rev</label>
                    <input type="number" min="0" value={s.Revision ?? 0}
                      onChange={(e) => setField(s.Project_Scope_ID, "Revision", Number(e.target.value))} />
                  </div>

                  <div className="fld">
                    <label>Target date</label>
                    <input type="date" value={s.Target_Date || ""}
                      onChange={(e) => setField(s.Project_Scope_ID, "Target_Date", e.target.value)} />
                  </div>
                  <div className="fld">
                    <label>Actual date</label>
                    <input type="date" value={s.Actual_Date || ""}
                      onChange={(e) => setField(s.Project_Scope_ID, "Actual_Date", e.target.value)} />
                  </div>
                  <div className="fld">
                    <label>POC status</label>
                    <Select value={s.POC_Status_ID ?? ""} onChange={(v) => setField(s.Project_Scope_ID, "POC_Status_ID", v ? Number(v) : null)}>
                      <option value="">&mdash;</option>
                      {(lookups.pocStatuses || []).map((x) => (
                        <option key={x.POC_Status_ID} value={x.POC_Status_ID}>{x.POC_Status}</option>
                      ))}
                    </Select>
                  </div>

                  <div className="fld span2">
                    <label>Checked by</label>
                    <Select value={s.Design_Checked_By ?? ""} onChange={(v) => setField(s.Project_Scope_ID, "Design_Checked_By", v ? Number(v) : null)}>
                      <option value="">&mdash;</option>
                      {(checkers.length ? checkers : lookups.people).map((p) => (
                        <option key={p.Person_ID} value={p.Person_ID}>{p.Person_Name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="fld dc-flags">
                    <Toggle checked={!!s.External_Design}
                      onChange={(v) => setField(s.Project_Scope_ID, "External_Design", v)} label="External" />
                    <Toggle checked={!!s.Carried_Forward}
                      onChange={(v) => setField(s.Project_Scope_ID, "Carried_Forward", v)} label="Carried fwd" />
                  </div>
                </div>

                <div className="dc-foot">
                  <button className="btn accent" disabled={savingId === s.Project_Scope_ID}
                    onClick={() => save(s)}>
                    {savingId === s.Project_Scope_ID ? "Saving\u2026" : "Save design"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const CSS = `
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

.design-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 14px; }
.design-card {
  border: 1px solid var(--border); border-top: 3px solid var(--muted);
  border-radius: var(--radius); padding: 14px; background: var(--white);
}
.dc-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.dc-title { display: flex; align-items: center; gap: 7px; font-size: 13.5px; font-weight: 700; }
.dc-right { display: flex; align-items: center; gap: 5px; }
.badge {
  font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  border-radius: 4px; padding: 2px 6px;
}
.badge.done { background: var(--ok-bg); color: var(--ok-text); border: 1px solid var(--ok-border); }
.badge.late { background: var(--err-bg); color: var(--err-text); border: 1px solid var(--err-border); }
.badge.ext  { background: var(--bg); color: var(--muted); border: 1px solid var(--border); }
.dc-del { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 11px; padding: 2px 4px; border-radius: 4px; }
.dc-del:hover { background: #fef2f2; color: #ef4444; }

.dc-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.dc-grid .span2 { grid-column: span 2; }
.dc-flags { display: flex; gap: 14px; align-items: center; padding-top: 16px; }
.dc-foot { display: flex; justify-content: flex-end; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border); }
.dc-foot .btn { padding: 6px 14px; font-size: 12.5px; }
`;
