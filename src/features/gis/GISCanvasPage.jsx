import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { listProjects } from "../../api/projects.js";
import {
  listGis, createFeature, moveFeatures, deleteFeatures, updateFeature, ensurePlots,
  placeJoints, traceNetwork, assignMeters,
} from "../../api/gis.js";
import {
  SNAP_PX, snapTargets, findSnap, nearestOnLines, connectedTo, lineLength,
} from "./snapping.js";
import BasemapSetup from "./BasemapSetup.jsx";
import { getLookups } from "../../api/lookups.js";
import { getBasemap } from "../../api/basemap.js";
import { listDevelopers } from "../../api/developers.js";
import { bulkUpdatePlots } from "../../api/plots.js";
import { listPlacementPlots } from "../../api/gis.js";
import PlacementPanel from "./PlacementPanel.jsx";
import AddPlotsModal from "./AddPlotsModal.jsx";
import { bedColour } from "../../lib/bedColours.js";
import { housePath } from "./plotRange.js";
import FeatureEditor from "./FeatureEditor.jsx";
import { usePdfPage, drawTile } from "./usePdfPage.js";

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
  const [draft, setDraft] = useState([]);        // line or boundary being drawn
  const [cursor, setCursor] = useState(null);
  const [lineTypes, setLineTypes] = useState([]);
  const [lineType, setLineType] = useState("elec_main");
  const [snapOn, setSnapOn] = useState(true);
  const [snapHit, setSnapHit] = useState(null);
  const [editVertex, setEditVertex] = useState(null);   // { featureId, index }
  const [size, setSize] = useState("");
  const [busy, setBusy] = useState("");
  const [showLabels, setShowLabels] = useState(true);
  const [basemap, setBasemap] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [bgImage, setBgImage] = useState(null);
  const [project, setProject] = useState(null);
  const [plotList, setPlotList] = useState([]);
  const [utilities, setUtilities] = useState([]);
  const [queue, setQueue] = useState([]);          // plots being placed, in order
  const [meterFor, setMeterFor] = useState(null);  // { plot, seedPoint, utility, all, placed }
  const [addOpen, setAddOpen] = useState(false);
  const [developers, setDevelopers] = useState([]);
  const [lookups, setLookups] = useState({});
  const [showGrid, setShowGrid] = useState(true);
  const [editing, setEditing] = useState(null);

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
      const lk = await getLookups();
      const [res, bm, pl] = await Promise.all([
        listGis(pid),
        getBasemap(pid).catch(() => null),
        listPlacementPlots(pid).catch((e) => ({
          plots: [], utilities: [], _error: e.message,
        })),
      ]);
      if (pl._error) setError(`Couldn't read this project's plots: ${pl._error}`);
      setPlotList(pl.plots || []);
      const devs = await listDevelopers(pid).catch(() => ({ rows: [] }));
      setDevelopers((devs.rows || []).map((d) => {
        const b = (lk.branches || []).find((x) => x.Branch_ID === d.Branch_ID);
        return { ...d, label: b ? (b.Branch_Dropdown || b.Branch_Name) : "Developer" };
      }));
      setUtilities((pl.utilities || []).map((u) => ({
        ...u,
        colour: (res.layers || []).find((l) => l.Layer_Key === u.layer_key)?.Colour || "#64748b",
      })));
      setLookups(lk);
      setBasemap(bm);
      setProject(projects.find((p) => String(p.Project_ID) === String(pid)) || null);
      setFeatures(res.features || []);
      setLayers(res.layers || []);
      setLineTypes(res.lineTypes || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [projects]);

  useEffect(() => { if (projectId) load(projectId); }, [projectId, load]);

  const layerOf = useCallback(
    (key) => layers.find((l) => l.Layer_Key === key) || { Colour: "#64748b", Label: key },
    [layers]
  );

  const visible = useMemo(
    () => features.filter((f) => !hidden.includes(f.Layer_Key)),
    [features, hidden]
  );
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const drawing = tool === "boundary" || tool === "line";
  const placing = queue.some((q) => !q.done);
  const nextPlot = meterFor?.plot || queue.find((q) => !q.done) || null;

  const isPdfMap = basemap?.Source_Kind === "pdf";

  const pdf = usePdfPage(isPdfMap ? basemap.Image_Url : null, basemap?.Pdf_Page || 1);

  /* Screen pixels per page unit: Metres_Per_Pixel turns page units into
     metres, view.scale turns metres into pixels. */
  const pdfScreenScale = isPdfMap && basemap?.Metres_Per_Pixel
    ? Number(basemap.Metres_Per_Pixel) * view.scale
    : 0;


  useEffect(() => { if (pdf.error) setError(pdf.error); }, [pdf.error]);

  /* Raster plans are decoded once and held — re-fetching on every
     repaint would be pointless for something that can't get sharper. */
  useEffect(() => {
    if (!basemap?.Image_Url || isPdfMap) { setBgImage(null); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setBgImage(img);
    img.onerror = () => setError(
      /\.pdf($|\?)/i.test(basemap.Image_Url)
        ? "This plan is a PDF but is recorded as an image — re-import it to render it as vector."
        : "The background plan couldn't be loaded."
    );
    img.src = basemap.Image_Url;
  }, [basemap?.Image_Url, isPdfMap]);

  const typeOf = useCallback(
    (key) => lineTypes.find((t) => t.Type_Key === key) || null,
    [lineTypes]
  );

  /* Everything worth snapping to, recalculated only when the drawing
     changes rather than on every mouse move. */
  const targets = useMemo(() => snapTargets(visibleRef.current || []), [features, hidden]);


  /* ── coordinate conversion ── */
  const toPx = useCallback((m) => ({ x: m[0] * view.scale + view.x, y: m[1] * view.scale + view.y }), [view]);
  const toM = useCallback((px, py) => [(px - view.x) / view.scale, (py - view.y) / view.scale], [view]);

  /* Ask for whatever part of the plan is on screen, at this zoom. */
  useEffect(() => {
    if (!isPdfMap || !pdf.size || !pdfScreenScale || !wrapRef.current) return;
    const mpp = Number(basemap.Metres_Per_Pixel);
    const ox = Number(basemap.Origin_X) || 0;
    const oy = Number(basemap.Origin_Y) || 0;
    const w = wrapRef.current.clientWidth, h = wrapRef.current.clientHeight;

    // screen corners -> metres -> page units
    const [mx0, my0] = toM(0, 0);
    const [mx1, my1] = toM(w, h);
    const x0 = (mx0 - ox) / mpp, y0 = (my0 - oy) / mpp;
    const x1 = (mx1 - ox) / mpp, y1 = (my1 - oy) / mpp;

    pdf.request(
      {
        x: Math.max(0, Math.min(x0, x1)),
        y: Math.max(0, Math.min(y0, y1)),
        w: Math.min(pdf.size.width, Math.abs(x1 - x0)),
        h: Math.min(pdf.size.height, Math.abs(y1 - y0)),
      },
      pdfScreenScale
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPdfMap, pdf.size, view.x, view.y, view.scale, basemap?.Metres_Per_Pixel, basemap?.Origin_X, basemap?.Origin_Y]);
  /* With Snap off, nothing is rounded. Quietly snapping to a metre grid
     you can't see is worse than not snapping — it looks like the click
     was misread. */
  const snap = (v) => (snapOn ? Math.round(v / SNAP_M) * SNAP_M : v);

  /* ── drawing ── */
  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const { width: w, height: h } = cv;
    ctx.clearRect(0, 0, w, h);

    // Background plan, under everything, at its calibrated size
    if (basemap?.Metres_Per_Pixel) {
      const mpp = Number(basemap.Metres_Per_Pixel);
      const ox = Number(basemap.Origin_X) || 0;
      const oy = Number(basemap.Origin_Y) || 0;
      const o = toPx([ox, oy]);

      ctx.save();
      ctx.globalAlpha = Number(basemap.Opacity ?? 0.6);
      const rot = (Number(basemap.Rotation_Deg) || 0) * Math.PI / 180;
      if (rot) { ctx.translate(o.x, o.y); ctx.rotate(rot); ctx.translate(-o.x, -o.y); }

      if (isPdfMap) {
        // page units -> metres -> screen
        const pageToScreen = (x, y) => {
          const p = toPx([ox + x * mpp, oy + y * mpp]);
          return [p.x, p.y];
        };
        drawTile(ctx, pdf.tile, pageToScreen, mpp * view.scale);
      } else if (bgImage) {
        ctx.drawImage(bgImage, o.x, o.y,
          bgImage.naturalWidth * mpp * view.scale,
          bgImage.naturalHeight * mpp * view.scale);
      }
      ctx.restore();
    }

    // grid, spaced so it never becomes noise at low zoom
    const step = GRID_M * view.scale;
    if (showGrid && step > 6) {
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
        const isMeter = f.Feature_Role === "meter";
        const isSeed = f.Feature_Role === "plot";
        // Seeds take the bedroom colour used everywhere else for plots
        const fill = isSeed ? bedColour(f.Attributes?.Bedrooms).bg : colour;

        if (isSeed) {
          housePath(ctx, p.x, p.y, on ? 20 : 16);
        } else if (isMeter) {
          const r = 4;
          ctx.beginPath();
          ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, on ? 8 : 6, 0, Math.PI * 2);
        }
        ctx.fillStyle = on ? "#1d4ed8" : fill;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
        if (f.Label && view.scale > 2.5 && !isMeter) {
          ctx.fillStyle = "#0f172a";
          ctx.font = "600 11px ui-monospace, Menlo, monospace";
          ctx.textAlign = "center";
          ctx.fillText(f.Label, p.x, p.y - (isSeed ? 15 : 11));
        }
      } else {
        const lt = lineTypes.find((t) => t.Type_Key === f.Attributes?.Line_Type);
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        if (f.Feature_Type === "polygon") ctx.closePath();
        ctx.strokeStyle = on ? "#1d4ed8" : (lt?.Colour ?? colour);
        ctx.lineWidth = on ? (lt?.Width_px ?? 2) + 1.5 : (lt?.Width_px ?? 2);
        ctx.setLineDash(lt?.Dashed ? [9, 6] : []);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.setLineDash([]);
        if (f.Feature_Type === "polygon") {
          ctx.fillStyle = colour + "18";
          ctx.fill();
        }
        // Vertices, so a selected line can be reshaped
        if (on) {
          pts.forEach((p, i) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, editVertex?.featureId === f.Feature_ID && editVertex.index === i ? 6 : 4.5, 0, Math.PI * 2);
            ctx.fillStyle = "#fff";
            ctx.fill();
            ctx.strokeStyle = "#1d4ed8";
            ctx.lineWidth = 2;
            ctx.stroke();
          });
        }
        // Way, circuit and length, once there's room
        if (pts.length > 1 && view.scale > 1.5 && (on || showLabels)) {
          const mid = pts[Math.floor(pts.length / 2)];
          const a = f.Attributes || {};
          const tag = a.Way ? `${a.Way}${a.Circuit ?? ""}` : "";
          const txt = on ? `${tag ? tag + "  " : ""}${lineLength(f.Geometry).toFixed(1)} m` : tag;
          if (txt) {
            ctx.font = "700 11px ui-monospace, Menlo, monospace";
            ctx.textAlign = "center";
            const w = ctx.measureText(txt).width + 10;
            ctx.fillStyle = "rgba(255,255,255,.9)";
            ctx.fillRect(mid.x - w / 2, mid.y - 20, w, 15);
            ctx.fillStyle = "#0f172a";
            ctx.fillText(txt, mid.x, mid.y - 9);
          }
        }
      }
    });

    // where the next click will land
    if (snapHit) {
      const p = toPx(snapHit.point);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - 5, p.y); ctx.lineTo(p.x + 5, p.y);
      ctx.moveTo(p.x, p.y - 5); ctx.lineTo(p.x, p.y + 5);
      ctx.stroke();
    }

    // What the next click will do
    if (placing && cursor) {
      ctx.save();

      if (meterFor) {
        const c = toPx(cursor);
        const origin = toPx(meterFor.seedPoint);

        // A leader back to the plot, so it's clear which one this serves
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(c.x, c.y);
        ctx.strokeStyle = meterFor.utility.colour;
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.rect(c.x - 5, c.y - 5, 10, 10);
        ctx.fillStyle = meterFor.utility.colour;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.globalAlpha = 1;
        const label = `${meterFor.plot.plot_number} ${meterFor.utility.utility}`;
        ctx.font = "700 11px ui-monospace, Menlo, monospace";
        ctx.textAlign = "center";
        const w = ctx.measureText(label).width + 12;
        ctx.fillStyle = "rgba(15,23,42,.85)";
        ctx.fillRect(c.x - w / 2, c.y - 32, w, 17);
        ctx.fillStyle = "#fff";
        ctx.fillText(label, c.x, c.y - 20);
      } else if (nextPlot) {
        const c = toPx(cursor);
        ctx.globalAlpha = 0.75;
        housePath(ctx, c.x, c.y, 18);
        ctx.fillStyle = bedColour(nextPlot.bedrooms).bg;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.font = "700 11px ui-monospace, Menlo, monospace";
        ctx.textAlign = "center";
        const w = ctx.measureText(nextPlot.plot_number).width + 12;
        ctx.fillStyle = "rgba(15,23,42,.85)";
        ctx.fillRect(c.x - w / 2, c.y - 34, w, 17);
        ctx.fillStyle = "#fff";
        ctx.fillText(nextPlot.plot_number, c.x, c.y - 22);
      }

      ctx.restore();
    }

    // line or boundary in progress
    if (draft.length) {
      const pts = draft.map(toPx);
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (cursor) { const c = toPx(cursor); ctx.lineTo(c.x, c.y); }
      ctx.strokeStyle = typeOf(lineType)?.Colour ?? "#0f172a";
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      pts.forEach((p) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = typeOf(lineType)?.Colour ?? "#0f172a"; ctx.fill();
      });
    }
  }, [visible, selected, view, toPx, layerOf, draft, cursor, snapHit, lineTypes, editVertex, typeOf, lineType, bgImage, basemap, showLabels, showGrid, isPdfMap, pdf.tile, pdf.size, placing, meterFor, nextPlot, utilities]);

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
  /* Vertices first, then edges. A boundary's corners are often off
     screen, so requiring a vertex hit made it unselectable. */
  function featureAt(px, py) {
    for (let i = visible.length - 1; i >= 0; i--) {
      const f = visible[i];
      for (const m of f.Geometry || []) {
        const p = toPx(m);
        if (Math.hypot(p.x - px, p.y - py) <= HIT_PX) return f;
      }
    }
    for (let i = visible.length - 1; i >= 0; i--) {
      const f = visible[i];
      if (f.Feature_Type === "point") continue;
      const g = f.Geometry || [];
      const closed = f.Feature_Type === "polygon";
      const n = closed ? g.length : g.length - 1;
      for (let k = 0; k < n; k++) {
        const a = toPx(g[k]);
        const b = toPx(g[(k + 1) % g.length]);
        const vx = b.x - a.x, vy = b.y - a.y;
        const len2 = vx * vx + vy * vy;
        if (!len2) continue;
        let t = ((px - a.x) * vx + (py - a.y) * vy) / len2;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(a.x + t * vx - px, a.y + t * vy - py);
        if (d <= HIT_PX) return f;
      }
    }
    return null;
  }

  /* ── pointer ── */
  function onDown(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const r = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;

    /* Right-click on something opens its editor; right-drag on empty
       space pans. Middle always pans, whatever's under it. */
    if (e.button === 2) {
      e.preventDefault();
      const hit = featureAt(px, py);
      if (hit && !placing && !drawing) {
        setSelected([hit.Feature_ID]);
        setEditing(hit);
        return;
      }
      drag.current = { mode: "pan", startPx: [px, py], startView: { ...view } };
      return;
    }
    if (e.button === 1) {
      e.preventDefault();
      drag.current = { mode: "pan", startPx: [px, py], startView: { ...view } };
      return;
    }
    if (e.button !== 0) return;

    if (drawing) {
      const raw = toM(px, py);
      const { point } = resolve(raw[0], raw[1]);
      setDraft((d) => [...d, point]);
      return;
    }

    if (placing) {
      const raw = toM(px, py);
      const { point } = resolve(raw[0], raw[1]);
      placeAt(point);
      return;
    }

    /* A selected line shows its vertices; dragging one reshapes the line
       rather than moving the whole thing. */
    if (tool === "select" && selected.length === 1) {
      const f = features.find((x) => x.Feature_ID === selected[0]);
      if (f && f.Feature_Type !== "point") {
        const idx = (f.Geometry || []).findIndex((m) => {
          const q = toPx(m);
          return Math.hypot(q.x - px, q.y - py) <= HIT_PX;
        });
        if (idx >= 0) {
          drag.current = { mode: "vertex", featureId: f.Feature_ID, index: idx };
          setEditVertex({ featureId: f.Feature_ID, index: idx });
          return;
        }
      }
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
    } else if (!e.shiftKey) {
      setSelected([]);
    }
  }

  /* Cursor position after snapping. Vertices and ends win over the
     middle of a line, because that's usually what you meant. */
  function resolve(mx, my) {
    if (!snapOn) return { point: [mx, my], hit: null };
    const t = findSnap(targets, [mx, my], view.scale, SNAP_PX);
    if (t) return { point: [...t.point], hit: t };
    const edge = nearestOnLines(visible, [mx, my], view.scale, SNAP_PX);
    if (edge) return { point: [...edge.point], hit: edge };
    return { point: [snap(mx), snap(my)], hit: null };
  }

  function onMove(e) {
    const r = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const raw = toM(px, py);

    if (drawing || placing) {
      const { point, hit } = resolve(raw[0], raw[1]);
      setCursor(point);
      setSnapHit(hit);
    } else {
      setCursor(raw);
      setSnapHit(null);
    }

    const d = drag.current;
    if (!d) return;
    const dx = px - d.startPx[0], dy = py - d.startPx[1];

    if (d.mode === "vertex") {
      const { featureId, index } = d;
      const { point } = resolve(raw[0], raw[1]);
      setFeatures((fs) => fs.map((f) =>
        f.Feature_ID === featureId
          ? { ...f, Geometry: f.Geometry.map((g, i) => (i === index ? point : g)) }
          : f));
      return;
    }

    if (d.mode === "pan") {
      const { x: sx, y: sy } = d.startView;
      setView((v) => ({ ...v, x: sx + dx, y: sy + dy }));
      return;
    }

    const dm = [dx / view.scale, dy / view.scale];
    const origin = d.origin;
    setFeatures((fs) => fs.map((f) => {
      const orig = origin[f.Feature_ID];
      if (!orig) return f;
      return { ...f, Geometry: orig.map(([x, y]) => [snap(x + dm[0]), snap(y + dm[1])]) };
    }));
  }

  async function onUp() {
    const d = drag.current;
    drag.current = null;
    setEditVertex(null);

    if (d?.mode === "vertex") {
      const f = features.find((x) => x.Feature_ID === d.featureId);
      if (f) {
        try { await moveFeatures(projectId, [{ Feature_ID: f.Feature_ID, Geometry: f.Geometry }]); }
        catch (e) { setError(e.message); await load(projectId); }
      }
      return;
    }

    if (!d || d.mode !== "move") return;
    const updates = d.ids
      .map((id) => features.find((f) => f.Feature_ID === id))
      .filter(Boolean)
      .map((f) => ({ Feature_ID: f.Feature_ID, Geometry: f.Geometry }));
    if (!updates.length) return;
    try { await moveFeatures(projectId, updates); }
    catch (e) { setError(e.message); await load(projectId); }
  }

  /* Registered natively with passive:false — React's onWheel is passive,
     so preventDefault there is ignored and a trackpad pinch zooms the
     whole page. A pinch arrives as a wheel event with ctrlKey set. */
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const swallow = (e) => { if (e.ctrlKey) e.preventDefault(); };
    wrap.addEventListener("wheel", swallow, { passive: false });
    return () => wrap.removeEventListener("wheel", swallow);
  }, [projectId]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    const onWheelNative = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = cv.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;

      // A pinch reports far larger deltas than a wheel notch; damp it so
      // both feel like the same gesture.
      const factor = e.ctrlKey
        ? Math.exp(-e.deltaY * 0.01)
        : (e.deltaY < 0 ? 1.12 : 0.89);

      setView((v) => {
        const next = Math.min(40, Math.max(0.4, v.scale * factor));
        return {
          scale: next,
          x: px - (px - v.x) * (next / v.scale),
          y: py - (py - v.y) * (next / v.scale),
        };
      });
    };

    cv.addEventListener("wheel", onWheelNative, { passive: false });
    return () => cv.removeEventListener("wheel", onWheelNative);
  }, [projectId]);

  /* ── actions ── */
  /* Create anything missing, then place the whole range. */
  async function addAndPlace(payload) {
    const res = await ensurePlots(projectId, payload);
    setAddOpen(false);
    await load(projectId);
    const toPlace = (res.plots || []).filter((p) => !p.placed);
    if (!toPlace.length) {
      setStatus("Those plots are already on the canvas.");
      setTimeout(() => setStatus(""), 4000);
      return;
    }
    startPlacing(toPlace);
    if (res.created) {
      setStatus(`${res.created} plot${res.created === 1 ? "" : "s"} created`);
      setTimeout(() => setStatus(""), 4000);
    }
  }

  /* Seed first, then one click per meter — each landing exactly where
     it's clicked rather than being spaced automatically. Meters on a
     real site sit where the builder put them, not on a tidy row. */
  function startPlacing(list) {
    setQueue(list.map((p) => ({ ...p, done: false })));
    setMeterFor(null);
    setTool("select");
    setSelected([]);
  }

  function stopPlacing() {
    setQueue([]);
    setMeterFor(null);
  }

  /* Draw it immediately, confirm with the server after. Waiting for a
     round trip before the seed appeared made placing feel unresponsive,
     and the click has already happened — showing it is honest. */
  function addOptimistic(feature) {
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setFeatures((f) => [...f, { ...feature, Feature_ID: tempId }]);
    return tempId;
  }
  const reconcile = (tempId, saved) =>
    setFeatures((f) => f.map((x) => (x.Feature_ID === tempId ? saved : x)));
  const rollback = (tempId) =>
    setFeatures((f) => f.filter((x) => x.Feature_ID !== tempId));

  function markPlaced(plotId) {
    setQueue((q) => q.map((x) => (x.plot_id === plotId ? { ...x, done: true } : x)));
    setPlotList((l) => l.map((x) => (x.plot_id === plotId ? { ...x, placed: true } : x)));
  }

  async function placeAt(point) {
    // A meter for the plot just seeded
    if (meterFor) {
      const { plot, utility, all, placed } = meterFor;
      const draftFeature = {
        Project_ID: Number(projectId),
        Layer_Key: utility.layer_key,
        Feature_Type: "point",
        Feature_Role: "meter",
        Geometry: [point],
        Label: `${utility.utility} Meter ${plot.plot_number}`,
        Plot_ID: plot.plot_id,
        Attributes: { Meter_Utility: utility.utility },
      };
      const tempId = addOptimistic(draftFeature);

      const nextPlaced = [...placed, utility.layer_key];
      const nextUtility = all.find((u) => !nextPlaced.includes(u.layer_key));
      if (nextUtility) setMeterFor({ ...meterFor, utility: nextUtility, placed: nextPlaced });
      else { setMeterFor(null); markPlaced(plot.plot_id); }

      try { reconcile(tempId, await createFeature(projectId, draftFeature)); }
      catch (e) { rollback(tempId); setError(e.message); }
      return;
    }

    // The seed itself
    const plot = queue.find((q) => !q.done);
    if (!plot) return;

    const draftFeature = {
      Project_ID: Number(projectId),
      Layer_Key: "plot",
      Feature_Type: "point",
      Feature_Role: "plot",
      Geometry: [point],
      Label: plot.plot_number,
      Plot_ID: plot.plot_id,
      Attributes: { Bedrooms: plot.bedrooms ?? null, Config: plot.config_code ?? null },
    };
    const tempId = addOptimistic(draftFeature);

    if (utilities.length) {
      setMeterFor({ plot, seedPoint: point, utility: utilities[0], all: utilities, placed: [] });
    } else {
      markPlaced(plot.plot_id);
    }

    try { reconcile(tempId, await createFeature(projectId, draftFeature)); }
    catch (e) { rollback(tempId); setMeterFor(null); setError(e.message); }
  }

  async function finishDrawing() {
    const isPoly = tool === "boundary";
    if (draft.length < (isPoly ? 3 : 2)) { setDraft([]); return; }
    const t = typeOf(lineType);
    try {
      await createFeature(projectId, {
        Layer_Key: isPoly ? "boundary" : (t?.Layer_Key ?? "note"),
        Feature_Type: isPoly ? "polygon" : "line",
        Geometry: draft,
        Label: isPoly ? "Site boundary" : (t?.Label ?? "Line"),
        Attributes: isPoly ? {} : {
          Line_Type: lineType,
          Size: size || null,
          // Recorded at draw time using the metre tolerance, not the
          // pixel one — what it touches, not what it looked near.
          Connects: connectedTo(draft, visible, null),
        },
      });
      setDraft([]);
      setSnapHit(null);
      await load(projectId);
    } catch (e) { setError(e.message); }
  }

  /* The network tools. Each says what it did — "12 joints placed" tells
     you something; a spinner that stops does not. */
  async function runNetwork(op) {
    setBusy(op);
    try {
      if (op === "joints") {
        const r = await placeJoints(projectId);
        setStatus(r.placed ? `${r.placed} joint${r.placed === 1 ? "" : "s"} placed where cables meet`
                           : "No new junctions found");
      } else if (op === "trace") {
        if (selected.length !== 1) {
          setError("Select the source — a substation, feeder pillar or POC — then trace.");
          return;
        }
        const r = await traceNetwork(projectId, selected[0]);
        setStatus(r.traced ? `${r.traced} cable${r.traced === 1 ? "" : "s"} numbered into ways and circuits`
                           : "Nothing is connected to that source yet");
      } else if (op === "meters") {
        const r = await assignMeters(projectId);
        setStatus(r.assigned ? `${r.assigned} plot${r.assigned === 1 ? "" : "s"} assigned to a cable`
                             : "No plots were close enough to a cable");
      }
      setTimeout(() => setStatus(""), 5000);
      setError("");
      await load(projectId);
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  /* Writing to the plot record, then refreshing the local copies so the
     seed recolours and the list stays right without a full reload. */
  async function savePlot(plotId, changes, seedAttrs) {
    setPlotList((l) => l.map((x) => (x.plot_id === plotId ? {
      ...x,
      property_config_id: changes.Property_Config_ID,
      heat_source_id: changes.Heat_Source_ID,
      heat_pump_model_id: changes.Heat_Pump_Model_ID,
      bedrooms: seedAttrs?.Bedrooms ?? x.bedrooms,
      config_code: seedAttrs?.Config ?? x.config_code,
    } : x)));
    try { await bulkUpdatePlots(projectId, [plotId], changes); }
    catch (e) { setError(e.message); await load(projectId); throw e; }
  }

  async function saveFeature(id, changes) {
    setFeatures((f) => f.map((x) => (x.Feature_ID === id ? { ...x, ...changes } : x)));
    try { await updateFeature(projectId, id, changes); }
    catch (e) { setError(e.message); await load(projectId); throw e; }
  }

  async function deleteFeature(id) {
    setFeatures((f) => f.filter((x) => x.Feature_ID !== id));
    setSelected((sel) => sel.filter((x) => x !== id));
    try { await deleteFeatures(projectId, [id]); }
    catch (e) { setError(e.message); await load(projectId); throw e; }
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
      if (e.key === "Escape") { setDraft([]); setTool("select"); setSelected([]); stopPlacing(); }
      if (e.key === "Enter" && drawing) finishDrawing();
      if (e.key === "Backspace" && drawing && draft.length) {
        e.preventDefault();
        setDraft((d) => d.slice(0, -1));
      }
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
              <button className={tool === "line" ? "gt on" : "gt"}
                onClick={() => { setTool("line"); setSelected([]); setDraft([]); }}>
                Draw line
              </button>
              <button className={tool === "boundary" ? "gt on" : "gt"}
                onClick={() => { setTool("boundary"); setSelected([]); setDraft([]); }}>
                Boundary
              </button>
            </div>
            {tool === "line" && (
              <>
                <select className="gis-type" value={lineType}
                  onChange={(e) => setLineType(e.target.value)} aria-label="Line type">
                  {lineTypes.map((t) => (
                    <option key={t.Type_Key} value={t.Type_Key}>{t.Label}</option>
                  ))}
                </select>
                <input className="gis-size" value={size} placeholder="Size"
                  aria-label="Cable or pipe size" onChange={(e) => setSize(e.target.value)} />
              </>
            )}
            <label className={snapOn ? "gis-snap on" : "gis-snap"} title="Snap to existing geometry">
              <input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} />
              Snap
            </label>
            <button className={basemap?.Metres_Per_Pixel ? "btn ghost" : "btn accent"}
              onClick={() => setSetupOpen(true)}>
              {basemap?.Metres_Per_Pixel ? "Background plan" : "Set up plan & scale"}
            </button>
            <button className="btn ghost" onClick={() => setView({ x: 60, y: 60, scale: 4 })}>Reset view</button>
            {selected.length > 0 && (
              <button className="btn ghost danger" onClick={removeSelected}>
                Delete {selected.length}
              </button>
            )}
          </>
        )}
      </div>

      {editing && (
        <FeatureEditor
          feature={editing}
          layers={layers}
          lineTypes={lineTypes}
          plotList={plotList}
          lookups={lookups}
          onSave={saveFeature}
          onSavePlot={savePlot}
          onDelete={deleteFeature}
          onClose={() => setEditing(null)}
        />
      )}

      {addOpen && projectId && (
        <AddPlotsModal
          existing={plotList}
          lookups={lookups}
          developers={developers}
          contractNumber={project?.Contract_Number}
          utilities={utilities}
          onStart={addAndPlace}
          onClose={() => setAddOpen(false)}
        />
      )}

      {setupOpen && projectId && (
        <BasemapSetup
          projectId={projectId}
          project={project}
          basemap={basemap}
          onChange={setBasemap}
          onClose={() => setSetupOpen(false)}
        />
      )}

      {projectId && !basemap?.Metres_Per_Pixel && (
        <Banner kind="warn">
          No scale set. Import a plan and calibrate it before placing plots or drawing
          trenches &mdash; otherwise nothing on the canvas is a real measurement.
        </Banner>
      )}

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

            <PlacementPanel
              onAdd={() => setAddOpen(true)}
              plots={plotList}
              utilities={utilities}
              queue={queue}
              current={nextPlot}
              meterFor={meterFor}
              onStart={startPlacing}
              onCancel={stopPlacing}
            />

            <p className="gl-title">Network</p>
            <div className="gn-tools">
              <button className="gn" disabled={!!busy} onClick={() => runNetwork("joints")}>
                {busy === "joints" ? "Working\u2026" : "Place joints"}
              </button>
              <button className="gn" disabled={!!busy || selected.length !== 1}
                title={selected.length === 1 ? "Trace from the selected feature" : "Select a source first"}
                onClick={() => runNetwork("trace")}>
                {busy === "trace" ? "Tracing\u2026" : "Trace from source"}
              </button>
              <button className="gn" disabled={!!busy} onClick={() => runNetwork("meters")}>
                {busy === "meters" ? "Working\u2026" : "Assign meters"}
              </button>
              <label className="gn-check">
                <input type="checkbox" checked={showLabels}
                  onChange={(e) => setShowLabels(e.target.checked)} />
                Show way &amp; circuit
              </label>
            </div>

            <p className="gl-title">View</p>
            <label className={showGrid ? "gl" : "gl off"}>
              <input type="checkbox" checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)} />
              <span className="gl-swatch grid" />
              <span className="gl-name">Grid</span>
              <span className="gl-count">{GRID_M}m</span>
            </label>

            <p className="gl-title">Help</p>
            <ul className="gl-help">
              <li>Right or middle drag to pan</li>
              <li>Right-click an object to edit it</li>
              <li>Scroll to zoom on the cursor</li>
              <li>Shift-click to multi-select</li>
              <li><kbd>Esc</kbd> cancels, <kbd>Del</kbd> removes</li>
              {drawing && <li><kbd>Enter</kbd> finishes, <kbd>Backspace</kbd> undoes</li>}
              {!drawing && <li>Select a line to drag its points</li>}
            </ul>
          </div>

          <div className="gis-canvas-wrap" ref={wrapRef}>
            <canvas
              ref={canvasRef}
              className={drawing || placing ? "crosshair" : ""}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={(e) => { e.currentTarget.releasePointerCapture?.(e.pointerId); onUp(); }}
              onPointerCancel={() => { drag.current = null; setEditVertex(null); }}
              onPointerLeave={() => { drag.current = null; setCursor(null); }}
              onContextMenu={(e) => e.preventDefault()}
              onAuxClick={(e) => e.preventDefault()}
            />
            <div className="gis-hud">
              <span className="hud-scale">
                <span className="hud-bar" style={{ width: barM * view.scale }} />
                {barM} m
              </span>
              {cursor && (
                <span className="hud-xy mono">
                  {cursor[0].toFixed(1)}, {cursor[1].toFixed(1)} m
                  {basemap?.Ref_Easting != null && (
                    <span className="hud-grid">
                      {(Number(basemap.Ref_Easting) + (cursor[0] - Number(basemap.Ref_Canvas_X))).toFixed(1)},
                      {" "}
                      {(Number(basemap.Ref_Northing) - (cursor[1] - Number(basemap.Ref_Canvas_Y))).toFixed(1)}
                    </span>
                  )}
                </span>
              )}
              <span className="hud-zoom">{Math.round(view.scale * 25)}%</span>
              {isPdfMap && <span className="hud-vector" title="Re-rendered from the PDF at this zoom">vector</span>}
            </div>
            {drawing && (
              <div className="gis-tip">
                {tool === "boundary" ? "Click to place corners" : "Click to place points"}
                {" \u00B7 "}<kbd>Enter</kbd> to finish{" \u00B7 "}
                <kbd>Backspace</kbd> undoes{" \u00B7 "}<kbd>Esc</kbd> cancels
                {draft.length > 0 && ` \u00B7 ${draft.length} placed`}
                {draft.length > 1 && ` \u00B7 ${lineLength(draft).toFixed(1)} m`}
                {snapHit && <span className="tip-snap">snapping to {snapHit.kind}</span>}
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
.gl-swatch.grid { background: repeating-linear-gradient(0deg,#cbd5e1 0 1px,transparent 1px 4px),
  repeating-linear-gradient(90deg,#cbd5e1 0 1px,transparent 1px 4px); }
.gl-name { flex: 1; }
.gl-count { font-size: 10.5px; font-weight: 700; color: var(--muted); }
.gis-layers > .pp { margin-bottom: 14px; }
.gn-tools { display: flex; flex-direction: column; gap: 5px; }
.gn { background: var(--white); border: 1px solid var(--border); border-radius: 6px;
  padding: 7px 10px; cursor: pointer; font: 600 11.5px inherit; color: var(--text); text-align: left; }
.gn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
.gn:disabled { opacity: .45; cursor: not-allowed; }
.gn-check { display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 500;
  text-transform: none; letter-spacing: 0; color: var(--muted); margin: 4px 0 0; cursor: pointer; }
.gl-help { margin: 0; padding-left: 16px; font-size: 11px; color: var(--muted); line-height: 1.7; }
kbd { font-family: ui-monospace, Menlo, monospace; font-size: 10px; background: var(--bg);
  border: 1px solid var(--border); border-radius: 3px; padding: 0 4px; }

.gis-canvas-wrap { position: relative; border: 1px solid var(--border); border-radius: var(--radius);
  overflow: hidden; background: var(--white); min-height: 0; }
.gis-canvas-wrap canvas { display: block; width: 100%; height: 100%; cursor: default;
  touch-action: none; overscroll-behavior: contain; }
.gis-canvas-wrap canvas.crosshair, .gis-canvas-wrap canvas.crosshair:active { cursor: crosshair; }
.gis-hud { position: absolute; left: 12px; bottom: 12px; display: flex; align-items: center; gap: 14px;
  background: rgba(255,255,255,.94); border: 1px solid var(--border); border-radius: 7px;
  padding: 6px 12px; font-size: 11px; color: var(--muted); }
.hud-scale { display: flex; align-items: center; gap: 7px; font-weight: 600; }
.hud-bar { height: 3px; background: var(--text); border-radius: 2px;
  border-left: 1px solid var(--text); border-right: 1px solid var(--text); }
.hud-xy { font-family: ui-monospace, Menlo, monospace; }
.hud-grid { margin-left: 10px; color: var(--accent); font-weight: 600; }
.hud-zoom { font-weight: 600; }
.hud-vector { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
  background: var(--ok-bg); color: var(--ok-text); border: 1px solid var(--ok-border);
  border-radius: 4px; padding: 1px 6px; }
.gis-tip { position: absolute; left: 50%; top: 12px; transform: translateX(-50%);
  background: var(--accent); color: #fff; border-radius: 999px; padding: 6px 16px;
  font-size: 11.5px; font-weight: 600; white-space: nowrap; }
.gis-tip kbd { background: rgba(255,255,255,.22); border-color: rgba(255,255,255,.35); color: #fff; }
.tip-snap { margin-left: 10px; background: #dc2626; border-radius: 999px; padding: 1px 9px; font-size: 10.5px; }
.gis-type { width: auto; min-width: 150px; font-size: 12.5px; }
.gis-size { width: 88px; font-size: 12.5px; }
.gis-snap { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600;
  text-transform: none; letter-spacing: 0; color: var(--muted); background: var(--white);
  border: 1px solid var(--border); border-radius: 7px; padding: 6px 12px; margin: 0; cursor: pointer; }
.gis-snap.on { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
.gis-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  border: 1px dashed var(--border); border-radius: var(--radius); background: var(--bg); }
.ge-title { margin: 0 0 4px; font-size: 15px; font-weight: 700; color: var(--text); }
.gis-empty p { margin: 0; font-size: 12.5px; color: var(--muted); }
`;
