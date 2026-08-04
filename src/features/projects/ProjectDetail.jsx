import { useState, useEffect, useCallback } from "react";
import { listOptions, addOptions, removeOption } from "../../api/projectOptions.js";
import ProjectDetailsForm from "./ProjectDetailsForm.jsx";
import StakeholderTab from "../stakeholders/StakeholderTab.jsx";
import ActivityTab from "../activity/ActivityTab.jsx";
import ContractDesignsTab from "../designs/ContractDesignsTab.jsx";
import AssetValueTab from "../av/AssetValueTab.jsx";
import POCApplicationsTab from "../poc/POCApplicationsTab.jsx";
import NonResidentialTab from "../nrs/NonResidentialTab.jsx";
import InvoicesTab from "../invoices/InvoicesTab.jsx";
import PlotsTab from "../plots/PlotsTab.jsx";
import OutlineDesignsTab from "../designs/OutlineDesignsTab.jsx";

/* An existing project, opened from the table. Tabs mirror the tender
   detail panel in the original app — Details and Plots for now, with
   Scopes, Designs and History slotting in as they're migrated. */
const TABS = [
  { id: "details", label: "Details" },
  { id: "stakeholder", label: "Stakeholders" },
  { id: "plots", label: "Plots" },
  { id: "nrs", label: "Non-Res Supplies" },
  { id: "poc", label: "POC Applications" },
  { id: "designs", label: "Outline Designs" },
  { id: "av", label: "Asset Value" },
  { id: "contract-designs", label: "Detailed Designs" },
  /* Invoices sits next to the designs it bills for, rather than at the
     far end after History and Comments. */
  { id: "invoices", label: "Invoices" },
  { id: "history", label: "History" },
  { id: "comments", label: "Comments" },
];

export default function ProjectDetail({
  project: incoming, initialTab = "details", onBack, onOpenOption, onTabChange,
  onProjectChange,
}) {
  /* The project as it now stands, not as it was handed over.

     The header shows the site name and the reference, and the details
     form saves them — but the form held its own copy and told nobody, so
     renaming a site left the heading showing the old name until the page
     was left and reopened. Someone who has just typed a name and watched
     it not appear reasonably concludes the save failed.

     Seeded from the prop and replaced when the form reports a save. The
     prop is watched too, so opening a different project still works. */
  const [project, setProject] = useState(incoming);
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
          <h2>
            <span className="mono ref">{project.Display_Ref ?? project.Project_Ref}</span>
            {project.Revision ? <span className="rev">r{project.Revision}</span> : null}
          </h2>
          <p className="page-sub">{project.Site_Name || "Unnamed site"}</p>
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

      <div className="detail-tabs" role="tablist">
        {TABS.map((t) => (
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
        {tab === "av" && <AssetValueTab projectId={project.Project_ID} />}
        {tab === "contract-designs" && <ContractDesignsTab projectRef={project.Project_Ref} />}
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
