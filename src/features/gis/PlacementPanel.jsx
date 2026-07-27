import { useState, useMemo } from "react";
import { bedColour } from "../../lib/bedColours.js";

/* Choosing which plots to place, and tracking progress through them.

   Placing is a sequence, not a single action: pick a range, then click
   the canvas once per plot. This panel is what tells you where you are
   in that sequence — which plot is next, what colour it'll be, and how
   many are left. */
export default function PlacementPanel({
  plots, utilities, queue, current, meterFor, onStart, onCancel, onSkipMeter,
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const unplaced = useMemo(() => plots.filter((p) => !p.placed), [plots]);

  /* Plot numbers are text, so a range means "between these two in the
     order they're listed" rather than arithmetic on the labels. */
  const inRange = useMemo(() => {
    if (!from && !to) return unplaced;
    const idx = (v) => unplaced.findIndex((p) => p.plot_number === v.trim());
    const a = from ? idx(from) : 0;
    const b = to ? idx(to) : unplaced.length - 1;
    if (a < 0 || b < 0) return [];
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    return unplaced.slice(lo, hi + 1);
  }, [unplaced, from, to]);

  const placing = queue.length > 0;

  if (placing) {
    const done = queue.filter((q) => q.done).length;
    return (
      <div className="pp active">
        <style>{CSS}</style>
        <div className="pp-head">
          <span className="pp-title">Placing plots</span>
          <span className="pp-count">{done} of {queue.length}</span>
        </div>

        {meterFor ? (
          <>
            <p className="pp-now">
              Plot <strong>{meterFor.plot.plot_number}</strong> placed. Now the{" "}
              <strong style={{ color: meterFor.utility.colour }}>
                {meterFor.utility.utility}
              </strong>{" "}
              meter.
            </p>
            <div className="pp-meters">
              {meterFor.all.map((u) => (
                <span key={u.layer_key}
                  className={
                    u.layer_key === meterFor.utility.layer_key ? "pm on"
                    : meterFor.placed.includes(u.layer_key) ? "pm done" : "pm"
                  }
                  style={u.layer_key === meterFor.utility.layer_key
                    ? { borderColor: u.colour, color: u.colour } : undefined}>
                  {meterFor.placed.includes(u.layer_key) ? "\u2713 " : ""}{u.utility}
                </span>
              ))}
            </div>
            <button className="pp-skip" onClick={onSkipMeter}>
              Skip this meter
            </button>
          </>
        ) : current ? (
          <>
            <p className="pp-now">
              Click where plot <strong>{current.plot_number}</strong> sits.
            </p>
            <span className="pp-chip" style={{
              background: bedColour(current.bedrooms).bg,
              color: bedColour(current.bedrooms).fg,
            }}>
              {current.config_code || `${current.bedrooms ?? "?"} bed`}
            </span>
          </>
        ) : (
          <p className="pp-now">All placed.</p>
        )}

        <div className="pp-upcoming">
          {queue.filter((q) => !q.done).slice(0, 8).map((q) => (
            <span key={q.plot_id} className="pp-next"
              style={{ background: bedColour(q.bedrooms).bg, color: bedColour(q.bedrooms).fg }}>
              {q.plot_number}
            </span>
          ))}
          {queue.filter((q) => !q.done).length > 8 && (
            <span className="pp-more">+{queue.filter((q) => !q.done).length - 8}</span>
          )}
        </div>

        <button className="pp-cancel" onClick={onCancel}>Stop placing</button>
      </div>
    );
  }

  return (
    <div className="pp">
      <style>{CSS}</style>
      <div className="pp-head">
        <span className="pp-title">Place plots</span>
        <span className="pp-count">{unplaced.length} to place</span>
      </div>

      {unplaced.length === 0 ? (
        <p className="pp-none">
          {plots.length ? "Every plot is on the canvas." : "This project has no plots yet."}
        </p>
      ) : (
        <>
          <div className="pp-range">
            <label>
              From
              <input list="pp-plots" value={from} placeholder={unplaced[0]?.plot_number}
                onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              To
              <input list="pp-plots" value={to}
                placeholder={unplaced[unplaced.length - 1]?.plot_number}
                onChange={(e) => setTo(e.target.value)} />
            </label>
            <datalist id="pp-plots">
              {unplaced.map((p) => <option key={p.plot_id} value={p.plot_number} />)}
            </datalist>
          </div>

          <p className="pp-preview">
            {inRange.length
              ? <>{inRange.length} plot{inRange.length === 1 ? "" : "s"} selected</>
              : <span className="pp-bad">No plots match that range</span>}
          </p>

          <div className="pp-upcoming">
            {inRange.slice(0, 10).map((p) => (
              <span key={p.plot_id} className="pp-next"
                style={{ background: bedColour(p.bedrooms).bg, color: bedColour(p.bedrooms).fg }}>
                {p.plot_number}
              </span>
            ))}
            {inRange.length > 10 && <span className="pp-more">+{inRange.length - 10}</span>}
          </div>

          {utilities.length > 0 && (
            <p className="pp-hint">
              After each plot you&rsquo;ll be asked for its{" "}
              {utilities.map((u) => u.utility.toLowerCase()).join(", ")} meter.
            </p>
          )}

          <button className="btn accent pp-go" disabled={!inRange.length}
            onClick={() => onStart(inRange)}>
            Start placing {inRange.length || ""}
          </button>
        </>
      )}
    </div>
  );
}

const CSS = `
.pp { border: 1px solid var(--border); border-radius: var(--radius); padding: 11px; background: var(--white); }
.pp.active { border-color: var(--accent); background: var(--accent-light); }
.pp-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.pp-title { font-size: 10.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .07em; color: var(--accent); }
.pp-count { font-size: 10.5px; font-weight: 700; background: var(--accent); color: #fff;
  border-radius: 20px; padding: 1px 8px; }
.pp-none { font-size: 11.5px; color: var(--muted); font-style: italic; margin: 0; }
.pp-range { display: flex; gap: 8px; }
.pp-range label { flex: 1; display: flex; flex-direction: column; gap: 3px;
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.pp-range input { font-size: 12px; padding: 5px 7px; }
.pp-preview { font-size: 11.5px; color: var(--muted); margin: 8px 0 6px; }
.pp-bad { color: var(--warn-text); font-weight: 600; }
.pp-upcoming { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 8px; }
.pp-next { font: 700 10px ui-monospace, Menlo, monospace; border-radius: 4px; padding: 2px 6px; }
.pp-more { font-size: 10px; font-weight: 700; color: var(--muted); align-self: center; }
.pp-hint { font-size: 11px; color: var(--muted); margin: 0 0 8px; line-height: 1.45; }
.pp-go { width: 100%; padding: 7px; font-size: 12.5px; }
.pp-now { font-size: 12.5px; margin: 0 0 8px; line-height: 1.45; }
.pp-chip { display: inline-block; font: 700 11px ui-monospace, Menlo, monospace;
  border-radius: 5px; padding: 3px 9px; margin-bottom: 9px; }
.pp-meters { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.pm { font-size: 10.5px; font-weight: 600; border: 1px solid var(--border); background: var(--white);
  border-radius: 5px; padding: 2px 8px; color: var(--muted); }
.pm.on { border-width: 2px; font-weight: 700; }
.pm.done { color: var(--ok-text); border-color: var(--ok-border); background: var(--ok-bg); }
.pp-skip, .pp-cancel { width: 100%; background: var(--white); border: 1px solid var(--border);
  border-radius: 6px; padding: 6px; cursor: pointer; font: 600 11.5px inherit; color: var(--muted); }
.pp-skip { margin-bottom: 6px; }
.pp-cancel:hover { border-color: #ef4444; color: #ef4444; }
`;
