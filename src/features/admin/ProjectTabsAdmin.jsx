import { useState, useEffect, useCallback } from "react";
import Banner from "../../components/Banner.jsx";
import { adminList, adminCreate, adminUpdate } from "../../api/admin.js";
import { AREAS } from "../../lib/navigation.js";
import { TABS, PINNED_TAB, tabsForStage } from "../../lib/projectTabs.js";

/* Which project tabs each section shows.

   A grid: sections down, tabs across, a tick where the tab appears. It
   is a grid because the question people actually ask is comparative —
   "does Finance see invoices and Operations not?" — and a per-section
   list of checkboxes makes that four screens of clicking to answer.

   ── What a tick means ──

   Ticked is the absence of a row. Only exceptions are stored, which
   keeps the meaning of the table plain: everything is shown unless
   something says otherwise. It also means a tab added by a later
   release appears everywhere by default rather than being invisible
   until somebody thinks to come here.

   ── What cannot be turned off ──

   Details is fixed, and shown as such. Hiding every tab would leave a
   section able to open a project and see nothing, which is a dead end
   reached by ticking boxes with nothing on screen to explain it.

   Tabs that only exist at one stage say so under their name. They can
   still be hidden — a section may not want Call-offs even on a contract
   — but it is worth knowing that unticking Outline Designs for a
   section changes nothing about its contract projects, because the
   stage rule had already removed it. */

/* Only the areas that can open a project. Listing every area would
   offer settings for HSQE and Admin that could never do anything. */
const projectAreas = () =>
  AREAS.filter((a) => a.items.some((i) => i.view === "projects" || i.view.endsWith("-projects")));

const stageNote = (tab) => {
  if (tab.stages.length > 1) return "";
  return tab.stages[0] === "tender" ? "Tender only" : "Contract only";
};

