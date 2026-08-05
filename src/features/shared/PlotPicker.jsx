import { useState, useMemo } from "react";
import {
  parseIds, serialiseIds, plotChoices, toggleChoice,
  rangeBetween, rangeNote, selectAll, NONE,
} from "../poc/interimPlots.js";

/* Choosing plots from a grid of chips.

   The same question comes up on an interim POC application and on a
   call-off — which of these plots does this cover — so it is the same
   panel rather than two that drift apart.

   The rules live in interimPlots.js and are shared too: a plot claimed
   elsewhere, a cap on how many, picking a run by its ends. Those are the
   parts worth getting right once.

   Kept as a controlled component: it holds no selection of its own, only
   the range-picking state, which is a gesture rather than data. */

export default function PlotPicker({
  plots = [],
  /* Comma-separated ids, as stored. Not an array, because that is the
     shape both callers keep it in and converting at the edges twice
     would be two places to get it wrong. */
  value = "",
  onChange,
  /* Plot ids that cannot be chosen, mapped to why. */
  claimed = new Map(),
  /* The most that may be chosen, or 0 for no limit. */
  target = 0,
  label = "Plots",
  /* What each chip shows: plot number by default. */
  labelOf = (p) => p.Plot_Number ?? p.plot_number ?? p.Plot_ID ?? p.plot_id,
  idOf = (p) => Number(p.Plot_ID ?? p.plot_id),
  note = null,
}) {
  const selected = useMemo(() => parseIds(value), [value]);
  const [rangeOn, setRangeOn] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const [said, setSaid] = useState("");

  /* Shaped so plotChoices and the range helpers, which key on Plot_ID,
     work whatever the caller's rows look like. */
  const rows = useMemo(
    () => plots.map((p) => ({ ...p, Plot_ID: idOf(p), __label: labelOf(p) })),
    [plots, idOf, labelOf],
  );

  const write = (ids) => onChange?.(serialiseIds(ids) || NONE);

  const click = (id) => {
    if (rangeOn) {
      if (anchor == null) {
        setAnchor(id);
        write(toggleChoice(selected, id, { claimed, target }));
        return;
      }
      const r = rangeBetween(rows, anchor, id, { claimed, selected, target });
      write(r.ids);
      setRangeOn(false);
      setAnchor(null);
      setSaid(r.refused
        ? `${r.added} added, ${r.refused} skipped.`
        : `${r.added} added.`);
      return;
    }
    write(toggleChoice(selected, id, { claimed, target }));
  };

  return (
    <div className="pp">
      <style>{CSS}</style>

      <div className="pp-head">
        <strong>{label}</strong>
        <span className="pp-count">
          {target
            ? `${selected.length} of ${target} chosen`
            : `${selected.length} chosen`}
        </span>
        {rows.length > 1 && (
          <span className="pp-btns">
            {/* Deselect first, at the far end from Select all — the two
                adjacent is how the destructive one gets pressed. */}
            <button type="button" className="pp-b" disabled={!selected.length}
              onClick={() => { write([]); setRangeOn(false); setAnchor(null); }}>
              Deselect all
            </button>
            <button type="button" className="pp-b"
              onClick={() => {
                const r = selectAll(rows, { claimed, target });
                write(r.ids);
                setRangeOn(false);
                setAnchor(null);
                setSaid(r.left
                  ? `${r.ids.length} chosen, ${r.left} more than allowed.`
                  : `${r.ids.length} chosen.`);
              }}>
              Select all
            </button>
            <button type="button" className={rangeOn ? "pp-b on" : "pp-b"}
              onClick={() => { setRangeOn(!rangeOn); setAnchor(null); }}>
              {rangeOn ? "Cancel range" : "Select range"}
            </button>
          </span>
        )}
      </div>

      {/* Always rendered, so the grid does not move when range mode is
          turned on — the first click of a range would otherwise land on
          a chip that had just slid under the cursor. */}
      <p className={rangeOn ? "pp-note on" : "pp-note"}>
        {rangeOn ? rangeNote(anchor, rows) : (said || note
          || "Click plots to choose them, or use Select range for a run.")}
      </p>

      {!rows.length ? (
        <p className="pp-empty">No plots on this project yet.</p>
      ) : (
        <div className="pp-grid">
          {plotChoices(rows, selected, {
            claimed,
            /* The cap does not lock chips while a range is being picked:
               the far end is often past it, and the range trims itself
               afterwards. */
            target: rangeOn ? 0 : target,
          }).map((c) => (
            <button key={c.id} type="button"
              className={[
                "pp-chip",
                c.chosen ? "on" : "",
                c.locked ? "off" : "",
                anchor != null && Number(anchor) === c.id ? "anchor" : "",
              ].filter(Boolean).join(" ")}
              disabled={c.locked}
              title={anchor != null && Number(anchor) === c.id
                ? "First of the range \u2014 click the last"
                : (c.why || String(c.plot.__label))}
              onClick={() => click(c.id)}>
              {c.plot.__label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const CSS = `
.pp-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.pp-head strong { font-size: 12.5px; }
.pp-count { color: var(--muted); font: 600 11.5px inherit; }
.pp-btns { margin-left: auto; display: inline-flex; gap: 5px; }
.pp-b { background: var(--white); border: 1px solid var(--border); border-radius: 5px;
  cursor: pointer; font: 600 10.5px inherit; padding: 2px 9px; color: var(--accent); }
.pp-b:disabled { opacity: .45; cursor: not-allowed; }
.pp-b.on { background: #d97706; border-color: #d97706; color: #fff; }
/* One fixed row whether a range is being picked or not — only the
   colour changes, never the height. */
.pp-note { display: block; height: 16px; line-height: 16px; margin: 0 0 6px;
  overflow: hidden; font-size: 11px; color: var(--muted); }
.pp-note.on { color: #92400e; font-weight: 600; }
.pp-empty { font-size: 12px; color: var(--muted); margin: 8px 0; }
.pp-grid { display: flex; flex-wrap: wrap; gap: 4px; max-height: 220px;
  overflow-y: auto; padding: 6px; border: 1px solid var(--border);
  border-radius: 7px; background: var(--white); }
.pp-chip { min-width: 38px; padding: 4px 7px; border: 1.5px solid var(--border);
  border-radius: 5px; background: var(--white); cursor: pointer;
  font: 600 11.5px inherit; color: var(--text); }
.pp-chip:hover:not(:disabled) { border-color: var(--accent); }
.pp-chip.on { border-color: var(--accent); background: #eff6ff; color: var(--accent); }
/* Locked chips are dimmed rather than hidden: a plot missing from the
   grid looks like a plot missing from the project. */
.pp-chip.off { border-color: #fecaca; background: #fef2f2; color: #b91c1c;
  cursor: not-allowed; opacity: .7; }
.pp-chip.anchor { border-color: #d97706; background: #fffbeb; color: #92400e; }
`;
