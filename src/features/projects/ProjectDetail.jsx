import { useState, useEffect, useCallback, useMemo } from "react";
import { listOptions, addOptions, removeOption } from "../../api/projectOptions.js";
import { remember, recall } from "../../lib/session.js";
import ProjectDetailsForm from "./ProjectDetailsForm.jsx";
import { visibleTabs, visibleStages, resolveStage } from "../../lib/projectTabs.js";
import { adminList } from "../../api/admin.js";
import StakeholderTab from "../stakeholders/StakeholderTab.jsx";
import CallOffsTab from "../calloffs/CallOffsTab.jsx";
import ActivityTab from "../activity/ActivityTab.jsx";
import ContractDesignsTab from "../designs/ContractDesignsTab.jsx";
import LegalTab from "./LegalTab.jsx";
import AssetValueTab from "../av/AssetValueTab.jsx";
import POCApplicationsTab from "../poc/POCApplicationsTab.jsx";
import NonResidentialTab from "../nrs/NonResidentialTab.jsx";
import InvoicesTab from "../invoices/InvoicesTab.jsx";
import PlotsTab from "../plots/PlotsTab.jsx";
import OutlineDesignsTab from "../designs/OutlineDesignsTab.jsx";

/* An existing project, opened from the table. Tabs mirror the tender
   detail panel in the original app — Details and Plots for now, with
   Scopes, Designs and History slotting in as they're migrated. */
/* The tab list, the stage rule and the per-section visibility rules all
   live in src/lib/projectTabs.js, because the admin screen that
   configures them needs the same lists. */

/* Where a project is being worked on. Held per project id, so two
   projects open in turn do not fight over one setting. */
const stageKey = (id) => `projectStage:${id}`;

