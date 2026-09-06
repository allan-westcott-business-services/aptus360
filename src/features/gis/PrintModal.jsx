import { useEffect, useMemo, useState } from "react";
import {
  PAPER, SCALES, sheetMm, groundCovered, printView, drawnBounds, scaleToFit,
  tooBig, mmPerMetre,
} from "./printSheet.js";

/* Printing the drawing to a sheet somebody can measure.

   ── The sheet decides, not the screen ──

   Every other export here follows what is on screen. This one must not:
   a plan is issued at a scale, and "whatever was zoomed to" is not one.
   So the paper size and the scale are chosen, and the drawing is
   rendered to fit them.

   ── Rendered by the canvas, not beside it ──

   The image is produced by the same draw routine the screen uses, given
   a different transform. A second renderer would be a second set of
   rules about what a joint looks like, and the two would drift apart on
   the first change to either.

   ── Printed as an image at an exact size in millimetres ──

   The browser is told the page size and the image is placed at the
   sheet's own dimensions in mm, so at 100% the scale is true. Printed
   "fit to page" it is not, and nothing here can prevent that — which is
   why the sheet carries the scale, the paper size, and a bar to check
   it against. */
export default function PrintModal({ features, onRender, onFrame, onClose }) {
  const [paper, setPaper] = useState("A1");
  const [landscape, setLandscape] = useState(true);
  const [dpi, setDpi] = useState(150);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const bounds = useMemo(() => drawnBounds(features || []), [features]);
  const [scaleDenom, setScaleDenom] = useState(
    () => scaleToFit(drawnBounds(features || []), "A1", true),
  );

  const sheet = sheetMm(paper, landscape);
  const covered = groundCovered(paper, landscape, scaleDenom);

  /* ── The sheet, on the drawing ──

     Reported up as it changes so the canvas can outline it. Two
     questions \u2014 what size and what scale \u2014 whose real answer is a
     rectangle on the ground, and until it was drawn the only way to see
     whether it covered the work was to print it.

     Cleared when this closes, including when it closes because the
     print succeeded: an outline left on the drawing afterwards is a
     line somebody would try to select. */
  useEffect(() => {
    /* Two rectangles, because they are two different edges and the
       difference is the margin. The outer one is the PAPER \u2014 what
       comes out of the printer. The inner is what actually lands on it.
       Drawing only the paper would promise ten millimetres of coverage
       all round that the sheet does not have. */
    const k = mmPerMetre(scaleDenom);
    onFrame?.({
      centre: bounds?.centre ?? [0, 0],
      w: covered.w,
      h: covered.h,
      paperW: sheet.w / k,
      paperH: sheet.h / k,
      paper,
      landscape,
      scaleDenom,
    });
  }, [onFrame, bounds, covered.w, covered.h, sheet.w, sheet.h,
    paper, landscape, scaleDenom]);

  useEffect(() => () => onFrame?.(null), [onFrame]);
  const fits = !bounds || (bounds.w <= covered.w && bounds.h <= covered.h);
  const size = printView({ paper, landscape, scaleDenom, dpi });
  const refuse = tooBig(paper, landscape, dpi);

  async function go() {
    if (refuse) { setErr(refuse); return; }
    setBusy(true);
    setErr("");
    try {
      await onRender({ paper, landscape, scaleDenom, dpi,
        centre: bounds?.centre ?? [0, 0] });
      onClose();
    } catch (e) {
      setErr(e?.message || "The sheet could not be drawn.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fe-backdrop" onClick={onClose}>
      <div className="fe pr-modal" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label="Print the drawing">
        <div className="fe-head">
          <div>
            <h3>Print</h3>
            <p className="hint">To scale, on paper up to A0.</p>
          </div>
          <button className="fe-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="fe-body">
          <div className="fld">
            <span className="fe-lab">Paper</span>
            <div className="pr-row">
              {Object.keys(PAPER).map((k) => (
                <button key={k} className={`btn sm${paper === k ? " accent" : " ghost"}`}
                  onClick={() => setPaper(k)}>{k}</button>
              ))}
            </div>
          </div>

          <div className="fld">
            <span className="fe-lab">Orientation</span>
            <div className="pr-row">
              {[[true, "Landscape"], [false, "Portrait"]].map(([v, label]) => (
                <button key={label}
                  className={`btn sm${landscape === v ? " accent" : " ghost"}`}
                  onClick={() => setLandscape(v)}>{label}</button>
              ))}
            </div>
          </div>

          <div className="fld">
            <span className="fe-lab">Scale</span>
            <div className="pr-row">
              {SCALES.map((n) => (
                <button key={n} className={`btn sm${scaleDenom === n ? " accent" : " ghost"}`}
                  onClick={() => setScaleDenom(n)}>1:{n}</button>
              ))}
              {/* What the drawing needs, so the choice is informed
                  rather than found by trying each one. */}
              {bounds && (
                <button className="btn sm ghost"
                  title="The smallest standard scale the whole drawing fits at"
                  onClick={() => setScaleDenom(scaleToFit(bounds, paper, landscape))}>
                  Fit &mdash; 1:{scaleToFit(bounds, paper, landscape)}
                </button>
              )}
            </div>
          </div>

          <div className="fld">
            <span className="fe-lab">Resolution</span>
            <div className="pr-row">
              {[96, 150, 200, 300].map((n) => (
                <button key={n} className={`btn sm${dpi === n ? " accent" : " ghost"}`}
                  disabled={!!tooBig(paper, landscape, n)}
                  title={tooBig(paper, landscape, n) || `${n} dots per inch`}
                  onClick={() => setDpi(n)}>{n} dpi</button>
              ))}
            </div>
          </div>

          {/* ── What this will actually give you ──

              Said before printing rather than found on the sheet. The
              two questions are always the same: does it fit, and how
              big is the file. */}
          <div className="pr-sum">
            <div><strong>{sheet.w} &times; {sheet.h} mm</strong> &middot;{" "}
              1 m = {mmPerMetre(scaleDenom)} mm on paper</div>
            <div>Covers <strong>{covered.w.toFixed(0)} &times; {covered.h.toFixed(0)} m</strong>
              {bounds && (
                <> of a drawing {bounds.w.toFixed(0)} &times; {bounds.h.toFixed(0)} m</>
              )}
            </div>
            <div className="hint">{size.widthPx} &times; {size.heightPx} pixels</div>
            {!fits && (
              <div className="pr-warn">
                The drawing is bigger than this sheet at this scale &mdash; the
                edges will be cut off. Use Fit, a larger sheet, or a smaller
                scale.
              </div>
            )}
            {refuse && <div className="pr-warn">{refuse}</div>}
            {err && <div className="pr-warn">{err}</div>}
          </div>

          {/* The one thing that cannot be enforced from here. */}
          <p className="hint">
            Print at 100% &mdash; not &ldquo;fit to page&rdquo;, which rescales
            the sheet and makes the scale wrong. Check the bar on the sheet
            against a rule.
          </p>
        </div>

        <div className="fe-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn accent" disabled={busy || !!refuse} onClick={go}>
            {busy ? "Drawing\u2026" : "Print"}
          </button>
        </div>
      </div>

      <style>{`
.pr-modal { width: min(560px, 94vw); }
.pr-row { display: flex; gap: 6px; flex-wrap: wrap; }
.pr-sum { margin-top: 12px; padding: 10px 12px; border-radius: 8px;
  background: var(--bg); border: 1px solid var(--line); font-size: 13px;
  display: flex; flex-direction: column; gap: 4px; }
.pr-warn { color: #b91c1c; font-weight: 600; }
      `}</style>
    </div>
  );
}
