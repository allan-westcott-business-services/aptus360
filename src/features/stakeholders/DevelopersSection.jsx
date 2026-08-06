import { useState, useEffect } from "react";
import Banner from "../../components/Banner.jsx";
import Section from "../../components/Section.jsx";
import { getLookups } from "../../api/lookups.js";
import { listDevelopers, saveDeveloper, deleteDeveloper } from "../../api/developers.js";

/* Developers on a project.

   A joint scheme has several, each with their own plots. One is usually
   the main but not necessarily — so "main" is a mark you set, not a
   position in the list. */
export default function DevelopersSection({ projectId, onChanged }) {
  const [lookups, setLookups] = useState(null);
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [unassigned, setUnassigned] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [codeEdit, setCodeEdit] = useState({});
  const [draft, setDraft] = useState({ Branch_ID: "", Developer_Code: "", Is_Main: false, Notes: "" });

  async function load() {
    try {
      const [lk, res] = await Promise.all([getLookups(), listDevelopers(projectId)]);
      setLookups(lk);
      setRows(res.rows || []);
      setCounts(res.counts || {});
      setUnassigned(res.unassigned || 0);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  const branch = (id) => (lookups?.branches || []).find((b) => b.Branch_ID === id);
  const branchLabel = (id) => {
    const b = branch(id);
    return b ? (b.Branch_Dropdown || b.Branch_Name) : "\u2014";
  };

  async function add() {
    if (!draft.Branch_ID) return setError("Choose a customer branch.");
    const b = branch(Number(draft.Branch_ID));
    try {
      await saveDeveloper(projectId, {
        Customer_ID: b?.Customer_ID ?? null,
        Branch_ID: Number(draft.Branch_ID),
        Is_Main: rows.length === 0 ? true : !!draft.Is_Main,
        Developer_Code: (draft.Developer_Code || "").toUpperCase() || null,
        Notes: draft.Notes || null,
      });
      setDraft({ Branch_ID: "", Developer_Code: "", Is_Main: false, Notes: "" });
      setAdding(false);
      setError("");
      await load();
      onChanged && onChanged();
    } catch (e) { setError(e.message); }
  }

  async function setMain(d) {
    try { await saveDeveloper(projectId, { Is_Main: true }, d.Project_Developer_ID); await load(); onChanged && onChanged(); }
    catch (e) { setError(e.message); }
  }

  async function remove(d) {
    const n = counts[d.Project_Developer_ID] || 0;
    const msg = n
      ? `Remove ${branchLabel(d.Branch_ID)}? Its ${n} plot${n === 1 ? "" : "s"} will become unassigned.`
      : `Remove ${branchLabel(d.Branch_ID)}?`;
    if (!window.confirm(msg)) return;
    try { await deleteDeveloper(projectId, d.Project_Developer_ID); await load(); onChanged && onChanged(); }
    catch (e) { setError(e.message); }
  }

  if (loading) return <div className="loading">Loading developers&hellip;</div>;

  const noMain = rows.length > 0 && !rows.some((d) => d.Is_Main);

  return (
    <Section
      title="Developers"
      right={
        <button className="btn ghost sm" onClick={() => setAdding((a) => !a)}>
          {adding ? "Cancel" : "+ Add developer"}
        </button>
      }
    >
      <style>{CSS}</style>
      {error && <Banner kind="error">{error}</Banner>}
      {noMain && <Banner kind="warn">No main developer set for this project.</Banner>}
      {unassigned > 0 && rows.length > 1 && (
        <Banner kind="warn">
          {unassigned} plot{unassigned === 1 ? " is" : "s are"} not assigned to a developer &mdash;
          set them on the Plots tab.
        </Banner>
      )}

      {adding && (
        <div className="dev-form">
          <div className="dev-grid">
            <div className="fld grow">
              <label>Customer branch <span className="req">*</span></label>
              <select value={draft.Branch_ID}
                onChange={(e) => {
                  const b = branch(Number(e.target.value));
                  const cust = (lookups?.customers || []).find((c) => c.Customer_ID === b?.Customer_ID);
                  setDraft((d) => ({
                    ...d,
                    Branch_ID: e.target.value,
                    Developer_Code: d.Developer_Code || cust?.Customer_Code || "",
                  }));
                }}>
                <option value="">&mdash; Select &mdash;</option>
                {(lookups.branches || [])
                  .filter((b) => !rows.some((r) => r.Branch_ID === b.Branch_ID))
                  .map((b) => (
                    <option key={b.Branch_ID} value={b.Branch_ID}>
                      {b.Branch_Dropdown || b.Branch_Name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="fld">
              <label>Code</label>
              <input className="dev-code" maxLength={4} placeholder="AH"
                value={draft.Developer_Code}
                onChange={(e) => setDraft((d) => ({ ...d, Developer_Code: e.target.value.toUpperCase() }))} />
            </div>
            <div className="fld grow">
              <label>Notes</label>
              <input value={draft.Notes}
                onChange={(e) => setDraft((d) => ({ ...d, Notes: e.target.value }))} />
            </div>
            <div className="fld">
              <label className="inline">
                <input type="checkbox" checked={draft.Is_Main || rows.length === 0}
                  disabled={rows.length === 0}
                  onChange={(e) => setDraft((d) => ({ ...d, Is_Main: e.target.checked }))} />
                Main developer
              </label>
              <button className="btn accent sm" onClick={add}>+ Add</button>
            </div>
          </div>
          <p className="hint">
            {rows.length === 0
              ? "The first developer is the main one."
              : "The code prefixes this developer's plot numbers \u2014 two branches of the same customer need different codes."}
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="dev-none">No developers on this project yet.</p>
      ) : (
        <div className="dev-list">
          {rows.map((d) => (
            <div className={d.Is_Main ? "dev main" : "dev"} key={d.Project_Developer_ID}>
              <div className="dev-main">
                <span className="dev-name">
                  {branchLabel(d.Branch_ID)}
                  {d.Is_Main && <span className="tag">Main</span>}
                </span>
                {d.Notes && <span className="dev-note">{d.Notes}</span>}
              </div>
              <input
                className="dev-code inline"
                maxLength={4}
                placeholder={"\u2014"}
                aria-label={`Code for ${branchLabel(d.Branch_ID)}`}
                value={codeEdit[d.Project_Developer_ID] ?? d.Developer_Code ?? ""}
                onChange={(e) => setCodeEdit((c) => ({
                  ...c, [d.Project_Developer_ID]: e.target.value.toUpperCase(),
                }))}
                onBlur={async (e) => {
                  const v = e.target.value.toUpperCase().trim();
                  if (v === (d.Developer_Code ?? "")) return;
                  try {
                    await saveDeveloper(projectId, { Developer_Code: v || null }, d.Project_Developer_ID);
                    setCodeEdit((c) => { const n = { ...c }; delete n[d.Project_Developer_ID]; return n; });
                    await load();
                    onChanged && onChanged();
                  } catch (err) { setError(err.message); await load(); }
                }}
              />
              <span className="dev-plots">
                {counts[d.Project_Developer_ID] || 0} plot{(counts[d.Project_Developer_ID] || 0) === 1 ? "" : "s"}
              </span>
              <span className="dev-act">
                {!d.Is_Main && (
                  <button className="btn ghost sm" onClick={() => setMain(d)}>Make main</button>
                )}
                <button className="btn delete sm" onClick={() => remove(d)}>Remove</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

const CSS = `
.dev-form { border: 1px solid var(--border); border-radius: var(--radius);
  background: #f8f9fb; padding: 12px; margin-bottom: 12px; }
.dev-grid { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
.dev-grid .fld.grow { flex: 1; min-width: 180px; }
.dev-grid .fld { display: flex; flex-direction: column; }
.dev-grid label.inline { display: flex; align-items: center; gap: 7px; font-size: 12.5px;
  font-weight: 500; text-transform: none; letter-spacing: 0; color: var(--text); margin: 0 0 7px; }
.dev-none { font-size: 12.5px; color: var(--muted); font-style: italic; margin: 0; }
.dev-list { display: flex; flex-direction: column; gap: 6px; }
.dev { display: flex; align-items: center; gap: 14px; border: 1px solid var(--border);
  border-left: 3px solid var(--border); border-radius: var(--radius); padding: 10px 13px; }
.dev.main { border-left-color: var(--accent); background: var(--accent-light); }
.dev-main { flex: 1; min-width: 0; }
.dev-name { display: block; font-size: 13px; font-weight: 700; }
.dev-note { font-size: 11.5px; color: var(--muted); }
.dev-code { width: 74px; font-family: ui-monospace, Menlo, monospace; font-weight: 700;
  text-align: center; text-transform: uppercase; }
/* flex: none so the row can neither stretch nor squeeze it — the width
   is the whole point of a four-character code field. */
.dev-code.inline { width: 62px; flex: none; padding: 4px 6px; font-size: 12px; }
.dev-plots { font-size: 12px; font-weight: 700; color: var(--muted);
  background: var(--white); border: 1px solid var(--border); border-radius: 999px; padding: 3px 11px; }
.dev-act { display: flex; gap: 5px; }
.tag { margin-left: 8px; font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; background: var(--accent); color: #fff; border-radius: 4px; padding: 1px 6px; }
`;
