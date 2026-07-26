import { useState } from "react";
import ProjectDetailsForm from "./ProjectDetailsForm.jsx";
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
  { id: "plots", label: "Plots" },
  { id: "nrs", label: "Non-Res Supplies" },
  { id: "poc", label: "POC Applications" },
  { id: "designs", label: "Outline Designs" },
  { id: "av", label: "Asset Value" },
  { id: "contract-designs", label: "Contract Designs" },
  { id: "history", label: "History" },
  { id: "comments", label: "Comments" },
  { id: "invoices", label: "Invoices" },
];

export default function ProjectDetail({ project, initialTab = "details", onBack }) {
  const [tab, setTab] = useState(initialTab);
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
            <span className="mono ref">{project.Project_Ref}</span>
            {project.Revision ? <span className="rev">r{project.Revision}</span> : null}
          </h2>
          <p className="page-sub">{project.Site_Name || "Unnamed site"}</p>
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
        {tab === "details" && <ProjectDetailsForm projectId={project.Project_ID} />}
        {tab === "designs" && <OutlineDesignsTab projectId={project.Project_ID} />}
        {tab === "history" && <ActivityTab projectId={project.Project_ID} view="history" />}
        {tab === "comments" && <ActivityTab projectId={project.Project_ID} view="comments" />}
        {tab === "nrs" && <NonResidentialTab projectId={project.Project_ID} />}
        {tab === "poc" && <POCApplicationsTab projectId={project.Project_ID} />}
        {tab === "av" && <AssetValueTab projectId={project.Project_ID} />}
        {tab === "contract-designs" && <ContractDesignsTab projectRef={project.Project_Ref} />}
        {tab === "invoices" && <InvoicesTab projectRef={project.Project_Ref} />}
        {tab === "plots" && (
          <PlotsTab projectId={project.Project_ID} projectRef={project.Project_Ref} />
        )}
      </div>
    </div>
  );
}

const CSS = `
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
