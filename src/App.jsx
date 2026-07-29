import { useState, useEffect, lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "./lib/AuthContext.jsx";
import LoginPage from "./features/auth/LoginPage.jsx";
import AccountMenu from "./features/auth/AccountMenu.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import Sidebar from "./components/Sidebar.jsx";
/* Loaded on demand. Admin and Plot Connections are large and most
   sessions never open them, so they shouldn't be in the first download. */
const ProjectsPage = lazy(() => import("./features/projects/ProjectsPage.jsx"));
const AdminPage = lazy(() => import("./features/admin/AdminPage.jsx"));
const PlotConnectionsPage = lazy(() => import("./features/connections/PlotConnectionsPage.jsx"));
const GISCanvasPage = lazy(() => import("./features/gis/GISCanvasPage.jsx"));
const GenerateAvInvoices = lazy(() => import("./features/av/GenerateAvInvoices.jsx"));
const AvInvoicesPage = lazy(() => import("./features/av/AvInvoicesPage.jsx"));
/* The same screen the Admin suite uses. One implementation: a second
   would drift, and the difference between the two would be invisible
   until someone edited a branch in the wrong one. */
const OrganisationsAdmin = lazy(() => import("./features/admin/OrganisationsAdmin.jsx"));
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

/* Safari on macOS sends gesturestart/gesturechange for a trackpad pinch
   rather than a ctrl+wheel, and those ignore any wheel handler. Blocking
   them inside the app area stops the page zooming under the canvas. */
function useBlockPageZoom() {
  useEffect(() => {
    const stop = (e) => {
      if (e.target.closest?.(".gis-canvas-wrap, .cv-stage")) e.preventDefault();
    };
    document.addEventListener("gesturestart", stop, { passive: false });
    document.addEventListener("gesturechange", stop, { passive: false });
    document.addEventListener("gestureend", stop, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      document.removeEventListener("gestureend", stop);
    };
  }, []);
}

function Shell() {
  useBlockPageZoom();
  const [view, setView] = useState("projects");
  const [collapsed, setCollapsed] = useState(false);

  let content;
  if (view === "projects") content = <div className="card"><ProjectsPage /></div>;
  else if (view === "admin") content = <div className="card"><AdminPage /></div>;
  else if (view === "plot-connections") content = <div className="card"><PlotConnectionsPage /></div>;
  else if (view === "gis-canvas") content = <div className="card"><GISCanvasPage /></div>;
  else if (view === "generate-av-invoices") content = <div className="card"><GenerateAvInvoices /></div>;
  else if (view === "av-invoices") content = <div className="card"><AvInvoicesPage /></div>;
  else if (view === "organisations") content = <div className="card"><OrganisationsAdmin /></div>;
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
        <div className="topbar">
          <AccountMenu />
        </div>
        {USE_MOCKS && (
          <div className="mock-bar">
            Sample data &mdash; set <code>VITE_USE_MOCKS=false</code> once the Project tables are populated.
          </div>
        )}
        {/* Keyed on the view so moving elsewhere clears a failed screen
            rather than leaving the error stuck. */}
        <ErrorBoundary key={view} label={findNavItem(view)?.label ?? "This screen"}>
          <Suspense fallback={<div className="lazy-wait">Loading&hellip;</div>}>
            {content}
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

/* Auth is optional until it's configured: without VITE_SUPABASE_ANON_KEY
   the app runs open, so sample-data mode still works with no backend. */
function Gate() {
  const { session, loading, authEnabled } = useAuth();
  if (!authEnabled) return <Shell />;
  if (loading) return <div className="boot">Loading&hellip;</div>;
  if (!session) return <LoginPage />;
  return <Shell />;
}
