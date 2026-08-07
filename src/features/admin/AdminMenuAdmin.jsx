import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { adminList, adminCreate, adminUpdate, adminDelete } from "../../api/admin.js";
import { ADMIN_TABLES } from "../../lib/adminTables.js";

/* Arranging the admin menu.

   ── What is editable and what is not ──

   The order, the headings and the names on them. Not what a screen is:
   its columns, its field types and whether it uses the generic editor
   or a bespoke one stay in adminTables.js, because those are facts
   about the code rather than preferences.

   So a screen entry here is a label and a position pointing at a key.
   Rename "DNO" to "Distribution Operators" and the menu says that; the
   screen it opens is unchanged.

   ── Moving things ──

   Up and down rather than dragging. Dragging is nicer to use and worse
   to get right — it needs pointer capture, an autoscroll, a drop
   indicator and a keyboard path anyway — and a menu is arranged once
   and then left alone. Two buttons work on the first try, from the
   keyboard, on a tablet, and while the list is scrolled.

   Each move swaps this row's order with its neighbour's, so only two
   rows are ever written. Renumbering the whole list on every nudge
   would be a hundred writes to move one line.

   ── Nothing can be lost ──

   A screen the code has and the table does not appears at the bottom
   under "Not in the menu yet", with a button to add it. A row pointing
   at a screen the code no longer has is marked as missing rather than
   hidden, because a name somebody chose is worth showing them before it
   is deleted.

   And this screen is not in the table. It is pinned by AdminPage, so
   emptying the menu entirely leaves the one entry that puts it back. */

const KINDS = [
  ["section", "Section heading"],
  ["group", "Sub-heading"],
];

