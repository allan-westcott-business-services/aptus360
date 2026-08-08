import { useState, useMemo } from "react";
import { useDragHandle } from "../../lib/useDragHandle.js";
import { setPlannerColour } from "../../api/planning.js";

/* Choosing what colour each manager's group is drawn in.

   ── Who appears ──

   Only people who manage a project. The Person table holds everybody —
   estimators, designers, jointers — and a list of all of them to colour
   would bury the six names that will ever appear on this board.

   ── Saved one at a time, and reported ──

   There is no bulk endpoint for this and it does not warrant one: it is
   a handful of rows, saved once in a while. What it does warrant is
   saying which ones failed rather than "could not save": if four of six
   went through, closing the dialog on a single error would leave
   somebody guessing which two to do again. */
export default function PmColoursModal({ data, onClose, onSaved }) {
  const drag = useDragHandle();

  const managers = useMemo(() => {
    const ids = new Set((data.projects || [])
      .map((p) => p.Project_Manager_ID)
      .filter((x) => x != null)
      .map(Number));
    return (data.people || [])
      .filter((p) => ids.has(Number(p.Person_ID)))
      .map((p) => ({
        id: Number(p.Person_ID),
        name: p.Person_Name || `Person #${p.Person_ID}`,
        colour: p.Planner_Colour || "#64748b",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const [draft, setDraft] = useState(() =>
    Object.fromEntries(managers.map((m) => [m.id, m.colour])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const changed = managers.filter((m) => draft[m.id] !== m.colour);

  async function save() {
    setBusy(true);
    setError("");
    const done = {};
    const failed = [];
    for (const m of changed) {
      try {
        await setPlannerColour(m.id, draft[m.id]);
        done[m.id] = draft[m.id];
      } catch {
        failed.push(m.name);
      }
    }
    setBusy(false);
    if (failed.length) {
      setError(`Saved ${Object.keys(done).length}. `
        + `Could not save: ${failed.join(", ")}.`);
      return;
    }
    onSaved(done);
  }

  return (
    <div className="fe-backdrop" onClick={() => { if (!drag.justDragged()) onClose(); }}>
      <div className="pmc" onClick={(e) => e.stopPropagation()} style={drag.panelStyle}
        role="dialog" aria-label="Manager colours">
        <style>{CSS}</style>

        <div className="pmc-head" {...drag.handleProps}>
          <div>
            <h3>Manager colours</h3>
            <p className="pmc-sub">
              What each manager&rsquo;s group band is drawn in when the schedule is
              grouped by project manager.
            </p>
          </div>
          <button className="fe-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="pmc-body">
          {error && <p className="pmc-err">{error}</p>}

          {!managers.length && (
            <p className="pmc-none">
              No project has a manager set, so there are no groups to colour. The
              manager is set on a project&rsquo;s details.
            </p>
          )}

          {managers.map((m) => (
            <label key={m.id} className="pmc-row">
              <input type="color" value={draft[m.id]}
                onChange={(e) => setDraft((d) => ({ ...d, [m.id]: e.target.value }))} />
              <span className="pmc-name">{m.name}</span>
              {draft[m.id] !== m.colour && <span className="pmc-changed">changed</span>}
            </label>
          ))}
        </div>

        <div className="fe-foot">
          <span className="fe-spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn accent" disabled={busy || !changed.length} onClick={save}>
            {busy ? "Saving\u2026" : (changed.length
              ? `Save ${changed.length} change${changed.length === 1 ? "" : "s"}`
              : "Nothing changed")}
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.pmc { background: var(--white); border-radius: 12px; width: min(440px, 94vw);
  max-height: 84vh; display: flex; flex-direction: column;
  box-shadow: 0 24px 60px rgba(15,23,42,.28); }
.pmc-head { display: flex; align-items: flex-start; gap: 10px; padding: 15px 18px 12px;
  border-bottom: 1px solid var(--border); }
.pmc-head > div { flex: 1; }
.pmc-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.pmc-sub { margin: 3px 0 0; font-size: 11.5px; color: var(--muted); }
.pmc-body { padding: 8px 18px 14px; overflow-y: auto; flex: 1; }
.pmc-row { display: flex; align-items: center; gap: 12px; padding: 8px 2px;
  border-bottom: 1px solid var(--border); cursor: pointer; }
.pmc-row input[type="color"] { width: 42px; height: 28px; padding: 0;
  border: 1px solid var(--border); border-radius: 6px; background: var(--white);
  cursor: pointer; }
.pmc-name { flex: 1; font-size: 13px; }
.pmc-changed { font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; color: #3730a3; background: #e0e7ff; border-radius: 20px;
  padding: 1px 8px; }
.pmc-none { font-size: 12.5px; color: var(--muted); padding: 16px 0; margin: 0; }
.pmc-err { font-size: 12px; color: #991b1b; background: #fef2f2; border: 1px solid #fca5a5;
  border-radius: 6px; padding: 7px 10px; margin: 8px 0; }
`;
