import { findArea } from "../lib/navigation.js";
import { alpha } from "../lib/colour.js";

/* The menu for one area.

   It used to render every section in the app with the current one
   expanded, which meant seventy items behind ten lids and a scroll to
   reach the bottom of them. Now the landing page picks the area and this
   shows that area's screens flat — no chevrons, nothing to expand,
   because there is only ever one section in view.

   Styles live in this file rather than styles.css so the sidebar stays a
   self-contained drop-in. Anything the rest of the app depends on has
   moved to styles.css, since this component is not on every screen: the
   landing page has no menu at all. */
const SIDEBAR_CSS = `
/* Dark slate palette carried over from the single-file app, so the
   React screens sit alongside the legacy ones without a visual jump. */
:root {
  --sb-bg:          #0f172a;
  --sb-bg-hover:    #1e293b;
  --sb-bg-active:   rgba(59, 130, 246, 0.18);
  --sb-border:      #1e293b;
  --sb-text:        #cbd5e1;
  --sb-text-strong: #f1f5f9;
  --sb-text-muted:  #94a3b8;
  --sb-text-hover:  #93c5fd;
  --sb-text-active: #60a5fa;
  --sb-text-dim:    #475569;
}

#app-sidebar {
  width: 240px; flex-shrink: 0; background: var(--sb-bg);
  display: flex; flex-direction: column; height: 100vh;
  position: sticky; top: 0; transition: margin-left 0.22s ease;
}
#app-sidebar.collapsed { margin-left: -240px; }

.sidebar-brand { padding: 14px 12px 10px; }
/* A button, because the logo is the way back to the landing page. It
   was already the most clicked-looking thing in the sidebar; now it
   does something. */
.brand-plate {
  width: 100%; background: #fff; border: 1px solid transparent;
  border-radius: 8px; padding: 10px 12px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.brand-plate:hover { border-color: var(--sb-text-hover); }
.brand-plate:focus-visible { outline: 2px solid var(--sb-text-active); outline-offset: 2px; }
/* Scales to the sidebar rather than a fixed size, so it still fits when
   the sidebar is narrowed. */
.brand-logo { width: 100%; max-width: 190px; height: auto; display: block; }

/* ═══ AREA HEADER ═══════════════════════════════════════════════
   Says which area's menu this is, in that area's colour, so the square
   somebody pressed on the landing page and the menu they land in are
   recognisably the same thing. */
.sb-area {
  margin: 4px 12px 8px; padding: 9px 11px;
  border-radius: 7px; border-left: 4px solid var(--sb-accent);
  background: var(--sb-accent-tint);
  display: flex; align-items: center; gap: 8px;
}
.sb-area-icon { font-size: 14px; line-height: 1; flex: none; }
.sb-area-label {
  font-size: 11.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--sb-accent); line-height: 1.3;
}

.sb-back {
  width: calc(100% - 24px); margin: 0 12px 8px; padding: 6px 10px;
  background: none; border: 1px solid var(--sb-border); border-radius: 6px;
  cursor: pointer; font-family: inherit; font-size: 11.5px;
  color: var(--sb-text-muted); text-align: left;
  display: flex; align-items: center; gap: 7px;
}
.sb-back:hover { background: var(--sb-bg-hover); color: var(--sb-text-hover); }
.sb-back:focus-visible { outline: 2px solid var(--sb-text-active); outline-offset: 1px; }

.sidebar-nav { flex: 1; overflow-y: auto; padding: 2px 8px 10px; }
.sidebar-nav::-webkit-scrollbar { width: 6px; }
.sidebar-nav::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
.sidebar-nav::-webkit-scrollbar-thumb:hover { background: #475569; }

.nav-item {
  width: 100%; text-align: left; background: none; border: 1px solid transparent;
  border-radius: 6px; padding: 7px 10px; margin-bottom: 1px; cursor: pointer;
  font-family: inherit; font-size: 12.5px; color: var(--sb-text);
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
}
.nav-item:hover { background: var(--sb-bg-hover); color: var(--sb-text-hover); }
.nav-item.active {
  background: var(--sb-bg-active); color: var(--sb-text-active); font-weight: 600;
}
.nav-item.coming-soon { color: var(--sb-text-dim); }
.nav-item.coming-soon:hover { color: var(--sb-text-dim); background: rgba(255, 255, 255, 0.03); }
.nav-badge {
  font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  background: #065f46; color: #6ee7b7; border-radius: 3px; padding: 1px 4px; flex: none;
}

.sidebar-footer {
  border-top: 1px solid var(--sb-border); padding: 10px 14px;
  display: flex; align-items: center; gap: 7px;
}
.conn-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; flex: none; }
.conn-pill { font-size: 11px; color: var(--sb-text-muted); }

.sidebar-toggle-btn {
  position: fixed; left: 240px; top: 14px; z-index: 20;
  width: 22px; height: 30px; border: 1px solid var(--border); border-left: none;
  border-radius: 0 6px 6px 0; background: var(--white); color: var(--muted);
  cursor: pointer; font-size: 10px; transition: left 0.22s ease;
  display: flex; align-items: center; justify-content: center;
}
.sidebar-toggle-btn:hover { color: var(--accent); }
#app-sidebar.collapsed + .sidebar-toggle-btn { left: 0; }

@media (max-width: 820px) {
  #app-sidebar { position: fixed; z-index: 30; height: 100vh; }
  #app-sidebar.collapsed { margin-left: -240px; }
}

@media (prefers-reduced-motion: reduce) {
  #app-sidebar, .sidebar-toggle-btn { transition: none; }
}
`;

export default function Sidebar({ view, onNavigate, onHome, collapsed, onToggle }) {
  const area = findArea(view);

  /* No area means the landing page, which has no menu. The shell does
     not mount the sidebar there, so this is belt and braces against a
     remembered view from an older build resolving to nothing. */
  if (!area) return null;

  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <aside id="app-sidebar" className={collapsed ? "collapsed" : ""}>
        <div className="sidebar-brand">
          <button className="brand-plate" onClick={onHome} title="All sections">
            {/* The logo already carries the name and the strapline, so
                text beside it would be saying everything twice. */}
            <img className="brand-logo" src="/aptus360-logo.png"
              alt="Aptus360 — End-to-End MU Management" />
          </button>
        </div>

        <button className="sb-back" onClick={onHome}>
          <span aria-hidden="true">&larr;</span>
          <span>All sections</span>
        </button>

        <div className="sb-area" style={{ "--sb-accent": area.colour, "--sb-accent-tint": alpha(area.colour, 16) }}>
          <span className="sb-area-icon" aria-hidden="true">{area.icon}</span>
          <span className="sb-area-label">{area.label}</span>
        </div>

        <nav className="sidebar-nav" aria-label={`${area.label} screens`}>
          {area.items.map((item) => {
            const cls = [
              "nav-item",
              view === item.view ? "active" : "",
              item.soon ? "coming-soon" : "",
            ].filter(Boolean).join(" ");
            return (
              <button
                key={item.view}
                className={cls}
                aria-current={view === item.view ? "page" : undefined}
                onClick={() => onNavigate(item.view)}
              >
                {item.label}
                {item.built && <span className="nav-badge">live</span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <span className="conn-dot" />
          <span className="conn-pill">Connected</span>
        </div>
      </aside>

      <button
        className="sidebar-toggle-btn"
        onClick={onToggle}
        aria-label={collapsed ? "Show menu" : "Hide menu"}
        title={collapsed ? "Show menu" : "Hide menu"}
      >
        {collapsed ? "\u25B6" : "\u25C0"}
      </button>
    </>
  );
}
