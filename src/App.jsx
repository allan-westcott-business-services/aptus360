import { useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import ProjectsPage from "./features/projects/ProjectsPage.jsx";
import AdminPage from "./features/admin/AdminPage.jsx";
import PlotConnectionsPage from "./features/connections/PlotConnectionsPage.jsx";
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
  const [view, setView] = useState("projects");
  const [collapsed, setCollapsed] = useState(false);

  let content;
  if (view === "projects") content = <div className="card"><ProjectsPage /></div>;
  else if (view === "admin") content = <div className="card"><AdminPage /></div>;
  else if (view === "plot-connections") content = <div className="card"><PlotConnectionsPage /></div>;
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