export default function AdminMenuAdmin() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [adding, setAdding] = useState(null);   // "section" | "group" | null
  const [newLabel, setNewLabel] = useState("");

  async function load() {
    try {
      const { rows: r = [] } = await adminList("Admin_Menu");
      setRows([...r].sort(byOrder));
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const screens = useMemo(
    () => ADMIN_TABLES.filter((t) => !t.separator && !t.group), []);
  const screenFor = (key) => screens.find((t) => t.key === key) || null;

  /* Screens the code has that no row points at. */
  const missingFromMenu = useMemo(() => {
    const claimed = new Set(rows.filter((r) => r.Screen_Key).map((r) => r.Screen_Key));
    return screens.filter((t) => !claimed.has(t.key));
  }, [rows, screens]);

  async function save(id, changes) {
    setBusy(id);
    try {
      await adminUpdate("Admin_Menu", id, changes);
      setRows((xs) => xs.map((x) =>
        (x.Admin_Menu_ID === id ? { ...x, ...changes } : x)).sort(byOrder));
      setError("");
    } catch (e) { setError(e.message); await load(); }
    finally { setBusy(null); }
  }

  /* Swap with the neighbour, which is two writes rather than a hundred. */
  async function move(row, by) {
    const i = rows.findIndex((x) => x.Admin_Menu_ID === row.Admin_Menu_ID);
    const j = i + by;
    if (j < 0 || j >= rows.length) return;
    const other = rows[j];

    /* Equal orders would swap to no effect and leave the pair stuck.
       Numbering them apart first costs one extra write, once. */
    const a = Number(row.Display_Order);
    const b = Number(other.Display_Order);
    const [mine, theirs] = a === b ? [b + (by > 0 ? 1 : -1), b] : [b, a];

    setBusy(row.Admin_Menu_ID);
    try {
      await adminUpdate("Admin_Menu", row.Admin_Menu_ID, { Display_Order: mine });
      await adminUpdate("Admin_Menu", other.Admin_Menu_ID, { Display_Order: theirs });
      setRows((xs) => xs.map((x) => {
        if (x.Admin_Menu_ID === row.Admin_Menu_ID) return { ...x, Display_Order: mine };
        if (x.Admin_Menu_ID === other.Admin_Menu_ID) return { ...x, Display_Order: theirs };
        return x;
      }).sort(byOrder));
      setError("");
    } catch (e) { setError(e.message); await load(); }
    finally { setBusy(null); }
  }

  async function addHeading(kind) {
    const label = newLabel.trim();
    if (!label) return setError("A heading needs a name.");
    setBusy("add");
    try {
      const made = await adminCreate("Admin_Menu", {
        Kind: kind, Label: label, Screen_Key: null,
        Display_Order: lastOrder(rows) + 10,
      });
      setRows((xs) => [...xs, made].sort(byOrder));
      setAdding(null);
      setNewLabel("");
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function addScreen(t) {
    setBusy(`add:${t.key}`);
    try {
      const made = await adminCreate("Admin_Menu", {
        Kind: "screen", Screen_Key: t.key, Label: t.label,
        Display_Order: lastOrder(rows) + 10,
      });
      setRows((xs) => [...xs, made].sort(byOrder));
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function remove(row) {
    const what = row.Kind === "screen"
      ? `Take "${row.Label}" off the menu?\n\nThe screen itself stays — it can be added back below.`
      : `Delete the "${row.Label}" heading?`;
    if (!window.confirm(what)) return;
    setBusy(row.Admin_Menu_ID);
    try {
      await adminDelete("Admin_Menu", row.Admin_Menu_ID);
      setRows((xs) => xs.filter((x) => x.Admin_Menu_ID !== row.Admin_Menu_ID));
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  if (loading) return <p className="am-empty">Loading&hellip;</p>;

  return (
    <div>
      <style>{CSS}</style>
      {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}

      <div className="am-head">
        <h3>Menu Layout</h3>
        <p className="am-sub">
          The order of this menu, its headings, and the names on them. What each
          screen contains is set by the screen itself &mdash; renaming an entry
          here changes the menu, not the editor it opens.
        </p>
      </div>

      <div className="am-list">
        {rows.map((r, i) => {
          const screen = r.Kind === "screen" ? screenFor(r.Screen_Key) : null;
          const gone = r.Kind === "screen" && !screen;
          return (
            <div key={r.Admin_Menu_ID}
              className={`am-row ${r.Kind}${r.Is_Active === false ? " off" : ""}`}>
              <div className="am-move">
                <button className="btn ghost sm" title="Move up"
                  disabled={i === 0 || busy === r.Admin_Menu_ID}
                  onClick={() => move(r, -1)}>&uarr;</button>
                <button className="btn ghost sm" title="Move down"
                  disabled={i === rows.length - 1 || busy === r.Admin_Menu_ID}
                  onClick={() => move(r, 1)}>&darr;</button>
              </div>

              <span className="am-kind">
                {r.Kind === "section" ? "Section"
                  : r.Kind === "group" ? "Sub" : "Screen"}
              </span>

              <input className="am-label" defaultValue={r.Label}
                key={`l${r.Admin_Menu_ID}`}
                onBlur={(e) => e.target.value.trim() && e.target.value !== r.Label
                  && save(r.Admin_Menu_ID, { Label: e.target.value.trim() })} />

              {/* What it opens, and whether that still exists. Shown
                  rather than dropped: a row pointing at a screen the
                  application no longer has is somebody's arrangement
                  gone stale, and deleting it quietly hides the fact. */}
              {r.Kind === "screen" && (
                <span className={gone ? "am-key gone" : "am-key"}>
                  {gone ? `${r.Screen_Key} — no longer exists` : r.Screen_Key}
                </span>
              )}

              <label className="am-on" title="Show this on the menu">
                <input type="checkbox" checked={r.Is_Active !== false}
                  onChange={(e) => save(r.Admin_Menu_ID, { Is_Active: e.target.checked })} />
                <span>On</span>
              </label>

              <button className="btn delete sm"
                disabled={busy === r.Admin_Menu_ID}
                onClick={() => remove(r)}>Delete</button>
            </div>
          );
        })}
      </div>

      <div className="am-add">
        {adding ? (
          <div className="am-add-row">
            <input autoFocus placeholder={adding === "section"
              ? "Section name, e.g. Utilities" : "Sub-heading, e.g. Water"}
              value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addHeading(adding)} />
            <button className="btn accent sm" disabled={busy === "add"}
              onClick={() => addHeading(adding)}>Add</button>
            <button className="btn ghost sm"
              onClick={() => { setAdding(null); setNewLabel(""); }}>Cancel</button>
          </div>
        ) : (
          KINDS.map(([k, name]) => (
            <button key={k} className="btn ghost sm" onClick={() => setAdding(k)}>
              + {name}
            </button>
          ))
        )}
        <p className="am-hint">
          New headings arrive at the bottom &mdash; move them up to where they belong.
        </p>
      </div>

      {missingFromMenu.length > 0 && (
        <div className="am-missing">
          <h4>Not in the menu yet</h4>
          <p className="am-hint">
            Screens this system has that nothing on the menu opens. They are
            shown at the end of the menu until they are placed.
          </p>
          <div className="am-chips">
            {missingFromMenu.map((t) => (
              <button key={t.key} className="btn ghost sm"
                disabled={busy === `add:${t.key}`}
                onClick={() => addScreen(t)}>
                + {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const byOrder = (a, b) => (Number(a.Display_Order) - Number(b.Display_Order))
  || (Number(a.Admin_Menu_ID) - Number(b.Admin_Menu_ID));

const lastOrder = (rows) => rows.reduce(
  (m, r) => Math.max(m, Number(r.Display_Order) || 0), 0);

const CSS = `
.am-head { margin-bottom: 14px; }
.am-head h3 { margin: 0; font-size: 16px; }
.am-sub { margin: 4px 0 0; font-size: 11.5px; color: var(--muted); max-width: 74ch; }
.am-empty { color: var(--muted); font-size: 13px; padding: 40px 0; text-align: center; }
.am-list { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.am-row { display: flex; align-items: center; gap: 10px; padding: 6px 10px;
  border-bottom: 1px solid var(--border); background: #fff; }
.am-row:last-child { border-bottom: none; }
.am-row.section { background: var(--bg); }
.am-row.group { background: #fafafa; }
.am-row.section .am-label { font-weight: 800; text-transform: uppercase;
  letter-spacing: .04em; font-size: 11.5px; }
.am-row.group .am-label { font-weight: 700; margin-left: 14px; }
.am-row.screen .am-label { margin-left: 28px; }
.am-row.off { opacity: .5; }
.am-move { display: flex; flex-direction: column; gap: 2px; }
.am-move .btn { padding: 0 6px; line-height: 1.35; }
.am-kind { font: 700 9.5px inherit; letter-spacing: .05em; text-transform: uppercase;
  color: var(--muted); width: 52px; flex: none; }
.am-label { flex: 1; min-width: 0; font: 500 12.5px inherit; padding: 5px 8px;
  border: 1px solid transparent; border-radius: 6px; background: none; color: var(--text); }
.am-label:hover, .am-label:focus { border-color: var(--border); background: #fff; }
.am-key { font: 500 10.5px ui-monospace, Menlo, monospace; color: var(--muted); }
.am-key.gone { color: #b91c1c; font-weight: 700; }
.am-on { display: flex; align-items: center; gap: 4px; font: 600 10.5px inherit;
  color: var(--muted); }
.am-add { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 14px 0; }
.am-add-row { display: flex; gap: 6px; align-items: center; }
.am-add-row input { font: 500 12.5px inherit; padding: 6px 9px; min-width: 260px;
  border: 1px solid var(--border); border-radius: 6px; }
.am-hint { margin: 0; font-size: 11px; color: var(--muted); }
.am-missing { margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--border); }
.am-missing h4 { margin: 0 0 2px; font-size: 12.5px; }
.am-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
`;
