import { useState } from "react";
import { NAV_SECTIONS } from "../lib/navigation.js";

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
                <span>
                  {section.icon} {section.label}
                </span>
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
