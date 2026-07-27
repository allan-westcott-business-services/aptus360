import { useState, useRef, useEffect, useCallback } from "react";

/* A zoomable view of the plan for placing calibration points.

   Precision matters more here than anywhere else on the canvas: every
   later measurement inherits this one. Clicking a 5m scale bar at
   fit-to-screen might span twenty pixels, and one pixel of error there
   becomes 25cm — then multiplies across the whole site. So: zoom to the
   pixel, and a loupe showing exactly what's under the cursor. */

const LOUPE = 132;      // px across
const LOUPE_ZOOM = 5;

export default function CalibrationView({
  src, imageWidth, imageHeight, points, onPlace, mode = "two", pinLabel,
}) {
  const wrapRef = useRef(null);
  const imgRef = useRef(null);
  const loupeRef = useRef(null);
  const [img, setImg] = useState(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [cursor, setCursor] = useState(null);
  const [panning, setPanning] = useState(false);
  const drag = useRef(null);
  const moved = useRef(false);

  useEffect(() => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => setImg(i);
    i.src = src;
    imgRef.current = i;
  }, [src]);

  // start fitted to the viewport
  const fit = useCallback(() => {
    const w = wrapRef.current;
    if (!w || !imageWidth) return;
    const s = Math.min(w.clientWidth / imageWidth, w.clientHeight / imageHeight);
    setView({
      scale: s,
      x: (w.clientWidth - imageWidth * s) / 2,
      y: (w.clientHeight - imageHeight * s) / 2,
    });
  }, [imageWidth, imageHeight]);

  useEffect(() => { if (img) fit(); }, [img, fit]);

  const toImage = (px, py) => [(px - view.x) / view.scale, (py - view.y) / view.scale];
  const toScreen = (ix, iy) => [ix * view.scale + view.x, iy * view.scale + view.y];

  function onWheel(e) {
    e.preventDefault();
    const r = wrapRef.current.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    setView((v) => {
      // Generous ceiling: at 40× a single image pixel is a visible block,
      // which is what placing a point precisely needs.
      const next = Math.min(40, Math.max(0.05, v.scale * (e.deltaY < 0 ? 1.15 : 0.87)));
      return {
        scale: next,
        x: px - (px - v.x) * (next / v.scale),
        y: py - (py - v.y) * (next / v.scale),
      };
    });
  }

  /* Middle or right button pans, as in every CAD tool. That leaves the
     left button doing one thing only — placing the point — so a slightly
     shaky click can't be mistaken for a drag. */
  const isPanButton = (e) => e.button === 1 || e.button === 2;

  function onDown(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const r = wrapRef.current.getBoundingClientRect();
    moved.current = false;

    if (isPanButton(e)) {
      e.preventDefault();
      drag.current = {
        pan: true,
        startPx: [e.clientX - r.left, e.clientY - r.top],
        startView: { ...view },
      };
      setPanning(true);
      return;
    }

    if (e.button !== 0) return;
    drag.current = { pan: false, startPx: [e.clientX - r.left, e.clientY - r.top] };
  }

  function onMove(e) {
    const r = wrapRef.current.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    setCursor([px, py]);
    drawLoupe(px, py);

    const d = drag.current;
    if (!d) return;
    const dx = px - d.startPx[0], dy = py - d.startPx[1];
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true;
    if (!d.pan) return;
    const { x: sx, y: sy } = d.startView;
    setView((v) => ({ ...v, x: sx + dx, y: sy + dy }));
  }

  function onUp(e) {
    const d = drag.current;
    drag.current = null;
    setPanning(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (!d || d.pan || e.button !== 0) return;
    if (moved.current) return;            // a drag isn't a click

    const r = wrapRef.current.getBoundingClientRect();
    const [ix, iy] = toImage(e.clientX - r.left, e.clientY - r.top);
    if (ix < 0 || iy < 0 || ix > imageWidth || iy > imageHeight) return;
    onPlace([ix, iy]);
  }

  /* The loupe reads from the decoded image, not the scaled element, so
     it shows real pixels rather than a blurry enlargement of a blur. */
  function drawLoupe(px, py) {
    const cv = loupeRef.current;
    if (!cv || !img) return;
    const ctx = cv.getContext("2d");
    const [ix, iy] = toImage(px, py);
    const span = LOUPE / LOUPE_ZOOM;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, LOUPE, LOUPE);
    ctx.drawImage(img, ix - span / 2, iy - span / 2, span, span, 0, 0, LOUPE, LOUPE);

    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LOUPE / 2, 0); ctx.lineTo(LOUPE / 2, LOUPE);
    ctx.moveTo(0, LOUPE / 2); ctx.lineTo(LOUPE, LOUPE / 2);
    ctx.stroke();
  }

  const pct = Math.round(view.scale * 100);

  return (
    <div className="cv">
      <style>{CSS}</style>

      <div
        className={panning ? "cv-stage panning" : "cv-stage"}
        ref={wrapRef}
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => { drag.current = null; setPanning(false); setCursor(null); }}
        onContextMenu={(e) => e.preventDefault()}
        onAuxClick={(e) => e.preventDefault()}
      >
        {img && (
          <img
            src={src}
            alt="Site plan"
            draggable={false}
            style={{
              position: "absolute",
              left: view.x, top: view.y,
              width: imageWidth * view.scale,
              height: imageHeight * view.scale,
              imageRendering: view.scale > 2 ? "pixelated" : "auto",
            }}
          />
        )}

        {points.map((p, i) => {
          const [sx, sy] = toScreen(p[0], p[1]);
          return (
            <span key={i} className={mode === "one" ? "cv-pin ref" : "cv-pin"}
                  style={{ left: sx, top: sy }}>
              {mode === "one" ? (pinLabel || "\u25CE") : i + 1}
            </span>
          );
        })}

        {points.length === 2 && (
          <svg className="cv-line">
            <line
              x1={toScreen(points[0][0], points[0][1])[0]}
              y1={toScreen(points[0][0], points[0][1])[1]}
              x2={toScreen(points[1][0], points[1][1])[0]}
              y2={toScreen(points[1][0], points[1][1])[1]}
            />
          </svg>
        )}

        {cursor && (
          <canvas
            ref={loupeRef}
            className="cv-loupe"
            width={LOUPE}
            height={LOUPE}
            style={{
              left: Math.min(cursor[0] + 20, (wrapRef.current?.clientWidth || 0) - LOUPE - 8),
              top: Math.max(8, cursor[1] - LOUPE - 20),
            }}
          />
        )}
      </div>

      <div className="cv-bar">
        <button onClick={() => setView((v) => ({ ...v, scale: Math.min(40, v.scale * 1.6) }))}>+</button>
        <button onClick={() => setView((v) => ({ ...v, scale: Math.max(0.05, v.scale / 1.6) }))}>&minus;</button>
        <button onClick={fit}>Fit</button>
        <span className="cv-zoom">{pct}%</span>
        <span className="cv-hint">Scroll to zoom &middot; right or middle drag to pan &middot; left click to place</span>
      </div>
    </div>
  );
}

