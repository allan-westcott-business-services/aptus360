import { useState, useEffect } from "react";
import Banner from "../../components/Banner.jsx";
import Section from "../../components/Section.jsx";
import { getLookups } from "../../api/lookups.js";
import { listDevelopers, saveDeveloper, deleteDeveloper } from "../../api/developers.js";
import { developerBranchName, branchColumnsFor } from "./developerBranch.js";

/* Developers on a project.

   A joint scheme has several, each with their own plots. One is usually
   the main but not necessarily — so "main" is a mark you set, not a
   position in the list. */
/* Written once, because it is set in three places — the initial state,
   a successful save and cancelling. Three copies of the same object
   literal is three chances to forget a field, and a field left behind
   is written to the next developer without anyone typing it. */
const EMPTY_DRAFT = { Branch_Choice: "", Developer_Code: "", Is_Main: false, Notes: "" };

export default function DevelopersSection({ projectId, onChanged }) {
  const [lookups, setLookups] = useState(null);
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [unassigned, setUnassigned] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [codeEdit, setCodeEdit] = useState({});
  /* Prefixed, because two branch tables with separate sequences cannot
     be told apart by a bare number — see developerBranch.js. */
  const [draft, setDraft] = useState(EMPTY_DRAFT);

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

  /* Either table, through the one rule the Details tab uses. This read
     lookups.branches alone, so a developer on an organisation branch —
     which is every developer added since Customer_Branch was superseded
     — showed as an em dash beside its plot count. */
  const branchLabel = (dev) => developerBranchName(dev, lookups) ?? "\u2014";

  /* The branch behind a prefixed choice, so the code can be defaulted
     from it. Organisation branches only: the old table is empty and
     nothing is offered from it. */
  const branchByChoice = (choice) => (lookups?.developerBranches || [])
    .find((b) => `o${b.Organisation_Branch_ID}` === String(choice)) || null;

  /* Whether the branch chosen has a code of its own to offer. Said on
     screen rather than left as an empty box: a code that has to be
     invented per project is how two branches came to share one. */
  const chosenBranch = branchByChoice(draft.Branch_Choice);

  async function add() {
    if (!draft.Branch_Choice) return setError("Choose a developer branch.");
    try {
      await saveDeveloper(projectId, {
        ...branchColumnsFor(draft.Branch_Choice),
        /* An organisation branch has no Customer to name, and inventing
           one would file the project under a customer nobody chose. */
        Customer_ID: null,
        Is_Main: rows.length === 0 ? true : !!draft.Is_Main,
        Developer_Code: (draft.Developer_Code || "").toUpperCase() || null,
        Notes: draft.Notes || null,
      });
      setDraft(EMPTY_DRAFT);
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
      ? `Remove ${branchLabel(d)}? Its ${n} plot${n === 1 ? "" : "s"} will become unassigned.`
      : `Remove ${branchLabel(d)}?`;
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
        <button className="btn ghost sm"
          onClick={() => {
            /* Cancel empties the form.

               It only closed it, so re-opening showed the branch and
               code last chosen — and since the code is now defaulted
               from the branch, a stale one sitting there would be
               written to a different developer without being typed. */
            if (adding) { setDraft(EMPTY_DRAFT); setError(""); }
            setAdding((a) => !a);
          }}>
          {adding ? "Cancel" : "+ Add developer"}
        </button>
      }
    >
      <style>{CSS}</style>
      {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}
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
              <label>Developer branch <span className="req">*</span></label>
              {/* Housing developers only, from the role-scoped lookup
                  the project form uses. Every branch in the register
                  was offered before, so a council or an IDNO could be
                  named as whose site this is.

                  Prefixed by table. Developers recorded before 0198 sit
                  on the older Customer_Branch and still have to be
                  shown and edited, so a bare id could not say which
                  table a choice came from. */}
              <select value={draft.Branch_Choice}
                onChange={(e) => {
                  const choice = e.target.value;
                  /* The code comes off the BRANCH.

                     It used to be defaulted from the customer, so every
                     branch of one housebuilder got the same one — Anwyl
                     Lancashire and Anwyl Wales both came out as AH. The
                     code prefixes plot numbers where a site has more
                     than one developer (2607.014-AH-12), so two
                     branches of the same company on one site produced
                     identical prefixes and no way to tell whose plot
                     was whose.

                     Only where nothing has been typed. Someone who has
                     already entered a code for this project has said
                     something the branch does not know. */
                  const b = branchByChoice(choice);
                  setDraft((d) => ({
                    ...d,
                    Branch_Choice: choice,
                    Developer_Code: d.Developer_Code || b?.Developer_Code || "",
                  }));
                }}>
                <option value="">&mdash; Select &mdash;</option>
                {(lookups.developerBranches || [])
                  .filter((b) => !rows.some((r) =>
                    Number(r.Organisation_Branch_ID) === Number(b.Organisation_Branch_ID)))
                  .map((b) => (
                    <option key={`o${b.Organisation_Branch_ID}`}
                      value={`o${b.Organisation_Branch_ID}`}>
                      {b.Organisation_Name
                        ? `${b.Organisation_Name} \u2014 ${b.Branch_Dropdown || b.Branch_Name}`
                        : (b.Branch_Dropdown || b.Branch_Name)}
                    </option>
                  ))}
              </select>
              {lookups.developerBranches_error && (
                <p className="fld-warn">{lookups.developerBranches_error}</p>
              )}
            </div>
            <div className="fld">
              <label>Code</label>
              <input className="dev-code" maxLength={4} placeholder="AH"
                value={draft.Developer_Code}
                onChange={(e) => setDraft((d) => ({ ...d, Developer_Code: e.target.value.toUpperCase() }))} />
              {/* Left editable, and this is why.

                  The branch's code is the right answer nearly always,
                  and it is what fills the box. But the code exists to
                  tell developers apart ON THIS SITE, and a scheme where
                  two branches of one company both appear needs whatever
                  distinguishes them there. A read-only field would make
                  that unsayable.

                  Where the branch has no code, the box is empty and
                  says so \u2014 rather than silently expecting one to be
                  invented, which is how AH came to mean two branches. */}
              {chosenBranch && !chosenBranch.Developer_Code && (
                <p className="fld-hint">
                  This branch has no code &mdash; set one on it in Admin
                  &rsaquo; Organisations so every project agrees.
                </p>
              )}
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
                  {branchLabel(d)}
                  {d.Is_Main && <span className="tag">Main</span>}
                </span>
                {d.Notes && <span className="dev-note">{d.Notes}</span>}
              </div>
              <input
                className="dev-code inline"
                maxLength={4}
                placeholder={"\u2014"}
                aria-label={`Code for ${branchLabel(d)}`}
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
/* Both belong to this form, so they live here rather than in
   src/styles.css — fault 11 is app-wide rules hidden in a component's
   own block, and this is the other direction of the same rule. */
.fld-warn { margin: 5px 0 0; font-size: 11.5px; color: #b45309; max-width: 34ch; line-height: 1.4; }
.fld-hint { margin: 5px 0 0; font-size: 11.5px; color: var(--muted); max-width: 34ch; line-height: 1.4; }
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
