import { useState, useRef, useEffect, useCallback } from "react";
import { usePdfPage, drawTile } from "./usePdfPage.js";

/* A zoomable view of the plan for placing calibration points.

   Canvas rather than an <img>, because a PDF can't be shown in one and
   a vector plan is the whole point — this re-renders from the PDF as you
   zoom, exactly as the main canvas does.

   Precision matters more here than anywhere else: every later
   measurement inherits this one. Hence the loupe, and zoom to 4000%. */

const LOUPE = 132;
const LOUPE_ZOOM = 5;

export default function CalibrationView({
  src, sourceKind = "image", pdfPage = 1,
  imageWidth, imageHeight, points, onPlace, mode = "two", pinLabel,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const loupeRef = useRef(null);
  const drag = useRef(null);
  const moved = useRef(false);

  const [raster, setRaster] = useState(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [cursor, setCursor] = useState(null);
  const [panning, setPanning] = useState(false);

  const isPdf = sourceKind === "pdf";
  const pdf = usePdfPage(isPdf ? src : null, pdfPage);

  // raster plans decode once
  useEffect(() => {
    if (!src || isPdf) { setRaster(null); return; }
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => setRaster(i);
    i.src = src;
  }, [src, isPdf]);

  const srcW = isPdf ? (pdf.size?.width ?? imageWidth) : (raster?.naturalWidth ?? imageWidth);
  const srcH = isPdf ? (pdf.size?.height ?? imageHeight) : (raster?.naturalHeight ?? imageHeight);
  const ready = isPdf ? !!pdf.tile : !!raster;

  const fit = useCallback(() => {
    const w = wrapRef.current;
    if (!w || !srcW) return;
    const s = Math.min(w.clientWidth / srcW, w.clientHeight / srcH) * 0.96;
    setView({
      scale: s,
      x: (w.clientWidth - srcW * s) / 2,
      y: (w.clientHeight - srcH * s) / 2,
    });
  }, [srcW, srcH]);

  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && srcW) { fitted.current = true; fit(); }
  }, [srcW, fit]);

  const toSource = (px, py) => [(px - view.x) / view.scale, (py - view.y) / view.scale];

  /* Tell the renderer which part of the page is on screen. */
  useEffect(() => {
    if (!isPdf || !pdf.size || !wrapRef.current) return;
    const w = wrapRef.current.clientWidth, h = wrapRef.current.clientHeight;
    const [x0, y0] = toSource(0, 0);
    const [x1, y1] = toSource(w, h);
    pdf.request(
      {
        x: Math.max(0, x0), y: Math.max(0, y0),
        w: Math.min(pdf.size.width, x1 - x0), h: Math.min(pdf.size.height, y1 - y0),
      },
      view.scale
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPdf, pdf.size, view.x, view.y, view.scale]);
  const toScreen = (sx, sy) => [sx * view.scale + view.x, sy * view.scale + view.y];

  /* Draw the plan, the placed pins and the measured line. */
  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(0, 0, cv.width, cv.height);

    if (isPdf) {
      drawTile(ctx, pdf.tile, toScreen, view.scale);
    } else if (raster && srcW) {
      ctx.imageSmoothingEnabled = view.scale < 2;
      ctx.drawImage(raster, view.x, view.y, srcW * view.scale, srcH * view.scale);
    }

    if (points.length === 2) {
      const a = toScreen(points[0][0], points[0][1]);
      const b = toScreen(points[1][0], points[1][1]);
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    points.forEach((p, i) => {
      const [sx, sy] = toScreen(p[0], p[1]);
      ctx.beginPath();
      ctx.arc(sx, sy, 11, 0, Math.PI * 2);
      ctx.fillStyle = mode === "one" ? "#39467b" : "#dc2626";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "700 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(mode === "one" ? (pinLabel || "\u25CE") : String(i + 1), sx, sy);
    });
  }, [isPdf, pdf.tile, raster, srcW, srcH, view, points, mode, pinLabel]);

  useEffect(() => {
    const cv = canvasRef.current, wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const resize = () => {
      cv.width = wrap.clientWidth;
      cv.height = wrap.clientHeight;
      draw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => { draw(); }, [draw]);

  /* The loupe samples the rendered bitmap, so its source rectangle has
     to be in that bitmap's pixels — page units times the scale it was
     rendered at, offset by where the tile starts. Reading page units
     directly is what made it show the wrong place. */
  function drawLoupe(px, py) {
    const cv = loupeRef.current;
    if (!cv) return;
    const bitmap = isPdf ? pdf.tile?.canvas : raster;
    if (!bitmap) return;

    const ctx = cv.getContext("2d");
    const [ix, iy] = toSource(px, py);
    const spanPage = LOUPE / LOUPE_ZOOM / view.scale;

    const s = isPdf ? pdf.tile.scale : 1;
    const ox = isPdf ? pdf.tile.x : 0;
    const oy = isPdf ? pdf.tile.y : 0;
    const bx = (ix - ox) * s;
    const by = (iy - oy) * s;
    const bSpan = spanPage * s;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, LOUPE, LOUPE);
    ctx.drawImage(bitmap, bx - bSpan / 2, by - bSpan / 2, bSpan, bSpan, 0, 0, LOUPE, LOUPE);

    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LOUPE / 2, 0); ctx.lineTo(LOUPE / 2, LOUPE);
    ctx.moveTo(0, LOUPE / 2); ctx.lineTo(LOUPE, LOUPE / 2);
    ctx.stroke();
  }

  function onWheel(e) {
    e.preventDefault();
    const r = wrapRef.current.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    setView((v) => {
      const next = Math.min(40, Math.max(0.02, v.scale * (e.deltaY < 0 ? 1.15 : 0.87)));
      return {
        scale: next,
        x: px - (px - v.x) * (next / v.scale),
        y: py - (py - v.y) * (next / v.scale),
      };
    });
  }

  const isPanButton = (e) => e.button === 1 || e.button === 2;

  function onDown(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const r = wrapRef.current.getBoundingClientRect();
    moved.current = false;
    if (isPanButton(e)) {
      e.preventDefault();
      drag.current = { pan: true, startPx: [e.clientX - r.left, e.clientY - r.top], startView: { ...view } };
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
    if (!d || d.pan || e.button !== 0 || moved.current) return;

    const r = wrapRef.current.getBoundingClientRect();
    const [ix, iy] = toSource(e.clientX - r.left, e.clientY - r.top);
    if (ix < 0 || iy < 0 || ix > srcW || iy > srcH) return;
    onPlace([ix, iy]);
  }

  const loading = !ready && !pdf.error;

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
        <canvas ref={canvasRef} className="cv-plan" />

        {loading && <div className="cv-wait">Rendering the plan&hellip;</div>}
        {pdf.error && <div className="cv-wait err">{pdf.error}</div>}

        {cursor && ready && (
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
        <button onClick={() => setView((v) => ({ ...v, scale: Math.max(0.02, v.scale / 1.6) }))}>&minus;</button>
        <button onClick={fit}>Fit</button>
        <span className="cv-zoom">{Math.round(view.scale * 100)}%</span>
        {isPdf && <span className="cv-vector">vector</span>}
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
.cv-stage.panning { cursor: grabbing; }
.cv-plan { display: block; width: 100%; height: 100%; }
.cv-wait { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 12.5px; color: var(--muted); pointer-events: none; }
.cv-wait.err { color: var(--err-text); font-weight: 600; padding: 20px; text-align: center; }
/* Explicit size, or a stray rule stretches it across the frame. */
.cv-loupe { position: absolute; z-index: 4; pointer-events: none; border-radius: 50%;
  width: 132px !important; height: 132px !important;
  border: 2px solid var(--white); box-shadow: 0 3px 12px rgba(0,0,0,.35); background: #fff; }
.cv-bar { display: flex; align-items: center; gap: 6px; }
.cv-bar button { width: 30px; height: 28px; border: 1px solid var(--border); background: var(--white);
  border-radius: 6px; cursor: pointer; font: 700 13px inherit; color: var(--text); }
.cv-bar button:hover { border-color: var(--accent); color: var(--accent); }
.cv-bar button:nth-child(3) { width: auto; padding: 0 12px; font-size: 12px; }
.cv-zoom { font-size: 11.5px; font-weight: 700; color: var(--accent); min-width: 46px; }
.cv-vector { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
  background: var(--ok-bg); color: var(--ok-text); border: 1px solid var(--ok-border);
  border-radius: 4px; padding: 1px 6px; }
.cv-hint { font-size: 11px; color: var(--muted); margin-left: auto; }
`;
