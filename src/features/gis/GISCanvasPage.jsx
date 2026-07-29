import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { listProjects } from "../../api/projects.js";
import {
  listGis, createFeature, moveFeatures, deleteFeatures, updateFeature, ensurePlots,
  placeJoints, traceNetwork, assignMeters, bulkUpdateFeatures,
} from "../../api/gis.js";
import {
  SNAP_PX, CONNECT_M, snapTargets, findSnap, nearestOnLines, connectedTo, lineLength,
  classOf, classLabel, joinLines, isTrenchType,
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
import { resolveStyle, appearance, subjectOf, symbolPath, STROKE_ONLY } from "../../lib/gisStyle.js";
import { splitByBoundary, boundaryPolygons, pointInAny, pointInPolygon, surfaceFor,
  ON_SITE, OFF_SITE } from "./boundary.js";
import { planAutoService, mainsTrenches, teeIntoMains, nearestOnPolyline } from "./autoService.js";
import {
  circuitLetter, nextCircuitId, metredSeedsInside, metersOfSeeds, circuitKva,
  assignWay, releaseWays, circuitsFrom, pocUnit, spanLabel, originNodeFor, traceFrom,
  circuitReport,
} from "./electric.js";
import FeatureEditor from "./FeatureEditor.jsx";
import BulkEditor from "./BulkEditor.jsx";
import BomModal from "./BomModal.jsx";
import { MenuBar, Menu, MenuGroup, MenuItem, MenuLayer } from "./GisMenus.jsx";
import CircuitReport from "./CircuitReport.jsx";
import { feederSections, junctionNodes, cablesFor, trenchComponents } from "./feeder.js";
import TrenchCheck from "./TrenchCheck.jsx";
import { usePdfPage, drawTile } from "./usePdfPage.js";

/* GIS canvas — stage 1.

   Coordinates are metres from the site origin. The canvas converts to
   pixels at draw time, so zooming never touches stored data and a
   distance measured on screen is a real distance.

   What's here: pan, zoom, grid, scale bar, layers, plot markers seeded
   from the project's plots, select and drag, and a boundary tool.
   Drawing tools and the electrical model come next. */

const GRID_M = 5;                 // metres between grid lines
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
  const [styles, setStyles] = useState([]);
  const [surfaceTypes, setSurfaceTypes] = useState([]);
  const [surface, setSurface] = useState("");
  const [standard, setStandard] = useState("");   // operator whose style rules apply
  const [editing, setEditing] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [picker, setPicker] = useState(null);   // { x, y, items } when a click is ambiguous
  const [bomOpen, setBomOpen] = useState(false);
  const [progress, setProgress] = useState(null);   // { done, total, label } while a long run works
  const [trace, setTrace] = useState(null);         // { startLabel, legs } from a full trace
  const [reportOpen, setReportOpen] = useState(false);
  /* Placing plots floats over the canvas rather than sitting in a
     sidebar. It has to stay open while the canvas is clicked — two clicks
     per plot — so it cannot be a modal with a backdrop. */
  const [placeOpen, setPlaceOpen] = useState(false);
  const [trenchCheck, setTrenchCheck] = useState(null);
  /* A ref, not state: the loop below has to read the current value
     between awaits, and a state read there would see the value from the
     render that started it. */
  const cancelRef = useRef(false);

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
      setStyles(res.styles || []);
      setSurfaceTypes(res.surfaceTypes || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [projects]);

  useEffect(() => { if (projectId) load(projectId); }, [projectId, load]);

  const layerOf = useCallback(
    (key) => layers.find((l) => l.Layer_Key === key) || { Colour: "#64748b", Label: key },
    [layers]
  );

  /* Hiding used to be per layer. The menus ask for finer control — LV
     cables separately from HV, meters separately from joints — so the
     hidden set now holds three kinds of key and a feature is hidden if
     any of its own match. Prefixed so a line type can never collide with
     a layer that happens to share its name. */
  const classKeys = useCallback((f) => [
    f.Layer_Key,
    f.Attributes?.Line_Type ? `lt:${f.Attributes.Line_Type}` : null,
    f.Feature_Role && f.Feature_Role !== "shape" ? `role:${f.Feature_Role}` : null,
    /* Layer and role together, so a utility menu can hide its own meters
       without hiding everyone's. Every meter carries role:meter, which is
       what the Electric menu's entry uses; gas:role:meter is narrower. */
    f.Layer_Key && f.Feature_Role && f.Feature_Role !== "shape"
      ? `${f.Layer_Key}:role:${f.Feature_Role}` : null,
  ].filter(Boolean), []);

  const visible = useMemo(
    () => features.filter((f) => !classKeys(f).some((k) => hidden.includes(k))),
    [features, hidden, classKeys]
  );

  /* How many of each class exist, so a toggle can say whether it will
     change anything before you click it. */
  const classCount = useMemo(() => {
    const c = {};
    for (const f of features) for (const k of classKeys(f)) c[k] = (c[k] || 0) + 1;
    return c;
  }, [features, classKeys]);

  /* Which class is soloed, if any. Kept alongside hidden rather than
     derived from it: the two can look identical — soloing the only
     visible layer leaves the same hidden set as hiding all the others —
     and S has to know whether pressing it again means "show everything"
     or "isolate this". */
  const [solo, setSolo] = useState(null);

  const toggleClass = useCallback((key) => {
    /* Hiding by hand ends a solo. Otherwise S would still be lit while
       the visible set no longer matches what it isolated. */
    setSolo(null);
    setHidden((h) => (h.includes(key) ? h.filter((x) => x !== key) : [...h, key]));
  }, []);

  /* Isolate one class: hide every class key that isn't carried by a
     feature carrying this one.

     Working from the features rather than from a list of known classes
     matters — a feature is hidden if ANY of its keys is hidden, so
     soloing an electric line type has to leave "electric" visible or the
     thing being soloed disappears with everything else. */
  const soloClass = useCallback((key) => {
    if (solo === key) { setSolo(null); setHidden([]); return; }
    const keep = new Set();
    const all = new Set();
    for (const f of features) {
      const ks = classKeys(f);
      ks.forEach((k) => all.add(k));
      if (ks.includes(key)) ks.forEach((k) => keep.add(k));
    }
    setSolo(key);
    setHidden([...all].filter((k) => !keep.has(k)));
  }, [features, classKeys, solo]);

  /* Every line type on one layer, for that utility's menu. */
  const typesOn = useCallback(
    (layerKey) => lineTypes.filter((t) => t.Layer_Key === layerKey),
    [lineTypes]
  );
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  /* Bulk actions need the selection to be one kind of thing. Editing a
     trench and a cable together would offer fields that only apply to
     one of them, and joining only means anything within a class. */
  const selectedFeatures = useMemo(
    () => selected.map((id) => features.find((f) => f.Feature_ID === id)).filter(Boolean),
    [selected, features]
  );
  const selectionClass = useMemo(() => {
    if (!selectedFeatures.length) return null;
    const first = classOf(selectedFeatures[0]);
    return selectedFeatures.every((f) => classOf(f) === first) ? first : null;
  }, [selectedFeatures]);
  const joinable = selectedFeatures.length > 1 && !!selectionClass
    && selectedFeatures.every((f) => f.Feature_Type === "line");

  const drawing = tool === "boundary" || tool === "line" || tool === "circuit";
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

  /* One resolver for the whole frame. Styles and layers change rarely,
     the chosen standard almost never, so the closure is rebuilt only
     when one of them does — not per feature, per repaint. */
  const styleFor = useCallback((f, fallback = {}) => {
    const resolved = resolveStyle(subjectOf(f, layers), styles,
      { organisationId: standard || null });
    const lt = lineTypes.find((t) => t.Type_Key === f.Attributes?.Line_Type);
    const layer = layers.find((l) => l.Layer_Key === f.Layer_Key);
    /* Falls back to what the canvas drew before styles existed, so an
       unstyled project looks exactly as it did. */
    return appearance(resolved, view.scale, {
      colour: lt?.Colour ?? layer?.Colour ?? "#64748b",
      widthPx: lt?.Width_px ?? 2,
      ...fallback,
    });
  }, [styles, layers, lineTypes, standard, view.scale]);

  /* A plot seed's size and symbol are configurable like anything else,
     but its colour is not: it carries the bedroom colour used on the
     plot badges, the plot summary and the House Types screen, and a
     style rule that quietly overrode it would break the one thing the
     symbol is read for at a glance.

     Half-width of 8 is what the canvas drew before styles existed, so an
     unstyled project is unchanged. */
  const seedStyle = useCallback((f, on) => {
    const ps = styleFor(f, { symbol: "house", symbolPx: 8 });
    return { ...ps, symbolPx: (on ? 1.25 : 1) * ps.symbolPx,
      colour: bedColour(f.Attributes?.Bedrooms).bg };
  }, [styleFor]);

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
      /* Outside its zoom band, unless it's selected — hiding the thing
         someone just clicked would look like it had been deleted. */
      if (!on && !styleFor(f).visible) return;

      if (f.Feature_Type === "point") {
        const p = pts[0];
        const isMeter = f.Feature_Role === "meter";
        const isSeed = f.Feature_Role === "plot";
        // Seeds take the bedroom colour used everywhere else for plots
        const fill = isSeed ? bedColour(f.Attributes?.Bedrooms).bg : colour;

        if (isSeed) {
          const ss = seedStyle(f, on);
          symbolPath(ctx, ss.symbol, p.x, p.y, ss.symbolPx);
        } else {
          /* Symbol and size come from the style, so a DNO that draws
             meters as hexagons gets hexagons without a code change. */
          const ps = styleFor(f);
          symbolPath(ctx, ps.symbol, p.x, p.y, (on ? 1.3 : 1) * (isMeter ? ps.symbolPx * 0.6 : ps.symbolPx));
          if (STROKE_ONLY.has(ps.symbol)) {
            ctx.strokeStyle = on ? "#1d4ed8" : (ps.colour ?? fill);
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.beginPath();
          }
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
        const st = styleFor(f);
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        if (f.Feature_Type === "polygon") ctx.closePath();
        ctx.strokeStyle = on ? "#1d4ed8" : st.colour;
        ctx.lineWidth = on ? st.widthPx + 1.5 : st.widthPx;
        ctx.setLineDash(st.dash);
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
        if (pts.length > 1 && st.showLabel && view.scale > 1.5 && (on || showLabels)) {
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

    /* Where the next click will land, and what it is latching onto.

       One marker for every kind of snap told you something was
       happening but not what — and an end is the one that matters,
       because that is the join the network is traced through. So an end
       gets its own shape, its own word, and a highlight on the line it
       belongs to. Meeting a line's end is a different act from passing
       near its middle, and the canvas should say which one you're
       about to do. */
    if (snapHit) {
      const p = toPx(snapHit.point);
      const isEnd = snapHit.kind === "end";

      /* Starting a run on the end of another run of the same class is
         the one snap that makes a connected network, so it gets its own
         colour. Green because it is the case you want: this end and
         that end are close enough to be treated as one point, and the
         cable you are about to draw will trace through. Everything else
         is a positioning aid and stays amber or red. */
      const continuing = isEnd && snapHit.sameClass;
      const tint = continuing ? "#16a34a" : isEnd ? "#dc2626" : "#f59e0b";

      ctx.save();

      // The line it belongs to, so there's no doubt which one was caught
      const target = visible.find((f) => f.Feature_ID === snapHit.featureId);
      if (target && target.Feature_Type !== "point" && (target.Geometry || []).length > 1) {
        const tp = target.Geometry.map(toPx);
        ctx.beginPath();
        tp.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        if (target.Feature_Type === "polygon") ctx.closePath();
        ctx.strokeStyle = tint;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 9;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.strokeStyle = tint;
      ctx.fillStyle = tint;
      ctx.lineWidth = 2;

      if (continuing) {
        /* Small, and sitting exactly on the existing end rather than
           near it — the point of it is to say "these two are the same
           point now", so anything larger would obscure the thing it is
           describing. The white ring keeps it legible over a dark
           basemap. */
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6.5, 0, Math.PI * 2);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = tint;
        ctx.fill();
      } else if (isEnd) {
        // Filled square, white-cored — reads as a terminal, not a hint
        ctx.beginPath();
        ctx.rect(p.x - 7, p.y - 7, 14, 14);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.rect(p.x - 3, p.y - 3, 6, 6);
        ctx.fill();
      } else if (snapHit.kind === "mid") {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 8); ctx.lineTo(p.x + 8, p.y);
        ctx.lineTo(p.x, p.y + 8); ctx.lineTo(p.x - 8, p.y);
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x - 5, p.y); ctx.lineTo(p.x + 5, p.y);
        ctx.moveTo(p.x, p.y - 5); ctx.lineTo(p.x, p.y + 5);
        ctx.stroke();
      }

      // Name it on the canvas. The tip bar is at the bottom of the
      // screen and the cursor is not.
      const word = isEnd ? "END"
        : snapHit.kind === "mid" ? "MIDPOINT"
        : snapHit.kind === "vertex" ? "POINT"
        : snapHit.kind === "edge" ? "ON LINE"
        : "POINT";
      const tag = continuing ? "JOINS HERE"
        : snapHit.sameClass ? `${word} \u00B7 SAME TYPE`
        : word;
      ctx.font = "700 10px ui-monospace, Menlo, monospace";
      ctx.textAlign = "left";
      const tw = ctx.measureText(tag).width;
      ctx.fillStyle = tint;
      ctx.fillRect(p.x + 12, p.y - 20, tw + 10, 15);
      ctx.fillStyle = "#fff";
      ctx.fillText(tag, p.x + 17, p.y - 9);

      ctx.restore();
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
        symbolPath(ctx, "house", c.x, c.y,
          seedStyle({ Layer_Key: "plot", Feature_Role: "plot", Attributes: {} }, false).symbolPx);
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
  }, [visible, selected, view, toPx, layerOf, styleFor, seedStyle, draft, cursor, snapHit, lineTypes, editVertex, typeOf, lineType, bgImage, basemap, showLabels, showGrid, isPdfMap, pdf.tile, pdf.size, placing, meterFor, nextPlot, utilities]);

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
  /* Everything within reach of the click, not just the first thing
     found.

     The old version returned on the first vertex within tolerance,
     newest feature first. Auto Service puts a service trench's end and
     every cable's middle vertex exactly on the plot seed, and those are
     drawn after it — so the seed could never be clicked. Coincident
     geometry is the normal case here, not an edge case.

     Ranked rather than ordered by age: a point beats a line at the same
     spot, because a point is the smaller target and is what you were
     aiming at, and a vertex beats an edge for the same reason. */
  function candidatesAt(px, py) {
    const out = [];
    for (const f of visible) {
      const g = f.Geometry || [];
      let best = null;

      for (const m of g) {
        const p = toPx(m);
        const d = Math.hypot(p.x - px, p.y - py);
        if (d <= HIT_PX && (!best || d < best.d)) best = { d, via: "vertex" };
      }

      if (f.Feature_Type !== "point") {
        const closed = f.Feature_Type === "polygon";
        const segs = closed ? g.length : g.length - 1;
        for (let k = 0; k < segs; k++) {
          const a = toPx(g[k]);
          const b = toPx(g[(k + 1) % g.length]);
          const vx = b.x - a.x, vy = b.y - a.y;
          const len2 = vx * vx + vy * vy;
          if (!len2) continue;
          let t = ((px - a.x) * vx + (py - a.y) * vy) / len2;
          t = Math.max(0, Math.min(1, t));
          const d = Math.hypot(a.x + t * vx - px, a.y + t * vy - py);
          if (d <= HIT_PX && (!best || d < best.d)) best = { d, via: "edge" };
        }
      }

      if (best) out.push({ feature: f, ...best });
    }

    const rank = (c) => (c.feature.Feature_Type === "point" ? 0 : 1) * 100
      + (c.via === "vertex" ? 0 : 10);
    return out.sort((a, b) => rank(a) - rank(b) || a.d - b.d);
  }

  const featureAt = (px, py) => candidatesAt(px, py)[0]?.feature ?? null;

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
       rather than moving the whole thing. Alt turns the same click into
       remove-this-point, or add-one-here when it lands on a segment. */
    if (tool === "select" && selected.length === 1) {
      const f = features.find((x) => x.Feature_ID === selected[0]);
      if (f && f.Feature_Type !== "point") {
        const idx = vertexAt(f, px, py);
        if (idx >= 0) {
          if (e.altKey) { removeVertex(f, idx); return; }
          drag.current = {
            mode: "vertex", featureId: f.Feature_ID, index: idx, startPx: [px, py],
            /* Recorded at the start: which end it is, and what class the
               line belongs to, so the move handler doesn't have to work
               it out on every pointer event. */
            isEnd: f.Feature_Type === "line"
              && (idx === 0 || idx === (f.Geometry || []).length - 1),
            lineType: f.Attributes?.Line_Type ?? null,
          };
          setEditVertex({ featureId: f.Feature_ID, index: idx });
          return;
        }
        if (e.altKey) {
          const seg = segmentAt(f, px, py);
          if (seg) { addVertex(f, seg.index, seg.point); return; }
        }
      }
    }

    const cands = candidatesAt(px, py);
    /* More than one thing under the cursor, and none of them already
       chosen — ask rather than pick. Shift keeps multi-select quick by
       taking the best candidate, and a click on something already
       selected goes straight to dragging it, so choosing once is
       enough. */
    if (cands.length > 1 && !e.shiftKey
        && !cands.some((c) => selected.includes(c.feature.Feature_ID))) {
      setPicker({ x: px, y: py, items: cands });
      return;
    }
    setPicker(null);
    const hit = cands[0]?.feature ?? null;
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
     middle of a line, because that's usually what you meant.

     Starting a line prefers its own class first: a mains trench begun
     near both a cable and another mains trench takes the trench. A run
     almost always continues from the run it belongs to, and once the
     first point is down the general rules take over — the far end is
     usually meeting something else entirely. */
  /* opts.sameClass names a class to prefer, and opts.exclude a feature to
     ignore — a vertex being dragged must not snap to its own line, which
     is by definition the nearest geometry to it. */
  function resolve(mx, my, opts = {}) {
    if (!snapOn) return { point: [mx, my], hit: null };

    const usable = opts.exclude != null
      ? targets.filter((t) => t.featureId !== opts.exclude)
      : targets;

    /* Same class first, both when starting a line and when dragging an
       end onto another. A cable end near a trench should join the cable
       it belongs with, not the trench that happens to run past. */
    const preferred = opts.sameClass ?? (tool === "line" && draft.length === 0 ? lineType : null);
    if (preferred) {
      const own = usable.filter((t) => t.lineType === preferred);
      const t = findSnap(own, [mx, my], view.scale, SNAP_PX);
      if (t) return { point: [...t.point], hit: { ...t, sameClass: true } };

      /* Anywhere along a line of the same class, not only its vertices
         and midpoints. A trench is usually met part way along rather than
         at a drawn point, and requiring a vertex would mean the join can
         only be made where someone happened to click when drawing it. */
      const ownLines = visible.filter((f) =>
        f.Feature_Type === "line"
        && f.Feature_ID !== opts.exclude
        && (f.Attributes?.Line_Type ?? null) === preferred);
      const e = nearestOnLines(ownLines, [mx, my], view.scale, SNAP_PX);
      if (e) return { point: [...e.point], hit: { ...e, sameClass: true } };
    }

    if (opts.exclude != null) {
      const t = findSnap(usable, [mx, my], view.scale, SNAP_PX);
      if (t) return { point: [...t.point], hit: t };
      const edge = nearestOnLines(
        visible.filter((f) => f.Feature_ID !== opts.exclude), [mx, my], view.scale, SNAP_PX);
      if (edge) return { point: [...edge.point], hit: edge };
      return { point: [mx, my], hit: null };
    }

    const t = findSnap(targets, [mx, my], view.scale, SNAP_PX);
    if (t) return { point: [...t.point], hit: t };
    const edge = nearestOnLines(visible, [mx, my], view.scale, SNAP_PX);
    if (edge) return { point: [...edge.point], hit: edge };
    /* Nothing in range, so nothing is changed. Snap means snap to
       geometry — rounding to a metre grid nobody can see reads as the
       click being misplaced, and it quietly moved every point that
       missed a target. */
    return { point: [mx, my], hit: null };
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

    /* Vertex first, and the delta after it. A vertex drag follows the
       cursor absolutely rather than by an offset, so it carries no
       startPx — reading one above this branch threw on every move and
       took the whole drag with it. Anything added below here that needs
       no delta belongs above the line that takes one. */
    if (d.mode === "vertex") {
      const { featureId, index, isEnd, lineType: ownType } = d;
      /* An end vertex is how one line is joined to another, so it gets
         the same treatment as starting a line: its own class first, and
         never its own geometry. A middle vertex is just being moved and
         takes the ordinary snap. */
      const { point, hit } = resolve(raw[0], raw[1], {
        exclude: featureId,
        sameClass: isEnd ? ownType : null,
      });
      setSnapHit(hit);
      setFeatures((fs) => fs.map((f) =>
        f.Feature_ID === featureId
          ? { ...f, Geometry: f.Geometry.map((g, i) => (i === index ? point : g)) }
          : f));
      return;
    }

    if (!d.startPx) return;
    const dx = px - d.startPx[0], dy = py - d.startPx[1];

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
      return { ...f, Geometry: orig.map(([x, y]) => [x + dm[0], y + dm[1]]) };
    }));
  }

  async function onUp() {
    const d = drag.current;
    drag.current = null;
    setEditVertex(null);

    if (d?.mode === "vertex") {
      setSnapHit(null);
      const f = features.find((x) => x.Feature_ID === d.featureId);
      if (!f) return;
      try {
        await moveFeatures(projectId, [{ Feature_ID: f.Feature_ID, Geometry: f.Geometry }]);

        /* Moving an end onto another line is how a connection is made,
           so the connection has to be recorded — tracing walks Connects,
           and a join that only exists geometrically stops the network
           dead at exactly the point someone just joined it.

           Recomputed rather than added to: dragging an end away from a
           line breaks a connection as surely as dragging it on makes
           one, and only recomputing catches both. */
        if (d.isEnd) {
          /* Landing part way along another line has to give that line a
             vertex at the meeting point.

             Two things depend on it. connectedTo measures against
             vertices, so without one the join is invisible to tracing.
             And the feeder router builds its graph from trench vertices —
             two lines crossing with no shared vertex are two separate
             networks to it, which is exactly the fault the connectivity
             check reports and nobody can see on screen.

             teeIntoMains returns null when a vertex is already close
             enough, so nothing is inserted twice. */
          const end = f.Geometry[d.index];
          const ownType = f.Attributes?.Line_Type ?? null;
          const teed = [];
          for (const other of features) {
            if (other.Feature_ID === f.Feature_ID) continue;
            if (other.Feature_Type !== "line") continue;
            if ((other.Attributes?.Line_Type ?? null) !== ownType) continue;
            const g = teeIntoMains(other.Geometry, end, CONNECT_M);
            if (g) teed.push({ Feature_ID: other.Feature_ID, Geometry: g });
          }
          if (teed.length) {
            await moveFeatures(projectId, teed);
            /* Read back before working out connections: connectedTo has
               to see the vertices that were just inserted. */
            setFeatures((fs) => fs.map((x) => {
              const t = teed.find((y) => y.Feature_ID === x.Feature_ID);
              return t ? { ...x, Geometry: t.Geometry } : x;
            }));
          }

          const withTees = features.map((x) => {
            const t = teed.find((y) => y.Feature_ID === x.Feature_ID);
            return t ? { ...x, Geometry: t.Geometry } : x;
          });
          const others = connectedTo(f.Geometry, withTees.filter(
            (x) => !hidden.some((k) => classKeys(x).includes(k))), f.Feature_ID);
          const before = [...(f.Attributes?.Connects || [])].sort().join(",");
          if (others.sort().join(",") !== before) {
            const updates = [{
              Feature_ID: f.Feature_ID,
              Attributes: { ...f.Attributes, Connects: others },
            }];

            /* Both ends of a join have to know about it. The features it
               now touches gain this one; the ones it used to touch and
               no longer does lose it. */
            const wasLinked = f.Attributes?.Connects || [];
            const touched = [...new Set([...others, ...wasLinked])];
            for (const id of touched) {
              const o = withTees.find((x) => x.Feature_ID === id);
              if (!o) continue;
              const cur = o.Attributes?.Connects || [];
              const want = others.includes(id)
                ? [...new Set([...cur, f.Feature_ID])]
                : cur.filter((x) => x !== f.Feature_ID);
              if (want.sort().join(",") !== [...cur].sort().join(",")) {
                updates.push({ Feature_ID: id, Attributes: { ...o.Attributes, Connects: want } });
              }
            }

            await bulkUpdateFeatures(projectId, updates);
            await load(projectId);

            const gained = others.filter((id) => !wasLinked.includes(id)).length;
            const lost = wasLinked.filter((id) => !others.includes(id)).length;
            if (gained || lost || teed.length) {
              setStatus([
                gained ? `joined to ${gained}` : null,
                teed.length ? `${teed.length} tee point(s) added` : null,
                lost ? `disconnected from ${lost}` : null,
              ].filter(Boolean).join(", "));
              setTimeout(() => setStatus(""), 5000);
            }
          }
        }
      } catch (e) { setError(e.message); await load(projectId); }
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
    if (tool === "circuit") {
      if (draft.length < 3) { setDraft([]); setTool("select"); return; }
      await finishCircuit(draft);
      return;
    }
    const isPoly = tool === "boundary";
    if (draft.length < (isPoly ? 3 : 2)) { setDraft([]); return; }
    const t = typeOf(lineType);

    if (isPoly) {
      try {
        await createFeature(projectId, {
          Layer_Key: "boundary", Feature_Type: "polygon",
          Geometry: draft, Label: "Site boundary", Attributes: {},
        });
        setDraft([]); setSnapHit(null);
        await load(projectId);
      } catch (e) { setError(e.message); }
      return;
    }

    /* A run that leaves the site is stored as two features, not one row
       with a flag. The halves have different lengths, costs and
       consents, and Length_m is one number per row.

       With no boundary drawn, site comes back null and one feature is
       created as before. Calling everything on-site because nobody has
       drawn the red line yet would put the wrong figure in a quote. */
    const runs = splitByBoundary(draft, boundaryPolygons(visible));

    try {
      const made = [];
      for (const run of runs) {
        made.push(await createFeature(projectId, {
          Layer_Key: t?.Layer_Key ?? "note",
          Feature_Type: "line",
          Geometry: run.geometry,
          Label: t?.Label ?? "Line",
          Attributes: {
            Line_Type: lineType,
            /* Written by which kind of run this is, not by whatever was
               last typed into a field that is now hidden. */
            Size: isTrenchType(lineType, lineTypes) ? null : (size || null),
            Surface_Type: isTrenchType(lineType, lineTypes)
              ? surfaceFor(run.site, surface, surfaceTypes) : null,
            Site: run.site,
            // Recorded at draw time using the metre tolerance, not the
            // pixel one — what it touches, not what it looked near.
            Connects: connectedTo(run.geometry, visible, null),
          },
        }));
      }

      /* Consecutive runs meet at the boundary, so they have to know
         about each other. Tracing walks Connects, and without this a
         network would stop dead at the red line — which is exactly where
         it most needs to carry on. The ids only exist once the rows do,
         hence the second pass. */
      if (made.length > 1) {
        const ids = made.map((m) => m.Feature_ID).filter(Boolean);
        if (ids.length === made.length) {
          await bulkUpdateFeatures(projectId, made.map((m, i) => ({
            Feature_ID: m.Feature_ID,
            Attributes: {
              ...m.Attributes,
              Connects: [...new Set([
                ...(m.Attributes?.Connects || []),
                ...[ids[i - 1], ids[i + 1]].filter(Boolean),
              ])],
            },
          })));
        }
      }

      setDraft([]);
      setSnapHit(null);
      await load(projectId);
      const off = runs.filter((r) => r.site === OFF_SITE).length;
      const surfaces = isTrenchType(lineType, lineTypes)
        ? [...new Set(runs.map((r) => surfaceFor(r.site, surface, surfaceTypes) ?? "none"))]
        : [];
      if (runs.length > 1) {
        setStatus(`Split at the boundary \u2014 ${runs.length} runs, ${off} off site`
          + (surfaces.length ? ` \u00B7 surface: ${surfaces.join(", ")}` : ""));
        setTimeout(() => setStatus(""), 6000);
      } else if (surfaces.length) {
        setStatus(`Trench drawn \u00B7 surface: ${surfaces[0]}`
          + (runs[0].site ? ` \u00B7 ${runs[0].site}` : " \u00B7 no boundary drawn yet"));
        setTimeout(() => setStatus(""), 5000);
      }
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

  /* ── vertices ──
     Geometry is the only thing sent. gis_length_trg recomputes
     Attributes.Length_m on any change to it, so the stored length can't
     fall behind the shape, and the label on screen reads the live
     geometry so it moves while you drag. */
  function vertexAt(f, px, py) {
    return (f.Geometry || []).findIndex((m) => {
      const q = toPx(m);
      return Math.hypot(q.x - px, q.y - py) <= HIT_PX;
    });
  }

  /* Which segment the click landed on, and where along it. Polygons
     include the closing edge back to the first point. */
  function segmentAt(f, px, py) {
    const g = f.Geometry || [];
    if (g.length < 2) return null;
    const closed = f.Feature_Type === "polygon";
    const n = closed ? g.length : g.length - 1;
    let best = null;
    let bestD = HIT_PX;
    for (let k = 0; k < n; k++) {
      const a = toPx(g[k]);
      const b = toPx(g[(k + 1) % g.length]);
      const vx = b.x - a.x, vy = b.y - a.y;
      const len2 = vx * vx + vy * vy;
      if (!len2) continue;
      let t = ((px - a.x) * vx + (py - a.y) * vy) / len2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(a.x + t * vx - px, a.y + t * vy - py);
      if (d <= bestD) {
        bestD = d;
        const am = g[k], bm = g[(k + 1) % g.length];
        best = { index: k, point: [am[0] + t * (bm[0] - am[0]), am[1] + t * (bm[1] - am[1])] };
      }
    }
    return best;
  }

  async function writeGeometry(id, geometry) {
    setFeatures((fs) => fs.map((f) => (f.Feature_ID === id ? { ...f, Geometry: geometry } : f)));
    try { await moveFeatures(projectId, [{ Feature_ID: id, Geometry: geometry }]); }
    catch (e) { setError(e.message); await load(projectId); }
  }

  /* A line needs two points and a polygon three. Below that it stops
     being the thing it is, so the last one can't be removed — deleting
     the feature is the honest way to get rid of it. */
  function removeVertex(f, index) {
    const g = f.Geometry || [];
    const floor = f.Feature_Type === "polygon" ? 3 : 2;
    if (g.length <= floor) {
      setError(f.Feature_Type === "polygon"
        ? "An area needs three corners. Delete the whole shape instead."
        : "A line needs two points. Delete the whole line instead.");
      return;
    }
    setEditVertex(null);
    setError("");
    writeGeometry(f.Feature_ID, g.filter((_, i) => i !== index));
  }

  function addVertex(f, segmentIndex, point) {
    const g = f.Geometry || [];
    const next = [...g.slice(0, segmentIndex + 1), point, ...g.slice(segmentIndex + 1)];
    setEditVertex({ featureId: f.Feature_ID, index: segmentIndex + 1 });
    setError("");
    writeGeometry(f.Feature_ID, next);
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

  /* Joining runs end to end into one. The earliest-drawn line survives,
     so it keeps its Feature_ID and with it its way, circuit and the
     Connects entries other features hold against it — tracing walks
     that graph, so a joined run that lost its identity would drop off
     the network.

     Anything that pointed at a consumed line is repointed at the
     survivor in the same request. The survivor is written before the
     others are deleted: if the delete fails you are left with the
     joined line and its originals overlapping, which is visible and
     fixable, rather than a gap where a run used to be. */
  /* ── Auto Service ──
     A port of the original's gisAutoServiceTrench. For each plot seed:
     drop a perpendicular onto the nearest mains trench, lay a service
     trench along it, stack that plot's meters just beyond the seed, and
     run a service cable or pipe down the trench to each one.

     Scope follows the original: the selected seed, or every seed when
     nothing is selected.

     Two things are done differently, both because this app has
     something the original didn't. Meter spacing is in metres rather
     than screen pixels over zoom — the original capped that figure to
     stop a zoomed-out run flinging meters across the site, which is a
     symptom of keeping a screen measurement in the data. And on-site
     versus off-site comes from the boundary, tested per run, rather than
     being inherited from whatever the mains trench happened to be
     labelled. */
  /* POC and substation, as the original places them.

     A POC snaps onto the nearest main of its utility, because it is the
     point where that main meets the DNO's network. A substation snaps
     onto the nearest trench, so it sits on the network rather than
     beside it. Both fall back to where you clicked, with the reason
     said out loud — the original lets you place one before the network
     exists and draw through it afterwards. */
  async function placeNode(role) {
    if (!projectId) return;
    const layerKey = role === "substation" ? "electric" : (utilities[0]?.layer_key ?? "electric");

    if (role === "poc") {
      const existing = features.find((f) => f.Feature_Role === "poc" && f.Layer_Key === layerKey);
      if (existing) {
        setError(`There is already an ${layerKey} POC. Move or delete it rather than adding a second.`);
        setSelected([existing.Feature_ID]);
        return;
      }
    }

    /* Middle of the current view, then snapped. Placing it at the centre
       rather than asking for a click keeps this one button rather than a
       button and a mode. */
    const cx = (canvasRef.current?.clientWidth ?? 800) / 2;
    const cy = (canvasRef.current?.clientHeight ?? 500) / 2;
    let point = toM(cx, cy);
    let note = "";

    const targets = role === "substation"
      ? visible.filter((f) => f.Feature_Type === "line"
          && isTrenchType(f.Attributes?.Line_Type, lineTypes))
      : visible.filter((f) => f.Feature_Type === "line"
          && f.Layer_Key === layerKey
          && String(f.Attributes?.Line_Type || "").includes("main"));

    let best = null;
    for (const t of targets) {
      const r = nearestOnPolyline(point, t.Geometry || []);
      if (r && (!best || r.d < best.d)) best = { ...r, line: t };
    }
    if (best) { point = best.q; note = ` on ${best.line.Label ?? "the network"}`; }
    else {
      note = role === "substation"
        ? " \u2014 not on a trench yet, draw one through it to join the network"
        : " \u2014 not on a main yet, draw the main through it later";
    }

    const count = features.filter((f) => f.Feature_Role === role).length + 1;
    const label = role === "substation"
      ? `Substation ${count}`
      : `${utilities.find((u) => u.layer_key === layerKey)?.utility ?? "Electric"} POC`;

    try {
      await createFeature(projectId, {
        Layer_Key: layerKey,
        Feature_Type: "point",
        Feature_Role: role,
        Geometry: [point],
        Label: label,
        Attributes: role === "substation" ? {} : { Output: null },
      });
      await load(projectId);
      setStatus(`${label} placed${note}`);
      setTimeout(() => setStatus(""), 7000);
      setError("");
    } catch (e) { setError(e.message); }
  }

  /* ── Link to Circuit ──
     The original's gisLinkCircuitFinish. Draw round the plot seeds a
     circuit should serve; the plots with an electric meter become its
     members, membership is written on those meters, and the circuit
     takes the next free LV way on the substation.

     Cabling is deliberately not drawn here, exactly as in the original —
     defining a circuit assigns its meters, and laying the feeders is a
     separate step. */
  async function finishCircuit(ring) {
    const sub = features.find((f) => f.Feature_Role === "substation");
    if (!sub) {
      setError("Place a substation first \u2014 a circuit has to feed back to one.");
      return;
    }
    const seeds = metredSeedsInside(features, ring, pointInPolygon);
    if (!seeds.length) {
      setError("No plot seeds with an electric meter inside that outline.");
      return;
    }
    const meters = metersOfSeeds(features, seeds);
    const circuitId = nextCircuitId(features);
    const letter = circuitLetter(circuitId);
    const name = `Circuit ${circuitId}`;
    const kva = circuitKva(meters, (id) => plotList.find((p) => p.plot_id === id));
    const way = assignWay(sub, circuitId, kva);

    if (way.full) {
      setError(`All ${way.ways} LV ways are taken. Add a way on the substation, or free one by deleting a circuit.`);
      return;
    }

    setBusy("circuit");
    try {
      await bulkUpdateFeatures(projectId, meters.map((m) => ({
        Feature_ID: m.Feature_ID,
        Attributes: {
          ...m.Attributes,
          Circuit_ID: circuitId, Circuit_Name: name, Circuit_Letter: letter,
        },
      })));
      if (way.changed) {
        await updateFeature(projectId, sub.Feature_ID, {
          Attributes: { ...sub.Attributes, Way_Circuits: way.map },
        });
      }
      /* The origin node. Every other point on the circuit is measured
         from it, so it exists from the moment the circuit does rather
         than appearing later when someone traces. The original does the
         same in gisEnsureCircuitOriginNode. */
      if (!originNodeFor(features, circuitId)) {
        await createFeature(projectId, {
          Layer_Key: "electric",
          Feature_Type: "point",
          Feature_Role: "spannode",
          Geometry: [sub.Geometry[0]],
          Label: `Point ${spanLabel(letter, 0)}`,
          Attributes: {
            Circuit_ID: circuitId, Circuit_Name: name, Circuit_Letter: letter,
            Span_Seq: 0, Span_Label: spanLabel(letter, 0),
            Connects: [sub.Feature_ID],
          },
        });
      }

      await load(projectId);
      setTool("select");
      setDraft([]);
      setError("");
      setStatus(
        `${name} (${letter}) \u00B7 node ${spanLabel(letter, 0)} at the substation: `
        + `${seeds.length} plot(s), ${meters.length} meter(s), `
        + `${kva} kVA on LV way ${way.way}`
        + (way.over ? ` \u2014 ~${way.amps} A exceeds the ${way.fuse} A fuse` : "")
      );
      setTimeout(() => setStatus(""), 10000);
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  /* Taking meters out of a circuit. The circuit itself stays — this is
     the ordinary correction, a plot that turned out to belong on the
     next feeder along. The meters keep everything else; only their
     membership is cleared. */
  async function removeFromCircuit(meterIds, circuit) {
    if (!meterIds.length) return;
    setBusy("circuit");
    try {
      const rows = features.filter((f) => meterIds.includes(f.Feature_ID));
      await bulkUpdateFeatures(projectId, rows.map((m) => {
        const A = { ...m.Attributes };
        delete A.Circuit_ID; delete A.Circuit_Name; delete A.Circuit_Letter;
        return { Feature_ID: m.Feature_ID, Attributes: A };
      }));
      await load(projectId);
      setStatus(`${meterIds.length} meter(s) taken out of ${circuit.name}`);
      setTimeout(() => setStatus(""), 6000);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  /* Deleting a circuit unassigns its meters, frees its way on the
     substation and removes its span nodes. The meters and the trenches
     stay: they are physical things that exist whatever the circuit plan
     says, and deleting them would turn a planning change into a redraw. */
  async function deleteCircuit(circuit) {
    const meters = features.filter((f) =>
      f.Feature_Role === "meter" && Number(f.Attributes?.Circuit_ID) === Number(circuit.id));
    const nodes = features.filter((f) =>
      f.Feature_Role === "spannode" && Number(f.Attributes?.Circuit_ID) === Number(circuit.id));

    if (!window.confirm(
      `Delete ${circuit.name}?\n\n`
      + `${meters.length} meter(s) will be unassigned and ${nodes.length} span node(s) removed. `
      + `The meters and trenches stay.`
    )) return;

    setBusy("circuit");
    try {
      if (meters.length) {
        await bulkUpdateFeatures(projectId, meters.map((m) => {
          const A = { ...m.Attributes };
          delete A.Circuit_ID; delete A.Circuit_Name; delete A.Circuit_Letter;
          return { Feature_ID: m.Feature_ID, Attributes: A };
        }));
      }
      /* One call rather than a loop: the span nodes of a circuit go
         together, and a partial failure halfway through a loop would
         leave a circuit that is neither deleted nor intact. */
      if (nodes.length) await deleteFeatures(projectId, nodes.map((nd) => nd.Feature_ID));

      /* The way it held goes back into the pool, or the substation fills
         up with circuits that no longer exist. */
      const sub = features.find((f) => f.Feature_Role === "substation");
      if (sub) {
        const rel = releaseWays(sub, circuit.id);
        if (rel.changed) {
          await updateFeature(projectId, sub.Feature_ID, {
            Attributes: { ...sub.Attributes, Way_Circuits: rel.map },
          });
        }
      }
      await load(projectId);
      setStatus(`${circuit.name} deleted \u2014 ${meters.length} meter(s) unassigned`);
      setTimeout(() => setStatus(""), 7000);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  /* Build the LV feeder network.

     Routes each circuit's cables along the trenches from the substation
     out to its plots, breaking runs at junctions, at ends, and wherever
     the cable count changes. A port of the original's
     gisBuildLvFeederNetwork.

     Rebuilds rather than adds: generated feeders are deleted first, so
     running it twice gives the same answer as running it once. Only
     generated ones — a cable drawn by hand is somebody's decision and
     survives. */
  async function buildLvNetwork() {
    const circuits = circuitsFrom(features);
    if (!features.some((f) => f.Feature_Role === "substation")) {
      return setError("Place a substation first \u2014 feeders route back to it.");
    }
    if (!circuits.length) {
      return setError("No circuits defined yet \u2014 use Link to Circuit first.");
    }

    const old = features.filter((f) =>
      f.Attributes?.Line_Type === "elec_feeder" && f.Attributes?.Generated);

    if (!window.confirm(
      `Build the LV feeder network for ${circuits.length} circuit(s)?`
      + (old.length ? `\n\nThis redraws ${old.length} existing feeder cable(s).` : "")
    )) return;

    setBusy("feeder");
    setProgress({ done: 0, total: circuits.length, label: "Routing feeders" });
    try {
      if (old.length) await deleteFeatures(projectId, old.map((f) => f.Feature_ID));

      let runs = 0, cables = 0, nodesMade = 0;
      const failed = [];
      const stranded = [];
      let done = 0;

      for (const c of circuits) {
        setProgress({ done, total: circuits.length, label: `${c.name} (${c.letter})` });

        /* Scoped to this circuit's seeds, so a plot on another feeder
           doesn't pull its load onto this one. */
        const seedIds = new Set();
        for (const m of c.meters) {
          const sid = m.Attributes?.Seed_Feature_ID;
          if (sid != null) { seedIds.add(Number(sid)); continue; }
          const seed = features.find((f) => f.Feature_Role === "plot"
            && m.Plot_ID != null && Number(f.Plot_ID) === Number(m.Plot_ID));
          if (seed) seedIds.add(Number(seed.Feature_ID));
        }

        /* An empty seed set filters every meter out, so the model would
           report "no meters on the network" when the real problem is that
           this circuit's meters aren't linked to a seed. Different fault,
           different fix, so it is caught separately. */
        if (!seedIds.size) {
          failed.push(`${c.name}: its meters aren't linked to a plot seed`);
          done++; continue;
        }

        const r = feederSections(features, {
          lineTypes,
          plotById: (id) => plotList.find((p) => p.plot_id === id),
          seedIds,
        });
        if (r.error) { failed.push(`${c.name}: ${r.error}`); done++; continue; }
        if (!r.sections.length) {
          failed.push(`${c.name}: nothing to route \u2014 its meters reach the network but no run leads back to the substation`);
          done++; continue;
        }
        if (r.skipped?.length) stranded.push(...r.skipped);

        for (const [i, sec] of r.sections.entries()) {
          await createFeature(projectId, {
            Layer_Key: "electric",
            Feature_Type: "line",
            Geometry: sec.pts,
            Label: `${c.letter}${i + 1}`,
            Attributes: {
              Line_Type: "elec_feeder",
              Circuit_ID: c.id, Circuit_Name: c.name, Circuit_Letter: c.letter,
              Meters: sec.meters, KVA: sec.kva, Cables: sec.cables,
              /* What makes the next rebuild safe. */
              Generated: true,
            },
          });
          runs++;
          cables += sec.cables;
        }

        /* Junction span nodes, so the network is marked up without
           anyone having to run a trace first — the original does this
           as part of the build for the same reason. */
        const existingNodes = features.filter((f) => f.Feature_Role === "spannode"
          && Number(f.Attributes?.Circuit_ID) === Number(c.id));
        let seq = existingNodes.reduce(
          (t, f) => Math.max(t, Number(f.Attributes?.Span_Seq) || 0), 0);

        for (const j of junctionNodes(r.model)) {
          const near = existingNodes.some((f) =>
            Math.hypot(f.Geometry[0][0] - j.point[0], f.Geometry[0][1] - j.point[1]) < 1);
          if (near) continue;
          seq += 1;
          await createFeature(projectId, {
            Layer_Key: "electric",
            Feature_Type: "point",
            Feature_Role: "spannode",
            Geometry: [j.point],
            Label: `Point ${spanLabel(c.letter, seq)}`,
            Attributes: {
              Circuit_ID: c.id, Circuit_Name: c.name, Circuit_Letter: c.letter,
              Span_Seq: seq, Span_Label: spanLabel(c.letter, seq),
            },
          });
          nodesMade++;
        }
        done++;
      }

      await load(projectId);

      /* Reported apart. A build that drew nothing is not a quieter
         version of one that worked — it needs the reason, and burying it
         at the end of a success line is how it gets missed. */
      if (failed.length) {
        setError(`Couldn\u2019t route: ${failed.join(" \u00B7 ")}`);
      } else {
        setError("");
      }

      setStatus(runs === 0
        ? "No feeder cables drawn."
        : `LV network: ${runs} run(s), ${cables} cable(s) across `
          + `${circuits.length - failed.length} circuit(s)`
          + (nodesMade ? `, ${nodesMade} junction node(s)` : "")
          + (stranded.length
            ? ` \u2014 ${stranded.length} meter(s) not on the trench network`
            : ""));
      setTimeout(() => setStatus(""), 14000);
    } catch (e) { setError(e.message); await load(projectId); }
    finally { setBusy(""); setProgress(null); }
  }

  async function runAutoService() {
    const seeds = selected.length
      ? features.filter((f) => selected.includes(f.Feature_ID) && f.Feature_Role === "plot")
      : features.filter((f) => f.Feature_Role === "plot");
    if (!seeds.length) {
      setError(selected.length
        ? "Select a plot seed, or select nothing to cover every plot."
        : "Place a plot seed first.");
      return;
    }

    const trenches = mainsTrenches(visible, (f) => isTrenchType(f.Attributes?.Line_Type, lineTypes));
    if (!trenches.length) { setError("Draw a mains trench first."); return; }

    const serviceType = lineTypes.find((t) => t.Type_Key === "trench_service") || {};
    const polys = boundaryPolygons(visible);

    /* A seed is already done if a service trench is bound to it. The
       link is stored on the trench rather than inferred from position,
       so moving either afterwards doesn't make the plot look unserved
       and get a second trench on the next run. */
    const serviced = new Set(features
      .filter((f) => f.Attributes?.Seed_Feature_ID != null)
      .map((f) => Number(f.Attributes.Seed_Feature_ID)));

    const utilitiesFor = (seed) => {
      const plot = plotList.find((p) => p.plot_id === seed.Plot_ID);
      return utilities.filter((u) =>
        /* Electric-only plot gets no gas meter — the original read the
           plot's heat source for this. */
        !(u.layer_key === "gas" && plot && plot.heat_source_id != null
          && Number(plot.heat_source_id) !== 1));
    };

    /* A meter already at this plot for this utility. Matched on the plot
       first, because that is how the placement flow links them, and on
       the seed only as a fallback for a seed with no plot behind it. */
    const existingMeter = (seed, utility) => {
      const m = features.find((f) =>
        f.Feature_Role === "meter"
        && f.Layer_Key === utility.layer_key
        && (seed.Plot_ID != null
          ? f.Plot_ID === seed.Plot_ID
          : Number(f.Attributes?.Seed_Feature_ID) === Number(seed.Feature_ID)));
      return m ? (m.Geometry || [])[0] ?? null : null;
    };

    const { plans, skipped } = planAutoService(seeds, trenches, utilitiesFor, {
      alreadyServiced: (s) => serviced.has(Number(s.Feature_ID)),
      existingMeter,
    });
    if (!plans.length) {
      setError(`Nothing to do \u2014 ${skipped.length} seed(s) skipped (${skipped[0]?.why ?? "unknown"}).`);
      return;
    }

    setBusy("autoservice");
    cancelRef.current = false;
    setProgress({ done: 0, total: plans.length, label: `Servicing ${plans.length} plot(s)` });
    let trenchCount = 0, meterCount = 0, cableCount = 0, keptCount = 0;
    let doneCount = 0, stopped = false;
    try {
      for (const plan of plans) {
        /* Stopping part-way is safe and worth offering: a run over a
           whole estate is slow, and the already-serviced guard means a
           later run picks up exactly where this one left off rather
           than starting again or doubling up. */
        if (cancelRef.current) { stopped = true; break; }
        setProgress({
          done: doneCount,
          total: plans.length,
          label: `Plot ${doneCount + 1} of ${plans.length}`
            + (plan.seed.Label ? ` \u00B7 ${plan.seed.Label}` : ""),
        });
        /* Split at the boundary like any other run, so a service that
           leaves the site is two features with the right lengths on
           either side rather than one row that is half wrong. */
        const runs = splitByBoundary(plan.trench, polys);
        const madeTrenches = [];
        for (const run of runs) {
          madeTrenches.push(await createFeature(projectId, {
            Layer_Key: serviceType.Layer_Key ?? "trench",
            Feature_Type: "line",
            Geometry: run.geometry,
            Label: `Service trench ${plan.seed.Label ?? ""}`.trim(),
            Plot_ID: plan.seed.Plot_ID ?? null,
            Attributes: {
              Line_Type: "trench_service",
              Site: run.site,
              Surface_Type: surfaceFor(run.site, null, surfaceTypes),
              Seed_Feature_ID: plan.seed.Feature_ID,
              Connects: connectedTo(run.geometry, visible, null),
            },
          }));
          trenchCount++;
        }

        for (const m of plan.meters) {
          /* Already placed, with its meters. Leave them alone and run
             the service to where they actually are. */
          if (m.exists) { keptCount++; continue; }
          await createFeature(projectId, {
            Layer_Key: m.utility.layer_key,
            Feature_Type: "point",
            Feature_Role: "meter",
            Geometry: [m.point],
            Label: `${m.utility.utility} Meter ${plan.seed.Label ?? ""}`.trim(),
            Plot_ID: plan.seed.Plot_ID ?? null,
            Attributes: {
              Meter_Utility: m.utility.utility,
              Seed_Feature_ID: plan.seed.Feature_ID,
              /* Classified on the way in, so it counts on the right side
                 of the bill rather than landing in Unclassified. */
              Site: polys.length ? (pointInAny(m.point, polys) ? ON_SITE : OFF_SITE) : null,
            },
          });
          meterCount++;
        }

        for (const c of plan.cables) {
          await createFeature(projectId, {
            Layer_Key: c.utility.layer_key,
            Feature_Type: "line",
            Geometry: c.geometry,
            Label: `${c.utility.utility} service ${plan.seed.Label ?? ""}`.trim(),
            Plot_ID: plan.seed.Plot_ID ?? null,
            Attributes: {
              /* The seeded key is elec_service, not electric_service —
                 the layer key and the line-type prefix don't match for
                 electric. Getting this wrong left every generated cable
                 with an unrecognised type: no colour of its own, and a
                 bill that said "Electric" instead of "Electric service". */
              Line_Type: lineTypes.find((t) => t.Layer_Key === c.utility.layer_key
                && String(t.Type_Key).endsWith("_service"))?.Type_Key ?? null,
              Seed_Feature_ID: plan.seed.Feature_ID,
              Connects: connectedTo(c.geometry, visible, null),
            },
          });
          cableCount++;
        }

        /* Give the mains a vertex where the service tees in. Without it
           the two lines cross without meeting and tracing stops at the
           junction. */
        const teed = teeIntoMains(plan.mains.Geometry, plan.foot, CONNECT_M);
        if (teed) {
          await moveFeatures(projectId, [{ Feature_ID: plan.mains.Feature_ID, Geometry: teed }]);
        }
        doneCount++;
        setProgress((p) => (p ? { ...p, done: doneCount } : p));
      }

      await load(projectId);
      setError("");
      setStatus(
        (stopped ? `Stopped after ${doneCount} of ${plans.length} plot(s). ` : "")
        + `Auto service: ${trenchCount} trench(es), ${meterCount} meter(s), ${cableCount} service(s)`
        + (keptCount ? `, ${keptCount} existing meter(s) kept` : "")
        + (skipped.length ? `, ${skipped.length} skipped` : "")
        + (selected.length ? " \u2014 selected plot only" : "")
        + (stopped ? " \u2014 run it again to carry on where it stopped." : "")
      );
      setTimeout(() => setStatus(""), stopped ? 12000 : 8000);
    } catch (e) { setError(e.message); await load(projectId); }
    finally { setBusy(""); setProgress(null); cancelRef.current = false; }
  }

  /* Full trace from here.

     The original's gisFullCircuitTrace. From the selected span node,
     walk everything downstream, closing a leg at each further span node
     or dead end, and report the length and meters on each. "Full"
     because it carries on past each node rather than stopping at the
     first — that is the difference between this and a single-hop trace.

     Downstream is defined by distance from the substation, which is the
     only definition that makes a leg length mean anything. */
  function runFullTrace() {
    const node = selectedFeatures.find((f) => f.Feature_Role === "spannode");
    if (!node) { setError("Select a span node to trace from."); return; }
    const station = features.find((f) => f.Feature_Role === "substation");
    if (!station) { setError("No substation on the network to measure from."); return; }

    const { legs, error: why, startLabel } = traceFrom(node.Feature_ID, features, station.Feature_ID);
    if (why) { setError(why); return; }

    setTrace({ startLabel, legs });
    setError("");
  }

  async function joinSelected() {
    const lines = selectedFeatures.filter((f) => f.Feature_Type === "line");
    const { geometry, used, error: why } = joinLines(lines);
    if (why) { setError(why); return; }

    const survivor = used.reduce((a, b) => (a.Feature_ID <= b.Feature_ID ? a : b));
    const consumed = used
      .filter((f) => f.Feature_ID !== survivor.Feature_ID)
      .map((f) => f.Feature_ID);

    const attrs = { ...(survivor.Attributes || {}) };
    if (Array.isArray(attrs.Connects)) {
      attrs.Connects = [...new Set(attrs.Connects.filter((id) => !consumed.includes(id)))];
    }

    const repointed = features
      .filter((f) => !consumed.includes(f.Feature_ID)
        && f.Feature_ID !== survivor.Feature_ID
        && Array.isArray(f.Attributes?.Connects)
        && f.Attributes.Connects.some((id) => consumed.includes(id)))
      .map((f) => ({
        Feature_ID: f.Feature_ID,
        Attributes: {
          ...f.Attributes,
          Connects: [...new Set(f.Attributes.Connects.map(
            (id) => (consumed.includes(id) ? survivor.Feature_ID : id)))],
        },
      }));

    setBusy("join");
    try {
      await bulkUpdateFeatures(projectId, [
        { Feature_ID: survivor.Feature_ID, Geometry: geometry, Attributes: attrs },
        ...repointed,
      ]);
      await deleteFeatures(projectId, consumed);
      await load(projectId);
      setSelected([survivor.Feature_ID]);
      setError("");
      setStatus(`${used.length} lines joined into one \u2014 ${lineLength(geometry).toFixed(1)} m`);
      setTimeout(() => setStatus(""), 5000);
    } catch (e) { setError(e.message); await load(projectId); }
    finally { setBusy(""); }
  }

  async function applyBulk(updates) {
    await bulkUpdateFeatures(projectId, updates);
    await load(projectId);
    setStatus(`${updates.length} feature${updates.length === 1 ? "" : "s"} updated`);
    setTimeout(() => setStatus(""), 5000);
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
      if (e.key === "Escape" && picker) { setPicker(null); return; }
      if (e.key === "Escape") { setDraft([]); setTool("select"); setSelected([]); stopPlacing(); }
      if (e.key === "Enter" && drawing) finishDrawing();
      if (e.key === "Backspace" && drawing && draft.length) {
        e.preventDefault();
        setDraft((d) => d.slice(0, -1));
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace")
          && document.activeElement?.tagName !== "INPUT") {
        /* A point is being worked on, so Delete means that point. Only
           once nothing is picked does it mean the whole feature. */
        if (editVertex) {
          const f = features.find((x) => x.Feature_ID === editVertex.featureId);
          if (f) { e.preventDefault(); removeVertex(f, editVertex.index); return; }
        }
        if (selected.length) { e.preventDefault(); removeSelected(); }
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
    /* Right-click opens the feature editor, and the browser's own menu
       must not come with it.

       The canvas has its own handler, but it only catches this on macOS,
       where contextmenu fires on mousedown — before React commits the
       modal. Windows fires it after mouseup, by which point the editor's
       backdrop is under the cursor and is the event target, so the
       canvas never sees it. Caught here instead, where the canvas and
       anything it opens are both in scope.

       Form fields are exempt. Suppressing right-click inside a text box
       takes away paste, spellcheck and undo for no benefit. */
    <div className="gis"
      onContextMenu={(e) => {
        if (!e.target?.closest?.("input, textarea, select, [contenteditable]")) {
          e.preventDefault();
        }
      }}>
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
            {/* Drawing tools stay out of the menus: they are modal, and
                which one is active has to be visible without opening
                anything. */}
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
                {isTrenchType(lineType, lineTypes) ? (
                  <select className="gis-type" value={surface} aria-label="Surface type"
                    onChange={(e) => setSurface(e.target.value)}
                    title="Surface for any part outside the boundary. On-site runs are set to Unmade automatically.">
                    <option value="">Surface&hellip;</option>
                    {surfaceTypes.map((x) => (
                      <option key={x.Surface_Key} value={x.Surface_Key}>{x.Label}</option>
                    ))}
                  </select>
                ) : (
                  <input className="gis-size" value={size} placeholder="Size"
                    aria-label="Cable or pipe size" onChange={(e) => setSize(e.target.value)} />
                )}
              </>
            )}

            <MenuBar>
              {({ open, setOpen }) => (
                <>
                  <Menu id="setup" label="Setup" open={open} setOpen={setOpen}>
                    <MenuItem label={basemap?.Metres_Per_Pixel ? "Background plan" : "Set up plan & scale"}
                      hint={basemap?.Metres_Per_Pixel ? "scaled" : "not set"}
                      onClick={() => setSetupOpen(true)} />
                    <MenuItem label="Add plots by range"
                      hint="create plots, then place them"
                      onClick={() => setAddOpen(true)} />
                    <MenuItem label="Place plot seeds"
                      hint={`${plotList.filter((p) => !p.placed).length} unplaced`}
                      active={placeOpen || queue.length > 0}
                      onClick={() => setPlaceOpen(true)} />
                    <div className="gm-sep" />
                    <MenuGroup label="Drawing standard" />
                    <div className="gm-item" style={{ padding: "2px 9px 6px" }}>
                      <select className="gis-type" value={standard} aria-label="Drawing standard"
                        style={{ width: "100%" }}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setStandard(e.target.value)}>
                        <option value="">House style</option>
                        {[...new Map((lookups?.orgOperators || [])
                          .map((o) => [o.Organisation_ID, o])).values()].map((o) => (
                            <option key={o.Organisation_ID} value={o.Organisation_ID}>
                              {o.Name}{o.Code ? ` (${o.Code})` : ""}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="gm-sep" />
                    <MenuItem label="Snap to geometry" active={snapOn}
                      hint={snapOn ? "on" : "off"}
                      onClick={() => setSnapOn(!snapOn)} />
                    <MenuItem label="Reset view"
                      onClick={() => setView({ x: 60, y: 60, scale: 4 })} />
                  </Menu>

                  <Menu id="layers" label="Layers" open={open} setOpen={setOpen}
                    badge={hidden.length}>
                    <MenuGroup label="Show or hide" />
                    {layers.map((l) => (
                      <MenuLayer key={l.Layer_Key} label={l.Label} colour={l.Colour}
                        count={classCount[l.Layer_Key] || 0}
                        hidden={hidden.includes(l.Layer_Key)}
                        solo={solo === l.Layer_Key}
                        onHide={() => toggleClass(l.Layer_Key)}
                        onSolo={() => soloClass(l.Layer_Key)} />
                    ))}
                    <MenuLayer label="Span nodes" colour="#334155"
                      count={classCount["role:spannode"] || 0}
                      hidden={hidden.includes("role:spannode")}
                      solo={solo === "role:spannode"}
                      onHide={() => toggleClass("role:spannode")}
                      onSolo={() => soloClass("role:spannode")} />
                    <div className="gm-sep" />
                    <MenuItem label="Show everything" disabled={!hidden.length}
                      onClick={() => { setHidden([]); setSolo(null); }} />
                  </Menu>

                  <Menu id="electric" label="Electric" open={open} setOpen={setOpen}>
                    <MenuGroup label="Show or hide" />
                    {typesOn("electric").map((t) => (
                      <MenuLayer key={t.Type_Key} label={t.Label} colour={t.Colour}
                        count={classCount[`lt:${t.Type_Key}`] || 0}
                        hidden={hidden.includes(`lt:${t.Type_Key}`)}
                        solo={solo === `lt:${t.Type_Key}`}
                        onHide={() => toggleClass(`lt:${t.Type_Key}`)}
                        onSolo={() => soloClass(`lt:${t.Type_Key}`)} />
                    ))}
                    {/* Electric meters specifically. Joints, link boxes,
                        substations and POCs only exist on electric, so
                        the plain role key is right for those. */}
                    <MenuLayer label="Electric meters"
                      count={classCount["electric:role:meter"] || 0}
                      hidden={hidden.includes("electric:role:meter")}
                      solo={solo === "electric:role:meter"}
                      onHide={() => toggleClass("electric:role:meter")}
                      onSolo={() => soloClass("electric:role:meter")} />
                    {[["joint", "Joints"], ["linkbox", "Link boxes"],
                      ["substation", "Substations"], ["poc", "POCs"]].map(([role, label]) => (
                        <MenuLayer key={role} label={label}
                          count={classCount[`role:${role}`] || 0}
                          hidden={hidden.includes(`role:${role}`)}
                          solo={solo === `role:${role}`}
                          onHide={() => toggleClass(`role:${role}`)}
                          onSolo={() => soloClass(`role:${role}`)} />
                      ))}
                    <div className="gm-sep" />
                    <MenuGroup label="Network" />
                    <MenuItem label="+ POC" hint="snaps to nearest main"
                      disabled={!projectId} onClick={() => placeNode("poc")} />
                    <MenuItem label="+ Substation" hint="snaps to nearest trench"
                      disabled={!projectId} onClick={() => placeNode("substation")} />
                    <MenuItem label={tool === "circuit" ? "Drawing circuit\u2026" : "Link to Circuit"}
                      active={tool === "circuit"} disabled={!projectId}
                      hint="draw round the seeds it serves"
                      onClick={() => {
                        setTool(tool === "circuit" ? "select" : "circuit");
                        setSelected([]); setDraft([]);
                      }} />
                    <MenuItem label="Circuit report"
                      hint="meters by feeder, with distances"
                      disabled={!features.some((f) => f.Feature_Role === "substation")}
                      onClick={() => setReportOpen(true)} />
                    <MenuItem label="Full trace from here"
                      disabled={!selectedFeatures.some((f) => f.Feature_Role === "spannode")}
                      hint={selectedFeatures.some((f) => f.Feature_Role === "spannode")
                        ? undefined : "select a span node"}
                      onClick={runFullTrace} />
                    <div className="gm-sep" />
                    <MenuGroup label="Not built yet" />
                    {/* Both are routing tools rather than things drawn by
                        hand, so neither has a line type — a visibility
                        toggle for a class that can never have members
                        reads as broken rather than unbuilt. */}
                    <MenuItem label="HV route POC to substation"
                      hint="future feature" disabled />
                    <MenuItem label={busy === "feeder" ? "Building\u2026" : "Build LV network"}
                      hint={`${cablesFor(features.filter((f) => f.Feature_Role === "meter"
                        && f.Layer_Key === "electric" && f.Attributes?.Circuit_ID != null).length)} cable(s) minimum`}
                      disabled={busy === "feeder" || !circuitsFrom(features).length}
                      onClick={buildLvNetwork} />
                  </Menu>

                  {["gas", "water"].map((key) => {
                    const layer = layers.find((l) => l.Layer_Key === key);
                    return (
                      <Menu key={key} id={key} label={layer?.Label ?? key}
                        open={open} setOpen={setOpen}>
                        <MenuGroup label="Show or hide" />
                        {typesOn(key).map((t) => (
                          <MenuLayer key={t.Type_Key} label={t.Label} colour={t.Colour}
                            count={classCount[`lt:${t.Type_Key}`] || 0}
                            hidden={hidden.includes(`lt:${t.Type_Key}`)}
                            solo={solo === `lt:${t.Type_Key}`}
                            onHide={() => toggleClass(`lt:${t.Type_Key}`)}
                            onSolo={() => soloClass(`lt:${t.Type_Key}`)} />
                        ))}
                        <MenuLayer label="Meters"
                          count={classCount[`${key}:role:meter`] || 0}
                          hidden={hidden.includes(`${key}:role:meter`)}
                          solo={solo === `${key}:role:meter`}
                          onHide={() => toggleClass(`${key}:role:meter`)}
                          onSolo={() => soloClass(`${key}:role:meter`)} />
                        <div className="gm-sep" />
                        <MenuLayer label={`Whole ${layer?.Label ?? key} layer`}
                          colour={layer?.Colour} count={classCount[key] || 0}
                          hidden={hidden.includes(key)}
                          solo={solo === key}
                          onHide={() => toggleClass(key)}
                          onSolo={() => soloClass(key)} />
                      </Menu>
                    );
                  })}

                  <Menu id="lighting" label="Street lighting" open={open} setOpen={setOpen}>
                    <MenuGroup label="Show or hide" />
                    {typesOn("lighting").map((t) => (
                      <MenuLayer key={t.Type_Key} label={t.Label} colour={t.Colour}
                        count={classCount[`lt:${t.Type_Key}`] || 0}
                        hidden={hidden.includes(`lt:${t.Type_Key}`)}
                        solo={solo === `lt:${t.Type_Key}`}
                        onHide={() => toggleClass(`lt:${t.Type_Key}`)}
                        onSolo={() => soloClass(`lt:${t.Type_Key}`)} />
                    ))}
                    <MenuLayer label="Columns" count={classCount["role:column"] || 0}
                      hidden={hidden.includes("role:column")}
                      solo={solo === "role:column"}
                      onHide={() => toggleClass("role:column")}
                      onSolo={() => soloClass("role:column")} />
                    {!typesOn("lighting").length && (
                      <MenuItem label="Lighting layer missing" hint="run migration 0072" disabled />
                    )}
                  </Menu>

                  <Menu id="tools" label="Tools & reporting" open={open} setOpen={setOpen}>
                    <MenuItem label="Bill of materials"
                      hint="quantities by site and surface"
                      disabled={!projectId} onClick={() => setBomOpen(true)} />
                    <MenuGroup label="Network" />
                    <MenuItem label={busy === "joints" ? "Working\u2026" : "Place joints"}
                      hint="joints where services meet mains"
                      disabled={!!busy} onClick={() => runNetwork("joints")} />
                    <MenuItem label={busy === "trace" ? "Tracing\u2026" : "Trace from source"}
                      hint={selected.length === 1 ? undefined : "select one feature first"}
                      disabled={!!busy || selected.length !== 1}
                      onClick={() => runNetwork("trace")} />
                    <MenuItem label={busy === "meters" ? "Working\u2026" : "Assign meters"}
                      hint="match meters to their plots"
                      disabled={!!busy} onClick={() => runNetwork("meters")} />
                    <div className="gm-sep" />
                    <MenuGroup label="View" />
                    <MenuItem label="Way and circuit labels" active={showLabels}
                      hint={showLabels ? "on" : "off"}
                      onClick={() => setShowLabels(!showLabels)} />
                    <MenuItem label="Grid" active={showGrid} hint={`${GRID_M} m`}
                      onClick={() => setShowGrid(!showGrid)} />
                    <div className="gm-sep" />
                    <MenuItem label="Check trench connectivity"
                      hint="finds trenches that don't join up"
                      disabled={!projectId}
                      onClick={() => {
                        const r = trenchComponents(features, { lineTypes });
                        if (r.error) { setError(r.error); return; }
                        setTrenchCheck(r);
                      }} />
                    <MenuItem label={busy === "autoservice" ? "Auto service\u2026" : "Auto service"}
                      hint="trench, meters and services per seed"
                      disabled={busy === "autoservice"} onClick={runAutoService} />
                    <div className="gm-sep" />
                    <MenuGroup label="Selection" />
                    <MenuItem label={`Edit ${selected.length}`}
                      disabled={selected.length < 2 || !selectionClass}
                      hint={selected.length > 1 && !selectionClass ? "mixed selection" : undefined}
                      onClick={() => setBulkOpen(true)} />
                    <MenuItem label={busy === "join" ? "Joining\u2026" : `Join ${selected.length}`}
                      disabled={!joinable || busy === "join"} onClick={joinSelected} />
                    <MenuItem label={`Delete ${selected.length}`} danger
                      disabled={!selected.length} onClick={removeSelected} />
                  </Menu>
                </>
              )}
            </MenuBar>

            {selected.length > 1 && !selectionClass && (
              <span className="gis-mixed">
                Mixed selection &mdash; shift-click to narrow it to one kind
              </span>
            )}
          </>
        )}
      </div>

      {reportOpen && (() => {
        const r = circuitReport(features, (id) => plotList.find((p) => p.plot_id === id));
        if (r.error) {
          setReportOpen(false);
          setError(r.error);
          return null;
        }
        const poc = features.find((f) => f.Feature_Role === "poc" && f.Layer_Key === "electric");
        return (
          <CircuitReport
            report={r}
            projectRef={project?.Project_Ref}
            siteName={project?.Site_Name}
            /* The capacity the whole drawing is working within, so the
               report can say when it has been exceeded rather than
               leaving it to be worked out. */
            pocOutput={poc?.Attributes?.Output != null && poc.Attributes.Output !== ""
              ? Number(poc.Attributes.Output) : null}
            onClose={() => setReportOpen(false)}
            busy={busy === "circuit"}
            onRemoveFromCircuit={removeFromCircuit}
            onDeleteCircuit={deleteCircuit}
          />
        );
      })()}

      {trenchCheck && (
        <TrenchCheck
          result={trenchCheck}
          /* Selecting puts the group on the canvas selection, so the next
             action is dragging an end onto the piece it should join
             rather than hunting for it. */
          onSelect={(ids) => {
            setSelected(ids);
            setTrenchCheck(null);
            setStatus(`${ids.length} trench(es) selected \u2014 drag an end onto the network to join it`);
            setTimeout(() => setStatus(""), 8000);
          }}
          onClose={() => setTrenchCheck(null)}
        />
      )}

      {editing && (
        <FeatureEditor
          feature={editing}
          layers={layers}
          lineTypes={lineTypes}
          surfaceTypes={surfaceTypes}
          plotList={plotList}
          lookups={lookups}
          onSave={saveFeature}
          onSavePlot={savePlot}
          onDelete={deleteFeature}
          onClose={() => setEditing(null)}
        />
      )}

      {bomOpen && projectId && (
        <BomModal
          projectId={projectId}
          projectName={project?.Project_Name ?? project?.Project_Ref}
          onClose={() => setBomOpen(false)}
        />
      )}

      {bulkOpen && selectedFeatures.length > 1 && (
        <BulkEditor
          features={selectedFeatures}
          lineTypes={lineTypes}
          surfaceTypes={surfaceTypes}
          layers={layers}
          onApply={applyBulk}
          onClose={() => setBulkOpen(false)}
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
            {picker && (
              /* Offered where the click landed, nudged in from the
                 edges so a click near the right or bottom doesn't put
                 the list off the canvas. */
              <div className="gis-picker" role="dialog" aria-label="Choose an object"
                style={{
                  left: Math.min(picker.x + 10, (wrapRef.current?.clientWidth ?? 900) - 250),
                  top: Math.min(picker.y + 10, (wrapRef.current?.clientHeight ?? 600) - 60
                    - picker.items.length * 30),
                }}>
                <p className="gp-head">{picker.items.length} objects here</p>
                {picker.items.map(({ feature: f, via }) => (
                  <button key={f.Feature_ID} className="gp-item"
                    onMouseEnter={() => setSelected([f.Feature_ID])}
                    onClick={() => { setSelected([f.Feature_ID]); setPicker(null); }}>
                    <span className="gp-sw" style={{
                      background: f.Feature_Role === "plot"
                        ? bedColour(f.Attributes?.Bedrooms).bg
                        : styleFor(f).colour,
                      borderRadius: f.Feature_Type === "point" ? "50%" : "2px",
                    }} />
                    <span className="gp-name">
                      {f.Label || classLabel(f, lineTypes) || "Unnamed"}
                    </span>
                    <span className="gp-kind">
                      {classLabel(f, lineTypes)}
                      {via === "vertex" && f.Feature_Type !== "point" && " \u00B7 end"}
                    </span>
                  </button>
                ))}
                <button className="gp-cancel" onClick={() => setPicker(null)}>
                  Cancel &middot; <kbd>Esc</kbd>
                </button>
              </div>
            )}

            {/* What is defined so far: the POC's agreed output and the
                circuits drawn against it. Both are read constantly while
                laying out an estate, and neither was visible without
                opening a feature. */}
            {(() => {
              const poc = features.find((f) => f.Feature_Role === "poc"
                && f.Layer_Key === "electric");
              const circuits = circuitsFrom(features);
              if (!poc && !circuits.length) return null;
              return (
                <div className="gis-elec">
                  {poc && (
                    <span className="ge-poc">
                      POC {poc.Attributes?.Output != null && poc.Attributes.Output !== ""
                        ? `${poc.Attributes.Output} ${pocUnit(poc.Layer_Key)}`
                        : "output not set"}
                    </span>
                  )}
                  {circuits.map((c) => (
                    <span className="ge-c" key={c.id} title={`${c.name}, ${c.meters.length} meter(s)`}>
                      {c.letter}<em>{c.meters.length}</em>
                    </span>
                  ))}
                </div>
              );
            })()}

            {(placeOpen || queue.length > 0) && (
              <div className="gis-place">
                <PlacementPanel
                  onAdd={() => setAddOpen(true)}
                  plots={plotList}
                  utilities={utilities}
                  queue={queue}
                  current={nextPlot}
                  meterFor={meterFor}
                  onStart={startPlacing}
                  onCancel={() => { stopPlacing(); setPlaceOpen(false); }}
                />
                {/* Only closable when nothing is queued: shutting it
                    mid-placement would leave a queue with no way to see
                    or cancel it. */}
                {queue.length === 0 && (
                  <button className="fe-x gp-x" onClick={() => setPlaceOpen(false)}
                    aria-label="Close">&times;</button>
                )}
              </div>
            )}

            {trace && (
              <div className="gis-trace" role="dialog" aria-label="Full trace">
                <div className="gt-head">
                  <strong>Full trace from {trace.startLabel}</strong>
                  <button className="fe-x" onClick={() => setTrace(null)} aria-label="Close">
                    &times;
                  </button>
                </div>
                {!trace.legs.length && <p className="gt-none">Nothing downstream.</p>}
                {trace.legs.length > 0 && (
                  <table className="gt-tbl">
                    <thead>
                      <tr><th>Leg</th><th className="num">Length</th><th className="num">Meters</th></tr>
                    </thead>
                    <tbody>
                      {trace.legs.map((l, i) => (
                        <tr key={i}>
                          <td>{l.from} &rarr; {l.to ?? "end"}</td>
                          <td className="num">{l.metres.toFixed(1)} m</td>
                          <td className="num">{l.meters.length}</td>
                        </tr>
                      ))}
                      <tr className="gt-tot">
                        <td>{trace.legs.length} leg(s)</td>
                        <td className="num">
                          {trace.legs.reduce((t, l) => t + l.metres, 0).toFixed(1)} m
                        </td>
                        <td className="num">
                          {trace.legs.reduce((t, l) => t + l.meters.length, 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {progress && (
              <div className="gis-prog" role="status" aria-live="polite">
                <p className="gp-lbl">{progress.label}</p>
                <div className="gp-track">
                  <div className="gp-bar" style={{
                    width: `${progress.total ? Math.round(progress.done / progress.total * 100) : 0}%`,
                  }} />
                </div>
                <div className="gp-foot">
                  <span>{progress.done} of {progress.total}</span>
                  <button className="gp-stop" onClick={() => { cancelRef.current = true; }}>
                    Stop
                  </button>
                </div>
              </div>
            )}

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
                {tool === "circuit" ? "Click round the plot seeds this circuit serves"
              : tool === "boundary" ? "Click to place corners" : "Click to place points"}
                {" \u00B7 "}<kbd>Enter</kbd> to finish{" \u00B7 "}
                <kbd>Backspace</kbd> undoes{" \u00B7 "}<kbd>Esc</kbd> cancels
                {draft.length > 0 && ` \u00B7 ${draft.length} placed`}
                {draft.length > 1 && ` \u00B7 ${lineLength(draft).toFixed(1)} m`}
                {/* Says what it found and what you're drawing, so a snap
                    that didn't turn green explains itself instead of
                    just looking broken. */}
                {tool === "line" && !snapOn && (
                  <span className="tip-warn">Snap is off &mdash; nothing will latch</span>
                )}
                {tool === "line" && snapOn && !snapHit && (
                  <span className="tip-snap">
                    no snap in range &middot; drawing {typeOf(lineType)?.Label ?? lineType}
                  </span>
                )}
                {tool === "line" && snapOn && snapHit && (
                  snapHit.sameClass && snapHit.kind === "end" ? (
                    <span className="tip-join">
                      joining the end of {typeOf(snapHit.lineType)?.Label ?? "that line"}
                    </span>
                  ) : (
                    <span className="tip-snap">
                      {snapHit.kind} of{" "}
                      {typeOf(snapHit.lineType)?.Label ?? snapHit.lineType ?? "another object"}
                      {" "}&middot; drawing {typeOf(lineType)?.Label ?? lineType}
                      {snapHit.kind === "end" && snapHit.lineType !== lineType
                        && " \u2014 different type, so no join"}
                    </span>
                  )
                )}
                {tool !== "line" && snapHit && (
                  <span className="tip-snap">snapping to {snapHit.kind}</span>
                )}
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

/* One column now the sidebar has gone. It was two tracks, 210px then
   1fr, and with only the canvas left inside it the canvas took the
   210px one — which is why the drawing appeared squeezed into the space
   the sidebar used to occupy.

   No backticks in here: this comment sits inside a template literal, so
   one would close the string and the CSS after it becomes JavaScript. */
.gis-main { flex: 1; display: grid; grid-template-columns: 1fr; min-height: 0; }

kbd { font-family: ui-monospace, Menlo, monospace; font-size: 10px; background: var(--bg);
  border: 1px solid var(--border); border-radius: 3px; padding: 0 4px; }

.gis-canvas-wrap { position: relative; border: 1px solid var(--border); border-radius: var(--radius);
  overflow: hidden; background: var(--white); min-height: 0; }
.gis-canvas-wrap canvas { display: block; width: 100%; height: 100%; cursor: default;
  touch-action: none; overscroll-behavior: contain; }
.gis-canvas-wrap canvas.crosshair, .gis-canvas-wrap canvas.crosshair:active { cursor: crosshair; }
/* Top left, clear of the panels that report on a selection — plots are
   placed while looking at the drawing, not at a table. */
.gis-place { position: absolute; left: 12px; top: 12px; z-index: 7; width: 258px;
  max-height: 78%; overflow-y: auto; background: var(--white);
  border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px;
  box-shadow: 0 10px 30px rgba(15,23,42,.18); }
.gp-x { position: absolute; right: 8px; top: 8px; }
.gis-trace { position: absolute; right: 12px; top: 44px; z-index: 8; width: 300px;
  background: var(--white); border: 1px solid var(--border); border-radius: 10px;
  padding: 10px 12px; box-shadow: 0 10px 30px rgba(15,23,42,.2); max-height: 60%;
  overflow-y: auto; }
.gt-head { display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin-bottom: 7px; font-size: 12.5px; }
.gt-none { font-size: 12px; color: var(--muted); margin: 0; }
.gt-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
.gt-tbl th { text-align: left; font-size: 9.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: var(--muted); padding: 3px 5px; border-bottom: 1px solid var(--border); }
.gt-tbl td { padding: 4px 5px; border-bottom: 1px solid var(--border); }
.gt-tbl .num { text-align: right; font-variant-numeric: tabular-nums; }
.gt-tot td { font-weight: 700; border-bottom: none; }
.gis-prog { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%);
  z-index: 8; min-width: 300px; background: var(--white); border: 1px solid var(--border);
  border-radius: 12px; padding: 13px 16px; box-shadow: 0 10px 34px rgba(15,23,42,.22); }
.gp-lbl { margin: 0 0 9px; font-size: 12.5px; font-weight: 600; }
.gp-track { height: 9px; background: #eef0f8; border-radius: 6px; overflow: hidden; }
.gp-bar { height: 100%; background: var(--accent); border-radius: 6px; transition: width .15s ease; }
.gp-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 7px;
  font-size: 11px; color: var(--muted); }
.gp-stop { background: none; border: none; cursor: pointer; font: 600 11px inherit;
  color: #b91c1c; padding: 2px 6px; border-radius: 4px; }
.gp-stop:hover { background: #fef2f2; }
.gis-elec { position: absolute; right: 12px; top: 12px; z-index: 5; display: flex;
  align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; max-width: 45%; }
.ge-poc { background: #0f766e; color: #fff; border-radius: 20px; padding: 2px 10px;
  font: 700 10.5px inherit; }
.ge-c { background: var(--white); border: 1px solid var(--accent); color: var(--accent);
  border-radius: 20px; padding: 2px 9px; font: 700 10.5px inherit; display: inline-flex;
  align-items: center; gap: 5px; }
.ge-c em { font-style: normal; font-weight: 600; color: var(--muted); }
.gis-picker { position: absolute; z-index: 6; width: 240px; background: var(--white);
  border: 1px solid var(--border); border-radius: 8px; padding: 5px;
  box-shadow: 0 10px 28px rgba(15,23,42,.18); }
.gp-head { margin: 3px 7px 5px; font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .07em; color: var(--muted); }
.gp-item { display: grid; grid-template-columns: 12px 1fr; gap: 2px 8px; width: 100%;
  text-align: left; background: none; border: none; border-radius: 5px; padding: 5px 7px;
  cursor: pointer; font: inherit; color: var(--text); align-items: center; }
.gp-item:hover { background: var(--accent-light); }
.gp-sw { width: 12px; height: 12px; grid-row: 1 / 3; }
.gp-name { font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.gp-kind { grid-column: 2; font-size: 10.5px; color: var(--muted); }
.gp-cancel { width: 100%; background: none; border: none; border-top: 1px solid var(--border);
  margin-top: 4px; padding: 6px; cursor: pointer; font: 500 11px inherit; color: var(--muted); }
.gp-cancel:hover { color: var(--text); }
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
.tip-join { margin-left: 10px; padding: 1px 8px; border-radius: 20px; font-weight: 700;
  background: #16a34a; color: #fff; }
.tip-warn { margin-left: 10px; padding: 1px 8px; border-radius: 20px; font-weight: 700;
  background: #b45309; color: #fff; }
.gis-mixed { font-size: 11px; color: var(--muted); font-style: italic; max-width: 22ch; }
.gis-snap { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600;
  text-transform: none; letter-spacing: 0; color: var(--muted); background: var(--white);
  border: 1px solid var(--border); border-radius: 7px; padding: 6px 12px; margin: 0; cursor: pointer; }
.gis-snap.on { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
.gis-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  border: 1px dashed var(--border); border-radius: var(--radius); background: var(--bg); }
.ge-title { margin: 0 0 4px; font-size: 15px; font-weight: 700; color: var(--text); }
.gis-empty p { margin: 0; font-size: 12.5px; color: var(--muted); }
`;