export default function ProjectDetail({
  project: incoming, initialTab = "details", onBack, onOpenOption, onTabChange,
  onProjectChange, areaKey = null,
}) {
  /* Which tabs this section hides. Fetched rather than passed down:
     every route into this page would otherwise have to know to carry
     it, and one of them forgetting shows as the setting being ignored
     on that route only. Failure is tolerated — an unreachable table
     means no rows, which means every tab, which is what the page did
     before the setting existed. */
  const [tabRows, setTabRows] = useState([]);
  const [stageRows, setStageRows] = useState([]);
  useEffect(() => {
    let live = true;
    const soft = (t) => adminList(t).catch(() => ({ rows: [] }));
    Promise.all([soft("Project_Tab_Visibility"), soft("Project_Stage_Visibility")])
      .then(([tabs, stages]) => {
        if (!live) return;
        setTabRows(tabs.rows || []);
        setStageRows(stages.rows || []);
      });
    return () => { live = false; };
  }, []);
  /* The project as it now stands, not as it was handed over.

     The header shows the site name and the reference, and the details
     form saves them — but the form held its own copy and told nobody, so
     renaming a site left the heading showing the old name until the page
     was left and reopened. Someone who has just typed a name and watched
     it not appear reasonably concludes the save failed.

     Seeded from the prop and replaced when the form reports a save. The
     prop is watched too, so opening a different project still works. */
  const [project, setProject] = useState(incoming);

  /* Contract projects open on the contract stage.

     A project that has been won is nearly always being looked at for
     what happens next, not for what was quoted — so the stage follows
     the status unless somebody has said otherwise for this project. */
  const [stage, setStage] = useState(() => {
    const saved = recall(stageKey(incoming?.Project_ID), null);
    if (saved === "tender" || saved === "contract") return saved;
    return incoming?.Is_Contract || incoming?.Contract_Signed_Date
      ? "contract" : "tender";
  });
  useEffect(() => {
    remember(stageKey(project?.Project_ID), stage);
  }, [stage, project?.Project_ID]);

  /* Everything below reads `stage`, so it is declared after it rather
     than beside the fetch above: a useMemo runs its factory during
     render, and reading a const from above its own declaration is a
     temporal dead zone that takes the whole page down. */
  const stages = useMemo(
    () => visibleStages(areaKey, stageRows), [areaKey, stageRows]);

  /* A stage this section does not offer is corrected rather than shown.
     Somebody who last looked at this project in Tendering & Design has
     "tender" remembered for it, and must not land on a Tender view in
     Operations where Tender does not exist. */
  const shownStage = useMemo(
    () => resolveStage(stage, areaKey, stageRows), [stage, areaKey, stageRows]);
  useEffect(() => {
    if (shownStage !== stage) setStage(shownStage);
  }, [shownStage, stage]);

  const shownTabs = useMemo(
    () => visibleTabs(shownStage, areaKey, tabRows), [shownStage, areaKey, tabRows]);

  /* Switching stage can leave the open tab behind — POC Applications
     does not exist on a contract. Falls back to Details, which is in
     both and is where somebody would look first anyway. */
  useEffect(() => {
    if (!shownTabs.some((t) => t.id === tab)) setTab("details");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, shownTabs]);
  useEffect(() => { setProject(incoming); }, [incoming]);
  /* The other versions of this enquiry: 2607.004(A), (B) and so on.
     Fetched rather than passed in, because a project can be opened from
     several places and only one of them knows about its siblings. */
  const [options, setOptions] = useState([]);
  const [busyOpt, setBusyOpt] = useState(false);

  const loadOptions = useCallback(async () => {
    try { setOptions((await listOptions(project.Project_ID)).rows || []); }
    catch { setOptions([]); }
  }, [project.Project_ID]);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  async function addOne() {
    setBusyOpt(true);
    try { await addOptions(project.Project_ID, 1); await loadOptions(); }
    finally { setBusyOpt(false); }
  }

  async function removeThis() {
    /* Named in the prompt: the letters are short and one option looks
       much like another two clicks in. */
    if (!window.confirm(
      `Delete option ${project.Option_Letter} of ${project.Project_Ref}?\n\n`
      + "Its plots, developers and designs go with it. This cannot be undone."
    )) return;
    setBusyOpt(true);
    try { await removeOption(project.Project_ID, project.Project_ID); onBack(); }
    finally { setBusyOpt(false); }
  }

  const [tab, setTab] = useState(initialTab);

  /* Told upward so a reload comes back to the tab being read rather than
     the one this was opened on. Without it the page remembers where
     someone arrived, which after a few clicks is not where they are. */
  useEffect(() => { onTabChange?.(tab); }, [tab, onTabChange]);
  if (!project) return null;

  return (
    <div>
      <style>{CSS}</style>

      <div className="detail-head">
        <button className="back-link" onClick={onBack}>
          &larr; All projects
        </button>
        <div className="detail-title">
          {/* Site name on the same line as the reference rather than
              beneath it. The two are read together — the reference
              identifies the project and the name is how anybody actually
              recognises it — and stacking them pushed the tab strip a
              line further down every screen. */}
          <h2>
            <span className="mono ref">{project.Display_Ref ?? project.Project_Ref}</span>
            {project.Revision ? <span className="rev">r{project.Revision}</span> : null}
            <span className="site">{project.Site_Name || "Unnamed site"}</span>
          </h2>
        </div>

        {/* Shown only when there is more than one, so an ordinary project
            is not cluttered by a strip saying it has no alternatives. */}
        {options.length > 1 && (
          <div className="opt-strip" role="group" aria-label="Options">
            {options.map((o) => (
              <button key={o.Project_ID}
                className={o.Project_ID === project.Project_ID ? "opt on" : "opt"}
                title={o.Project_ID === project.Project_ID ? "You are here" : `Open ${o.Display_Ref}`}
                onClick={() => o.Project_ID !== project.Project_ID && onOpenOption?.(o)}>
                {o.Option_Letter ?? "\u2014"}
              </button>
            ))}
          </div>
        )}

        <div className="opt-actions">
          <button className="btn ghost sm" disabled={busyOpt} onClick={addOne}
            title="Copy this project as the next option">
            {busyOpt ? "Working\u2026" : "+ Option"}
          </button>
          {options.length > 1 && (
            <button className="btn ghost sm danger" disabled={busyOpt} onClick={removeThis}
              title="Delete this option and everything in it">
              Remove {project.Option_Letter}
            </button>
          )}
        </div>
      </div>

      {/* Which stage the project is being looked at in.

          Remembered per project, so someone working through a contract
          does not land on the tender tabs every time they come back to
          it. A view rather than a status: switching does not change the
          project, only what is in front of you. */}
      {/* Only where there is something to switch between. A section
          left with one stage gets no control: one option is furniture,
          and it invites a click that does nothing. */}
      {stages.length > 1 && (
        <div className="stage-bar">
          <div className="stage-switch" role="tablist" aria-label="Stage">
            {stages.map((sg) => (
              <button key={sg.id} role="tab"
                aria-selected={shownStage === sg.id}
                className={shownStage === sg.id ? "stage-btn on" : "stage-btn"}
                onClick={() => setStage(sg.id)}>
                {sg.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="detail-tabs" role="tablist">
        {shownTabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "detail-tab on" : "detail-tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="detail-body">
        {tab === "details" && (
          <ProjectDetailsForm projectId={project.Project_ID}
            onSaved={(saved) => {
              setProject((p) => ({ ...p, ...saved }));
              /* Passed further up as well, so the page that opened this
                 holds the new name too. Without it the remembered
                 position — which stores the project it opened — puts the
                 old name back after a reload. */
              onProjectChange?.(saved);
            }} />
        )}
        {tab === "designs" && <OutlineDesignsTab projectId={project.Project_ID} />}
        {tab === "history" && <ActivityTab projectId={project.Project_ID} view="history" />}
        {tab === "comments" && <ActivityTab projectId={project.Project_ID} view="comments" />}
        {tab === "nrs" && <NonResidentialTab projectId={project.Project_ID} />}
        {tab === "poc" && <POCApplicationsTab projectId={project.Project_ID} />}
        {tab === "legal" && <LegalTab />}
        {tab === "av" && <AssetValueTab projectId={project.Project_ID} />}
        {tab === "contract-designs" && <ContractDesignsTab projectRef={project.Project_Ref} />}
        {tab === "calloffs" && <CallOffsTab projectId={project.Project_ID} />}
        {tab === "invoices" && (
          <InvoicesTab projectId={project.Project_ID} projectRef={project.Project_Ref} />
        )}
        {tab === "stakeholder" && <StakeholderTab projectId={project.Project_ID} />}
        {tab === "plots" && (
          <PlotsTab projectId={project.Project_ID} projectRef={project.Project_Ref} />
        )}
      </div>
    </div>
  );
}

const CSS = `
/* The stage switch: two states, so a segmented pair rather than a
   dropdown — with two options a dropdown hides one of them behind a
   click for no reason. */
.stage-bar { display: flex; align-items: center; gap: 12px; padding: 0 0 10px; }
.stage-switch { display: inline-flex; border: 1px solid var(--border);
  border-radius: 8px; overflow: hidden; background: var(--white); }
.stage-btn { background: none; border: none; cursor: pointer; padding: 6px 18px;
  font: 700 12px inherit; color: var(--muted); }
.stage-btn:hover:not(.on) { background: var(--bg); }
.stage-btn.on { background: var(--accent); color: #fff; }

.opt-strip { display: flex; gap: 4px; align-items: center; }
.opt { width: 30px; height: 30px; border: 1px solid var(--border); background: var(--white);
  border-radius: 7px; cursor: pointer; font: 700 12px inherit; color: var(--muted); }
.opt:hover { border-color: var(--accent); color: var(--accent); }
.opt.on { background: var(--accent); border-color: var(--accent); color: #fff; cursor: default; }
.opt-actions { display: flex; gap: 6px; align-items: center; }
.detail-head { display: flex; align-items: baseline; gap: 14px; margin-bottom: 12px; }
.back-link {
  background: none; border: none; padding: 0; cursor: pointer;
  font: 600 12.5px inherit; color: var(--accent); flex: none;
}
.back-link:hover { text-decoration: underline; }
.detail-title h2 { margin: 0; font-size: 19px; font-weight: 700; display: flex; align-items: baseline; gap: 8px; }
.detail-title .ref { color: var(--accent); }
/* Lighter than the reference beside it: the two are read together, and
   equal weight makes neither of them the thing you find first. */
.detail-title .site { font-weight: 500; font-size: 16px; color: var(--muted); }
.detail-title .rev {
  font-size: 11px; font-weight: 700; color: var(--muted);
  background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px;
}
.detail-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-bottom: 18px; }
.detail-tab {
  background: none; border: none; border-bottom: 2px solid transparent;
  padding: 9px 16px; margin-bottom: -1px; cursor: pointer;
  font-family: inherit; font-size: 13px; font-weight: 600; color: var(--muted);
}
.detail-tab:hover { color: var(--text); }
.detail-tab.on { color: var(--accent); border-bottom-color: var(--accent); }
`;

