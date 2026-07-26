import { useState } from "react";
import { NAV_SECTIONS } from "../lib/navigation.js";

/* Styles live in this file rather than styles.css so the sidebar is a single
   self-contained drop-in. Move them to styles.css later if you prefer. */
const SIDEBAR_CSS = `
.shell { display: flex; min-height: 100vh; }
.main { flex: 1; min-width: 0; padding: 20px 24px; overflow-x: auto; }

/* ═══ SIDEBAR ═══════════════════════════════════════════════════
   Dark slate palette carried over from the single-file app, so the
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
.brand-plate {
  background: #fff; border-radius: 8px; padding: 10px 12px;
  display: flex; align-items: center; gap: 10px;
}
.brand-mark {
  width: 34px; height: 34px; flex: none; border-radius: 7px;
  background: var(--accent); color: #fff; font-size: 11px; font-weight: 700;
  letter-spacing: 0.02em; display: flex; align-items: center; justify-content: center;
}
.brand-text { display: flex; flex-direction: column; line-height: 1.2; min-width: 0; }
.brand-text strong { font-size: 14px; font-weight: 700; color: var(--text); }
.brand-text em {
  font-style: normal; font-size: 10px; color: var(--muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.sidebar-nav { flex: 1; overflow-y: auto; padding: 6px 0 10px; }
.sidebar-nav::-webkit-scrollbar { width: 6px; }
.sidebar-nav::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
.sidebar-nav::-webkit-scrollbar-thumb:hover { background: #475569; }

.nav-section { margin-bottom: 2px; }
.nav-section-header {
  width: 100%; padding: 9px 12px 9px 10px; background: none; border: none;
  cursor: pointer; display: flex; align-items: center; justify-content: space-between;
  font-family: inherit; font-size: 11.5px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.06em; text-align: left;
}
.nav-section-header:hover { filter: brightness(1.25); }
.chevron { font-size: 10px; transition: transform 0.18s; display: inline-block; }
.chevron.down { transform: rotate(90deg); }

.nav-section-items { padding: 3px 8px 6px; }
.nav-item {
  width: 100%; text-align: left; background: none; border: 1px solid transparent;
  border-radius: 6px; padding: 6px 10px; margin-bottom: 1px; cursor: pointer;
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

/* ═══ PLACEHOLDER (unmigrated views) ════════════════════════════ */
.placeholder { text-align: center; padding: 60px 24px; }
.placeholder-badge {
  display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.07em; padding: 4px 11px; border-radius: 20px; margin-bottom: 14px;
}
.placeholder h2 { margin: 0 0 8px; font-size: 20px; }
.placeholder p { margin: 0 0 6px; font-size: 13px; color: var(--muted); max-width: 46ch;
  margin-left: auto; margin-right: auto; }
.placeholder-progress {
  margin-top: 18px !important; font-size: 11px !important; text-transform: uppercase;
  letter-spacing: 0.07em; font-weight: 700; opacity: 0.55;
}

@media (max-width: 820px) {
  #app-sidebar { position: fixed; z-index: 30; height: 100vh; }
  #app-sidebar.collapsed { margin-left: -240px; }
  .main { padding: 16px 14px; }
}
`;

export default function Sidebar({ view, onNavigate, collapsed, onToggle }) {
  // Open the section containing the current view; collapse the rest.
  const [open, setOpen] = useState(() => {
    const initial = {};
    NAV_SECTIONS.forEach((s) => {
      initial[s.id] = s.items.some((i) => i.view === view);
    });
    return initial;
  });

  const toggleSection = (id) => setOpen((p) => ({ ...p, [id]: !p[id] }));

  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <aside id="app-sidebar" className={collapsed ? "collapsed" : ""}>
        <div className="sidebar-brand">
          <div className="brand-plate">
            <span className="brand-mark">A360</span>
            <span className="brand-text">
              <strong>Aptus360</strong>
              <em>End-to-End MU Management</em>
            </span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_SECTIONS.map((section) => (
            <div className="nav-section" key={section.id}>
              <button
                className="nav-section-header"
                onClick={() => toggleSection(section.id)}
                aria-expanded={!!open[section.id]}
                style={{
                  color: section.colour,
                  borderLeft: `4px solid ${section.colour}`,
                  background: `${section.colour}1a`,
                }}
              >
                <span>{section.label}</span>
                <span className={open[section.id] ? "chevron down" : "chevron"} style={{ color: section.colour }}>
                  &#9656;
                </span>
              </button>

              {open[section.id] && (
                <div className="nav-section-items">
                  {section.items.map((item) => {
                    const cls = [
                      "nav-item",
                      view === item.view ? "active" : "",
                      item.soon ? "coming-soon" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <button
                        key={item.view}
                        className={cls}
                        onClick={() => onNavigate(item.view)}
                      >
                        {item.label}
                        {item.built && <span className="nav-badge">live</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
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