const CSS = `
.cv { display: flex; flex-direction: column; gap: 8px; }
.cv-stage { position: relative; height: 340px; border: 1px solid var(--border);
  border-radius: var(--radius); overflow: hidden; background: #f1f5f9;
  cursor: crosshair; touch-action: none; user-select: none; }
.cv-stage img { pointer-events: none; }
.cv-pin { position: absolute; transform: translate(-50%, -50%); width: 22px; height: 22px;
  border-radius: 50%; background: #dc2626; color: #fff; font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; border: 2px solid #fff;
  box-shadow: 0 1px 5px rgba(0,0,0,.45); pointer-events: none; z-index: 3; }
.cv-pin.ref { background: var(--accent); font-size: 13px; }
.cv-line { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2; }
.cv-line line { stroke: #dc2626; stroke-width: 2; stroke-dasharray: 7 5; }
.cv-loupe { position: absolute; z-index: 4; pointer-events: none; border-radius: 50%;
  border: 2px solid var(--white); box-shadow: 0 3px 12px rgba(0,0,0,.35); background: #fff; }
.cv-bar { display: flex; align-items: center; gap: 6px; }
.cv-bar button { width: 30px; height: 28px; border: 1px solid var(--border); background: var(--white);
  border-radius: 6px; cursor: pointer; font: 700 13px inherit; color: var(--text); }
.cv-bar button:hover { border-color: var(--accent); color: var(--accent); }
.cv-bar button:nth-child(3) { width: auto; padding: 0 12px; font-size: 12px; }
.cv-zoom { font-size: 11.5px; font-weight: 700; color: var(--accent); min-width: 48px; }
.cv-stage.panning { cursor: grabbing; }
.cv-hint { font-size: 11px; color: var(--muted); margin-left: auto; }
`;
