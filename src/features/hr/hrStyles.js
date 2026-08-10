/* Styles for the Human Resources screens.

   Carried over from the standalone HR portal, with one change applied
   throughout: every selector is now nested under `.hr-root`.

   That is not tidiness. Both apps independently define `.card`, `.btn`
   and `.badge`, and the standalone version also reset `margin` and
   `padding` on `*`. Injected flat, whichever stylesheet loaded last would
   silently restyle the other app's screens — and because Human Resources
   is lazy-loaded, "last" would depend on whether the user had visited it
   yet. Scoping makes the boundary explicit instead of accidental.

   The scoping raises specificity by one class, which also settles the
   inherited-rule conflicts with src/styles.css in HR's favour inside the
   pane and nowhere else. Two of those needed handling explicitly — see
   the notes on selects and labels below. */

export const HR_CSS = `
/* ═══ BASE ══════════════════════════════════════════════════════
   Was a bare \`*\` reset. Confined to the pane: stripping margin and
   padding from every element in the document would flatten the rest
   of Aptus360, which is written against browser defaults. */
.hr-root, .hr-root *, .hr-root *::before, .hr-root *::after {
  box-sizing: border-box; font-family: "DM Sans Variable", "DM Sans", "DM Sans Fallback", system-ui, sans-serif;
  margin: 0; padding: 0;
}
.hr-root {
  background: var(--bg); color: var(--text);
  /* The pane owns the space the app shell gives it, and scrolls its
     own overflow — the standalone version sized itself to the
     viewport, which here would put a second scrollbar inside one. */
  min-height: 100%;
}
.hr-root .font-display { font-family: 'Plus Jakarta Sans Variable', 'Plus Jakarta Sans', sans-serif !important; }

/* The standalone app put this padding and measure on its own <main>.
   That element is Aptus360's now, so the pane carries them instead —
   without them the HR screens run edge to edge and the wide tables
   become unreadable on a large monitor. */
.hr-root .hr-page { padding: 12px 16px 40px; }
.hr-root #hr-page-content { max-width: 1152px; margin: 0 auto; }
.hr-root .hr-boot { display: flex; align-items: center; justify-content: center;
  height: 200px; color: var(--muted); font-size: 13px; }

/* ═══ SCROLLBARS ════════════════════════════════════════════════ */
.hr-root ::-webkit-scrollbar { width: 5px; height: 5px; }
.hr-root ::-webkit-scrollbar-track { background: transparent; }
.hr-root ::-webkit-scrollbar-thumb { background: #475569; border-radius: 99px; }
.hr-root input[type=search]::-webkit-search-cancel-button { display: none; }
@keyframes hrSlideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }

/* ═══ BUTTONS ═══════════════════════════════════════════════════ */
.hr-root .btn {
  display: inline-flex; align-items: center; gap: 6px;
  font-weight: 600; border-radius: 8px; cursor: pointer; border: none;
  font-family: "DM Sans Variable", "DM Sans", "DM Sans Fallback", system-ui, sans-serif; transition: all 0.15s;
}
.hr-root .btn-primary { background: var(--accent); color: #fff; padding: 9px 16px; font-size: 14px; }
.hr-root .btn-primary:hover:not(:disabled) { background: var(--accent-dark); }
.hr-root .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.hr-root .btn-secondary {
  background: #fff; color: var(--text); padding: 9px 16px; font-size: 14px;
  border: 1px solid #e5e7eb; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.hr-root .btn-secondary:hover { background: var(--bg); }
.hr-root .btn-icon {
  padding: 6px; border-radius: 6px; background: none;
  color: var(--muted); cursor: pointer; border: none;
  display: inline-flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.hr-root .btn-icon.edit:hover { color: var(--accent); background: var(--accent-light); }
.hr-root .btn-icon.del:hover  { color: #ef4444; background: var(--err-bg); }

/* ═══ BADGE / PILL ══════════════════════════════════════════════ */
.hr-root .badge {
  display: inline-flex; align-items: center;
  padding: 2px 8px; border-radius: 6px;
  font-size: 11px; font-weight: 600; letter-spacing: 0.03em;
}

/* ═══ CARD ══════════════════════════════════════════════════════ */
.hr-root .card { background: #fff; border-radius: 12px; border: 1px solid var(--border); overflow: hidden; }

/* ═══ ICON TILE ═════════════════════════════════════════════════ */
.hr-root .icon-tile {
  width: 40px; height: 40px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}

/* ═══ STAT CARD ═════════════════════════════════════════════════ */
.hr-root .stat-card {
  background: #fff; border-radius: 12px; border: 1px solid var(--border);
  padding: 20px; transition: box-shadow 0.2s;
}
.hr-root .stat-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }

/* ═══ MODULE CARD (dashboard grid) ══════════════════════════════ */
.hr-root .mod-card {
  background: #fff; border-radius: 12px; border: 1px solid var(--border);
  padding: 20px; display: flex; align-items: center; gap: 14px;
  transition: box-shadow 0.2s;
}
.hr-root .mod-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }

/* ═══ FORM FIELDS ═══════════════════════════════════════════════ */
.hr-root .field-label {
  display: block; font-size: 11px; font-weight: 700; color: var(--muted);
  text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px;
}
.hr-root .field-input {
  width: 100%; border: 1px solid var(--border); border-radius: 8px;
  padding: 10px 14px; font-size: 14px; color: var(--text); background: #fff;
  outline: none; transition: border-color 0.15s, box-shadow 0.15s;
  font-family: "DM Sans Variable", "DM Sans", "DM Sans Fallback", system-ui, sans-serif;
}
.hr-root .field-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
.hr-root .field-hint { font-size: 11px; color: var(--muted); margin-top: 4px; }
.hr-root .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

/* src/styles.css sets appearance:none on every select in the app so it
   can draw its own control. That rule reaches in here too and takes the
   dropdown arrow off HR's selects, which then read as text inputs that
   refuse to be typed in. Put the native control back and leave room for
   it, rather than importing the other app's arrow — these fields are
   taller and lighter-bordered, and a chevron positioned for one would
   sit wrong on the other. */
.hr-root select.field-input {
  appearance: auto; -webkit-appearance: auto;
  padding-right: 32px;
}

/* Same shape of problem: src/styles.css styles bare \`label\`, and HR uses
   labels the app's rule was never written for — inside table cells and
   beside checkboxes, where a block-level uppercase caption is wrong.
   Only \`.field-label\` above wants that treatment. */
.hr-root label:not(.field-label) {
  display: inline; font-size: inherit; font-weight: inherit;
  text-transform: none; letter-spacing: normal; color: inherit; margin-bottom: 0;
}

/* ═══ TABLE ═════════════════════════════════════════════════════ */
.hr-root .tbl { width: 100%; border-collapse: collapse; }
.hr-root .th { background: var(--bg); font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; padding: 12px 20px; border-bottom: 1px solid var(--bg); text-align: left; }
.hr-root .td { padding: 14px 20px; font-size: 14px; color: var(--text); border-bottom: 1px solid var(--bg); }
.hr-root .tr:hover .td { background: var(--bg); }
.hr-root .tr:last-child .td { border-bottom: none; }

/* ═══ AVATAR ════════════════════════════════════════════════════ */
.hr-root .avatar {
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; flex-shrink: 0;
}

/* ═══ MODAL ═════════════════════════════════════════════════════
   Fixed to the viewport, so it covers the sidebar as well as the
   pane. The z-index clears the app's sidebar toggle (20). */
.hr-root .modal-overlay {
  position: fixed; inset: 0; z-index: 50;
  display: flex; align-items: center; justify-content: center; padding: 16px;
  background: rgba(2,6,23,0.6); backdrop-filter: blur(6px);
}
.hr-root .modal {
  background: #fff; border-radius: 20px;
  box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4);
  display: flex; flex-direction: column; max-height: 88vh;
}
.hr-root .modal-sm { width: 100%; max-width: 500px; }
.hr-root .modal-md { width: 100%; max-width: 680px; }

/* ═══ MODAL TAB BAR ═════════════════════════════════════════════ */
.hr-root .modal-tab {
  padding: 12px 18px; font-size: 12px; font-weight: 600; background: none;
  border: none; border-bottom: 2px solid transparent; color: var(--muted);
  cursor: pointer; font-family: "DM Sans Variable", "DM Sans", "DM Sans Fallback", system-ui, sans-serif; transition: all 0.15s;
}
.hr-root .modal-tab.active { color: var(--accent); border-bottom-color: var(--accent); }

/* ═══ SECTION TAB BUTTONS ═══════════════════════════════════════ */
.hr-root .admin-tab {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px;
  border-radius: 10px; font-size: 12px; font-weight: 600; cursor: pointer;
  border: 1px solid var(--border); background: #fff; color: var(--muted);
  transition: all 0.15s; font-family: "DM Sans Variable", "DM Sans", "DM Sans Fallback", system-ui, sans-serif; text-align: left;
}
.hr-root .admin-tab:hover { border-color: #c7d2fe; color: var(--accent); }
.hr-root .admin-tab.active { background: var(--accent); color: #fff; border-color: var(--accent); box-shadow: 0 4px 12px rgba(79,70,229,0.3); }

/* ═══ ALERTS ════════════════════════════════════════════════════ */
.hr-root .alert { display: flex; align-items: center; gap: 10px; border-radius: 8px; padding: 12px 16px; font-size: 13px; font-weight: 500; border: 1px solid; }
.hr-root .alert-info  { background: var(--accent-light); border-color: #bfdbfe; color: #1d4ed8; }
.hr-root .alert-error { background: var(--err-bg); border-color: var(--err-border); color: #dc2626; }

/* ═══ SEARCH BAR ════════════════════════════════════════════════ */
.hr-root .search-wrap { position: relative; margin-bottom: 24px; }
.hr-root .search-wrap .field-input { padding-left: 40px; }
.hr-root .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }

/* ═══ EMPTY STATE ═══════════════════════════════════════════════ */
.hr-root .empty { padding: 80px 20px; text-align: center; }

/* ═══ ICON SIZING ═══════════════════════════════════════════════
   The toast mounts on document.body, outside the pane, so it needs
   the rule separately. */
.hr-root [data-lucide], .hr-root svg[class*="lucide"],
#hr-toast [data-lucide], #hr-toast svg { display: inline-block; vertical-align: middle; }

/* ═══ TOAST ═════════════════════════════════════════════════════ */
#hr-toast { font-family: "DM Sans Variable", "DM Sans", "DM Sans Fallback", system-ui, sans-serif; }
`;
