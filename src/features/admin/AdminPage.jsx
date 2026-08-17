import { useState, useEffect, useMemo } from "react";
import { ADMIN_TABLES } from "../../lib/adminTables.js";
import { adminList } from "../../api/admin.js";
import GenericTable from "./GenericTable.jsx";
import PropertyConfigAdmin from "./PropertyConfigAdmin.jsx";
import PeopleRolesAdmin from "./PeopleRolesAdmin.jsx";
import TeamsAdmin from "./TeamsAdmin.jsx";
import ProjectTabsAdmin from "./ProjectTabsAdmin.jsx";
import SubRegionAdmin from "./SubRegionAdmin.jsx";
import StatusWorkflowAdmin from "./StatusWorkflowAdmin.jsx";
import ElectricSpecsAdmin from "./ElectricSpecsAdmin.jsx";
import PointsConfigAdmin from "./PointsConfigAdmin.jsx";
import CustomersAdmin from "./CustomersAdmin.jsx";
import TabbedTables from "./TabbedTables.jsx";
import OrganisationsAdmin from "./OrganisationsAdmin.jsx";
import GisStylesAdmin from "./GisStylesAdmin.jsx";
import WaterPipeSizesAdmin from "./WaterPipeSizesAdmin.jsx";
import GasPipeSizesAdmin from "./GasPipeSizesAdmin.jsx";
import GasDiversityAdmin from "./GasDiversityAdmin.jsx";
import DigRatesAdmin from "./DigRatesAdmin.jsx";
import AdminMenuAdmin from "./AdminMenuAdmin.jsx";

/* Admin shell: a list of reference tables on the left, the editor on the
   right. Mirrors the original app's admin panel. */
export default function AdminPage() {
  /* Headings are rows in the same list, so anything that walks it for a
     screen has to step over both kinds. */
  /* What appears in the menu.

     `hidden` is a table that still exists and is still edited — just
     not from an entry of its own. Regions, Sub Regions, Roles, Crafts
     and the three POC lists are reached through the merged pages that
     name them, and listing them twice would be two routes to one
     editor with no way to tell which somebody meant. */
  const isScreen = (t) => !t.separator && !t.group && !t.hidden;

  /* ── The menu, arranged in the database ──

     Admin_Menu says what order the screens go in, what headings they sit
     under and what each is called. What a screen *is* stays in
     adminTables.js, so a row here is a label and a position pointing at
     a key.

     Three things this has to survive, because the menu is the way back
     to everything including the screen that edits it:

       The table not loading at all — a network failure, or the
       migration not run yet. The code order is used instead, which is
       exactly what the menu was before it became data.

       A screen the table does not mention. Appended, so anything added
       by a later release turns up somewhere obvious rather than
       nowhere.

       The layout editor itself, pinned at the end and never in the
       table. Deleting every row leaves the one entry that puts the rest
       back. */
  const [arrangement, setArrangement] = useState(null);

  useEffect(() => {
    let live = true;
    adminList("Admin_Menu")
      .then(({ rows = [] }) => { if (live) setArrangement(rows); })
      .catch(() => { if (live) setArrangement([]); });
    return () => { live = false; };
  }, []);

  const menu = useMemo(() => {
    const pinned = [
      { separator: true, label: "This menu" },
      { key: "Admin_Menu", label: "Menu Layout", special: "menulayout" },
    ];
    if (!arrangement?.length) return [...ADMIN_TABLES, ...pinned];

    const byKey = new Map(ADMIN_TABLES.filter(isScreen).map((t) => [t.key, t]));
    const out = [];
    for (const r of [...arrangement].sort((a, b) =>
      (Number(a.Display_Order) - Number(b.Display_Order))
      || (Number(a.Admin_Menu_ID) - Number(b.Admin_Menu_ID)))) {
      /* A screen switched off is spoken for: it has a row, somebody
         turned it off, and it stays off. Skipping before this line left
         it looking unplaced and put it back at the bottom of the menu,
         which is the opposite of what the switch says. */
      if (r.Is_Active === false) {
        if (r.Screen_Key) byKey.delete(r.Screen_Key);
        continue;
      }
      if (r.Kind === "section") { out.push({ separator: true, label: r.Label }); continue; }
      if (r.Kind === "group") { out.push({ group: true, label: r.Label }); continue; }
      const t = byKey.get(r.Screen_Key);
      /* A row naming a screen this build does not have is skipped rather
         than shown as a dead entry. The layout editor lists it as
         missing, which is where that belongs. */
      if (!t) continue;
      byKey.delete(r.Screen_Key);
      out.push({ ...t, label: r.Label || t.label });
    }
    if (byKey.size) {
      out.push({ separator: true, label: "Not placed yet" });
      for (const t of byKey.values()) out.push(t);
    }
    return [...out, ...pinned];
  }, [arrangement]);

  const first = menu.find(isScreen);
  const [active, setActive] = useState(ADMIN_TABLES.find(isScreen).key);
  const table = menu.find((t) => isScreen(t) && t.key === active) ?? first;

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
        {menu.map((t, i) =>
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
        ) : table?.special === "projecttabs" ? (
          <ProjectTabsAdmin />
        ) : table?.special === "subregions" ? (
          <SubRegionAdmin />

        /* ── The merged pages ──

            Tabs over the editors that already exist, rather than three
            new screens. Each tab names a table by key and the wrapper
            hands it to GenericTable — or renders a bespoke screen where
            one is needed, as Sub Region is.

            Described here rather than in adminTables.js because a tab
            list is a layout, and that file describes tables. */
        ) : table?.special === "regions" ? (
          <TabbedTables
            title="Regions & Sub Regions"
            note={"Where work happens. A sub region belongs to a region, "
              + "so the two are set up together."}
            tabs={[
              { label: "Regions", key: "Region" },
              { label: "Sub Regions", render: () => <SubRegionAdmin /> },
            ]}
          />
        ) : table?.special === "rolescrafts" ? (
          <TabbedTables
            title="Roles & Crafts"
            note={"What somebody is, and what they can do. A role is a "
              + "job title; a craft is a skill a team holds and a work "
              + "phase can require."}
            tabs={[
              { label: "Roles", key: "Role" },
              { label: "Crafts", key: "Craft" },
            ]}
          />
        ) : table?.special === "poc" ? (
          <TabbedTables
            title="POC Admin"
            note={"The lists a point of connection is described by: what "
              + "kind it is, where it has got to, and where its quotation "
              + "has got to."}
            tabs={[
              { label: "POC Type", key: "POC_Type" },
              { label: "POC Status", key: "POC_Status" },
              { label: "POC Quotation Status", key: "Quotation_Status" },
            ]}
          />
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
        ) : table?.special === "menulayout" ? (
          <AdminMenuAdmin />
        ) : table?.special === "gisstyles" ? (
          <GisStylesAdmin />
        ) : table?.special === "waterpipes" ? (
          <WaterPipeSizesAdmin />
        ) : table?.special === "gaspipes" ? (
          <GasPipeSizesAdmin />
        ) : table?.special === "gasdiversity" ? (
          <GasDiversityAdmin />
        ) : table?.special === "digrates" ? (
          <DigRatesAdmin />
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
