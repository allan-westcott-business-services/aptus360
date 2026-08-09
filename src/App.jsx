import { useState, useEffect, Suspense } from "react";
import { lazyPage } from "./lib/lazyPage.js";
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
const ProjectsPage = lazyPage("ProjectsPage", () => import("./features/projects/ProjectsPage.jsx"));
const AdminPage = lazyPage("AdminPage", () => import("./features/admin/AdminPage.jsx"));
const PlotConnectionsPage = lazyPage("PlotConnectionsPage", () => import("./features/connections/PlotConnectionsPage.jsx"));
const GISCanvasPage = lazyPage("GISCanvasPage", () => import("./features/gis/GISCanvasPage.jsx"));
const GenerateAvInvoices = lazyPage("GenerateAvInvoices", () => import("./features/av/GenerateAvInvoices.jsx"));
const AvInvoicesPage = lazyPage("AvInvoicesPage", () => import("./features/av/AvInvoicesPage.jsx"));
/* The same screen the Admin suite uses. One implementation: a second
   would drift, and the difference between the two would be invisible
   until someone edited a branch in the wrong one. */
const OrganisationsAdmin = lazyPage("OrganisationsAdmin", () => import("./features/admin/OrganisationsAdmin.jsx"));
/* Also reached from Operations — see the note in navigation.js. */
const TeamsAdmin = lazyPage("TeamsAdmin", () => import("./features/admin/TeamsAdmin.jsx"));
const CustomerProjectsPage = lazyPage("CustomerProjectsPage", () => import("./features/customers/CustomerProjectsPage.jsx"));
const CallOffsPage = lazyPage("CallOffsPage", () => import("./features/calloffs/CallOffsPage.jsx"));
const VehiclesPage = lazyPage("VehiclesPage", () => import("./features/vehicles/VehiclesPage.jsx"));
const VynTrackerPage = lazyPage("VynTrackerPage", () => import("./features/vyn/VynTrackerPage.jsx"));
const NcrListPage = lazyPage("NcrListPage", () => import("./features/hsqe/NcrListPage.jsx"));
const HsqeDashboardPage = lazyPage("HsqeDashboardPage", () => import("./features/hsqe/HsqeDashboardPage.jsx"));
const PlanningPage = lazyPage("PlanningPage", () => import("./features/planning/PlanningPage.jsx"));
/* Human Resources is the largest single screen in the app — sixteen
   modules, plus Chart.js and an icon set nothing else uses. Lazy for the
   same reason as Admin, only more so: most sessions never open it, and
   nobody should download it to look at a project. */
const HumanResourcesPage = lazyPage("HumanResourcesPage", () => import("./features/hr/HumanResourcesPage.jsx"));
import { USE_MOCKS } from "./api/client.js";
/* Not lazy: it is the first thing most sessions see, and a spinner in
   front of eight buttons would be slower than the buttons. */
import HomePage from "./features/home/HomePage.jsx";
import {
  findNavItem, builtCount, totalCount,
  isHrView, hrModuleFor, hrViewFor,
  HOME_VIEW, ALL_VIEWS, findArea, isProjectView, PROJECT_VIEWS, projectsViewFor,
} from "./lib/navigation.js";

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
        {/* Where a screen absorbed another one, say so here rather than
            leaving somebody hunting the old menu for generator hire. */}
        {item?.note && <p>{item.note}</p>}
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

/* Every view the shell will restore into, which is now derived from the
   areas rather than listed again here. The hand-kept copy of this list
   was a second place to remember a screen: a page added to the sidebar
   but missed here was one you could navigate to and not reload back
   into. Unbuilt views are included deliberately — they render the
   placeholder, which is a real screen and a legitimate place to be. */
const VIEWS = ALL_VIEWS;

function Shell() {
  useBlockPageZoom();
  /* Where the user was. A reload took everyone to the projects list
     whatever they had open, which on a page that is slow to get back to
     is the whole navigation done again for the sake of pressing F5. */
  const [view, setView] = useState(() => recallOneOf("view", VIEWS, HOME_VIEW));
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
  useEffect(() => onOpenProject(() => setView((v) => projectsViewFor(findArea(v)?.id))), []);
  const [collapsed, setCollapsed] = useState(false);

  let content;
  /* No card wrapper: the landing page is the whole screen, and a white
     panel behind eight white squares would put a border round nothing. */
  if (view === HOME_VIEW) content = <HomePage onOpen={setView} />;
  /* One screen, opened from five sections. The area it was opened from
     decides which project tabs are offered — see Admin → Project Tabs. */
  else if (isProjectView(view)) {
    content = <div className="card"><ProjectsPage areaKey={PROJECT_VIEWS[view]} /></div>;
  }
  else if (view === "admin") content = <div className="card"><AdminPage /></div>;
  else if (view === "plot-connections") content = <div className="card"><PlotConnectionsPage /></div>;
  else if (view === "gis-canvas") content = <div className="card"><GISCanvasPage /></div>;
  else if (view === "generate-av-invoices") content = <div className="card"><GenerateAvInvoices /></div>;
  else if (view === "av-invoices") content = <div className="card"><AvInvoicesPage /></div>;
  else if (view === "organisations") content = <div className="card"><OrganisationsAdmin /></div>;
  else if (view === "teams") content = <div className="card"><TeamsAdmin /></div>;
  else if (view === "customer-projects") content = <div className="card"><CustomerProjectsPage /></div>;
  else if (view === "vehicles") content = <div className="card"><VehiclesPage /></div>;
  else if (view === "vyn-tracker") content = <div className="card"><VynTrackerPage /></div>;
  else if (view === "ncr-list") content = <div className="card"><NcrListPage /></div>;
  else if (view === "hsqe-dashboard") content = <div className="card"><HsqeDashboardPage /></div>;
  /* No card wrapper: the page has its own header bar and switches between
     a list and a detail view, both of which own their padding. */
  else if (view === "call-offs") content = <CallOffsPage />;
  /* Same reason as the call-offs page: it owns its toolbar and its
     own padding, and a card around a board that fills the width would
     put a border a few pixels inside another one. */
  else if (view === "planning") content = <PlanningPage />;
  /* One component for all sixteen HR screens: which one it shows is a
     prop, not a route, because the portal keeps its own loaded data and
     switching modules inside it is much cheaper than remounting.

     No card wrapper — the HR screens draw their own cards, and the
     dashboard is a grid of them.

     onNavigate is what lets the portal move the sidebar: a dashboard
     tile or an org-chart node navigates internally, tells us the module
     it went to, and the selection follows. Without it the sidebar would
     keep pointing at a screen the user had already left. */
  else if (isHrView(view)) {
    content = (
      <HumanResourcesPage
        page={hrModuleFor(view)}
        onNavigate={(moduleId) => setView(hrViewFor(moduleId))}
      />
    );
  }
  else content = <NotBuilt view={view} />;

  /* The landing page is the menu, so it does not also get one beside
     it. Everywhere else the sidebar is scoped to the area the current
     view belongs to. */
  const showSidebar = view !== HOME_VIEW && !!findArea(view);

  return (
    <div className="shell">
      {showSidebar && (
        <Sidebar
          view={view}
          onNavigate={setView}
          onHome={() => setView(HOME_VIEW)}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
      )}
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
