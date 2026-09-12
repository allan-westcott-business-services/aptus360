import { useEffect, useMemo, useState } from "react";
import { useDragHandle } from "../../lib/useDragHandle.js";
import { drawnBounds, SCALES, mmPerMetre } from "./printSheet.js";
import {
  paperOptions, tilePlan, DEFAULT_MARGIN_MM, DEFAULT_OVERLAP_MM,
} from "./printTiles.js";

/* Choosing what to print the drawing on.

   ── The question this dialogue exists to answer ──

   Not "which paper is this" but "what do I print this on to get it
   onto the fewest sheets". That cannot be answered by eye, so every
   paper size is costed at the chosen scale and listed with its sheet
   count, and the one being considered is drawn on the drawing behind.

   ── Two margins, and they are different things ──

   The BORDER is what the printer cannot print into: a fact about the
   machine, 5 mm on most desktop printers and less on a plotter. The
   OVERLAP is how much ground neighbouring sheets share: a decision
   about how they will be joined. Confusing them gives either a white
   line down every seam or 5 mm of drawing missing at each one, so they
   are asked separately and named for what they are.

   ── It saves a PDF; it does not print ──

   The browser's own print of a canvas was a picture of the drawing at
   whatever resolution the screen happened to be. A PDF is the drawing:
   vector, to scale, with the basemap embedded as vector too. Printing
   is then the PDF viewer's job, where the tray and the copies live
   anyway. */

