import { useState, useRef, useEffect } from "react";
import Banner from "../../components/Banner.jsx";
import { getBasemap, saveBasemap, removeBasemap, uploadBasemap, readImageSize } from "../../api/basemap.js";
import { pdfPageCount } from "./pdfToImage.js";
import CalibrationView from "./CalibrationView.jsx";

/* Getting the canvas ready to draw on.

   Four steps in order, because each depends on the last: import the
   plan, calibrate it against a known distance, tie it to the grid, then
   place it. Calibration comes before everything because until the
   drawing knows how long a metre is, nothing measured on it means
   anything. */

const STEPS = [
  { id: "import",  label: "Import plan" },
  { id: "scale",   label: "Calibrate scale" },
  { id: "ref",     label: "Reference point" },
  { id: "place",   label: "Position" },
];

export default function BasemapSetup({ projectId, project, basemap, onChange, onClose }) {
  const [step, setStep] = useState(basemap ? "scale" : "import");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const fileRef = useRef(null);
  const [pendingPdf, setPendingPdf] = useState(null);   // { file, pages }
  const [pdfPage, setPdfPage] = useState(1);

  // calibration
  const [calPts, setCalPts] = useState([]);
  const [calDist, setCalDist] = useState("");
  const [statedScale, setStatedScale] = useState(basemap?.Stated_Scale || "");

  // reference
  const [refE, setRefE] = useState(basemap?.Ref_Easting ?? project?.Eastings ?? "");
  const [refN, setRefN] = useState(basemap?.Ref_Northing ?? project?.Northings ?? "");
  const [refPt, setRefPt] = useState(
    basemap?.Ref_Canvas_X != null ? [basemap.Ref_Canvas_X, basemap.Ref_Canvas_Y] : null
  );

  useEffect(() => {
    if (basemap?.Cal_Point_A && basemap?.Cal_Point_B) {
      setCalPts([basemap.Cal_Point_A, basemap.Cal_Point_B]);
      setCalDist(String(basemap.Cal_Distance_M ?? ""));
    }
  }, [basemap]);

  const mpp = basemap?.Metres_Per_Pixel;

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 60 * 1024 * 1024) {
      return setError("That file is over 60MB — larger than this can handle.");
    }
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);

    /* A drawing set often has the site plan on a later page, so ask
       rather than silently taking page 1. */
    if (isPdf) {
      setError("");
      try {
        const pages = await pdfPageCount(file);
        if (pages > 1) { setPendingPdf({ file, pages }); setPdfPage(1); return; }
      } catch { /* fall through and let the render report the problem */ }
    }
    await ingest(file, 1);
  }

  async function ingest(file, page) {
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    setBusy(true); setError(""); setProgress(0);
    try {
      const size = isPdf ? null : await readImageSize(file);
      const { url, path, size: pdfSize } = await uploadBasemap(projectId, file, setProgress, page);
      const dims = pdfSize || size;
      const saved = await saveBasemap(projectId, {
        File_Name: file.name, Storage_Path: path, Image_Url: url,
        Image_Width: dims.width, Image_Height: dims.height,
        Opacity: 0.6,
      });
      setPendingPdf(null);
      onChange(saved);
      setStep("scale");
      setStatus(`${file.name} imported at ${dims.width}×${dims.height}px${
        isPdf ? ` (page ${page})` : ""}`);
      setTimeout(() => setStatus(""), 4000);
    } catch (e2) {
      setError(e2.message);
    } finally { setBusy(false); setProgress(0); }
  }

  const calPx = calPts.length === 2
    ? Math.hypot(calPts[1][0] - calPts[0][0], calPts[1][1] - calPts[0][1])
    : 0;
  const derivedMpp = calPx && Number(calDist) ? Number(calDist) / calPx : null;
  const impliedScale = derivedMpp ? Math.round(derivedMpp * 1000) : null;

  async function saveScale() {
    if (!derivedMpp) return setError("Place two points and enter the distance between them.");
    setBusy(true);
    try {
      const saved = await saveBasemap(projectId, {
        Metres_Per_Pixel: derivedMpp,
        Cal_Point_A: calPts[0], Cal_Point_B: calPts[1],
        Cal_Distance_M: Number(calDist),
        Stated_Scale: statedScale || null,
      });
      onChange(saved);
      setStep("ref");
      setStatus(`Calibrated: 1 pixel = ${derivedMpp.toFixed(4)} m (about 1:${impliedScale})`);
      setTimeout(() => setStatus(""), 5000);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function saveRef() {
    if (!refPt) return setError("Click the plan to mark the point you know the coordinates of.");
    if (refE === "" || refN === "") return setError("Enter the easting and northing for that point.");
    setBusy(true);
    try {
      const saved = await saveBasemap(projectId, {
        Ref_Canvas_X: refPt[0], Ref_Canvas_Y: refPt[1],
        Ref_Easting: Number(refE), Ref_Northing: Number(refN),
      });
      onChange(saved);
      setStep("place");
      setStatus("Reference point set — the canvas can now report grid coordinates");
      setTimeout(() => setStatus(""), 4000);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function savePlacement(changes) {
    try {
      const saved = await saveBasemap(projectId, changes);
      onChange(saved);
    } catch (e) { setError(e.message); }
  }

  async function discard() {
    if (!window.confirm("Remove the background plan? Anything drawn on the canvas stays.")) return;
    setBusy(true);
    try {
      await removeBasemap(projectId);
      onChange(null);
      setStep("import");
      setCalPts([]); setCalDist("");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const done = {
    import: !!basemap,
    scale: !!mpp,
    ref: basemap?.Ref_Easting != null,
    place: !!basemap,
  };

  return (
    <div className="bs-backdrop" onClick={onClose}>
      <div className="bs" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Background plan setup">
        <style>{CSS}</style>

        <div className="bs-head">
          <div>
            <h3>Background plan</h3>
            <p className="bs-sub">Set the drawing up before placing plots or trenches.</p>
          </div>
          <button className="bs-x" onClick={onClose} aria-label="Close">&#10005;</button>
        </div>

        <div className="bs-steps">
          {STEPS.map((s, i) => (
            <button key={s.id}
              className={[
                "bs-step",
                step === s.id ? "on" : "",
                done[s.id] ? "done" : "",
                i > 0 && !done[STEPS[i - 1].id] ? "locked" : "",
              ].filter(Boolean).join(" ")}
              disabled={i > 0 && !done[STEPS[i - 1].id]}
              onClick={() => setStep(s.id)}>
              <span className="bs-num">{done[s.id] ? "\u2713" : i + 1}</span>
              {s.label}
            </button>
          ))}
        </div>

        <div className="bs-body">
          {error && <Banner kind="error">{error}</Banner>}
          {status && <Banner kind="ok">{status}</Banner>}

          {step === "import" && (
            <div className="bs-import">
              <p className="bs-hint">
                A site plan as PDF, PNG or JPEG. PDFs are rendered here in the browser
                at high resolution &mdash; a vector drawing comes out crisp, so import
                the original rather than a screenshot of it.
              </p>
              <input ref={fileRef} type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                onChange={onFile} disabled={busy} />

              {pendingPdf && (
                <div className="bs-pdf">
                  <p>
                    <strong>{pendingPdf.file.name}</strong> has {pendingPdf.pages} pages.
                    Which one is the site plan?
                  </p>
                  <div className="bs-pdf-row">
                    <input type="number" min="1" max={pendingPdf.pages} value={pdfPage}
                      aria-label="Page number"
                      onChange={(e) => setPdfPage(Number(e.target.value))} />
                    <button className="btn accent" disabled={busy}
                      onClick={() => ingest(pendingPdf.file, pdfPage)}>
                      Import page {pdfPage}
                    </button>
                    <button className="btn ghost" onClick={() => setPendingPdf(null)}>Cancel</button>
                  </div>
                </div>
              )}
              {busy && (
                <div className="bs-progress"><span style={{ width: `${progress}%` }} /></div>
              )}
              {basemap && (
                <div className="bs-current">
                  <img src={basemap.Image_Url} alt="" />
                  <div>
                    <strong>{basemap.File_Name || "Plan"}</strong>
                    <span>{basemap.Image_Width}×{basemap.Image_Height}px</span>
                  </div>
                  <button className="btn ghost danger" onClick={discard} disabled={busy}>Remove</button>
                </div>
              )}
            </div>
          )}

          {step === "scale" && basemap && (
            <>
              <p className="bs-hint">
                Click two points a known distance apart &mdash; a scale bar, a plot
                frontage, anything dimensioned &mdash; then type that distance. Zoom in
                first: every measurement on the site inherits this one, so it&rsquo;s worth
                placing the points on the exact pixel.
              </p>
              <CalibrationView
                src={basemap.Image_Url}
                imageWidth={basemap.Image_Width}
                imageHeight={basemap.Image_Height}
                points={calPts}
                onPlace={(pt) => setCalPts((p) => (p.length >= 2 ? [pt] : [...p, pt]))}
              />
              <div className="bs-row">
                <div className="fld w-sm">
                  <label htmlFor="bs-dist">Distance between them</label>
                  <div className="bs-unit">
                    <input id="bs-dist" type="number" step="0.01" value={calDist}
                      onChange={(e) => setCalDist(e.target.value)} />
                    <span>m</span>
                  </div>
                </div>
                <div className="fld w-sm">
                  <label htmlFor="bs-stated">Stated scale</label>
                  <input id="bs-stated" value={statedScale} placeholder="1:500"
                    onChange={(e) => setStatedScale(e.target.value)} />
                  <p className="hint">For reference</p>
                </div>
                <div className="bs-result">
                  {derivedMpp ? (
                    <>
                      <strong>1 px = {derivedMpp.toFixed(4)} m</strong>
                      <span>roughly 1:{impliedScale} &middot; measured over {Math.round(calPx)} px</span>
                      {calPx > 0 && calPx < 120 && (
                        <span className="bs-warn">
                          Short baseline &mdash; 1px of error here is about{" "}
                          {((1 / calPx) * 100).toFixed(1)}% across the whole drawing.
                          Zoom in, or measure a longer known distance.
                        </span>
                      )}
                      {calPx >= 400 && (
                        <span className="bs-good">
                          Good baseline &mdash; error stays under {(100 / calPx).toFixed(2)}%
                        </span>
                      )}
                      {statedScale && impliedScale &&
                        Math.abs(impliedScale - Number(statedScale.replace(/[^0-9]/g, ""))) >
                          Number(statedScale.replace(/[^0-9]/g, "")) * 0.05 && (
                        <span className="bs-warn">
                          Doesn&rsquo;t match the stated {statedScale} &mdash; worth re-checking
                        </span>
                      )}
                    </>
                  ) : <span className="bs-await">
                        {calPts.length}/2 points placed
                      </span>}
                </div>
                <button className="btn accent" disabled={busy || !derivedMpp} onClick={saveScale}>
                  Save scale
                </button>
              </div>
            </>
          )}

          {step === "ref" && basemap && (
            <>
              <p className="bs-hint">
                Click a point whose grid reference you know &mdash; a site corner, a
                benchmark, the POC &mdash; and enter its coordinates. One tie point is
                enough, since the plan is already true to scale and north.
              </p>
              <CalibrationView
                src={basemap.Image_Url}
                imageWidth={basemap.Image_Width}
                imageHeight={basemap.Image_Height}
                mode="one"
                points={refPt && mpp ? [[refPt[0] / mpp, refPt[1] / mpp]] : []}
                onPlace={(pt) => setRefPt([
                  +(pt[0] * (mpp || 1)).toFixed(2),
                  +(pt[1] * (mpp || 1)).toFixed(2),
                ])}
              />
              <div className="bs-row">
                <div className="fld w-sm">
                  <label htmlFor="bs-e">Easting</label>
                  <input id="bs-e" className="mono" type="number" value={refE}
                    onChange={(e) => setRefE(e.target.value)} />
                </div>
                <div className="fld w-sm">
                  <label htmlFor="bs-n">Northing</label>
                  <input id="bs-n" className="mono" type="number" value={refN}
                    onChange={(e) => setRefN(e.target.value)} />
                </div>
                <div className="bs-result">
                  {refPt
                    ? <><strong>Canvas {refPt[0].toFixed(1)}, {refPt[1].toFixed(1)} m</strong>
                        <span>from the site origin</span></>
                    : <span className="bs-await">Click the plan to mark the point</span>}
                  {project?.Eastings && (
                    <span className="bs-note">
                      Project record says {project.Eastings}, {project.Northings}
                    </span>
                  )}
                </div>
                <button className="btn accent" disabled={busy || !refPt} onClick={saveRef}>
                  Save reference
                </button>
              </div>
            </>
          )}

          {step === "place" && basemap && (
            <>
              <p className="bs-hint">
                Where the plan sits on the canvas, and how strongly it shows through.
                Lock it once positioned so it can&rsquo;t be nudged while drawing.
              </p>
              <div className="bs-row wrap">
                <div className="fld w-sm">
                  <label htmlFor="bs-ox">Origin X</label>
                  <input id="bs-ox" type="number" step="0.5" value={basemap.Origin_X ?? 0}
                    onChange={(e) => savePlacement({ Origin_X: Number(e.target.value) })} />
                </div>
                <div className="fld w-sm">
                  <label htmlFor="bs-oy">Origin Y</label>
                  <input id="bs-oy" type="number" step="0.5" value={basemap.Origin_Y ?? 0}
                    onChange={(e) => savePlacement({ Origin_Y: Number(e.target.value) })} />
                </div>
                <div className="fld w-sm">
                  <label htmlFor="bs-rot">Rotation</label>
                  <div className="bs-unit">
                    <input id="bs-rot" type="number" step="0.5" value={basemap.Rotation_Deg ?? 0}
                      onChange={(e) => savePlacement({ Rotation_Deg: Number(e.target.value) })} />
                    <span>&deg;</span>
                  </div>
                </div>
                <div className="fld grow">
                  <label htmlFor="bs-op">Opacity {Math.round((basemap.Opacity ?? 0.6) * 100)}%</label>
                  <input id="bs-op" type="range" min="0.1" max="1" step="0.05"
                    value={basemap.Opacity ?? 0.6}
                    onChange={(e) => savePlacement({ Opacity: Number(e.target.value) })} />
                </div>
                <label className="bs-lock">
                  <input type="checkbox" checked={!!basemap.Locked}
                    onChange={(e) => savePlacement({ Locked: e.target.checked })} />
                  Lock
                </label>
              </div>

              <div className="bs-summary">
                <div><span>Scale</span><strong>1 px = {mpp?.toFixed(4)} m</strong></div>
                <div><span>Plan size</span>
                  <strong>{(basemap.Image_Width * (mpp || 0)).toFixed(0)} × {(basemap.Image_Height * (mpp || 0)).toFixed(0)} m</strong>
                </div>
                <div><span>Grid tie</span>
                  <strong>{basemap.Ref_Easting != null
                    ? `${basemap.Ref_Easting}, ${basemap.Ref_Northing}` : "not set"}</strong>
                </div>
              </div>
              <p className="bs-ready">
                Ready &mdash; plot seeds and trenches drawn from here are true to scale.
              </p>
            </>
          )}
        </div>

        <div className="bs-foot">
          {basemap && step !== "import" && (
            <button className="btn ghost danger" onClick={discard} disabled={busy}>Remove plan</button>
          )}
          <span className="bs-spacer" />
          <button className="btn accent" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.bs-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.5); z-index: 1000;
  display: flex; align-items: center; justify-content: center; padding: 24px; }
.bs { background: var(--white); border-radius: 12px; width: 100%; max-width: 760px;
  max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(0,0,0,.3); }
.bs-head { display: flex; align-items: flex-start; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--border); }
.bs-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.bs-sub { margin: 3px 0 0; font-size: 12px; color: var(--muted); }
.bs-x { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 13px; }
.bs-steps { display: flex; gap: 4px; padding: 12px 20px 0; border-bottom: 1px solid var(--border); }
.bs-step { display: flex; align-items: center; gap: 7px; background: none; border: none;
  border-bottom: 2px solid transparent; padding: 8px 12px; margin-bottom: -1px; cursor: pointer;
  font: 600 12px inherit; color: var(--muted); }
.bs-step.on { color: var(--accent); border-bottom-color: var(--accent); }
.bs-step.done .bs-num { background: #059669; color: #fff; }
.bs-step:disabled { opacity: .4; cursor: not-allowed; }
.bs-num { width: 18px; height: 18px; border-radius: 50%; background: var(--bg);
  display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; }
.bs-body { padding: 16px 20px; overflow-y: auto; }
.bs-hint { font-size: 12.5px; color: var(--muted); margin: 0 0 12px; max-width: 70ch; line-height: 1.55; }
.bs-preview { position: relative; border: 1px solid var(--border); border-radius: var(--radius);
  overflow: hidden; background: var(--bg); cursor: crosshair; max-height: 340px; }
.bs-preview img { display: block; width: 100%; height: auto; max-height: 340px; object-fit: contain; }
.bs-pin { position: absolute; transform: translate(-50%, -50%); width: 20px; height: 20px;
  border-radius: 50%; background: #dc2626; color: #fff; font-size: 10px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,.4); }
.bs-pin.ref { background: var(--accent); font-size: 12px; }
.bs-line { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.bs-line line { stroke: #dc2626; stroke-width: 3; stroke-dasharray: 8 6; vector-effect: non-scaling-stroke; }
.bs-row { display: flex; gap: 14px; align-items: flex-end; margin-top: 14px; }
.bs-row.wrap { flex-wrap: wrap; }
.bs-row .fld.w-sm { width: 120px; flex: none; }
.bs-row .fld.grow { flex: 1; min-width: 160px; }
.bs-unit { display: flex; align-items: center; gap: 6px; }
.bs-unit span { font-size: 12px; color: var(--muted); font-weight: 600; }
.bs-result { flex: 1; display: flex; flex-direction: column; gap: 2px; font-size: 12px; padding-bottom: 6px; }
.bs-result strong { font-size: 13.5px; color: var(--accent); }
.bs-result span { color: var(--muted); font-size: 11.5px; }
.bs-warn { color: var(--warn-text) !important; font-weight: 600; }
.bs-good { color: var(--ok-text) !important; font-weight: 600; }
.bs-note { color: var(--muted); font-style: italic; }
.bs-await { color: var(--muted); font-style: italic; }
.bs-import input[type=file] { font-size: 12.5px; }
.bs-pdf { border: 1px solid var(--accent); background: var(--accent-light);
  border-radius: var(--radius); padding: 12px 14px; margin-top: 12px; }
.bs-pdf p { margin: 0 0 9px; font-size: 12.5px; }
.bs-pdf-row { display: flex; gap: 8px; align-items: center; }
.bs-pdf-row input { width: 80px; }
.bs-progress { height: 5px; background: var(--bg); border-radius: 3px; overflow: hidden; margin-top: 12px; }
.bs-progress span { display: block; height: 100%; background: var(--accent); transition: width .2s; }
.bs-current { display: flex; align-items: center; gap: 12px; margin-top: 14px;
  border: 1px solid var(--border); border-radius: var(--radius); padding: 10px; }
.bs-current img { width: 64px; height: 44px; object-fit: cover; border-radius: 5px; background: var(--bg); }
.bs-current div { flex: 1; display: flex; flex-direction: column; }
.bs-current strong { font-size: 12.5px; }
.bs-current span { font-size: 11px; color: var(--muted); }
.bs-lock { display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600;
  text-transform: none; letter-spacing: 0; color: var(--text); margin: 0 0 6px; cursor: pointer; }
.bs-summary { display: flex; gap: 26px; margin-top: 16px; padding: 12px 14px;
  background: var(--bg); border-radius: var(--radius); }
.bs-summary div { display: flex; flex-direction: column; gap: 2px; }
.bs-summary span { font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: var(--muted); }
.bs-summary strong { font-size: 13px; }
.bs-ready { margin: 12px 0 0; font-size: 12.5px; color: var(--ok-text); font-weight: 600; }
.bs-foot { display: flex; align-items: center; gap: 9px; padding: 14px 20px; border-top: 1px solid var(--border); }
.bs-spacer { flex: 1; }
.btn.ghost.danger { color: #b91c1c; }
.mono { font-family: ui-monospace, Menlo, monospace; }
`;
