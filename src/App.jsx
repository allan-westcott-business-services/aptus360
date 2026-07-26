import { useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import AddProjectPage from "./features/projects/AddProjectPage.jsx";
import ProjectsList from "./features/projects/ProjectsList.jsx";
import EditContractForm from "./features/projects/EditContractForm.jsx";
import { USE_MOCKS } from "./api/client.js";
import { findNavItem, builtCount, totalCount } from "./lib/navigation.js";

/* Placeholder for views not yet migrated. Keeping these visible rather than
   hiding them means the sidebar doubles as a progress board. */
function NotBuilt({ view }) {
  const item = findNavItem(view);
  return (
    <div className="card">
      <div className="placeholder">
        <div
          className="placeholder-badge"
          style={{ background: `${item?.section.colour ?? "#94a3b8"}1a`, color: item?.section.colour ?? "#94a3b8" }}
        >
          {item?.section.icon} {item?.section.label}
        </div>
        <h2>{item?.label ?? view}</h2>
        <p>
          {item?.soon
            ? "This was flagged as coming soon in the original app and hasn't been built yet."
            : "Not migrated to React yet. It still exists in the original app."}
        </p>
        <p className="placeholder-progress">
          {builtCount()} of {totalCount()} screens migrated
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("project-add");
  const [collapsed, setCollapsed] = useState(false);

  let content;
  if (view === "projects") content = <div className="card"><ProjectsList onOpen={() => setView("project-edit")} /></div>;
  else if (view === "project-add") content = <div className="card"><AddProjectPage /></div>;
  else if (view === "project-edit") content = <div className="card"><EditContractForm /></div>;
  else content = <NotBuilt view={view} />;

  return (
    <div className="shell">
      <Sidebar
        view={view}
        onNavigate={setView}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      <main className="main">
        {USE_MOCKS && (
          <div className="mock-bar">
            Sample data &mdash; set <code>VITE_USE_MOCKS=false</code> once the Project tables are populated.
          </div>
        )}
        {content}
      </main>
    </div>
  );
}
