import { useState } from "react";
import GenericTable from "./GenericTable.jsx";
import { findAdminTable } from "../../lib/adminTables.js";

/* Several small tables on one page, as tabs.

   ── Why a wrapper and not three screens ──

   Region and Sub Region, Role and Crafts, the three POC lists: each
   pair or trio is two or three things maintained together and reached
   separately, so the menu was long and the relationship between them
   was nowhere on screen.

   They could each have become a bespoke component, and one of them
   probably still should — a sub region belongs to a region, and showing
   them side by side would say so. But three bespoke screens is three
   times the surface for the same idea, and the tables themselves are
   already described in adminTables.js and already edited perfectly well
   by GenericTable.

   So this holds tabs and hands each one to the editor that already
   exists. A tab is a key into that list; nothing about a table is
   restated here, which means a column added to Region appears in the
   tab without this file knowing.

   ── Sub Region keeps its own screen ──

   It is `special`, because a sub region is chosen against a region and
   the plain editor cannot ask that. So a tab can name either a plain
   table or a bespoke component, and says which. */

export default function TabbedTables({ title, note, tabs = [] }) {
  const [at, setAt] = useState(0);
  const tab = tabs[at];

  /* The table behind a tab, looked up rather than passed in — through
     the same function the menu resolves with, so a tab cannot describe
     a table differently from the way it is described everywhere else,
     and a separator cannot be mistaken for one. */
  const table = tab?.key ? findAdminTable(tab.key) : null;

  return (
    <div className="tt">
      <style>{CSS}</style>
      <h2 className="admin-title">{title}</h2>
      {note && <p className="tt-note">{note}</p>}

      <div className="tt-tabs" role="tablist">
        {tabs.map((t, i) => (
          <button key={t.label} role="tab"
            aria-selected={i === at}
            className={i === at ? "tt-tab on" : "tt-tab"}
            onClick={() => setAt(i)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="tt-body">
        {/* A bespoke screen where the tab names one, the plain editor
            otherwise. Said as a choice rather than hidden behind a
            wrapper component, because which of the two a tab is
            matters when somebody comes to change it. */}
        {tab?.render ? tab.render()
          : table ? <GenericTable table={table} />
            : <p className="hint">{`Nothing configured for ${tab?.label}.`}</p>}
      </div>
    </div>
  );
}

const CSS = `
.tt-note { color: var(--muted); font-size: 12.5px; line-height: 1.65;
  max-width: 70ch; margin: 0 0 14px; }
.tt-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border);
  margin-bottom: 14px; flex-wrap: wrap; }
.tt-tab { background: none; border: none; border-bottom: 2px solid transparent;
  padding: 7px 12px; font: 600 12.5px inherit; color: var(--muted);
  cursor: pointer; }
.tt-tab.on { color: var(--text); border-bottom-color: var(--accent); }
/* The heading each table draws for itself would repeat the tab beside
   it, so it is turned off in here. */
.tt-body .admin-title { display: none; }
`;
