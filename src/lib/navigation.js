/* Navigation, organised as areas rather than one long list.

   The app opens on a landing page of one square per area. Choosing one
   sets the area, and the sidebar then shows that area's screens and
   nothing else — so somebody planning a week of work is not scrolling
   past street lighting and fire hydrants to reach the board.

   This file is the single source of truth for three things that used to
   drift apart: what the landing page offers, what the sidebar shows, and
   which menu items People & Roles can grant. Adding a screen here adds
   it to all three.

   `view` is the route key. `built: true` means the React version exists;
   everything else renders a placeholder, so an area square can honestly
   report how much of itself is live. `soon: true` marks items that were
   already "coming soon" in the original app.

   Colours are the ones the old sidebar sections used, so the squares and
   the menu headers agree about what colour Operations is. */

export const HOME_VIEW = "home";

export const AREAS = [
  {
    id: "bd",
    label: "Business Development",
    icon: "\u{1F91D}",
    colour: "#a78bfa",
    blurb: "Customers, the companies behind them, and work not yet won.",
    items: [
      { view: "customer-projects", label: "Customers & Projects", built: true },
      { view: "bd-projects", label: "Projects", built: true },
      /* The company register. It sits here rather than in Admin because
         it is the record a bid is raised against, not reference data
         somebody maintains once a quarter. */
      { view: "organisations", label: "Organisations", built: true },
      { view: "customer-feedback", label: "Customer Feedback" },
      /* Built now: enquiries sent from the developer portal land here,
         waiting for somebody to accept or decline them. It belongs in
         this section rather than in Admin because an enquiry IS work
         not yet won — the thing this section is for. */
      { view: "enquiries", label: "Enquiries", built: true },
    ],
  },
  {
    id: "design",
    label: "Tendering & Design",
    icon: "\u{1F4D0}",
    colour: "#f59e0b",
    blurb: "Projects from enquiry through to a drawn and costed design.",
    items: [
      { view: "projects", label: "Projects", built: true },
      /* The GIS Canvas was the second item here. Drawing moved out of
         this application into Utility GIS, which is the same code on
         its own database, so the canvas, the ten gis-* endpoints and
         everything that read a drawing came out together. */
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: "\u2699\uFE0F",
    colour: "#34d399",
    blurb: "Getting the work called off, planned, crewed and connected.",
    items: [
      { view: "call-offs", label: "Call-offs", built: true },
      { view: "planning", label: "Planning", built: true },
      /* The same projects screen the other sections open, with its own
         view key so the sidebar can tell which section it belongs to.
         Which tabs it shows is configured under Admin → Project Tabs.

         Placed after Call-offs and Planning rather than first, because
         the area opens on its first built screen and Operations should
         still land on the call-offs board. */
      { view: "ops-projects", label: "Projects", built: true },
      /* The same screen the Admin suite shows under Teams. One
         implementation mounted in two places, as Organisations is:
         a second would drift, and the difference between the two
         would be invisible until somebody edited a gang in the
         wrong one. */
      { view: "teams", label: "Teams", built: true },
      { view: "plot-connections", label: "Plot Connections", built: true },
      { view: "pc-dashboard", label: "Plot Connections Dashboard", built: true },
      { view: "sc-log", label: "Service Card Log" },
      { view: "vehicles", label: "Vehicles", built: true },
      /* Generator hire was its own screen under Electric. It is a piece
         of plant that goes out and comes back like any other, so it
         belongs with whatever tracks the rest of the plant. */
      { view: "equipment", label: "Equipment", note: "Includes generator hire." },
      { view: "vyn-tracker", label: "VYN Tracker", built: true },
    ],
  },
  {
    id: "commercial",
    label: "Commercial",
    icon: "\u{1F4BC}",
    colour: "#60a5fa",
    blurb: "Asset value: what the connected plots are worth, and billing it.",
    items: [
      { view: "av-invoices", label: "Asset Value", built: true },
      { view: "generate-av-invoices", label: "Generate AV Invoices", built: true },
      { view: "commercial-projects", label: "Projects", built: true },
    ],
  },
  /* Human Resources: the square, and nothing behind it.

     The implementation was removed with the GIS canvas — the whole of
     src/features/hr, sixteen screens of a self-contained portal that
     read a different Supabase project, the `hr-` view prefix and the
     helpers that split it. The HR data is untouched; it never lived in
     this database.

     The square stays, drawn and disabled. Asked for: "add the UI
     square button back for the Human Resources module but disable it
     and mark as 'To Be Developed'."

     It is the same argument the grey squares were given when access
     control arrived: eight squares are the shape of the business, and
     somebody who sees seven has no way to tell whether HR does not
     apply to their job, has not been built, or is simply not theirs.
     The difference is what it says. "No access" is something to ask
     the office about; "To Be Developed" is not, and the two must not
     be confused or somebody raises a ticket nobody can answer.

     `toBeDeveloped` rather than inferring it from the items having no
     `built: true`. Inference would mean any area whose last screen was
     switched off quietly relabelled itself, and would have described
     HSQE and Finance that way for months before this. The items are
     kept because checknav walks firstViewOf for every area, and
     because they are the list of what rebuilding it would mean. */
  {
    id: "hr",
    label: "Human Resources",
    icon: "\u{1F465}",
    colour: "#818cf8",
    toBeDeveloped: true,
    blurb: "People, pay, leave, performance and everything that follows.",
    items: [
      { view: "hr-dashboard", label: "HR Dashboard" },
      { view: "hr-people", label: "People" },
      { view: "hr-roles", label: "Roles & Structure" },
      { view: "hr-pay", label: "Pay" },
      { view: "hr-leave", label: "Leave" },
      { view: "hr-benefits", label: "Benefits" },
      { view: "hr-performance", label: "Performance" },
      { view: "hr-skills", label: "Skills & Training" },
      { view: "hr-recruitment", label: "Recruitment" },
      { view: "hr-onboarding", label: "Onboarding" },
      { view: "hr-interactions", label: "Interactions" },
      { view: "hr-compliance", label: "Compliance" },
      { view: "hr-contractors", label: "Contractors & Temps" },
      { view: "hr-leavers", label: "Leavers" },
      { view: "hr-reports", label: "HR Reports" },
      { view: "hr-admin", label: "HR Admin" },
    ],
  },
  {
    id: "hsqe",
    label: "HSQE",
    icon: "\u{1F6E1}\uFE0F",
    colour: "#f87171",
    blurb: "Health, safety, quality and environment: audits, incidents, RAMS.",
    items: [
      { view: "hsqe-dashboard", label: "HSQE Dashboard", built: true },
      { view: "ncr-list", label: "Non Compliance Reports", built: true },
      { view: "audits", label: "Audits & Inspections", soon: true },
      { view: "incident-log", label: "Incident Log", soon: true },
      { view: "training-records", label: "Training Records", soon: true },
      { view: "rams", label: "RAMS", soon: true },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: "\u{1F4B3}",
    colour: "#f472b6",
    blurb: "Invoices out, money in, and chasing what has not arrived.",
    items: [
      { view: "finance-projects", label: "Projects", built: true },
      { view: "invoice-log", label: "Invoice Log" },
      { view: "crc-dashboard", label: "Credit Control Dashboard" },
      { view: "crc-overdue", label: "Overdue Invoices" },
      { view: "crc-letters", label: "Letters" },
      { view: "crc-chase-log", label: "Chase Log" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    icon: "\u{1F5C4}\uFE0F",
    colour: "#64748b",
    blurb: "Reference data the rest of the app reads: statuses, specs, teams.",
    items: [
      { view: "admin", label: "Admin", built: true },
    ],
  },
];

/* Kept under the old name as well, because People & Roles grants menu
   access by section and reads the same definition the sidebar renders
   from. The two cannot disagree about what pages exist while they are
   literally the same array. */
export const NAV_SECTIONS = AREAS;

/* Every view any area offers, plus the landing page. What a remembered
   view is checked against: a name from an older build would otherwise
   leave the shell rendering nothing with no way back. */
export const ALL_VIEWS = [HOME_VIEW, ...AREAS.flatMap((a) => a.items.map((i) => i.view))];

/* The area a view belongs to, which is what the sidebar scopes itself
   to. Null for the landing page, which belongs to no area — that is the
   signal to hide the menu entirely rather than show an empty one. */
export const findArea = (view) =>
  AREAS.find((a) => a.items.some((i) => i.view === view)) ?? null;

/* The first screen an area opens on. Its first built item where there is
   one, so choosing Operations lands on call-offs rather than a
   placeholder, and the first item otherwise so an area with nothing
   built still opens somewhere and explains itself. */
export const firstViewOf = (area) =>
  (area.items.find((i) => i.built) ?? area.items[0]).view;

/* Every view that opens the projects screen, and the area each belongs
   to. The screen reads the area to decide which tabs to show.

   Five keys for one screen rather than one key in five areas, because
   the sidebar scopes itself by looking up which area a view belongs to
   — a key in five areas makes that lookup ambiguous, and checknav.mjs
   refuses it for exactly that reason. */
export const PROJECT_VIEWS = {
  "projects": "design",
  "bd-projects": "bd",
  "ops-projects": "operations",
  "commercial-projects": "commercial",
  "finance-projects": "finance",
};

export const isProjectView = (view) => Object.hasOwn(PROJECT_VIEWS, view);

/* The projects view for an area, used when one screen sends somebody to
   a project — the call-offs list does — so they stay in the section
   they were already in rather than being moved to another one. */
export const projectsViewFor = (areaKey) =>
  Object.keys(PROJECT_VIEWS).find((v) => PROJECT_VIEWS[v] === areaKey) ?? "projects";

export const findNavItem = (view) => {
  for (const area of AREAS) {
    const item = area.items.find((i) => i.view === view);
    /* `section` rather than `area`, because the placeholder screen and
       People & Roles both already read that key. */
    if (item) return { ...item, section: area, area };
  }
  return null;
};

export const builtCount = () =>
  AREAS.reduce((n, a) => n + a.items.filter((i) => i.built).length, 0);

export const totalCount = () =>
  AREAS.reduce((n, a) => n + a.items.length, 0);

export const areaBuiltCount = (area) => area.items.filter((i) => i.built).length;
