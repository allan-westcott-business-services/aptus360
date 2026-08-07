import { useState } from "react";
import { ADMIN_TABLES } from "../../lib/adminTables.js";
import GenericTable from "./GenericTable.jsx";
import PropertyConfigAdmin from "./PropertyConfigAdmin.jsx";
import PeopleRolesAdmin from "./PeopleRolesAdmin.jsx";
import TeamsAdmin from "./TeamsAdmin.jsx";
import SubRegionAdmin from "./SubRegionAdmin.jsx";
import StatusWorkflowAdmin from "./StatusWorkflowAdmin.jsx";
import ElectricSpecsAdmin from "./ElectricSpecsAdmin.jsx";
import PointsConfigAdmin from "./PointsConfigAdmin.jsx";
import CustomersAdmin from "./CustomersAdmin.jsx";
import OrganisationsAdmin from "./OrganisationsAdmin.jsx";
import GisStylesAdmin from "./GisStylesAdmin.jsx";
import WaterPipeSizesAdmin from "./WaterPipeSizesAdmin.jsx";

/* Admin shell: a list of reference tables on the left, the editor on the
   right. Mirrors the original app's admin panel. */
export default function AdminPage() {
  /* Headings are rows in the same list, so anything that walks it for a
     screen has to step over both kinds. */
  const isScreen = (t) => !t.separator && !t.group;
  const first = ADMIN_TABLES.find(isScreen);
  const [active, setActive] = useState(first.key);
  const table = ADMIN_TABLES.find((t) => isScreen(t) && t.key === active);

  return (
    <div className="admin-shell">
      <style>{CSS}</style>

      {/* ── The menu ──

          Three kinds of entry, all of them rows in ADMIN_TABLES so the
          order on screen is the order in that file and nothing else:

            { separator: true, label } a section
            { group: true, label }     a sub-section under it
            { key, label, ... }        a screen

          Renaming is the label, reordering is moving the line, and a new
          section is one row. Held as a list rather than as nested arrays
          because a flat list can be reordered across a boundary — moving
          a screen from one section to another is a cut and paste, not a
          restructure. */}
      <nav className="admin-nav">
        {ADMIN_TABLES.map((t, i) =>
          t.separator ? (
            <p className="admin-sep" key={`sep${i}`}>{t.label}</p>
          ) : t.group ? (
            <p className="admin-group" key={`grp${i}`}>{t.label}</p>
          ) : (
            <button
              key={t.key}
              className={active === t.key ? "admin-nav-item on" : "admin-nav-item"}
              onClick={() => setActive(t.key)}
            >
              {t.label}
            </button>
          )
        )}
      </nav>

      <div className="admin-panel">
        {table?.special === "housetypes" ? (
          <PropertyConfigAdmin />
        ) : table?.special === "people" ? (
          <PeopleRolesAdmin />
        ) : table?.special === "teams" ? (
          <TeamsAdmin />
        ) : table?.special === "subregions" ? (
          <SubRegionAdmin />
        ) : table?.special === "workflow" ? (
          <StatusWorkflowAdmin />
        ) : table?.special === "electric" ? (
          <ElectricSpecsAdmin />
        ) : table?.special === "points" ? (
          <PointsConfigAdmin />
        ) : table?.special === "organisations" ? (
          <OrganisationsAdmin />
        ) : table?.special === "customers" ? (
          <CustomersAdmin />
        ) : table?.special === "gisstyles" ? (
          <GisStylesAdmin />
        ) : table?.special === "waterpipes" ? (
          <WaterPipeSizesAdmin />
        ) : table ? (
          <GenericTable table={table} />
        ) : null}
      </div>
    </div>
  );
}

const CSS = `
.admin-shell { display: flex; gap: 20px; align-items: flex-start; }
.admin-nav {
  width: 210px; flex: none; border-right: 1px solid var(--border);
  padding-right: 14px; max-height: 76vh; overflow-y: auto;
}
/* A sub-heading inside a section: quieter than the section above it,
   indented to the depth of the items it gathers. */
.admin-group { margin: 10px 0 2px 10px; font: 700 9.5px inherit; letter-spacing: .06em;
  text-transform: uppercase; color: var(--muted); opacity: .8; }
.admin-sep {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em;
  color: var(--muted); margin: 14px 0 5px; padding: 0 8px;
}
.admin-sep:first-child { margin-top: 0; }
.admin-nav-item {
  display: block; width: 100%; text-align: left; background: none;
  border: 1px solid transparent; border-radius: 6px; padding: 6px 10px;
  font: 500 12.5px inherit; color: var(--text); cursor: pointer; margin-bottom: 1px;
}
.admin-nav-item:hover { background: var(--bg); }
.admin-nav-item.on { background: var(--accent-light); color: var(--accent); font-weight: 600; }
.admin-panel { flex: 1; min-width: 0; }
.soon-note {
  padding: 40px; text-align: center; color: var(--muted); font-size: 13px;
  border: 1px dashed var(--border); border-radius: var(--radius); background: var(--bg);
}
.soon-note code { font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
`;
