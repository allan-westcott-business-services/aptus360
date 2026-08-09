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
      /* The company register. It sits here rather than in Admin because
         it is the record a bid is raised against, not reference data
         somebody maintains once a quarter. */
      { view: "organisations", label: "Organisations", built: true },
      { view: "customer-feedback", label: "Customer Feedback" },
      { view: "enquiries", label: "Enquiries", soon: true },
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
      { view: "gis-canvas", label: "GIS Canvas", built: true },
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
      { view: "teams", label: "Teams" },
      { view: "plot-connections", label: "Plot Connections", built: true },
      { view: "sc-log", label: "Service Card Log" },
      { view: "vehicles", label: "Vehicles", built: true },
      /* Generator hire was its own screen under Electric. It is a piece
         of plant that goes out and comes back like any other, so it
         belongs with whatever tracks the rest of the plant. */
      { view: "equipment", label: "Equipment", note: "Includes generator hire." },
      { view: "vyn-tracker", label: "VYN Tracker" },
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
    ],
  },
  /* Human Resources.

     Every view is one screen of the HR portal, which is not a React page
     but a self-contained app mounted into the shell — see
     features/hr/hrPortal.js. The `hr-` prefix is what App.jsx routes on
     and what it strips to get the portal's own module id, so the two
     halves of each name have to stay in step: `hr-people` is the
     portal's `people` module and nothing else. */
  {
    id: "hr",
    label: "Human Resources",
    icon: "\u{1F465}",
    colour: "#818cf8",
    blurb: "People, pay, leave, performance and everything that follows.",
    items: [
      { view: "hr-dashboard", label: "HR Dashboard", built: true },
      { view: "hr-people", label: "People", built: true },
      { view: "hr-roles", label: "Roles & Structure", built: true },
      { view: "hr-pay", label: "Pay", built: true },
      { view: "hr-leave", label: "Leave", built: true },
      { view: "hr-benefits", label: "Benefits", built: true },
      { view: "hr-performance", label: "Performance", built: true },
      { view: "hr-skills", label: "Skills & Training", built: true },
      { view: "hr-recruitment", label: "Recruitment", built: true },
      { view: "hr-onboarding", label: "Onboarding", built: true },
      { view: "hr-interactions", label: "Interactions", built: true },
      { view: "hr-compliance", label: "Compliance", built: true },
      { view: "hr-contractors", label: "Contractors & Temps", built: true },
      { view: "hr-leavers", label: "Leavers", built: true },
      { view: "hr-reports", label: "HR Reports", built: true },
      { view: "hr-admin", label: "HR Admin", built: true },
    ],
  },
  {
    id: "hsqe",
    label: "HSQE",
    icon: "\u{1F6E1}\uFE0F",
    colour: "#f87171",
    blurb: "Health, safety, quality and environment: audits, incidents, RAMS.",
    items: [
      { view: "hsqe-dashboard", label: "HSQE Dashboard" },
      { view: "ncr-list", label: "Non Compliance Reports" },
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

export const HR_PREFIX = "hr-";

export const isHrView = (view) => String(view).startsWith(HR_PREFIX);

export const hrModuleFor = (view) => String(view).slice(HR_PREFIX.length);

export const hrViewFor = (moduleId) => HR_PREFIX + moduleId;

export const HR_VIEWS = AREAS.find((a) => a.id === "hr").items.map((i) => i.view);

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
