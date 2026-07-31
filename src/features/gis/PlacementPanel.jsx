import { useState, useMemo } from "react";
import { bedColour } from "../../lib/bedColours.js";
import { parsePlotRange, MAX_PLOTS, DIRECTION_NAME } from "./plotRange.js";

/* How many unplaced plots to offer as buttons before the list becomes a
   wall. Past this the range box is the better tool anyway. */
const PICK_LIMIT = 24;

/* Choosing which plots to place, and tracking progress through them.

   Two clicks per plot, as the original: one for the position, one to say
   which side the meters go. The second click is a direction, not a
   position — the meters space themselves 2m out and 1.4m apart. */
export default function PlacementPanel({
  plots, utilities, queue, current, meterFor, onStart, onCancel, onAdd,
}) {
  const [range, setRange] = useState("");

  const unplaced = useMemo(() => plots.filter((p) => !p.placed), [plots]);
  const byNumber = useMemo(() => {
    const m = {};
    plots.forEach((p) => { m[String(p.plot_number)] = p; });
    return m;
  }, [plots]);

  const parsed = useMemo(() => parsePlotRange(range), [range]);

  /* Only plots that exist on the project and aren't already placed. */
  const resolved = useMemo(
    () => parsed.numbers
      .map((n) => byNumber[n])
      .filter((p) => p && !p.placed),
    [parsed.numbers, byNumber]
  );
  const missing = parsed.numbers.filter((n) => !byNumber[n]);
  const already = parsed.numbers.filter((n) => byNumber[n]?.placed);

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

        {current ? (
          meterFor ? (
            <>
              <p className="pp-now">
                Plot <strong>{current.plot_number}</strong> placed. Now click where its{" "}
                <strong style={{ color: meterFor.utility.colour }}>
                  {meterFor.utility.utility.toLowerCase()}
                </strong>{" "}
                meter sits.
              </p>
              <div className="pp-meters">
                {meterFor.all.map((u) => {
                  const done = meterFor.placed.includes(u.layer_key);
                  const now = u.layer_key === meterFor.utility.layer_key;
                  return (
                    <span key={u.layer_key} className={now ? "pm on" : done ? "pm done" : "pm"}
                      style={now ? { borderColor: u.colour, color: u.colour } : undefined}>
                      {done ? "\u2713 " : ""}{u.utility}
                    </span>
                  );
                })}
              </div>
            </>
          ) : (
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
          )
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

        <button className="pp-cancel" onClick={onCancel}>Stop placing &middot; Esc</button>
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

      <button className="btn accent pp-go" onClick={onAdd}>&#8853; Add plots by range</button>

      {plots.length === 0 ? (
        <p className="pp-none pp-gap">
          No plots came back for this project. If it has plots, the list failed to load
          &mdash; check the browser console.
        </p>
      ) : unplaced.length === 0 ? (
        <p className="pp-none pp-gap">Every plot is on the canvas.</p>
      ) : (
        <>
          <p className="pp-or">or place existing plots</p>

          {/* Click one to place it. Typing a single number in the box
              below has always worked, but the field is labelled "range"
              with a range in the placeholder, so nothing said so — and
              re-placing one plot after deleting its seed is the commonest
              reason to be here at all. */}
          <label className="pp-label">Pick one</label>
          <div className="pp-pick">
            {unplaced.slice(0, PICK_LIMIT).map((p) => (
              <button key={p.plot_id} className="pp-one" onClick={() => onStart([p])}
                title={`Place plot ${p.plot_number}`}
                style={{ background: bedColour(p.bedrooms).bg, color: bedColour(p.bedrooms).fg }}>
                {p.plot_number}
              </button>
            ))}
            {unplaced.length > PICK_LIMIT && (
              <span className="pp-more">
                +{unplaced.length - PICK_LIMIT} more &mdash; use the box below
              </span>
            )}
          </div>

          <label className="pp-label" htmlFor="pp-range">Or several at once</label>
          <input id="pp-range" className="pp-input" value={range}
            placeholder="1-50  or  1,2,5-10,22-30"
            onChange={(e) => setRange(e.target.value)} />
          <p className="pp-fine">
            Numbers separated by commas, hyphens for ranges. Up to {MAX_PLOTS} at once.
          </p>

          {range.trim() && (
            <p className="pp-preview">
              {resolved.length
                ? <>{resolved.length} plot{resolved.length === 1 ? "" : "s"} ready</>
                : <span className="pp-bad">Nothing to place from that range</span>}
              {already.length > 0 && (
                <span className="pp-note"> &middot; {already.length} already placed</span>
              )}
              {missing.length > 0 && (
                <span className="pp-note"> &middot; {missing.length} not on this project</span>
              )}
              {parsed.bad.length > 0 && (
                <span className="pp-bad"> &middot; couldn&rsquo;t read {parsed.bad.join(", ")}</span>
              )}
            </p>
          )}

          <div className="pp-upcoming">
            {resolved.slice(0, 10).map((p) => (
              <span key={p.plot_id} className="pp-next"
                style={{ background: bedColour(p.bedrooms).bg, color: bedColour(p.bedrooms).fg }}>
                {p.plot_number}
              </span>
            ))}
            {resolved.length > 10 && <span className="pp-more">+{resolved.length - 10}</span>}
          </div>

          {utilities.length > 0 && (
            <p className="pp-hint">
              Two clicks each: where the plot sits, then which side its{" "}
              {utilities.map((u) => u.utility.toLowerCase()).join(", ")} meters go.
            </p>
          )}

          <button className="btn accent pp-go" disabled={!resolved.length}
            onClick={() => onStart(resolved)}>
            Start placing {resolved.length || ""}
          </button>
        </>
      )}
    </div>
  );
}

const CSS = `
.pp { border: 1px solid var(--border); border-radius: var(--radius); padding: 11px; background: var(--white); }
.pp.active { border-color: var(--accent); background: var(--accent-light); }
/* Stacked, not side by side. The panel is 200px wide and "88 to place"
   is a pill that mustn't wrap — putting the label above it gives the
   count the whole width and keeps it on one line. */
.pp-head { display: flex; flex-direction: column; align-items: flex-start; gap: 5px;
  margin-bottom: 8px; }
.pp-title { font-size: 10.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .07em; color: var(--accent); }
.pp-count { font-size: 10.5px; font-weight: 700; background: var(--accent); color: #fff;
  border-radius: 20px; padding: 1px 8px; white-space: nowrap; }
.pp-none { font-size: 11.5px; color: var(--muted); font-style: italic; margin: 0; }
.pp-label { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: var(--muted); margin-bottom: 3px; }
.pp-pick { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 10px; max-height: 132px;
  overflow-y: auto; }
.pp-one { border: none; border-radius: 5px; cursor: pointer; font: 700 11px inherit;
  padding: 4px 8px; }
.pp-one:hover { outline: 2px solid var(--accent); outline-offset: 1px; }
.pp-input { width: 100%; font: 600 13px inherit; padding: 6px 8px; }
.pp-fine { font-size: 10.5px; color: var(--muted); margin: 4px 0 8px; line-height: 1.4; }
.pp-preview { font-size: 11.5px; color: var(--muted); margin: 0 0 6px; line-height: 1.45; }
.pp-note { color: var(--muted); }
.pp-bad { color: var(--warn-text); font-weight: 600; }
.pp-upcoming { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 8px; }
.pp-next { font: 700 10px ui-monospace, Menlo, monospace; border-radius: 4px; padding: 2px 6px; }
.pp-more { font-size: 10px; font-weight: 700; color: var(--muted); align-self: center; }
.pp-hint { font-size: 11px; color: var(--muted); margin: 0 0 8px; line-height: 1.45; }
.pp-go { width: 100%; padding: 7px; font-size: 12.5px; }
.pp-gap { margin-top: 9px; }
.pp-or { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
  color: var(--muted); margin: 12px 0 6px; text-align: center; }
.pp-now { font-size: 12.5px; margin: 0 0 8px; line-height: 1.45; }
.pp-sub { font-size: 11px; color: var(--muted); margin: 0 0 8px; }
.pp-chip { display: inline-block; font: 700 11px ui-monospace, Menlo, monospace;
  border-radius: 5px; padding: 3px 9px; margin-bottom: 9px; }
.pp-meters { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.pm { font-size: 10.5px; font-weight: 600; border: 1px solid var(--border); background: var(--white);
  border-radius: 5px; padding: 2px 8px; color: var(--muted); }
.pm.on { border-width: 2px; font-weight: 700; }
.pm.done { color: var(--ok-text); border-color: var(--ok-border); background: var(--ok-bg); }
.pp-cancel { width: 100%; background: var(--white); border: 1px solid var(--border);
  border-radius: 6px; padding: 6px; cursor: pointer; font: 600 11.5px inherit; color: var(--muted); }
.pp-cancel:hover { border-color: #ef4444; color: #ef4444; }
`;
