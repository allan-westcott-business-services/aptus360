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
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
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
      /* Not re-sorted: the list is already in the order it is being
         shown in, and sorting here would jump a row somebody has just
         dragged into a gap back to wherever its number falls. */
      setRows((xs) => xs.map((x) =>
        (x.Admin_Menu_ID === id ? { ...x, ...changes } : x)));
      setError("");
    } catch (e) { setError(e.message); await load(); }
    finally { setBusy(null); }
  }

  /* ── Moving a row ──

     The list moves first and the database catches up.

     It used to be the other way round: two writes, awaited one after
     the other, and only then did the row move on screen — so every
     nudge cost two round trips before anything happened, and the
     buttons were disabled throughout. Arranging forty rows that way is
     eighty waits, which is what made it unusable rather than merely
     slow. Nothing else was competing for the machine; the time was all
     network, and all of it avoidable.

     Now the reorder is local and instant, and one row is written in the
     background. A failure puts the list back and says so, which is the
     price of not waiting and a fair one for a menu.

     ── One write, not forty ──

     The moved row takes a number between its new neighbours rather than
     the list being renumbered. Dropping row forty at position two
     renumbers thirty-eight rows if you do it sequentially; a midpoint
     touches one.

     Room runs out eventually — orders seeded ten apart allow three or
     four drops into the same gap before the numbers meet — and then the
     whole list is renumbered once and the gaps are back. That is rare
     enough to be worth its cost and simple enough to be obviously
     correct. */
  const [saving, setSaving] = useState(0);

  async function write(changes) {
    if (!changes.length) return;
    setSaving((n) => n + 1);
    try {
      await Promise.all(changes.map((c) =>
        adminUpdate("Admin_Menu", c.Admin_Menu_ID, { Display_Order: c.Display_Order })));
      setError("");
    } catch (e) {
      setError(`${e.message} — the order on screen may not have saved.`);
      await load();
    } finally { setSaving((n) => n - 1); }
  }

  function reorder(from, to) {
    if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return;

    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    /* Between the two it now sits between. Open-ended at either end of
       the list, where there is only one neighbour to be beside. */
    const before = next[to - 1];
    const after = next[to + 1];
    const lo = before ? Number(before.Display_Order) : null;
    const hi = after ? Number(after.Display_Order) : null;

    let order = null;
    if (lo == null && hi == null) order = 10;
    else if (lo == null) order = hi - 10;
    else if (hi == null) order = lo + 10;
    else if (hi - lo > 1) order = Math.floor((lo + hi) / 2);

    if (order != null) {
      const one = { ...moved, Display_Order: order };
      next[to] = one;
      setRows(next);
      write([{ Admin_Menu_ID: one.Admin_Menu_ID, Display_Order: order }]);
      return;
    }

    /* No room left between the neighbours. Renumber the lot, ten apart,
       and write only the rows whose number actually changed. */
    const spaced = next.map((r, i) => ({ ...r, Display_Order: (i + 1) * 10 }));
    setRows(spaced);
    write(spaced
      .filter((r, i) => Number(next[i].Display_Order) !== r.Display_Order)
      .map((r) => ({ Admin_Menu_ID: r.Admin_Menu_ID, Display_Order: r.Display_Order })));
  }

  const move = (row, by) => reorder(
    rows.findIndex((x) => x.Admin_Menu_ID === row.Admin_Menu_ID),
    rows.findIndex((x) => x.Admin_Menu_ID === row.Admin_Menu_ID) + by);

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
        <h3>
          Menu Layout
          {/* Quiet, and only while something is in flight. The order is
              already on screen; this says the database has caught up,
              which is a different question from whether the move
              worked. */}
          {saving > 0 && <span className="am-saving">saving&hellip;</span>}
        </h3>
        <p className="am-sub">
          The order of this menu, its headings, and the names on them. What each
          screen contains is set by the screen itself &mdash; renaming an entry
          here changes the menu, not the editor it opens.
        </p>
      </div>

      {/* ── Dragging ──

          The browser's own drag and drop, with no library: a row is
          draggable, the row under the pointer marks itself, and the
          drop moves it. That is enough for a list on a desktop admin
          screen, and it costs nothing to carry.

          The up and down buttons stay. Dragging cannot be done from a
          keyboard, and a control that only works with a mouse is one
          some people cannot use at all — the buttons are now instant
          too, so they are a real alternative rather than a slow one. */}
      <div className="am-list">
        {rows.map((r, i) => {
          const screen = r.Kind === "screen" ? screenFor(r.Screen_Key) : null;
          const gone = r.Kind === "screen" && !screen;
          return (
            <div key={r.Admin_Menu_ID}
              draggable
              onDragStart={(e) => {
                setDragId(r.Admin_Menu_ID);
                e.dataTransfer.effectAllowed = "move";
                /* Firefox will not start a drag without payload. */
                e.dataTransfer.setData("text/plain", String(r.Admin_Menu_ID));
              }}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              onDragOver={(e) => {
                if (dragId == null || dragId === r.Admin_Menu_ID) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overId !== r.Admin_Menu_ID) setOverId(r.Admin_Menu_ID);
              }}
              onDragLeave={() => { if (overId === r.Admin_Menu_ID) setOverId(null); }}
              onDrop={(e) => {
                e.preventDefault();
                const from = rows.findIndex((x) => x.Admin_Menu_ID === dragId);
                if (from >= 0 && from !== i) reorder(from, i);
                setDragId(null);
                setOverId(null);
              }}
              className={`am-row ${r.Kind}`
                + (r.Is_Active === false ? " off" : "")
                + (dragId === r.Admin_Menu_ID ? " dragging" : "")
                + (overId === r.Admin_Menu_ID ? " over" : "")}>
              <span className="am-grip" title="Drag to move">&#8942;&#8942;</span>
              <div className="am-move">
                {/* Never disabled by a save in flight. The list has
                    already moved; waiting on the write to allow the
                    next nudge is what made this slow. */}
                <button className="btn ghost sm" title="Move up"
                  disabled={i === 0}
                  onClick={() => move(r, -1)}>&uarr;</button>
                <button className="btn ghost sm" title="Move down"
                  disabled={i === rows.length - 1}
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
.am-row.dragging { opacity: .4; }
.am-row.over { box-shadow: inset 0 2px 0 var(--accent); }
.am-grip { cursor: grab; color: var(--border); font-size: 11px; letter-spacing: -2px;
  user-select: none; flex: none; }
.am-row:hover .am-grip { color: var(--muted); }
.am-saving { margin-left: 10px; font: 600 10.5px inherit; color: var(--muted); }
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
