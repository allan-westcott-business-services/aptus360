import { useState } from "react";
import AddProjectForm from "./AddProjectForm.jsx";
import PlotsTab from "../plots/PlotsTab.jsx";

/* Add Project, tabbed.

   Plots stays locked until the project exists — Plot.Project_ID is a
   foreign key, so there is nothing to attach them to until the record
   is saved. Creating the project unlocks the tab and switches to it. */
export default function AddProjectPage({ onBack }) {
  const [tab, setTab] = useState("project");
  const [created, setCreated] = useState(null);

  const tabs = [
    { id: "project", label: "Project", enabled: true },
    { id: "plots", label: "Plots", enabled: !!created },
  ];

  return (
    <div>
      <style>{CSS}</style>

      {onBack && (
        <button className="back-link" onClick={onBack}>
          &larr; All projects
        </button>
      )}

      <div className="detail-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            disabled={!t.enabled}
            title={t.enabled ? undefined : "Save the project first"}
            className={
              (tab === t.id ? "detail-tab on" : "detail-tab") + (t.enabled ? "" : " locked")
            }
            onClick={() => t.enabled && setTab(t.id)}
          >
            {t.label}
            {t.id === "plots" && !created && <span className="lock">&#128274;</span>}
          </button>
        ))}
      </div>

      <div className="detail-body">
        {tab === "project" && (
          <AddProjectForm
            onCreated={(project) => setCreated(project)}
            onGoToPlots={() => setTab("plots")}
            onReset={() => setCreated(null)}
          />
        )}
        {tab === "plots" && created && (
          <PlotsTab projectId={created.Project_ID} projectRef={created.Project_Ref} />
        )}
      </div>
    </div>
  );
}

const CSS = `
.detail-tabs {
  display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-bottom: 18px;
}
.detail-tab {
  background: none; border: none; border-bottom: 2px solid transparent;
  padding: 9px 16px; margin-bottom: -1px; cursor: pointer;
  font-family: inherit; font-size: 13px; font-weight: 600; color: var(--muted);
  display: inline-flex; align-items: center; gap: 6px;
}
.detail-tab:hover:not(.locked) { color: var(--text); }
.detail-tab.on { color: var(--accent); border-bottom-color: var(--accent); }
.detail-tab.locked { opacity: 0.45; cursor: not-allowed; }
.detail-tab .lock { font-size: 9px; }
.done-actions { display: flex; gap: 9px; justify-content: center; }
.back-link {
  background: none; border: none; padding: 0 0 10px; cursor: pointer;
  font: 600 12.5px inherit; color: var(--accent); display: block;
}
.back-link:hover { text-decoration: underline; }
`;
