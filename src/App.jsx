import { useState, useEffect, lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "./lib/AuthContext.jsx";
import { onOpenGis } from "./lib/gisIntent.js";
import { onOpenCallOff } from "./lib/callOffIntent.js";
import { onOpenProject } from "./lib/projectIntent.js";
import { remember, recallOneOf } from "./lib/session.js";
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
const CustomerProjectsPage = lazy(() => import("./features/customers/CustomerProjectsPage.jsx"));
const CallOffsPage = lazy(() => import("./features/calloffs/CallOffsPage.jsx"));
const PlanningPage = lazy(() => import("./features/planning/PlanningPage.jsx"));
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

/* Every page the shell knows how to render. Also what a remembered view
   is checked against: a name from an older build would otherwise leave
   the shell rendering nothing with no way back. */
const VIEWS = [
  "projects", "admin", "plot-connections", "gis-canvas",
  "generate-av-invoices", "av-invoices", "organisations", "customer-projects",
  "call-offs", "planning",
];

function Shell() {
  useBlockPageZoom();
  /* Where the user was. A reload took everyone to the projects list
     whatever they had open, which on a page that is slow to get back to
     is the whole navigation done again for the sake of pressing F5. */
  const [view, setView] = useState(() => recallOneOf("view", VIEWS, "projects"));
  useEffect(() => remember("view", view), [view]);

  /* Somewhere else in the app has asked for the canvas — the outline
     design tab, wanting to show the design it is describing. The payload
     is left for the canvas to collect; all the shell has to do is put it
     on screen. */
  useEffect(() => onOpenGis(() => setView("gis-canvas")), []);

  /* The planning board handing somebody over to where a booking is
     actually edited. Same arrangement as the canvas above: the board
     says where it wants to go, the shell switches, and the call-offs
     page collects the payload when it mounts. */
  useEffect(() => onOpenCallOff(() => setView("call-offs")), []);

  /* The call-offs list sending somebody to a project to raise a new
     one. The project and tab are already in the session by the time
     this fires; all the shell does is put the page on screen. */
  useEffect(() => onOpenProject(() => setView("projects")), []);
  const [collapsed, setCollapsed] = useState(false);

  let content;
  if (view === "projects") content = <div className="card"><ProjectsPage /></div>;
  else if (view === "admin") content = <div className="card"><AdminPage /></div>;
  else if (view === "plot-connections") content = <div className="card"><PlotConnectionsPage /></div>;
  else if (view === "gis-canvas") content = <div className="card"><GISCanvasPage /></div>;
  else if (view === "generate-av-invoices") content = <div className="card"><GenerateAvInvoices /></div>;
  else if (view === "av-invoices") content = <div className="card"><AvInvoicesPage /></div>;
  else if (view === "organisations") content = <div className="card"><OrganisationsAdmin /></div>;
  else if (view === "customer-projects") content = <div className="card"><CustomerProjectsPage /></div>;
  /* No card wrapper: the page has its own header bar and switches between
     a list and a detail view, both of which own their padding. */
  else if (view === "call-offs") content = <CallOffsPage />;
  /* Same reason as the call-offs page: it owns its toolbar and its
     own padding, and a card around a board that fills the width would
     put a border a few pixels inside another one. */
  else if (view === "planning") content = <PlanningPage />;
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
