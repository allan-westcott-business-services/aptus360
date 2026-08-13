import { useState, useEffect } from "react";
import { useDragHandle } from "../../lib/useDragHandle.js";
import Banner from "../../components/Banner.jsx";
import { getProject, createRevision } from "../../api/projects.js";
import { getLookups } from "../../api/lookups.js";
import { utilityById } from "../../lib/utilities.js";

/* Creating a revision.

   The decision that matters is per design: redraw it, or carry it
   forward unchanged. That's what Carried_Forward records, and it's why
   the original asked before creating rather than after. */
export default function CreateRevisionModal({ project, onClose, onCreated }) {
  const [scopes, setScopes] = useState([]);
  const [lookups, setLookups] = useState(null);
  const [carry, setCarry] = useState([]);
  const [copyPlots, setCopyPlots] = useState(true);
  const [plotCount, setPlotCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    Promise.all([getProject(project.Project_ID), getLookups()])
      .then(([p, lk]) => {
        if (!live) return;
        setScopes(p.scopes || []);
        setPlotCount(p.Auto_Plot_Count ?? 0);
        setLookups(lk);
        // Carrying everything forward is the common case
        setCarry((p.scopes || []).map((s) => s.Project_Scope_ID));
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [project.Project_ID]);

  const statusName = (id) =>
    (lookups?.designStatuses || []).find((d) => d.Design_Status_ID === id)?.Status ?? "Not started";

  const toggle = (id) =>
    setCarry((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const nextRev = (project.Revision ?? 0) + 1;
  const redoing = scopes.filter((s) => !carry.includes(s.Project_Scope_ID)).length;

  async function create() {
    setBusy(true);
    try {
      const created = await createRevision(project.Project_ID, carry, copyPlots);
      onCreated && onCreated(created);
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  const drag = useDragHandle();

  return (
    <div className="cr-backdrop" onClick={() => { if (!drag.justDragged()) onClose(); }}>
      <div className="cr" onClick={(e) => e.stopPropagation()} style={drag.panelStyle} role="dialog" aria-label="Create revision">
        <style>{CSS}</style>

        <div className="cr-head" {...drag.handleProps}>
          <div>
            <h3>Create revision {nextRev}</h3>
            <p className="cr-sub">
              <span className="mono">{project.Project_Ref}</span> r{project.Revision ?? 0}
              {" \u2192 "}
              <span className="mono">{project.Project_Ref}</span> r{nextRev}
            </p>
          </div>
          <button className="cr-x" onClick={onClose} aria-label="Close">&#10005;</button>
        </div>

        <div className="cr-body">
          {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}

          <Banner kind="warn">
            The current revision will be marked <strong>Superseded</strong> and can no longer
            be worked on. This can&rsquo;t be undone from here.
          </Banner>

          {loading ? (
            <p className="cr-wait">Loading designs&hellip;</p>
          ) : (
            <>
              <p className="cr-label">Outline designs</p>
              <p className="cr-hint">
                Ticked designs carry forward as they stand. Unticked ones start blank on the
                new revision, ready to be redrawn.
              </p>

              {scopes.length === 0 ? (
                <p className="cr-none">This project has no outline designs.</p>
              ) : (
                <div className="cr-list">
                  {scopes.map((s) => {
                    const u = utilityById(s.Utility_ID);
                    const on = carry.includes(s.Project_Scope_ID);
                    return (
                      <label className={on ? "cr-row on" : "cr-row"} key={s.Project_Scope_ID}>
                        <input type="checkbox" checked={on}
                          onChange={() => toggle(s.Project_Scope_ID)} />
                        <span className="cr-dot" style={{ background: u?.colour }} />
                        <span className="cr-name">{u?.name ?? "Design"}</span>
                        <span className="cr-status">{statusName(s.Design_Status_ID)}</span>
                        <span className={on ? "cr-tag carry" : "cr-tag redo"}>
                          {on ? "Carry forward" : "Redraw"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              <p className="cr-label">Plots</p>
              <label className="cr-check">
                <input type="checkbox" checked={copyPlots}
                  onChange={(e) => setCopyPlots(e.target.checked)} />
                Copy the {plotCount} plot{plotCount === 1 ? "" : "s"} and their developers across
              </label>
              <p className="cr-hint">
                Points are calculated from the plot count, so a revision without plots scores
                nothing until they&rsquo;re added.
              </p>
            </>
          )}
        </div>

        <div className="cr-foot">
          <span className="cr-summary">
            {carry.length} carried forward{redoing > 0 && `, ${redoing} to redraw`}
          </span>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn accent" disabled={busy || loading} onClick={create}>
            {busy ? "Creating\u2026" : `Create revision ${nextRev}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.cr-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.45); z-index: 1000;
  display: flex; align-items: center; justify-content: center; padding: 24px; }
.cr { background: var(--white); border-radius: 12px; width: 100%; max-width: 560px;
  max-height: 88vh; display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(0,0,0,.3); }
.cr-head { display: flex; align-items: flex-start; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--border); }
.cr-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.cr-sub { margin: 3px 0 0; font-size: 12px; color: var(--muted); }
.cr-x { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 13px; }
.cr-body { padding: 16px 20px; overflow-y: auto; }
.cr-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em;
  color: var(--accent); margin: 16px 0 6px; }
.cr-hint { font-size: 11.5px; color: var(--muted); margin: 0 0 10px; }
.cr-none { font-size: 12.5px; color: var(--muted); font-style: italic; margin: 0; }
.cr-wait { font-size: 12.5px; color: var(--muted); }
.cr-list { display: flex; flex-direction: column; gap: 5px; }
.cr-row { display: flex; align-items: center; gap: 10px; border: 1px solid var(--border);
  border-radius: var(--radius); padding: 9px 12px; margin: 0; cursor: pointer;
  font-size: 12.5px; font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--text); }
.cr-row.on { border-color: var(--accent); background: var(--accent-light); }
.cr-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.cr-name { flex: 1; font-weight: 600; }
.cr-status { font-size: 11px; color: var(--muted); }
.cr-tag { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  border-radius: 4px; padding: 2px 7px; white-space: nowrap; }
.cr-tag.carry { background: var(--ok-bg); color: var(--ok-text); border: 1px solid var(--ok-border); }
.cr-tag.redo { background: var(--warn-bg); color: var(--warn-text); border: 1px solid var(--warn-border); }
.cr-check { display: flex; align-items: center; gap: 9px; font-size: 12.5px; font-weight: 500;
  text-transform: none; letter-spacing: 0; color: var(--text); margin: 0 0 6px; cursor: pointer; }
.cr-foot { display: flex; align-items: center; gap: 9px; padding: 14px 20px;
  border-top: 1px solid var(--border); }
.cr-summary { flex: 1; font-size: 11.5px; color: var(--muted); }
.mono { font-family: ui-monospace, Menlo, monospace; }
`;
