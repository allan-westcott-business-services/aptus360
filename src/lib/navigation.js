/* Navigation structure, carried over from the single-file app.

   `view` is the route key. `built: true` means the React version exists;
   everything else renders a placeholder, so the sidebar doubles as a
   migration checklist — you can see at a glance what's left.

   `soon: true` marks items that were already "coming soon" in the old app. */

export const NAV_SECTIONS = [
  {
    id: "orgs",
    label: "Organisations",
    icon: "\u{1F3E2}",
    colour: "#a78bfa",
    items: [
      /* First in the section, because it is the one record the others are
         becoming. Customers, DNOs, IDNOs and Fire Authorities are the
         five parallel tables Organisations replaces — they stay until the
         pickers have moved across, but new work belongs here. */
      { view: "organisations", label: "Organisations", built: true },
      { view: "customers", label: "Customers" },
      { view: "customer-feedback", label: "Customer Feedback" },
      { view: "dnos", label: "DNOs" },
      { view: "idnos", label: "IDNOs" },
      { view: "fire-authorities", label: "Fire Authorities" },
      { view: "suppliers", label: "Suppliers" },
      { view: "materials", label: "Materials" },
      { view: "sc-compliance", label: "SC Compliance" },
    ],
  },
  {
    id: "commercial",
    label: "Commercial",
    icon: "\u{1F4BC}",
    colour: "#60a5fa",
    items: [
      { view: "commercial-dashboard", label: "Commercial Dashboard" },
      { view: "tender-dashboard", label: "Tender Dashboard" },
      { view: "enquiries", label: "Enquiries", soon: true },
      { view: "projects", label: "Projects", built: true },
      { view: "invoice-log", label: "Invoice Log" },
      { view: "asset-value-invoices", label: "Asset Value" },
      { view: "asset-value-dashboard", label: "Asset Value Dashboard" },
      { view: "av-meter-recon", label: "Meter Date Reconciliation" },
      { view: "generate-av-invoices", label: "Generate AV Invoices", built: true },
      { view: "av-invoices", label: "AV Invoices", built: true },
      { view: "invoice-plot-extractor", label: "Import Audacia Invoice Data" },
      { view: "mains-install-tracking", label: "Mains Install Tracking" },
      { view: "update-av-asset-values", label: "Update AV Asset Values" },
      { view: "gis-canvas", label: "GIS Canvas", built: true },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: "\u2699\uFE0F",
    colour: "#34d399",
    items: [
      { view: "operations-dashboard", label: "Operations Dashboard", soon: true },
      { view: "call-offs", label: "Call-offs" },
      { view: "planning", label: "Planning" },
      { view: "field-team-work", label: "Field Team Work" },
      { view: "plot-connections", label: "Plot Connections", built: true },
      { view: "sc-log", label: "Service Card Log" },
      { view: "teams", label: "Teams" },
      { view: "vehicles", label: "Vehicles" },
      { view: "equipment", label: "Equipment" },
      { view: "vyn-tracker", label: "VYN Tracker" },
    ],
  },
  {
    id: "electric",
    label: "Electric",
    icon: "\u26A1",
    colour: "#fbbf24",
    items: [
      { view: "electric-outline-design", label: "Electric Outline Design", soon: true },
      { view: "electric-contract-design", label: "Electric Detailed Design", soon: true },
      { view: "generator-hire", label: "Generator Hire" },
      { view: "street-lighting", label: "Street Lighting" },
      { view: "feeder-pillar", label: "Feeder Pillars" },
      { view: "landlord-supply", label: "Landlord Supply", soon: true },
      { view: "temp-building-supply", label: "Temporary Building Supply", soon: true },
    ],
  },
  {
    id: "gas",
    label: "Gas",
    icon: "\u{1F525}",
    colour: "#fb923c",
    items: [
      { view: "gas-outline-design", label: "Gas Outline Design", soon: true },
      { view: "gas-contract-design", label: "Gas Detailed Design", soon: true },
    ],
  },
  {
    id: "water",
    label: "Water",
    icon: "\u{1F4A7}",
    colour: "#22d3ee",
    items: [
      { view: "water-outline-design", label: "Water Outline Design", soon: true },
      { view: "water-contract-design", label: "Water Detailed Design", soon: true },
      { view: "fire-hydrants", label: "Fire Hydrants" },
    ],
  },
  {
    id: "hsqe",
    label: "HSQE",
    icon: "\u{1F6E1}\uFE0F",
    colour: "#f87171",
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
    id: "crc",
    label: "Credit Control",
    icon: "\u{1F4B3}",
    colour: "#f472b6",
    items: [
      { view: "crc-dashboard", label: "Dashboard" },
      { view: "crc-overdue", label: "Overdue Invoices" },
      { view: "crc-letters", label: "Letters" },
      { view: "crc-chase-log", label: "Chase Log" },
    ],
  },
  {
    id: "logs",
    label: "Logs",
    icon: "\u{1F4CB}",
    colour: "#94a3b8",
    items: [
      { view: "poc-log", label: "POC Applications Log" },
      { view: "outline-design-log", label: "Outline Design Log" },
      { view: "contract-design-log", label: "Detailed Design Log" },
    ],
  },
];

NAV_SECTIONS.push({
  id: "admin",
  label: "Admin",
  colour: "#64748b",
  items: [{ view: "admin", label: "Reference Data", built: true }],
});

export const findNavItem = (view) => {
  for (const section of NAV_SECTIONS) {
    const item = section.items.find((i) => i.view === view);
    if (item) return { ...item, section };
  }
  return null;
};

export const builtCount = () =>
  NAV_SECTIONS.reduce((n, s) => n + s.items.filter((i) => i.built).length, 0);

export const totalCount = () =>
  NAV_SECTIONS.reduce((n, s) => n + s.items.length, 0);
