import { useState } from "react";
import { ADMIN_TABLES } from "../../lib/adminTables.js";
import GenericTable from "./GenericTable.jsx";
import PropertyConfigAdmin from "./PropertyConfigAdmin.jsx";
import PeopleRolesAdmin from "./PeopleRolesAdmin.jsx";
import SubRegionAdmin from "./SubRegionAdmin.jsx";
import StatusWorkflowAdmin from "./StatusWorkflowAdmin.jsx";
import ElectricSpecsAdmin from "./ElectricSpecsAdmin.jsx";
import PointsConfigAdmin from "./PointsConfigAdmin.jsx";

/* Admin shell: a list of reference tables on the left, the editor on the
   right. Mirrors the original app's admin panel. */
export default function AdminPage() {
  const first = ADMIN_TABLES.find((t) => !t.separator);
  const [active, setActive] = useState(first.key);
  const table = ADMIN_TABLES.find((t) => !t.separator && t.key === active);

  return (
    <div className="admin-shell">
      <style>{CSS}</style>

      <nav className="admin-nav">
        {ADMIN_TABLES.map((t, i) =>
          t.separator ? (
            <p className="admin-sep" key={`sep${i}`}>{t.label}</p>
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
        ) : table?.special === "subregions" ? (
          <SubRegionAdmin />
        ) : table?.special === "workflow" ? (
          <StatusWorkflowAdmin />
        ) : table?.special === "electric" ? (
          <ElectricSpecsAdmin />
        ) : table?.special === "points" ? (
          <PointsConfigAdmin />
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
