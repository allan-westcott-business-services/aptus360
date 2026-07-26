import { useState } from "react";
import EditContractForm from "./EditContractForm.jsx";
import PlotsTab from "../plots/PlotsTab.jsx";

/* Tabbed project page. Mirrors the tender detail panel in the original
   app — Details, Plots, and room for Scopes, Designs, History as those
   get migrated. */
const TABS = [
  { id: "details", label: "Details" },
  { id: "plots", label: "Plots" },
];

export default function ProjectDetail({ projectId = 4711, projectRef = "2607.014" }) {
  const [tab, setTab] = useState("details");

  return (
    <div>
      <style>{CSS}</style>

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
        {tab === "details" && <EditContractForm projectId={projectId} />}
        {tab === "plots" && <PlotsTab projectId={projectId} projectRef={projectRef} />}
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
}
.detail-tab:hover { color: var(--text); }
.detail-tab.on { color: var(--accent); border-bottom-color: var(--accent); }
`;
