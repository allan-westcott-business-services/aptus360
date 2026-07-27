import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { listProjects } from "../../api/projects.js";
import { listGis, seedPlots, createFeature, moveFeatures, deleteFeatures } from "../../api/gis.js";

/* GIS canvas — stage 1.

   Coordinates are metres from the site origin. The canvas converts to
   pixels at draw time, so zooming never touches stored data and a
   distance measured on screen is a real distance.

   What's here: pan, zoom, grid, scale bar, layers, plot markers seeded
   from the project's plots, select and drag, and a boundary tool.
   Drawing tools and the electrical model come next. */

const GRID_M = 5;                 // metres between grid lines
const SNAP_M = 1;                 // drag snaps to the nearest metre
const HIT_PX = 10;

export default function GISCanvasPage() {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [search, setSearch] = useState("");
  const [features, setFeatures] = useState([]);
  const [layers, setLayers] = useState([]);
  const [hidden, setHidden] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [tool, setTool] = useState("select");
  const [draft, setDraft] = useState([]);        // boundary being drawn
  const [cursor, setCursor] = useState(null);

  // view transform: metres → pixels
  const [view, setView] = useState({ x: 60, y: 60, scale: 4 });
  const drag = useRef(null);

  useEffect(() => {
    listProjects({ limit: 500 })
      .then((r) => setProjects(r.rows || []))
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(async (pid) => {
    if (!pid) return;
    setLoading(true);
    try {
      const res = await listGis(pid);
      setFeatures(res.features || []);
      setLayers(res.layers || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (projectId) load(projectId); }, [projectId, load]);

  const layerOf = useCallback(
    (key) => layers.find((l) => l.Layer_Key === key) || { Colour: "#64748b", Label: key },
    [layers]
  );

  const visible = useMemo(
    () => features.filter((f) => !hidden.includes(f.Layer_Key)),
    [features, hidden]
  );

  /* ── coordinate conversion ── */
  const toPx = useCallback((m) => ({ x: m[0] * view.scale + view.x, y: m[1] * view.scale + view.y }), [view]);
  const toM = useCallback((px, py) => [(px - view.x) / view.scale, (py - view.y) / view.scale], [view]);
  const snap = (v) => Math.round(v / SNAP_M) * SNAP_M;

  /* ── drawing ── */
  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const { width: w, height: h } = cv;
    ctx.clearRect(0, 0, w, h);

    // grid, spaced so it never becomes noise at low zoom
    const step = GRID_M * view.scale;
    if (step > 6) {
      ctx.strokeStyle = "#eef0f4";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = view.x % step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = view.y % step; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();
    }

    // origin
    const o = toPx([0, 0]);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(o.x - 12, o.y); ctx.lineTo(o.x + 12, o.y);
    ctx.moveTo(o.x, o.y - 12); ctx.lineTo(o.x, o.y + 12);
    ctx.stroke();

    visible.forEach((f) => {
      const colour = layerOf(f.Layer_Key).Colour;
      const on = selected.includes(f.Feature_ID);
      const pts = (f.Geometry || []).map(toPx);
      if (!pts.length) return;

      if (f.Feature_Type === "point") {
        const p = pts[0];
        ctx.beginPath();
        ctx.arc(p.x, p.y, on ? 8 : 6, 0, Math.PI * 2);
        ctx.fillStyle = on ? "#1d4ed8" : colour;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
        if (f.Label && view.scale > 2.5) {
          ctx.fillStyle = "#0f172a";
          ctx.font = "600 11px ui-monospace, Menlo, monospace";
          ctx.textAlign = "center";
          ctx.fillText(f.Label, p.x, p.y - 11);
        }
      } else {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        if (f.Feature_Type === "polygon") ctx.closePath();
        ctx.strokeStyle = on ? "#1d4ed8" : colour;
        ctx.lineWidth = on ? 3 : 2;
        ctx.stroke();
        if (f.Feature_Type === "polygon") {
          ctx.fillStyle = colour + "18";
          ctx.fill();
        }
      }
    });

    // boundary in progress
    if (draft.length) {
      const pts = draft.map(toPx);
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (cursor) { const c = toPx(cursor); ctx.lineTo(c.x, c.y); }
      ctx.strokeStyle = "#0f172a";
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      pts.forEach((p) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#0f172a"; ctx.fill();
      });
    }
  }, [visible, selected, view, toPx, layerOf, draft, cursor]);

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

  /* ── hit testing ── */
  function featureAt(px, py) {
    for (let i = visible.length - 1; i >= 0; i--) {
      const f = visible[i];
      for (const m of f.Geometry || []) {
        const p = toPx(m);
        if (Math.hypot(p.x - px, p.y - py) <= HIT_PX) return f;
      }
    }
    return null;
  }

  /* ── pointer ── */
  function onDown(e) {
    const r = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;

    if (tool === "boundary") {
      const [mx, my] = toM(px, py);
      setDraft((d) => [...d, [snap(mx), snap(my)]]);
      return;
    }

    const hit = featureAt(px, py);
    if (hit) {
      const next = e.shiftKey
        ? (selected.includes(hit.Feature_ID)
            ? selected.filter((x) => x !== hit.Feature_ID)
            : [...selected, hit.Feature_ID])
        : (selected.includes(hit.Feature_ID) ? selected : [hit.Feature_ID]);
      setSelected(next);
      drag.current = { mode: "move", startPx: [px, py], ids: next, origin: {} };
      next.forEach((id) => {
        const f = features.find((x) => x.Feature_ID === id);
        if (f) drag.current.origin[id] = f.Geometry;
      });
    } else {
      if (!e.shiftKey) setSelected([]);
      drag.current = { mode: "pan", startPx: [px, py], startView: { ...view } };
    }
  }

  function onMove(e) {
    const r = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    setCursor(toM(px, py));

    if (!drag.current) return;
    const dx = px - drag.current.startPx[0], dy = py - drag.current.startPx[1];

    if (drag.current.mode === "pan") {
      setView((v) => ({ ...v, x: drag.current.startView.x + dx, y: drag.current.startView.y + dy }));
    } else {
      const dm = [dx / view.scale, dy / view.scale];
      setFeatures((fs) => fs.map((f) => {
        const orig = drag.current.origin[f.Feature_ID];
        if (!orig) return f;
        return { ...f, Geometry: orig.map(([x, y]) => [snap(x + dm[0]), snap(y + dm[1])]) };
      }));
    }
  }

  async function onUp() {
    const d = drag.current;
    drag.current = null;
    if (!d || d.mode !== "move") return;
    const updates = d.ids
      .map((id) => features.find((f) => f.Feature_ID === id))
      .filter(Boolean)
      .map((f) => ({ Feature_ID: f.Feature_ID, Geometry: f.Geometry }));
    if (!updates.length) return;
    try { await moveFeatures(projectId, updates); }
    catch (e) { setError(e.message); await load(projectId); }
  }

  function onWheel(e) {
    e.preventDefault();
    const r = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    setView((v) => {
      const next = Math.min(40, Math.max(0.4, v.scale * (e.deltaY < 0 ? 1.12 : 0.89)));
      // keep the point under the cursor fixed
      return {
        scale: next,
        x: px - (px - v.x) * (next / v.scale),
        y: py - (py - v.y) * (next / v.scale),
      };
    });
  }

  /* ── actions ── */
  async function seed() {
    setLoading(true);
    try {
      const res = await seedPlots(projectId);
      setStatus(res.created
        ? `${res.created} plot marker${res.created === 1 ? "" : "s"} placed — drag them into position`
        : "Every plot already has a marker");
      setTimeout(() => setStatus(""), 4000);
      await load(projectId);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function finishBoundary() {
    if (draft.length < 3) { setDraft([]); return; }
    try {
      await createFeature(projectId, {
        Layer_Key: "boundary", Feature_Type: "polygon", Geometry: draft, Label: "Site boundary",
      });
      setDraft([]);
      setTool("select");
      await load(projectId);
    } catch (e) { setError(e.message); }
  }

  async function removeSelected() {
    if (!selected.length) return;
    const withPlots = features.filter((f) => selected.includes(f.Feature_ID) && f.Plot_ID);
    if (withPlots.length && !window.confirm(
      `${withPlots.length} of these are plot markers. Deleting removes the marker, not the plot. Continue?`
    )) return;
    try {
      await deleteFeatures(projectId, selected);
      setSelected([]);
      await load(projectId);
    } catch (e) { setError(e.message); }
  }

  // keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { setDraft([]); setTool("select"); setSelected([]); }
      if (e.key === "Enter" && tool === "boundary") finishBoundary();
      if ((e.key === "Delete" || e.key === "Backspace") && selected.length
          && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault(); removeSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const q = search.trim().toLowerCase();
  const shownProjects = q
    ? projects.filter((p) => `${p.Project_Ref} ${p.Site_Name ?? ""}`.toLowerCase().includes(q))
    : projects;

  const counts = useMemo(() => {
    const c = {};
    features.forEach((f) => { c[f.Layer_Key] = (c[f.Layer_Key] || 0) + 1; });
    return c;
  }, [features]);

  // Scale bar: pick a round number of metres that fits a sensible width
  const barM = [1, 2, 5, 10, 20, 50, 100, 200].find((m) => m * view.scale > 60) || 200;

  return (
    <div className="gis">
      <style>{CSS}</style>

      <div className="gis-bar">
        <div className="gis-proj">
          <input className="gis-search" value={search} placeholder="&#128269; Find a project&hellip;"
            aria-label="Search projects" onChange={(e) => setSearch(e.target.value)} />
          <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setSelected([]); }}
            aria-label="Project">
            <option value="">&mdash; Select a project &mdash;</option>
            {shownProjects.map((p) => (
              <option key={p.Project_ID} value={p.Project_ID}>
                {p.Project_Ref} &mdash; {p.Site_Name || "Unnamed site"}
              </option>
            ))}
          </select>
        </div>

        {projectId && (
          <>
            <div className="gis-tools" role="group" aria-label="Tools">
              <button className={tool === "select" ? "gt on" : "gt"} onClick={() => { setTool("select"); setDraft([]); }}>
                Select
              </button>
              <button className={tool === "boundary" ? "gt on" : "gt"} onClick={() => { setTool("boundary"); setSelected([]); }}>
                Draw boundary
              </button>
            </div>
            <button className="btn ghost" onClick={seed} disabled={loading}>Place plot markers</button>
            <button className="btn ghost" onClick={() => setView({ x: 60, y: 60, scale: 4 })}>Reset view</button>
            {selected.length > 0 && (
              <button className="btn ghost danger" onClick={removeSelected}>
                Delete {selected.length}
              </button>
            )}
          </>
        )}
      </div>

      {error && <Banner kind="error">{error}</Banner>}
      {status && <Banner kind="ok">{status}</Banner>}

      {!projectId ? (
        <div className="gis-empty">
          <p className="ge-title">Choose a project</p>
          <p>Its plots can then be placed on the canvas and moved into position.</p>
        </div>
      ) : (
        <div className="gis-main">
          <div className="gis-layers">
            <p className="gl-title">Layers</p>
            {layers.map((l) => {
              const off = hidden.includes(l.Layer_Key);
              return (
                <label key={l.Layer_Key} className={off ? "gl off" : "gl"}>
                  <input type="checkbox" checked={!off}
                    onChange={() => setHidden((h) =>
                      h.includes(l.Layer_Key) ? h.filter((x) => x !== l.Layer_Key) : [...h, l.Layer_Key])} />
                  <span className="gl-swatch" style={{ background: l.Colour }} />
                  <span className="gl-name">{l.Label}</span>
                  <span className="gl-count">{counts[l.Layer_Key] || 0}</span>
                </label>
              );
            })}

            <p className="gl-title">Help</p>
            <ul className="gl-help">
              <li>Drag empty space to pan</li>
              <li>Scroll to zoom on the cursor</li>
              <li>Shift-click to multi-select</li>
              <li><kbd>Esc</kbd> cancels, <kbd>Del</kbd> removes</li>
              {tool === "boundary" && <li><kbd>Enter</kbd> closes the boundary</li>}
            </ul>
          </div>

          <div className="gis-canvas-wrap" ref={wrapRef}>
            <canvas
              ref={canvasRef}
              className={tool === "boundary" ? "crosshair" : ""}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={() => { drag.current = null; setCursor(null); }}
              onWheel={onWheel}
            />
            <div className="gis-hud">
              <span className="hud-scale">
                <span className="hud-bar" style={{ width: barM * view.scale }} />
                {barM} m
              </span>
              {cursor && (
                <span className="hud-xy mono">
                  {cursor[0].toFixed(1)}, {cursor[1].toFixed(1)} m
                </span>
              )}
              <span className="hud-zoom">{Math.round(view.scale * 25)}%</span>
            </div>
            {tool === "boundary" && (
              <div className="gis-tip">
                Click to place corners &middot; <kbd>Enter</kbd> to close &middot; <kbd>Esc</kbd> to cancel
                {draft.length > 0 && ` \u00B7 ${draft.length} placed`}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.gis { display: flex; flex-direction: column; height: calc(100vh - 120px); min-height: 520px; }
.gis-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.gis-proj { display: flex; gap: 8px; align-items: center; }
.gis-search { width: 190px; font-size: 12px; padding: 6px 9px; }
.gis-proj select { width: auto; min-width: 260px; font-size: 12.5px; }
.gis-tools { display: inline-flex; border: 1px solid var(--border); border-radius: 7px; overflow: hidden; }
.gt { background: var(--white); border: none; padding: 6px 14px; cursor: pointer;
  font: 600 12.5px inherit; color: var(--muted); }
.gt.on { background: var(--accent); color: #fff; }
.btn.ghost.danger { color: #b91c1c; }

.gis-main { flex: 1; display: grid; grid-template-columns: 210px 1fr; gap: 12px; min-height: 0; }
.gis-layers { border: 1px solid var(--border); border-radius: var(--radius); padding: 10px;
  overflow-y: auto; background: var(--white); }
.gl-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em;
  color: var(--muted); margin: 0 0 7px; }
.gl-title:not(:first-child) { margin-top: 16px; }
.gl { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 500;
  text-transform: none; letter-spacing: 0; color: var(--text); padding: 4px 3px; margin: 0;
  cursor: pointer; border-radius: 5px; }
.gl:hover { background: var(--bg); }
.gl.off .gl-name, .gl.off .gl-count { opacity: .4; }
.gl-swatch { width: 10px; height: 10px; border-radius: 3px; flex: none; }
.gl-name { flex: 1; }
.gl-count { font-size: 10.5px; font-weight: 700; color: var(--muted); }
.gl-help { margin: 0; padding-left: 16px; font-size: 11px; color: var(--muted); line-height: 1.7; }
kbd { font-family: ui-monospace, Menlo, monospace; font-size: 10px; background: var(--bg);
  border: 1px solid var(--border); border-radius: 3px; padding: 0 4px; }

.gis-canvas-wrap { position: relative; border: 1px solid var(--border); border-radius: var(--radius);
  overflow: hidden; background: var(--white); min-height: 0; }
.gis-canvas-wrap canvas { display: block; width: 100%; height: 100%; cursor: grab; touch-action: none; }
.gis-canvas-wrap canvas:active { cursor: grabbing; }
.gis-canvas-wrap canvas.crosshair, .gis-canvas-wrap canvas.crosshair:active { cursor: crosshair; }
.gis-hud { position: absolute; left: 12px; bottom: 12px; display: flex; align-items: center; gap: 14px;
  background: rgba(255,255,255,.94); border: 1px solid var(--border); border-radius: 7px;
  padding: 6px 12px; font-size: 11px; color: var(--muted); }
.hud-scale { display: flex; align-items: center; gap: 7px; font-weight: 600; }
.hud-bar { height: 3px; background: var(--text); border-radius: 2px;
  border-left: 1px solid var(--text); border-right: 1px solid var(--text); }
.hud-xy { font-family: ui-monospace, Menlo, monospace; }
.hud-zoom { font-weight: 600; }
.gis-tip { position: absolute; left: 50%; top: 12px; transform: translateX(-50%);
  background: var(--accent); color: #fff; border-radius: 999px; padding: 6px 16px;
  font-size: 11.5px; font-weight: 600; white-space: nowrap; }
.gis-tip kbd { background: rgba(255,255,255,.22); border-color: rgba(255,255,255,.35); color: #fff; }
.gis-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  border: 1px dashed var(--border); border-radius: var(--radius); background: var(--bg); }
.ge-title { margin: 0 0 4px; font-size: 15px; font-weight: 700; color: var(--text); }
.gis-empty p { margin: 0; font-size: 12.5px; color: var(--muted); }
`;