export default function PrintModal({
  features, basemap, onSave, onPrint, onFrame, onClose,
}) {
  const drag = useDragHandle();
  const bounds = useMemo(() => drawnBounds(features || []), [features]);

  const [scaleDenom, setScaleDenom] = useState(500);
  /* ── Opened on the answer, not on a guess ──

     This opened on A1 landscape whatever was drawn, which for an
     ordinary site is one sheet with an eighth of the paper used. The
     dialogue exists to find the cheapest sheet, so it starts on the
     cheapest sheet and the list explains why.

     Computed once, at mount. Changing the scale afterwards re-costs
     every option but does not move the selection: a designer who has
     picked A0 deliberately should not have it taken away for being
     wasteful. */
  const [pick, setPick] = useState(() => {
    const b = drawnBounds(features || []);
    const best = b ? paperOptions({ bounds: b, scaleDenom: 500 })[0] : null;
    return { paper: best?.paper ?? "A1", landscape: best?.landscape ?? true };
  });
  const paper = pick.paper;
  const landscape = pick.landscape;
  const setPaper = (v) => setPick((p) => ({ ...p, paper: v }));
  const setLandscape = (v) => setPick((p) => ({ ...p, landscape: v }));
  const [marginMm, setMarginMm] = useState(DEFAULT_MARGIN_MM);
  const [overlapMm, setOverlapMm] = useState(DEFAULT_OVERLAP_MM);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  /* Every size at this scale, cheapest first. Recomputed as the scale
     or either margin changes, because all three move the answer. */
  const options = useMemo(() => (bounds
    ? paperOptions({ bounds, scaleDenom, marginMm, overlapMm })
    : []), [bounds, scaleDenom, marginMm, overlapMm]);

  const plan = useMemo(() => (bounds
    ? tilePlan({ bounds, paper, landscape, scaleDenom, marginMm, overlapMm })
    : null), [bounds, paper, landscape, scaleDenom, marginMm, overlapMm]);

  /* ── The sheets, on the drawing ──

     Reported up so the canvas can outline them. Until they were drawn,
     the only way to see whether a sheet covered the work was to print
     it.

     Cleared when this closes, including when it closes because the
     save succeeded: an outline left behind is a line somebody would
     try to select. */
  useEffect(() => {
    if (!plan) { onFrame?.(null); return; }
    const k = mmPerMetre(plan.scaleDenom);
    onFrame?.({
      tiles: plan.tiles.map((t) => ({
        centre: t.centre,
        w: plan.printW / k,
        h: plan.printH / k,
        n: t.sheet,
      })),
      centre: plan.tiles[0]?.centre ?? bounds?.centre ?? [0, 0],
      w: plan.printW / k,
      h: plan.printH / k,
      paperW: plan.sheetW / k,
      paperH: plan.sheetH / k,
      paper: plan.paper,
      landscape: plan.landscape,
      scaleDenom: plan.scaleDenom,
    });
  }, [onFrame, plan, bounds]);

  useEffect(() => () => onFrame?.(null), [onFrame]);

  const run = async (what) => {
    if (!plan) return;
    setBusy(what);
    setErr("");
    try {
      const out = what === "save"
        ? await onSave(plan)
        : await onPrint(plan);
      /* Said rather than found later: a sheet issued without its plan
         is a sheet somebody has to be told about twice. */
      if (out?.missingBasemap) {
        setErr("The sheets were made, but the basemap could not be placed \u2014 "
          + "check it has a scale set in Basemap Setup.");
      } else {
        onClose();
      }
    } catch (e) {
      setErr(e?.message || "The PDF could not be made.");
    } finally {
      setBusy("");
    }
  };

  if (!bounds) {
    return (
      <div className="fe-backdrop" onClick={onClose}>
        <div className="fe" onClick={(e) => e.stopPropagation()}>
          <div className="fe-head"><div><h3>Print to scale</h3></div></div>
          <div className="fe-body">
            <p className="hint">Nothing is drawn yet, so there is nothing to print.</p>
          </div>
          <div className="fe-foot">
            <span className="fe-spacer" />
            <button className="btn ghost" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fe-backdrop" onClick={onClose}>
      <div className="fe fe-print" onClick={(e) => e.stopPropagation()}
        style={drag.panelStyle} role="dialog" aria-label="Print to scale">
        <style>{CSS}</style>
        <div className="fe-head" {...drag.handleProps}>
          <div>
            <h3>Print to scale</h3>
            <p className="fe-id">
              {bounds.w.toFixed(0)} &times; {bounds.h.toFixed(0)} m drawn
            </p>
          </div>
          <button className="fe-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="fe-body">
          <div className="fe-row">
            <div className="fld">
              <label htmlFor="pr-scale">Scale</label>
              <select id="pr-scale" value={scaleDenom}
                onChange={(e) => setScaleDenom(Number(e.target.value))}>
                {SCALES.map((s) => <option key={s} value={s}>1:{s}</option>)}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="pr-border">Printer border (mm)</label>
              <input id="pr-border" type="number" min="0" max="25" step="1"
                value={marginMm}
                onChange={(e) => setMarginMm(Number(e.target.value) || 0)} />
              <p className="hint">What your printer cannot print into.</p>
            </div>
            <div className="fld">
              <label htmlFor="pr-lap">Sheet overlap (mm)</label>
              <input id="pr-lap" type="number" min="0" max="50" step="1"
                value={overlapMm}
                onChange={(e) => setOverlapMm(Number(e.target.value) || 0)} />
              <p className="hint">Ground shared by neighbouring sheets, to trim to.</p>
            </div>
          </div>

          {/* ── Every size, costed ──

              The list IS the decision. Sorted by sheet count, so the
              cheapest answer is the first row, and the one in force is
              highlighted on the drawing behind. */}
          <div className="pr-h">At 1:{scaleDenom}</div>
          <div className="pr-list">
            {options.map((o) => {
              const on = o.paper === paper && o.landscape === landscape;
              return (
                <button type="button" key={`${o.paper}${o.landscape}`}
                  className={on ? "pr-opt on" : "pr-opt"}
                  onClick={() => setPick({ paper: o.paper, landscape: o.landscape })}>
                  <span className="pr-name">
                    {o.paper} {o.landscape ? "landscape" : "portrait"}
                  </span>
                  <span className="pr-sheets">
                    {o.sheets} sheet{o.sheets === 1 ? "" : "s"}
                    {o.sheets > 1 && <em> {o.cols}&times;{o.rows}</em>}
                  </span>
                  <span className="pr-use">{Math.round(o.coverage * 100)}% used</span>
                </button>
              );
            })}
          </div>

          {plan && (
            <p className="hint">
              {plan.sheets === 1
                ? `One ${plan.paper} sheet covers the drawing at 1:${plan.scaleDenom}.`
                : `${plan.sheets} sheets, ${plan.cols} across and ${plan.rows} down, `
                  + `each sharing ${plan.overlapMm} mm with its neighbours.`}
              {" "}The grid is drawn on the plan behind this.
            </p>
          )}

          {!basemap && (
            <p className="hint">
              No basemap is set, so the sheets carry the design alone.
            </p>
          )}

          {err && <p className="fe-err">{err}</p>}
        </div>

        <div className="fe-foot">
          <button className="btn ghost" disabled={!!busy} onClick={() => run("save")}>
            {busy === "save" ? "Saving\u2026" : "Save PDF"}
          </button>
          <span className="fe-spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn accent" disabled={!!busy} onClick={() => run("print")}>
            {busy === "print" ? "Preparing\u2026" : "Print"}
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.fe.fe-print { width: min(560px, 94vw); }
.pr-h { font: 700 10.5px inherit; letter-spacing: .06em; text-transform: uppercase;
  color: var(--muted); margin: 4px 0 2px; }
.pr-list { display: grid; gap: 4px; max-height: 230px; overflow-y: auto; }
.pr-opt { display: grid; grid-template-columns: 1fr auto auto; gap: 10px;
  align-items: center; text-align: left; padding: 7px 10px; border-radius: 8px;
  border: 1.5px solid var(--border); background: #fff; cursor: pointer;
  font: inherit; font-size: 12.5px; }
.pr-opt:hover { border-color: #94a3b8; }
.pr-opt.on { border-color: var(--accent); background: #eef2ff; }
.pr-name { font-weight: 600; }
.pr-sheets { font-weight: 700; }
.pr-sheets em { font-style: normal; font-weight: 500; color: var(--muted); }
.pr-use { color: var(--muted); font-size: 11px; min-width: 62px; text-align: right; }
`;
