import { useState, useRef, useLayoutEffect, useEffect } from "react";

/* Row actions menu, matching the original app's burger on each tender row.
   The popup is position:fixed against the button — the table wrapper has
   overflow:auto, which clips absolutely-positioned children. */
export default function BurgerMenu({ items }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open || !btn.current) return setPos(null);
    const r = btn.current.getBoundingClientRect();
    const h = Math.min(items.length * 32 + 16, 340);
    setPos({
      top: r.bottom + 4 + h > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4,
      left: r.left,
    });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  return (
    <span className="burger-wrap" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btn}
        className={open ? "burger-btn open" : "burger-btn"}
        title="Actions"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="burger-line" /><span className="burger-line" /><span className="burger-line" />
      </button>
      {open && pos && (
        <>
          <span className="burger-backdrop" onClick={() => setOpen(false)} />
          <span className="burger-menu" style={pos}>
            {items.filter(Boolean).map((it, i) =>
              it.divider ? (
                <span className="burger-divider" key={`d${i}`} />
              ) : (
                <button
                  key={it.label}
                  className={`burger-item${it.danger ? " danger" : ""}${it.disabled ? " off" : ""}`}
                  disabled={it.disabled}
                  onClick={() => { setOpen(false); it.fn && it.fn(); }}
                >
                  <span className="bi-icon">{it.icon}</span>
                  <span className="bi-label">{it.label}</span>
                </button>
              )
            )}
          </span>
        </>
      )}
    </span>
  );
}

export const BURGER_CSS = `
.burger-wrap { position: relative; display: inline-block; }
.burger-btn {
  width: 26px; height: 26px; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 3px; cursor: pointer;
  background: var(--white); border: 1px solid var(--border); border-radius: 6px; padding: 0;
}
.burger-btn:hover { background: var(--bg); border-color: #c5cad3; }
.burger-btn.open { background: var(--accent-light); border-color: var(--accent); }
.burger-line { width: 13px; height: 2px; background: var(--muted); border-radius: 2px; }
.burger-btn.open .burger-line { background: var(--accent); }
.burger-backdrop { position: fixed; inset: 0; z-index: 940; }
.burger-menu {
  position: fixed; z-index: 950; display: flex; flex-direction: column;
  background: var(--white); border: 1px solid var(--border); border-radius: 8px;
  box-shadow: 0 8px 26px rgba(0,0,0,.18); padding: 5px; min-width: 218px;
}
.burger-item {
  display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
  background: none; border: none; border-radius: 5px; padding: 6px 9px;
  cursor: pointer; font: 500 12.5px inherit; color: var(--text); white-space: nowrap;
}
.burger-item:hover { background: var(--bg); }
.burger-item.danger { color: #dc2626; }
.burger-item.danger:hover { background: #fef2f2; }
.burger-item.off { color: var(--muted); cursor: not-allowed; }
.burger-item.off:hover { background: none; }
.bi-icon { width: 16px; text-align: center; flex: none; }
.burger-divider { height: 1px; background: var(--border); margin: 4px 2px; }
`;