export default function ProjectTabsAdmin() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);

  const areas = projectAreas();

  const load = useCallback(async () => {
    try {
      const { rows: r = [] } = await adminList("Project_Tab_Visibility");
      setRows(r);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rowFor = (areaKey, tabId) =>
    rows.find((r) => r.Area_Key === areaKey && r.Tab_Key === tabId) ?? null;

  const isOn = (areaKey, tabId) => {
    if (tabId === PINNED_TAB) return true;
    const row = rowFor(areaKey, tabId);
    return !row || row.Is_Visible !== false;
  };

  async function toggle(areaKey, tabId) {
    if (tabId === PINNED_TAB) return;
    const key = `${areaKey}:${tabId}`;
    const existing = rowFor(areaKey, tabId);
    const next = !isOn(areaKey, tabId);
    setBusy(key);
    try {
      if (existing) {
        await adminUpdate("Project_Tab_Visibility",
          existing.Project_Tab_Visibility_ID, { Is_Visible: next });
        setRows((xs) => xs.map((x) =>
          x.Project_Tab_Visibility_ID === existing.Project_Tab_Visibility_ID
            ? { ...x, Is_Visible: next } : x));
      } else {
        /* Only ever written when something is unticked, so the table
           stays a list of exceptions rather than a full matrix. */
        const created = await adminCreate("Project_Tab_Visibility",
          { Area_Key: areaKey, Tab_Key: tabId, Is_Visible: next },
          "Project_Tab_Visibility_ID");
        setRows((xs) => [...xs, created]);
      }
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function setAll(areaKey, visible) {
    setBusy(`all:${areaKey}`);
    try {
      for (const tab of TABS) {
        if (tab.id === PINNED_TAB) continue;
        if (isOn(areaKey, tab.id) === visible) continue;
        await toggle(areaKey, tab.id);
      }
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="hint">Loading tab settings…</p>;

  return (
    <div className="pt">
      <style>{CSS}</style>
      <h2 className="admin-title">Project Tabs</h2>
      <p className="pt-intro">
        Which tabs the project page shows, depending on the section it was opened
        from. A tab is shown unless it is unticked here. The project&rsquo;s own stage
        still applies on top: a tender project never shows Call-offs, whatever a
        section asks for.
      </p>

      {error && <Banner kind="error">{error}</Banner>}

      {!areas.length ? (
        <Banner kind="warn">
          No section currently opens the project page, so there is nothing to configure.
        </Banner>
      ) : (
        <div className="pt-scroll">
          <table className="pt-grid">
            <thead>
              <tr>
                <th className="pt-corner">Section</th>
                {TABS.map((t) => (
                  <th key={t.id} className={t.id === PINNED_TAB ? "pinned" : ""}>
                    <span className="pt-tab-label">{t.label}</span>
                    {t.id === PINNED_TAB
                      ? <span className="pt-note">Always shown</span>
                      : stageNote(t) && <span className="pt-note">{stageNote(t)}</span>}
                  </th>
                ))}
                <th className="pt-actions" />
              </tr>
            </thead>
            <tbody>
              {areas.map((area) => {
                const shownCount = TABS.filter((t) => isOn(area.id, t.id)).length;
                return (
                  <tr key={area.id}>
                    <th scope="row" className="pt-area">
                      <span className="pt-area-dot" style={{ background: area.colour }} />
                      <span>
                        {area.label}
                        <span className="pt-count">{shownCount} of {TABS.length}</span>
                      </span>
                    </th>
                    {TABS.map((t) => {
                      const on = isOn(area.id, t.id);
                      const pinned = t.id === PINNED_TAB;
                      return (
                        <td key={t.id} className={pinned ? "pinned" : ""}>
                          <input type="checkbox" checked={on} disabled={pinned || !!busy}
                            aria-label={`${t.label} in ${area.label}`}
                            onChange={() => toggle(area.id, t.id)} />
                        </td>
                      );
                    })}
                    <td className="pt-actions">
                      <button className="btn sm" disabled={!!busy}
                        onClick={() => setAll(area.id, true)}>All</button>
                      <button className="btn sm" disabled={!!busy}
                        onClick={() => setAll(area.id, false)}>None</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="hint pt-foot">
        Sections are defined in the application, not here &mdash; this lists the ones
        that can open a project. Details cannot be unticked, so a section always has
        somewhere to land.
      </p>
    </div>
  );
}

const CSS = `
.pt-intro { margin: -6px 0 16px; font-size: 12.5px; color: var(--muted); max-width: 82ch;
  line-height: 1.6; }
.pt-scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); }
.pt-grid { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 12.5px; }
.pt-grid th, .pt-grid td { border-bottom: 1px solid var(--border); padding: 9px 10px;
  text-align: center; }
.pt-grid thead th { background: var(--bg); vertical-align: bottom; white-space: nowrap;
  font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase;
  letter-spacing: .03em; position: sticky; top: 0; z-index: 1; }
.pt-grid thead th.pinned { background: var(--accent-light); color: var(--accent); }
.pt-tab-label { display: block; }
.pt-note { display: block; margin-top: 3px; font-size: 9.5px; font-weight: 600;
  text-transform: none; letter-spacing: 0; color: var(--muted); }
.pt-corner { text-align: left !important; min-width: 190px; }
.pt-area { text-align: left !important; font-weight: 600; font-size: 12.5px;
  color: var(--text); text-transform: none; letter-spacing: 0;
  display: flex; align-items: center; gap: 9px; }
.pt-area-dot { width: 9px; height: 9px; border-radius: 3px; flex: none; }
.pt-count { display: block; font-size: 10.5px; font-weight: 500; color: var(--muted); }
.pt-grid tbody tr:hover td { background: var(--bg); }
.pt-grid td.pinned { background: var(--accent-light); }
.pt-actions { white-space: nowrap; }
.pt-actions .btn + .btn { margin-left: 4px; }
.pt-foot { margin-top: 12px; }
`;
