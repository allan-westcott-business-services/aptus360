import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { listProjects, getProject } from "../../api/projects.js";
import {
  listGis, createFeature, moveFeatures, deleteFeatures, updateFeature, ensurePlots,
  restoreFeatures, listUndo, recordUndo, markUndone, clearUndo,
  traceNetwork, assignMeters, bulkUpdateFeatures,
} from "../../api/gis.js";
import {
  SNAP_PX, CONNECT_M, snapTargets, findSnap, nearestOnLines, connectedTo, lineLength,
  classOf, classLabel, joinLines, isTrenchType, splitPolylineAt,
} from "./snapping.js";
import BasemapSetup from "./BasemapSetup.jsx";
import { getLookups } from "../../api/lookups.js";
import { getBasemap } from "../../api/basemap.js";
import { listDevelopers } from "../../api/developers.js";
import { takeGisIntent } from "../../lib/gisIntent.js";
import { remember, recall } from "../../lib/session.js";
import { bulkUpdatePlots } from "../../api/plots.js";
import { listPlacementPlots } from "../../api/gis.js";
import PlacementPanel from "./PlacementPanel.jsx";
import AddPlotsModal from "./AddPlotsModal.jsx";
import { bedColour } from "../../lib/bedColours.js";
import { resolveStyle, appearance, subjectOf, symbolPath, markerPositions, STROKE_ONLY }
  from "../../lib/gisStyle.js";
import { splitByBoundary, boundaryPolygons, pointInAny, pointInPolygon, surfaceFor,
  planClassification, ON_SITE, OFF_SITE } from "./boundary.js";
import {
  planAutoService, mainsTrenches, teeIntoMains, nearestOnPolyline,
  isServed, meterHasService,
} from "./autoService.js";
import {
  circuitLetter, nextCircuitId, metredSeedsInside, metersOfSeeds, circuitKva,
  assignWay, releaseWays, circuitsFrom, pocUnit, spanLabel, originNodeFor, traceFrom,
  circuitReport,
} from "./electric.js";
import FeatureEditor from "./FeatureEditor.jsx";
import BulkEditor from "./BulkEditor.jsx";
import BomModal from "./BomModal.jsx";
import { MenuBar, Menu, MenuGroup, MenuItem, MenuLayer } from "./GisMenus.jsx";
import * as XLSX from "xlsx";
import CircuitReport from "./CircuitReport.jsx";
import BulkDelete from "./BulkDelete.jsx";
import { feederSections, junctionNodes, endOfLineNodes, trenchComponents, serviceTrenchCheck,
  spanTrace, orderNodesFromRoot } from "./feeder.js";
import { cumulativeToNode, VD_DEFAULTS, defaultFeederCable } from "./voltDrop.js";
import {
  feederRenderPlan, offsetPolyline, circuitColours, circuitIdOf, feederColourAt,
} from "./feederColour.js";
import { planJoints, reconcileJoints, JOINT_KINDS } from "./joints.js";
import { routePocToSubstation } from "./route.js";
import { suggestCableChanges } from "./scenario.js";
import { byConnectivity, endsOnly } from "./traceOrder.js";
import { planCircuitGroups } from "./balance.js";
import { inDrawOrder } from "./drawOrder.js";
import { planRoute, traceAll } from "./routing.js";
import {
  isLocked, isFeatureLocked, lockReason, toggleClassLock, planLock,
} from "./locking.js";
import { find as findFeatures, strays, gaps } from "./find.js";
import { planSpanNodes, plantLabel, originsOf } from "./spanNodes.js";
import {
  BUILD_STATUSES, planMark, statusOf, statusColour, statusLabel, alongLine,
  isOffSite,
} from "./buildStatus.js";
import { contentsOf, stretchAt } from "./trenchContents.js";
import { trenchSize } from "./trenchSize.js";
import {
  gasMainRuns, END_EXTEND_M,
} from "./gasNetwork.js";
import { waterMainRuns, sizeTable, sizeFor } from "./waterNetwork.js";
import { serviceValves, VALVE_WIDTH_M } from "./serviceValves.js";
import { gasMainEnds, GAS_CAP_SPINE_M, GAS_CAP_ARM_M } from "./gasEnds.js";
import {
  rangesToSpans, toCallOffRows, labelOf as spanNodeLabel, orderPair,
} from "./mainsCallOff.js";
import {
  gasLevels, serviceTees, suggestPipeChanges, TEE_DIAMETERS, lineFollows,
} from "./gasPressure.js";
import {
  isEasement, easementBand, hatchPattern, EASEMENT_WIDTH_M, EASEMENT_COLOUR,
} from "./easement.js";
import { createCallOff, updateCallOff, listCallOffs } from "../../api/calloffs.js";
import { listAgreements } from "../../api/av.js";
import { listPoc } from "../../api/poc.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { personFor, displayName } from "../poc/whoAmI.js";
import SchematicModal from "./SchematicModal.jsx";
import {
  planDeveloperAssignment, developerAreas, assignmentStale,
} from "./developer.js";
import {
  diffFeatures, isEmptyDelta, deltaSize, planMany, emptyStack,
  record as recordEntry, canUndo, canRedo, popUndo, popRedo,
  undoLabel, redoLabel,
} from "./undoStack.js";
import TrenchCheck from "./TrenchCheck.jsx";
import { usePdfPage, drawTile } from "./usePdfPage.js";
import { tint } from "../../lib/pillColour.js";

/* GIS canvas — stage 1.

   Coordinates are metres from the site origin. The canvas converts to
   pixels at draw time, so zooming never touches stored data and a
   distance measured on screen is a real distance.

   What's here: pan, zoom, grid, scale bar, layers, plot markers seeded
   from the project's plots, select and drag, and a boundary tool.
   Drawing tools and the electrical model come next. */

const GRID_M = 5;                 // metres between grid lines

/* The background plan's class key.

   Every layer row is driven by a key some feature carries. The survey
   is an image and carries nothing, so it needs a name of its own to
   take part — one no feature will ever produce, which is why it is a
   plain word rather than a "role:" or "layer:" form. */
const BASEMAP_KEY = "basemap";
const HIT_PX = 10;

/* The boundary point is drawn in ink rather than in a utility's colour.

   It marks one place for electric, gas and water alike — where the
   network stops and the property begins — so painting it green would
   say it was the gas one's. */
const BOUNDARY_INK = "#334155";

export default function GISCanvasPage() {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [projects, setProjects] = useState([]);
  /* Which drawing was open, across a reload. Coming back to an empty
     canvas and picking the site out of a list of five hundred is the
     navigation done twice. */
  const [projectId, setProjectId] = useState(() => recall("gisProject", "") ?? "");
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

  /* The background plan is a layer like any other.

     It was drawn whenever one was attached, with no way to take it off
     — and a survey underneath a dense estate is the thing most often in
     the way when checking whether two runs actually meet.

     Remembered like the other canvas settings, so someone who works
     with it off does not have to turn it off on every visit. */
  const [showBasemap, setShowBasemap] = useState(
    () => recall("gisBasemapOn", true) !== false);
  useEffect(() => remember("gisBasemapOn", showBasemap), [showBasemap]);
  const [project, setProject] = useState(null);
  const [plotList, setPlotList] = useState([]);
  const [utilities, setUtilities] = useState([]);
  const [queue, setQueue] = useState([]);          // plots being placed, in order
  const [meterFor, setMeterFor] = useState(null);  // { plot, seedPoint, utility, all, placed }
  /* The click between the seed and the meters: where the property
     boundary is. { plot, seedPoint, tempId } */
  const [boundaryFor, setBoundaryFor] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [developers, setDevelopers] = useState([]);
  /* The equipment this project's outline designs say new runs are made
     of, one entry per utility. Read from the project rather than held on
     the canvas: it is a design decision, set on the Outline Designs tab,
     and the canvas is only obeying it. */
  const [scopeDefaults, setScopeDefaults] = useState([]);
  /* Which developer the next area belongs to. An area with nobody on it
     says nothing, so the tool cannot start without one chosen. */
  const [areaFor, setAreaFor] = useState(null);
  const [lookups, setLookups] = useState({});
  /* Off by default. The grid is a drawing aid for setting out, not
     something wanted over a background plan — and a plan is what most
     projects open with. */
  const [showGrid, setShowGrid] = useState(false);
  const [styles, setStyles] = useState([]);
  const [surfaceTypes, setSurfaceTypes] = useState([]);
  const [surface, setSurface] = useState("");
  const [standard, setStandard] = useState("");   // operator whose style rules apply
  const [editing, setEditing] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [picker, setPicker] = useState(null);   // { x, y, items } when a click is ambiguous
  const [bomOpen, setBomOpen] = useState(false);
  const [progress, setProgress] = useState(null);   // { done, total, label } while a long run works
  /* The same idea for work started from inside a modal. Its own state
     because the canvas bar is positioned in the canvas and covered by
     the modal that asked for the work. */
  const [circuitProgress, setCircuitProgress] = useState(null);
  const [trace, setTrace] = useState(null);         // { startLabel, legs } from a full trace
  /* The drawing as it was when the trace was computed. The trace is a
     snapshot — nothing recomputes it — so changing a cable or the
     substation leaves a table of figures that look current and are not.
     Compared rather than recomputed automatically: rewriting numbers
     under someone reading them is its own hazard, and a table that says
     it is out of date is more use than one that silently changes. */
  const [traceAt, setTraceAt] = useState(null);
  const [scenario, setScenario] = useState(null);
  /* Whether the panel is on screen, kept apart from whether a check has
     been run.

     Closing used to discard the result, which took the red rings with it
     — and the rings are the part someone works from: they say which
     nodes to look at while the panel is out of the way. So closing now
     puts the panel away and leaves the findings on the drawing. */
  const [traceOpen, setTraceOpen] = useState(false);
  /* How the table is ordered. By label reads well while the labels
     number in sequence; by connectivity follows the cable, which is how
     the site is walked and the only order that reads at all once most
     rows are called "Service joint — Plot 21". */
  const [traceOrder, setTraceOrder] = useState("label");
  /* Show only where the runs finish.

     A levels check is usually read for one question — does anything at
     the far end fall outside its limits — and on the advanced check
     eighty intermediate rows stand between the reader and the answer. */
  const [traceEnds, setTraceEnds] = useState(false);
  const [schematic, setSchematic] = useState(false);
  /* Rings round the meters, coloured by circuit.

     After grouping — or after any circuit is made by hand — the only
     sign of which properties belong together is the cable, and on a
     dense estate the cables overlap. A ring on the meter says it
     directly, and in the colour that circuit's feeder is already
     drawn in, so the map and the cables agree. */
  /* Off until asked for. The report has the button, and rings appearing
     unbidden on a drawing nobody has asked about circuits is noise. */
  const [circuitRings, setCircuitRings] = useState(false);

  /* A proposed grouping, before anything is written.

     Grouping an estate is a suggestion, not a decision: the shape of the
     site, the adoption, and where the DNO will accept a way all bear on
     it, and none of that is in the drawing. So the proposal is shown as
     coloured rings on the meters and nothing is created until it is
     accepted.

     Held apart from the circuits themselves, because at the point this
     runs there are no circuits — the drawing is a mains trench, plot
     seeds and meters, and that is all. */
  const [groupPlan, setGroupPlan] = useState(null);

  /* A proposed trench route, before anything is written.

     Which of the drawn candidates have to be live to reach every meter,
     and where the router would dig a link of its own. Shown rather than
     applied: it is a suggestion about several thousand pounds of
     groundwork, and the drawing stays as it is until somebody agrees. */
  const [routePlan, setRoutePlan] = useState(null);

  /* Junctions that are not junctions.

     A route that goes the long way round, or a section carrying nothing
     when it plainly should, is nearly always two trenches drawn to the
     same corner a few centimetres apart. They look joined at any working
     zoom and are two networks as far as the trace is concerned. */
  const [gapList, setGapList] = useState(null);

  /* Stepping through the traces one meter at a time.

     The counts say how busy a section is and nothing about how any one
     meter got there. When some meters do not trace, or a route looks
     wrong, seeing that meter's own path is the only thing that answers
     it — an index into the trace, rather than a second calculation that
     could disagree with the first. */
  const [stepAt, setStepAt] = useState(null);

  /* Raising a mains call-off from the drawing.

     A call-off names runs of trench — A1 to A5, A7 to A12 — and the
     drawing is where somebody can see which runs those are. Picking the
     nodes on the plan is the difference between a call-off that matches
     the site and one typed from a list of labels.

     `pick` holds the first node of a pair while the second is chosen;
     `ranges` holds the pairs already made. */
  /* Who is raising the call-off.

     Used for the contact name and Created_By, and referenced before it
     was ever brought in — the page had never needed the signed-in user
     until a call-off could be raised from it, and "user is not defined"
     arrived at the moment somebody pressed the button. */
  const { user } = useAuth();

  /* Who is raising it, by name.

     An email address in "Raised by" is the login, not the person — and
     on a call-off that goes to a gang it should read "Allan Murrell",
     not "a.murrell@aptus". The POC application already matches the
     signed-in user to a Person record on the email; this uses the same
     helper rather than a second rule that could disagree with it.

     Falls back to whatever name Supabase carries, then to the local part
     of the address — "a.murrell" tells somebody who it is where a blank
     tells them nothing. */
  const raisedByName = useMemo(() => {
    const p = personFor(user, lookups?.people || []);
    return p?.Person_Name || displayName(user) || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, lookups?.people]);

  const [callOffOpen, setCallOffOpen] = useState(false);
  /* Which utilities the call-off covers (0146). Raised from the drawing
     the same as from the project screen: a gang sent to an E/G dig
     needs to know it is electric and gas before they load the van, and
     the drawing is where somebody knows that. */
  const [callOffUtils, setCallOffUtils] = useState([]);
  const [pick, setPick] = useState(null);
  /* Whether to ask for another run. See where a range is added. */
  const [askAnother, setAskAnother] = useState(false);
  const [ranges, setRanges] = useState([]);

  /* The call-off just raised, waiting for the rest of its details.

     Raising it from the drawing captures the runs, which is the part
     only the drawing knows. The dates, the contact and the notes are
     the part somebody types — and sending them off to find the
     call-offs page to do it means the call-off sits half-finished until
     they remember. */
  const [raised, setRaised] = useState(null);

  /* Runs already committed to a call-off.

     Drawn pink, so somebody picking a new one can see at a glance what
     has been asked for and what has not. Without it the only way to
     know is to open the call-offs page and read the labels back, which
     is the drawing's job.

     Loaded once with the drawing rather than recomputed: a call-off is
     raised rarely and read constantly. */
  const [calledOff, setCalledOff] = useState([]);

  /* Marking a length of trench as existing, planned, to be removed or
     as-built.

     Two clicks on one trench: where the length starts and where it
     stops. Either can be an end or any point along it — a run is drawn
     as one line because that is how it was drawn, not because all of it
     is at the same stage. */
  const [marking, setMarking] = useState(null);   // { status } while picking
  const [markFrom, setMarkFrom] = useState(null); // { feature, point }

  /* What is routed inside a trench.

     A trench is dug once and carries whatever is laid in it — the LV
     feeder first, gas and water to follow. Asking what is in a given
     length meant reading the drawing by eye and hoping, and on a run
     with three utilities in it that is not reading, it is guessing. */
  const [inspect, setInspect] = useState(null);

  useEffect(() => {
    if (!projectId) { setCalledOff([]); return; }
    let live = true;
    listCallOffs(projectId)
      .then((res) => {
        if (!live) return;
        const spans = [];
        for (const co of res.rows || []) {
          if (co.Selection_Mode !== "Span") continue;
          for (const it of co.items || []) {
            if (it.From_Node_ID == null || it.To_Node_ID == null) continue;
            spans.push({
              fromId: it.From_Node_ID,
              toId: it.To_Node_ID,
              submission: co.Submission_ID,
              status: co.Status,
            });
          }
        }
        setCalledOff(spans);
      })
      /* A drawing that cannot reach the call-offs still draws. Colouring
         is a convenience; refusing to render the site because of it
         would not be. */
      .catch(() => { if (live) setCalledOff([]); });
    return () => { live = false; };
  }, [projectId]);

  /* Their geometry, worked out the same way a new range is. */
  const calledOffSpans = useMemo(() => {
    if (!calledOff.length) return [];
    const res = rangesToSpans(features, calledOff, {
      isTrench: (f) => f.Feature_Type === "line"
        && isTrenchType(f.Attributes?.Line_Type, lineTypes),
      serviceTypes: new Set(["trench_service", ...lineTypes
        .filter((t) => t.Layer_Key === "trench" && /service/i.test(t.Type_Key))
        .map((t) => t.Type_Key)]),
    });
    return res.spans || [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calledOff, features, lineTypes]);

  /* What the picked ranges come to.

     Recomputed from the drawing rather than stored: a trench edited
     between picking and submitting should change the length, and a
     figure captured at pick time would quietly disagree with the site. */
  const callOff = useMemo(() => {
    if (!callOffOpen || !ranges.length) return null;
    /* No substation needed: the run is measured along the trench, not
       traced through a circuit. A mains call-off is raised from the dig
       and must work before any cable exists. */
    return rangesToSpans(features, ranges, {
      isTrench: (f) => f.Feature_Type === "line"
        && isTrenchType(f.Attributes?.Line_Type, lineTypes),
      serviceTypes: new Set(["trench_service", ...lineTypes
        .filter((t) => t.Layer_Key === "trench" && /service/i.test(t.Type_Key))
        .map((t) => t.Type_Key)]),
      plotOf: (m) => {
        const pid = m?.Plot_ID ?? m?.Attributes?.Plot_ID;
        if (pid == null) return null;
        const p = plotList?.find((x) => Number(x.plot_id ?? x.Plot_ID) === Number(pid));
        return p?.plot_number ?? p?.Plot_Number ?? null;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callOffOpen, ranges, features, plotList]);


  /* A proposed trench route, before anything is written.

     Draw candidates everywhere a trench could go and this works out
     which of them have to be live to reach every meter. Shown as a
     proposal because it is a suggestion about a dig: the cheapest route
     is not always the right one, and a longer run can give better volt
     drop. */

  /* Classes locked against moving.

     A working preference rather than a fact about the drawing — which
     layer someone has finished with is theirs, not the project's — so it
     is remembered with the rest of their canvas settings and not written
     to the features. Individual locks are on the features, because those
     are decisions about the design. */
  /* The find box. Open and query kept apart so closing it does not lose
     what was typed — reopening to correct a typo and finding it gone is
     a small thing that makes a tool feel hostile. */
  /* Find is a box on the bar, not a dialog, so there is no "open".

     What is left is whether the cursor is in it — which decides only
     whether the strays list shows, since that is offered to somebody
     who has come looking without knowing what for. The results
     themselves follow what is typed and nothing else. */
  const [findFocus, setFindFocus] = useState(false);
  const findRef = useRef(null);
  const [findQ, setFindQ] = useState("");

  const [lockedClasses, setLockedClasses] = useState(
    () => recall("gisLocked", []) ?? []);
  useEffect(() => remember("gisLocked", lockedClasses), [lockedClasses]);


  /* What would bring the failing nodes back inside their limits.

     Worked out from the trace that is on screen, so the answer belongs
     to the figures being read rather than to the drawing as it may have
     become since. Nothing is written: it is a suggestion, and applying
     it is a decision. */
  function runScenario() {
    const station = features.find((f) => f.Feature_Role === "substation");
    const common = {
      cables: lookups?.cableSizes || [],
      cableTypes: lookups?.cableTypes || [],
      transformer: (lookups?.transformerSizes || []).find((t) =>
        String(t.Transformer_Size_ID)
          === String(station?.Attributes?.VD_Transformer_Size_ID)) || null,
      voltageV: Number(station?.Attributes?.Output_V) || 400,
      settings: trace?.limits || {},
    };

    /* A levels check covers every circuit, and a cable change is always
       within one — so each is searched on its own model and the answers
       put together. Searching only the first circuit's model would leave
       every failure on the others without a suggestion and no sign that
       it had not looked. */
    const parts = trace?.parts?.length ? trace.parts : [trace];
    const all = [];
    let exhausted = false;
    let largest = null;
    for (const part of parts) {
      const r = suggestCableChanges({ trace: part, ...common });
      if (r.error) continue;
      if (r.exhausted) { exhausted = true; largest = r.largest ?? largest; }
      for (const sg of r.suggestions || []) {
        all.push({ ...sg, circuitName: part.circuitName ?? null, pairs: r.pairs });
      }
    }

    all.sort((a, b) => a.cost - b.cost);
    setScenario({
      ok: true,
      suggestions: all.slice(0, 6),
      pairs: all.some((x) => x.pairs),
      exhausted: exhausted && !all.length,
      largest,
    });
  }

  /* Span nodes the trace found outside the limits.

     A leg ends at a span node and carries the cumulative loop impedance
     and volt drop at that point; where either is past its limit, the
     node the leg arrives at is the one out of tolerance. Held as a set
     of feature ids so the draw can ask about a node without walking the
     legs for every one of them.

     Dead-end legs are not in here. They end at meters rather than at a
     node, so there is nothing to ring — the trace table still reports
     them, and a red ring on the nearest node would point at the wrong
     place. */
  const traceOver = useMemo(() => {
    const out = new Set();
    for (const leg of trace?.legs || []) {
      if (leg.stopId == null || !leg.vd) continue;
      if (leg.vd.overOhms || leg.vd.overPct) out.add(Number(leg.stopId));
    }
    return out;
  }, [trace]);
  const [reportOpen, setReportOpen] = useState(false);
  const [bulkDelOpen, setBulkDelOpen] = useState(false);
  const [traceLeg, setTraceLeg] = useState(null);   // which leg is highlighted
  /* Space held down turns a left-drag into a pan. Middle-button panning
     is the usual route, but a Magic Mouse has no middle button, and
     right-drag is now the context menu's alone. */
  const [spaceHeld, setSpaceHeld] = useState(false);
  /* Whether a line is already being written. See finishDrawing. */
  const finishing = useRef(false);
  /* Where each label landed this frame, so one can be picked up. */
  const labelHits = useRef([]);
  const [svcCheck, setSvcCheck] = useState(null);
  /* Which gas meters the last build could not reach.

     Held past the build rather than shown in the confirm box: a list
     read before pressing OK is a list read while deciding whether to
     press it, and this is the one somebody works from afterwards. */
  const [gasUnserved, setGasUnserved] = useState(null);
  /* The result of a gas levels check: pressure at every span node. */
  const [gasLevelsResult, setGasLevelsResult] = useState(null);
  const [classPlan, setClassPlan] = useState(null);
  const [reclass, setReclass] = useState(false);
  /* Right-click menu: what was clicked, and where to put the menu.
     Held together so the two can never disagree about which feature the
     options apply to. */
  const [ctx, setCtx] = useState(null);   // { feature, atM, x, y }
  const ctxRef = useRef(null);

  /* ── Keep the right-click menu on screen ──

     It opens down and to the right of the cursor, which runs it off the
     bottom of the panel on anything clicked in the last inch or so —
     and the panel clips, so the items simply are not reachable.

     Measured rather than guessed: the menu's height depends on which
     feature was clicked, so a fixed allowance would be wrong for most
     of them. Laid out at the cursor, measured, then flipped to open
     upward or leftward if it does not fit.

     useLayoutEffect rather than useEffect, so the move happens before
     the browser paints and the menu is never seen in the wrong place.

     The guard is what stops this looping: the second pass computes the
     same position and sets nothing. */
  useLayoutEffect(() => {
    if (!ctx) return;
    const el = ctxRef.current;
    const host = el?.offsetParent;
    if (!el || !host) return;

    const { width: w, height: h } = el.getBoundingClientRect();
    /* Flipped to the other side of the cursor, not merely nudged up:
       nudging leaves the menu under the pointer, so the first item is
       whatever the cursor is already sitting on. */
    const x = ctx.px + w > host.clientWidth ? Math.max(4, ctx.px - w) : ctx.px;
    const y = ctx.py + h > host.clientHeight ? Math.max(4, ctx.py - h) : ctx.py;

    if (x !== ctx.x || y !== ctx.y) setCtx((c) => (c ? { ...c, x, y } : c));
  }, [ctx]);
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
      const proj = await getProject(pid).catch(() => null);
      setScopeDefaults(proj?.scopes || []);
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

  /* ── Undo and redo ──

     The unit is the feature row. An action records the rows it changed —
     as they were, and as they became — and nothing else, so an entry
     costs what the action touched rather than what the drawing contains.
     Auto Service over sixty plots is one entry, because it was one thing
     that was asked for.

     Inverses are recorded, not derived: working out how to reverse each
     action separately would be twenty-five reversals to get right and to
     keep right, whereas a before-and-after of the rows is the same shape
     whatever did the changing.

     The history lives in the database, so it survives a reload — which is
     when it is most wanted, since the drawing that needs undoing is often
     the one that made you reload. */
  const [stack, setStack] = useState(emptyStack());
  const [undoBusy, setUndoBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  /* The drawing as it stands, readable from inside an async action
     without waiting for a re-render. */
  const featuresRef = useRef(features);
  featuresRef.current = features;

  const loadHistory = useCallback(async (pid) => {
    if (!pid) return;
    try {
      const h = await listUndo(pid);
      setStack({
        past: (h.past || []).map((r) => ({
          id: r.Undo_ID, label: r.Label, delta: r.Delta, at: r.Created_At,
        })),
        future: (h.future || []).map((r) => ({
          id: r.Undo_ID, label: r.Label, delta: r.Delta, at: r.Created_At,
        })),
      });
    } catch { /* No history is not a reason to fail the page. */ }
  }, []);

  /* Record what an action did, given the drawing either side of it.

     Both sides are read from the server rather than from component
     state: state after an await has not necessarily re-rendered, and a
     delta computed against a stale "after" would record an action as
     having done less than it did — which is worse than not recording it,
     because undo would then half-reverse it. */
  const recordAction = useCallback(async (label, before, after) => {
    const delta = diffFeatures(before, after);
    if (isEmptyDelta(delta)) return;

    let id = null;
    try {
      const r = await recordUndo(projectId, label, delta);
      id = r?.entry?.Undo_ID ?? null;
    } catch {
      /* A history that cannot be written must not fail the work: the
         action itself has already succeeded. */
      return;
    }
    /* Through the stack helper so the limit and the "a new action clears
       the future" rule are applied in one place, then the server's id
       put on the entry it just made. */
    setStack((st) => {
      const next = recordEntry(st, label, delta);
      const past = next.past.slice(0, -1).concat([{ id, label, delta }]);
      return { past, future: [] };
    });
  }, [projectId]);

  /* Wrap an action so it lands in the history as one step.

     Reads the drawing before and after. That is one extra fetch per
     action, which is nothing beside what these actions do — they are the
     bulk operations, not a mouse drag. */
  const withUndo = useCallback(async (label, fn) => {
    let before = null;
    try { before = (await listGis(projectId)).features || []; }
    catch { /* Carry on without history rather than blocking the work. */ }

    const result = await fn();

    if (before) {
      try {
        const after = (await listGis(projectId)).features || [];
        await recordAction(label, before, after);
      } catch { /* as above */ }
    }
    return result;
  }, [projectId, recordAction]);

  /* Applying a delta, in either direction.

     Restore, remove and update are three separate calls because they are
     three different things: a deleted row has to come back under the id
     it had, since Connects is an array of ids and a row restored under a
     new one is referenced by nothing. */
  const applyPlan = useCallback(async (plan) => {
    if (plan.restore.length) {
      for (let i = 0; i < plan.restore.length; i += 100) {
        await restoreFeatures(projectId, plan.restore.slice(i, i + 100));
      }
    }
    if (plan.update.length) {
      for (let i = 0; i < plan.update.length; i += 100) {
        await restoreFeatures(projectId, plan.update.slice(i, i + 100));
      }
    }
    if (plan.remove.length) {
      for (let i = 0; i < plan.remove.length; i += 100) {
        await deleteFeatures(projectId, plan.remove.slice(i, i + 100));
      }
    }
  }, [projectId]);

  /* Step back, or several steps at once.

     The features are written first and the pointer moved only once that
     has worked, so a failed write cannot leave the history claiming a
     step that did not happen. */
  const runUndo = useCallback(async (count = 1) => {
    if (!canUndo(stack) || undoBusy) return;
    const n = Math.max(1, Math.min(count, stack.past.length));
    const entries = stack.past.slice(-n);

    setUndoBusy(true);
    try {
      await applyPlan(planMany(entries, "undo"));
      await markUndone(projectId, entries.map((e) => e.id).filter(Boolean), true);
      let st = stack;
      for (let i = 0; i < n; i++) st = popUndo(st).stack;
      setStack(st);
      await load(projectId);
      setStatus(n === 1
        ? `Undone: ${entries[entries.length - 1].label}`
        : `${n} steps undone`);
      setTimeout(() => setStatus(""), 6000);
      setError("");
    } catch (e) { setError(`Couldn\u2019t undo: ${e.message}`); await load(projectId); }
    finally { setUndoBusy(false); }
  }, [stack, undoBusy, applyPlan, projectId, load]);

  const runRedo = useCallback(async (count = 1) => {
    if (!canRedo(stack) || undoBusy) return;
    const n = Math.max(1, Math.min(count, stack.future.length));
    const entries = stack.future.slice(-n).reverse();

    setUndoBusy(true);
    try {
      await applyPlan(planMany(entries, "redo"));
      await markUndone(projectId, entries.map((e) => e.id).filter(Boolean), false);
      let st = stack;
      for (let i = 0; i < n; i++) st = popRedo(st).stack;
      setStack(st);
      await load(projectId);
      setStatus(n === 1 ? `Redone: ${entries[0].label}` : `${n} steps redone`);
      setTimeout(() => setStatus(""), 6000);
      setError("");
    } catch (e) { setError(`Couldn\u2019t redo: ${e.message}`); await load(projectId); }
    finally { setUndoBusy(false); }
  }, [stack, undoBusy, applyPlan, projectId, load]);

  /* Opened from somewhere else with a project — and possibly a utility —
     already chosen.

     Taken once, on mount, before anything is loaded: setting the project
     here lets the ordinary load run for it, rather than loading whatever
     was open and then loading again. The utility is held until the
     layers arrive, since which layer belongs to a utility is something
     only the loaded data knows. */
  const [pendingIsolate, setPendingIsolate] = useState(null);
  useEffect(() => {
    const intent = takeGisIntent();
    if (!intent) return;
    if (intent.projectId != null) setProjectId(String(intent.projectId));
    if (intent.utilityId != null) setPendingIsolate(Number(intent.utilityId));
  }, []);

  useEffect(() => { remember("gisProject", projectId || null); }, [projectId]);
  useEffect(() => { if (projectId) load(projectId); }, [projectId, load]);
  /* The history for this project, read once when it opens. Separate from
     load so a history that fails to read cannot stop the drawing. */
  useEffect(() => { if (projectId) loadHistory(projectId); }, [projectId, loadHistory]);

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
    /* The two kinds of boundary, told apart.

       A developer area and the site's red line are both polygons on the
       boundary layer, so one key covered both and hiding either hid the
       other. They are read for different reasons — the red line says
       what is on site, an area says whose ground it is — and wanting one
       without the other is the ordinary case once areas are drawn. */
    f.Layer_Key === "boundary" && f.Feature_Type === "polygon"
      ? (f.Attributes?.Project_Developer_ID != null ? "boundary:dev" : "boundary:site")
      : null,
  ].filter(Boolean), []);

  /* One colour per circuit, the same as the feeders use — so a ring and
     the cable leaving it are never different colours. */
  const ringColours = useMemo(() => {
    const sub = features.find((f) => f.Feature_Role === "substation");
    const chosen = sub?.Attributes?.Circuit_Colours;
    const out = circuitColours(features, chosen);

    /* Circuits that exist but have no feeder drawn yet.

       circuitColours works from the feeder mains, because its job is to
       colour them — so a circuit with no cable on it gets no colour, and
       a ring asking for one got nothing and drew nothing. That is
       exactly the state the circuit report is read in: circuits linked,
       Build LV Network not yet run.

       Coloured by position in circuitsFrom, which is the same rule the
       substation board uses for its way swatches. An earlier version
       numbered only the circuits without feeders, starting from zero —
       so with an empty Circuit 1 on the board, Circuit 2 was drawn green
       here and blue there, and the two disagreed about the same
       circuit. */
    const list = circuitsFrom(features);
    list.forEach((c, i) => {
      if (out.has(c.id)) return;
      out.set(c.id, chosen?.[c.id] ?? chosen?.[String(c.id)] ?? feederColourAt(i));
    });
    return out;
  }, [features]);

  /* Which proposed group each meter is in, while a suggestion is on
     screen. Keyed by feature id because a proposal has no circuit to key
     on — that is the whole point of it being a proposal. */
  const proposedGroup = useMemo(() => {
    const m = new Map();
    (groupPlan?.groups || []).forEach((g, i) => {
      for (const mt of g.meters) m.set(Number(mt.Feature_ID), i);
    });
    return m;
  }, [groupPlan]);

  const found = useMemo(() => (findQ
    ? findFeatures(features, findQ, {
      lineTypes, layers, plotById: (id) => plotList.find((p) => p.plot_id === id),
    })
    : { shown: [], total: 0 }), [findQ, features, lineTypes, layers, plotList]);

  /* Things sitting a long way from everything else — the shape of
     something dragged off by accident. Offered while the box has focus
     and nothing is typed, which is the moment somebody is looking for
     something without knowing what: it was what the dialog showed on
     opening, and the box has no opening.

     Still only worked out then, since it walks every feature. */
  const wanderers = useMemo(
    () => (findFocus && !findQ ? strays(features) : []), [findFocus, findQ, features]);

  /* Whether a feature refuses to move, and why.

     Through classKeys, so a lock on a line type and a lock on a layer
     both hold without this needing to know which is which. */
  const locked = useCallback(
    (f) => isLocked(f, classKeys(f), lockedClasses),
    [classKeys, lockedClasses]);

  const whyLocked = useCallback(
    (f) => lockReason(f, classKeys(f), lockedClasses,
      (k) => layerOf(k)?.Label ?? lineTypes.find((t) => `lt:${t.Type_Key}` === k)?.Label ?? k),
    [classKeys, lockedClasses, layerOf, lineTypes]);

  /* Which circuit is being looked at on its own, if any.

     Its own state rather than keys in the hidden set. The two are
     different decisions — what someone has turned off, and which feeder
     they are studying — and holding both in one place meant each kept
     undoing the other: isolating a circuit brought back every layer
     hidden by hand, and hiding a layer afterwards silently ended the
     isolation. Kept apart, they compose, and either can be changed
     without disturbing the other. */
  const [isolatedCircuit, setIsolatedCircuit] = useState(null);

  /* Which circuit an electric service cable belongs to.

     Circuit membership is written on the meter and nowhere else, so a
     service cable carries only the plot it was drawn for. Isolating a
     circuit therefore hid the meters of other circuits and left their
     service cables on the drawing, running to nothing.

     Derived from the meter rather than stamped onto the cable.
     Membership then has one home: moving a meter to another circuit
     takes its service cable with it, with nothing to keep in step and
     nothing to go stale.

     Resolved by every route the rest of the app uses, because the link
     is not made the same way everywhere — a meter may name its seed
     directly or only share a Plot_ID with it, and the same is true of
     the cable. Following only one of them left half the cables behind. */
  const circuitLookup = useMemo(() => {
    const seedToPlot = new Map();     // seed Feature_ID -> Plot_ID
    const plotToSeed = new Map();     // Plot_ID        -> seed Feature_ID
    for (const f of features) {
      if (f.Feature_Role !== "plot" || f.Plot_ID == null) continue;
      seedToPlot.set(String(f.Feature_ID), String(f.Plot_ID));
      plotToSeed.set(String(f.Plot_ID), String(f.Feature_ID));
    }

    const bySeed = new Map();
    const byPlot = new Map();
    for (const f of features) {
      if (f.Feature_Role !== "meter" || f.Layer_Key !== "electric") continue;
      const cid = f.Attributes?.Circuit_ID;
      if (cid == null) continue;
      const seed = f.Attributes?.Seed_Feature_ID != null
        ? String(f.Attributes.Seed_Feature_ID)
        : (f.Plot_ID != null ? plotToSeed.get(String(f.Plot_ID)) : null);
      if (seed != null) bySeed.set(seed, String(cid));
      const plot = f.Plot_ID != null
        ? String(f.Plot_ID)
        : (seed != null ? seedToPlot.get(seed) : null);
      if (plot != null) byPlot.set(plot, String(cid));
    }
    return { bySeed, byPlot, seedToPlot };
  }, [features]);

  /* The circuit a feature belongs to, if any — its own, or the one its
     plot's electric meter is on. */
  const circuitOf = useCallback((f) => {
    if (f.Layer_Key !== "electric") return null;
    if (f.Attributes?.Circuit_ID != null) return String(f.Attributes.Circuit_ID);

    const { bySeed, byPlot, seedToPlot } = circuitLookup;
    const seed = f.Attributes?.Seed_Feature_ID;
    if (seed != null) {
      const bs = bySeed.get(String(seed));
      if (bs != null) return bs;
      const plot = seedToPlot.get(String(seed));
      if (plot != null) {
        const bp = byPlot.get(plot);
        if (bp != null) return bp;
      }
    }
    if (f.Plot_ID != null) {
      const bp = byPlot.get(String(f.Plot_ID));
      if (bp != null) return bp;
    }
    return null;
  }, [circuitLookup]);

  /* Electric only, and checked rather than assumed. A circuit is a fact
     about the LV network; anything on another layer that happens to
     carry a Circuit_ID — a water service tagged when it shared a trench,
     a copied feature — is not part of that circuit and must not vanish
     when one is isolated. */
  const outsideCircuit = useCallback((f, cid) => {
    if (cid == null || f.Layer_Key !== "electric") return false;
    const own = circuitOf(f);
    return own != null && own !== String(cid);
  }, [circuitOf]);

  /* Showing only the trench the route actually needs.

     A site drawn with a candidate in front of every plot on both sides
     of every road is unreadable once it is routed — the answer is in
     there, under twice as much trench that is not part of it.

     Applies to trench only. Hiding the cables and meters as well would
     leave the live trench floating with nothing to place it against,
     which is the opposite of what someone turning this on wants. */
  const [liveTrenchOnly, setLiveTrenchOnly] = useState(false);

  /* What counts as live: the marks left by an accepted route, or the
     proposal currently on screen.

     Both, because the toggle is wanted at both moments — while looking
     at a suggestion, and afterwards when reading the drawing back. A
     proposal takes precedence, since that is the thing being looked
     at. */
  const liveTrenchIds = useMemo(() => {
    if (routePlan?.ok) {
      return new Set(routePlan.liveByTrench.map((x) => Number(x.Feature_ID)));
    }
    const marked = features.filter((f) => f.Attributes?.Route_Live === true);
    return marked.length ? new Set(marked.map((f) => Number(f.Feature_ID))) : null;
  }, [routePlan, features]);

  const visible = useMemo(
    () => features.filter((f) => {
      /* ── Span nodes answer to their own switch only ──

         A span node sits on the trench and is created there, so it
         carries the trench layer's key — which meant isolating a
         utility took every span node with it, because no electric
         feature carries "trench". They are the points a levels check
         and a call-off are measured between: the drawing they are read
         against is a utility's, and losing them the moment you look at
         one is losing them exactly when they are wanted.

         So a span node is hidden by its own entry and by nothing else.
         Hiding the trench layer leaves the nodes standing, which is
         also right — the dig and the points along it are different
         facts about the same line. */
      const keys = f.Feature_Role === "spannode"
        ? ["role:spannode", `${f.Layer_Key}:role:spannode`]
        : classKeys(f);
      if (keys.some((k) => hidden.includes(k))) return false;
      if (outsideCircuit(f, isolatedCircuit)) return false;

      if (liveTrenchOnly && liveTrenchIds
        && f.Feature_Type === "line"
        && isTrenchType(f.Attributes?.Line_Type, lineTypes)) {
        return liveTrenchIds.has(Number(f.Feature_ID));
      }
      return true;
    }),
    [features, hidden, classKeys, isolatedCircuit, outsideCircuit,
      liveTrenchOnly, liveTrenchIds, lineTypes]
  );

  /* Plots with a water supply, and whether their mark should be drawn.

     Worked out once rather than per seed per frame: a seed does not
     know its utilities, so the answer is "is there a water meter
     carrying this Plot_ID", and asking that inside the draw loop is a
     scan of every feature for every plot on the site.

     Keyed on Plot_ID rather than on the seed, because that is what a
     meter carries. */
  const waterPlots = useMemo(() => {
    const out = new Set();
    for (const f of features) {
      if (f.Feature_Role !== "meter" || f.Layer_Key !== "water") continue;
      if (f.Plot_ID != null) out.add(Number(f.Plot_ID));
    }
    return out;
  }, [features]);

  /* Whether the circled A is drawn rather than the plain diamond. The
     A is a water mark; the point under it is not. */
  const waterShown = useMemo(
    () => !hidden.includes("water") && !hidden.includes("water:role:meter"),
    [hidden]);

  /* Whether boundary points are drawn at all.

     They belong to every utility, so they are shown while any of them
     is — or while the plots are. Isolating a utility hides the plot
     layer, since a seed carries no utility's keys, and tying the mark
     to the seed is what made Isolate Water take the boundary points
     with it. */
  const boundaryShown = useMemo(() => {
    if (!hidden.includes("plot")) return true;
    return layers.some((l) => l.Utility_ID != null && !hidden.includes(l.Layer_Key));
  }, [hidden, layers]);

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

  /* ── H, S and I ──

     Three verbs over one visible set.

     H hides a layer and leaves the rest alone. S builds a list: press it
     on gas and only gas is on screen, press it on water as well and
     both are — S is I with more than one thing in it. I is the same
     act limited to one, so choosing another drops the first.

     `shownOnly` is what the S buttons are lit by; `hidden` stays the
     one thing the drawing reads. Two states rather than one because
     they answer different questions — what did somebody pick, and what
     is off screen — and deriving the picks back out of the hidden set
     is not possible once an H has been pressed as well. */
  /* Which layers are showing, remembered across a reload.

     Everything else on this toolbar is \u2014 the basemap, the locked
     classes, which project is open \u2014 and this was not, so a refresh
     put every layer back on and left somebody switching them off again.

     `shownOnly` is the one to keep: `hidden` and `solo` are both worked
     out from it, so restoring it restores all three without any of them
     being able to disagree. */
  const [shownOnly, setShownOnly] = useState(() => recall("gisShownOnly", []));

  /* Show only these, and work out what that hides.

     From the features rather than from a list of known classes: a
     feature is hidden if ANY of its keys is hidden, so showing an
     electric line type has to leave "electric" showing too or the line
     disappears under a key nobody pressed. */
  const applyShown = useCallback((keys) => {
    setShownOnly(keys);
    remember("gisShownOnly", keys);
    setSolo(keys.length === 1 ? keys[0] : null);
    if (!keys.length) { setHidden([]); return; }

    const keep = new Set();
    const all = new Set();
    for (const f of features) {
      const ks = classKeys(f);
      ks.forEach((k) => all.add(k));
      if (ks.some((k) => keys.includes(k))) ks.forEach((k) => keep.add(k));
    }

    /* The background plan, as a key no feature carries.

       It is an image rather than a feature, so the sweep above cannot
       see it and it sat outside all of this — which is why its S did
       nothing and it had no I at all. Naming it here is what lets it be
       picked and isolated like anything else.

       ── But it survives everybody else's isolate ──

       Always kept, never swept. Isolating gas leaves the survey exactly
       where it was, because a utility shown without the ground it runs
       over is half a drawing — the same argument span nodes get above,
       and the same one the circuit isolate makes for not using this
       function at all.

       So S and I on another row mean "only this, over the plan", and S
       or I on this row means the plan on its own, since picking it
       sweeps every feature key and keeps only this one. Its own H still
       hides it, which is the way to get a utility with no survey under
       it. */
    all.add(BASEMAP_KEY);
    keep.add(BASEMAP_KEY);

    /* Span nodes survive an isolate. Nothing on an electric drawing
       carries "role:spannode", so the sweep above would hide it — and a
       utility isolated without the points it is measured between is
       half the drawing. Their own H still hides them.

       Both forms of the key, not just the plain one. A node placed on
       the trench also carries "trench:role:spannode", and keeping only
       "role:spannode" left the narrower key hidden — which was enough
       to take the node with it, since a feature goes if any of its keys
       is hidden. */
    for (const k of all) {
      if (k === "role:spannode" || k.endsWith(":role:spannode")) keep.add(k);
    }

    setHidden([...all].filter((k) => !keep.has(k)));
  }, [features, classKeys]);

  /* S isolates, and more than one can be lit.

     Press it on gas and only gas is on screen. Press it on water as
     well and both are, and nothing else. Press it again on a lit one
     and that layer drops out; press it on the last lit one and the
     whole drawing comes back, which is the way out.

     So S and I do the same thing and differ only in how many they will
     hold: I is S limited to one, and choosing another I drops the
     first. Putting a single hidden layer back is H's job — it toggles —
     which is what keeps this free to mean isolate at all times rather
     than meaning it only sometimes. */
  const showClass = useCallback((key) => {
    applyShown(shownOnly.includes(key)
      ? shownOnly.filter((x) => x !== key)
      : [...shownOnly, key]);
  }, [applyShown, shownOnly]);

  /* Everything a feature of this class carries.

     A plot seed answers to "plot", "role:plot" and "plot:role:plot".
     Isolating a utility hides all three, and taking one back off the
     hidden list left the other two on it — so unhiding plot seeds after
     an isolate appeared to do nothing at all, because a feature goes if
     any of its keys is hidden.

     Gathered from the features rather than from a list of key shapes,
     so a class this file has never heard of behaves the same. */
  const kinOf = useCallback((key) => {
    const out = new Set([key]);
    for (const f of features) {
      const ks = classKeys(f);
      if (ks.includes(key)) ks.forEach((k) => out.add(k));
    }
    return out;
  }, [features, classKeys]);

  const hideClass = useCallback((key) => {
    /* Hiding one of the layers a list is showing takes it off the list,
       rather than hiding it twice over. Otherwise pressing H on the
       only layer showing would leave an empty list still in force and
       nothing on screen, with every S lit. */
    if (shownOnly.includes(key)) {
      applyShown(shownOnly.filter((x) => x !== key));
      return;
    }
    /* Pressing H on a hidden layer puts it back. The button is the one
       anybody reaches for to undo the press that hid it, and refusing
       there sends them looking for a control that already exists.

       While a show list is running, putting a layer back means joining
       the list. Anything else leaves the two disagreeing — the list
       saying "only electric" while plot seeds are on screen — and the
       next press of any S would recompute from the list and hide them
       again, which reads as the drawing undoing what you just did.

       With no list running it is a straight unhide, of every key the
       class carries rather than only the one named. That is what was
       wrong: an isolate hides "plot", "role:plot" and "plot:role:plot",
       taking one off left the other two on, and a feature goes if any
       of its keys is hidden. So the seeds stayed away and the button
       looked broken. */
    if (hidden.includes(key)) {
      if (shownOnly.length) { applyShown([...shownOnly, key]); return; }
      const kin = kinOf(key);
      setSolo(null);
      setHidden((h) => h.filter((x) => !kin.has(x)));
      return;
    }
    setSolo(null);
    setHidden((h) => [...h, key]);
  }, [applyShown, shownOnly, hidden, kinOf]);

  /* Isolate one class: hide every class key that isn't carried by a
     feature carrying this one.

     Working from the features rather than from a list of known classes
     matters — a feature is hidden if ANY of its keys is hidden, so
     soloing an electric line type has to leave "electric" visible or the
     thing being soloed disappears with everything else. */
  const soloClass = useCallback((key) => {
    /* The same act as S, with room for one. Pressing it again shows
       everything, which is the only way back from an isolate that does
       not require remembering what was on before it. */
    applyShown(solo === key && shownOnly.length === 1 ? [] : [key]);
  }, [applyShown, solo, shownOnly]);

  /* Show one circuit and hide the rest.

     Deliberately not soloClass. That hides everything not carried by the
     thing being isolated, which for a circuit would take the trenches,
     the plot seeds and the other utilities with it — and a feeder shown
     without the ground it runs through is not much use. This hides only
     the other circuits' keys, so anything belonging to no circuit stays
     exactly as it was.

     Pressing it again on the same circuit puts everything back. */
  const isolateCircuit = useCallback((circuitId) => {
    setIsolatedCircuit((cur) =>
      (String(cur) === String(circuitId) ? null : circuitId));
  }, []);

  /* Isolate the utility that was asked for, once there are layers to
     match it against.

     Matched through the layer's own Utility_ID rather than by name: the
     layer keys and the utility names are maintained separately, and
     "Electric" matching "electric" is a coincidence that would not
     survive someone adding street lighting. */
  useEffect(() => {
    if (pendingIsolate == null || !layers.length) return;
    const layer = layers.find((l) => Number(l.Utility_ID) === pendingIsolate);
    setPendingIsolate(null);
    if (!layer) {
      setError("That utility has no layer on this drawing to show.");
      return;
    }
    soloClass(layer.Layer_Key);
    setStatus(`Showing ${layer.Label ?? layer.Layer_Key} only \u2014 `
      + "Show Everything brings the rest back");
    setTimeout(() => setStatus(""), 9000);
  }, [pendingIsolate, layers, soloClass]);

  /* The equipment a new run inherits, from its outline design.

     Keyed on the layer's utility and on whether the run is a service,
     because that is how the default is recorded: one main and one
     service per utility. A run drawn on a utility with nothing set gets
     nothing — a default that is not there is not a reason to guess.

     Electric returns a cable id, the rest return free text, matching how
     each is held on the feature itself. Nothing here invents a size for
     a utility that has no catalogue. */
  const defaultsFor = useCallback((lineTypeKey) => {
    const t = lineTypes.find((x) => x.Type_Key === lineTypeKey);
    const layerKey = t?.Layer_Key ?? null;
    if (!layerKey) return {};

    const layer = layers.find((l) => l.Layer_Key === layerKey);
    if (!layer?.Utility_ID) return {};

    const scope = scopeDefaults.find((sc) => Number(sc.Utility_ID) === Number(layer.Utility_ID));
    if (!scope) return {};

    const isService = String(lineTypeKey).includes("service");

    if (layerKey === "electric") {
      const id = isService
        ? scope.Default_Service_Cable_Size_ID
        : scope.Default_Main_Cable_Size_ID;
      return id != null ? { VD_Cable_Size_ID: Number(id) } : {};
    }
    const size = isService ? scope.Default_Service_Size : scope.Default_Main_Size;
    return size ? { Size: size } : {};
  }, [lineTypes, layers, scopeDefaults]);

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

  const drawing = tool === "boundary" || tool === "devarea"
    || tool === "line" || tool === "circuit";

  /* A cable's full name, for a status line or a tooltip. */
  const cableName = (c) => {
    if (!c) return "";
    const t = (lookups?.cableTypes || []).find((x) => x.Cable_Type_ID === c.Cable_Type_ID);
    return [t?.Cable_Type, c.Size_Label].filter(Boolean).join(" ");
  };
  const placing = queue.some((q) => !q.done);
  const nextPlot = meterFor?.plot || boundaryFor?.plot
    || queue.find((q) => !q.done) || null;

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

  /* Colour and sideways nudge for each LV feeder main.

     Worked out from the features alone, so it is recomputed when the
     drawing changes rather than on every repaint — the parallel test
     compares runs pairwise and samples along them, which is far too much
     to redo on a pan.

     Both are drawing aids and neither touches stored geometry: the nudge
     is applied to projected pixels further down. Offsetting real
     geometry would move cable ends past CONNECT_M and sever the very
     junctions the Circuit Report walks. */
  const feederPlan = useMemo(() => {
    /* The colours chosen on the substation, if any. Held there rather
       than on each cable because the choice belongs to the circuit, and
       a circuit is many cable sections — putting it on the sections
       would mean keeping them all in step and would drift the moment one
       was redrawn. */
    const sub = features.find((f) => f.Feature_Role === "substation");
    return feederRenderPlan(features, {
      chosenColours: sub?.Attributes?.Circuit_Colours || {},
    });
  }, [features]);

  /* Put the remembered choice back once there are features to work it
     out against.

     applyShown derives the hidden set from the features, so calling it
     before they arrive would hide nothing and quietly clear the
     setting. Runs when the drawing first has something in it. */
  const restoredLayers = useRef(false);
  useEffect(() => {
    if (restoredLayers.current || !features.length) return;
    restoredLayers.current = true;
    const saved = recall("gisShownOnly", []);
    if (Array.isArray(saved) && saved.length) applyShown(saved);
  }, [features, applyShown]);

  /* Where each gas main stops, so the cap can be drawn there.

     Once per change of drawing rather than once per repaint: finding a
     free end means measuring every end against every other main, and
     that is not work to do on each frame of a pan. Keyed on Feature_ID,
     so the line being drawn asks about itself.

     Depends on lineTypes as well as features, because what counts as a
     main is read off the type — renaming one in admin has to move the
     caps with it. */
  const gasCaps = useMemo(
    () => gasMainEnds(features, { lineTypes }),
    [features, lineTypes]);

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
    /* A build status overrides the line type's colour.

       A length marked as to-be-removed has to look different from one
       marked as-built, and the only place that reads on the drawing is
       the colour of the trench itself. The type's colour is what it
       falls back to where nothing has been marked, so an unmarked
       drawing looks exactly as it did.

       Dashed for planned and to-be-removed: those are lengths that are
       not in the ground, and a solid line for something that does not
       exist yet is the drawing saying something untrue. */
    const bs = statusOf(f);
    const bsColour = bs ? statusColour(bs) : null;

    return appearance(resolved, view.scale, {
      colour: bsColour ?? lt?.Colour ?? layer?.Colour ?? "#64748b",
      widthPx: lt?.Width_px ?? 2,
      ...(bs === "planned" || bs === "remove" ? { dashed: true } : {}),
      ...fallback,
    });
  }, [styles, layers, lineTypes, standard, view.scale]);

  /* Declared after styleFor, not beside the other water state.

     It was above it, and styleFor is a const — so the memo ran during
     render and read it before initialisation, which took the canvas out
     with "Cannot access 'ki' before initialization": the name after
     minification, meaning nothing to anyone reading it. Anything built
     from a resolved style has to come after the resolver. */
  /* The cable a line was drawn with, as it is written on a drawing.

     Built once rather than searched per line per frame: a site has a
     few dozen cable sizes and several hundred cables, and the label
     draw runs on every pan. */
  const cableNames = useMemo(() => {
    const types = new Map((lookups?.cableTypes || [])
      .map((t) => [Number(t.Cable_Type_ID), t.Cable_Type]));
    const out = new Map();
    for (const c of lookups?.cableSizes || []) {
      const type = types.get(Number(c.Cable_Type_ID));
      out.set(Number(c.Cable_Size_ID),
        [type, c.Size_Label].filter(Boolean).join(" "));
    }
    return out;
  }, [lookups]);

  /* The colour the water layer draws in, resolved rather than read.

     The boundary mark and the service valves are annotations on the
     water network, so they have to be the colour the water network
     actually is — and that is not simply GIS_Layer."Colour". A style row
     scoped to the layer overrides it, which is how "Water (layer
     default)" works, and reading the layer directly meant the mains
     followed that row while the marks beside them stayed on the layer's
     own colour. Two greens on one drawing, disagreeing.

     Asked with no line type and no role, so it resolves the layer's
     default rather than a main's or a meter's — which is what these are
     annotating. Falls back the same way everything else does. */
  const waterColour = useMemo(
    () => styleFor({ Layer_Key: "water", Feature_Type: "point", Attributes: {} }).colour
      || "#3b82f6",
    [styleFor]);


  /* A plot seed's size and symbol are configurable like anything else,
     but its colour is not: it carries the bedroom colour used on the
     plot badges, the plot summary and the House Types screen, and a
     style rule that quietly overrode it would break the one thing the
     symbol is read for at a glance.

     Half-width of 8 is what the canvas drew before styles existed, so an
     unstyled project is unchanged. */
  const seedStyle = useCallback((f, on) => {
    const ps = styleFor(f, { symbol: "house", symbolPx: 8 });
    /* The bedroom count from the plot, not from the seed.

       A seed carries a copy taken when it was placed, and a copy does
       not follow the plot it copied. Change a house type on the Plots
       tab and every seed kept the colour of the type it used to be —
       the drawing disagreeing with the schedule, with nothing to say
       which was right.

       The stored copy is still the fallback, for a seed whose plot has
       gone or has not loaded yet: the wrong colour is better than no
       colour, and a seed that vanished into the background would be
       worse than one that is out of date. */
    const plot = f.Plot_ID != null
      ? (plotList || []).find((p) => Number(p.plot_id) === Number(f.Plot_ID))
      : null;
    const beds = plot?.bedrooms ?? f.Attributes?.Bedrooms;
    return { ...ps, symbolPx: (on ? 1.25 : 1) * ps.symbolPx,
      colour: bedColour(beds).bg };
  }, [styleFor, plotList]);

  /* Everything worth snapping to, recalculated only when the drawing
     changes rather than on every mouse move. */
  const targets = useMemo(() => snapTargets(visibleRef.current || []), [features, hidden]);

  /* The line being drawn, as something to snap to.

     A trench that comes back on itself — a ring road, a loop round a
     green — closes by snapping its last point onto its first. That was
     impossible: snapTargets works from the saved features, and a line
     still being drawn is not among them, so its own start had nothing
     to snap to and the loop was always a fraction open. A gap of a few
     centimetres looks closed at any working zoom and leaves the network
     in two pieces.

     The first point is offered from the third click onwards. Before
     that, closing would make a loop of one segment, and the start point
     sitting under the cursor as a snap target while the second point is
     being placed only gets in the way. */
  const draftTargets = useMemo(() => {
    if (draft.length < 3) return [];
    return [{
      point: draft[0],
      featureId: null,
      vertex: 0,
      kind: "end",
      label: "Close the loop",
      lineType: lineType ?? null,
    }];
  }, [draft, lineType]);

  const allTargets = useMemo(
    () => (draftTargets.length ? [...targets, ...draftTargets] : targets),
    [targets, draftTargets],
  );


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
    if (showBasemap && basemap?.Metres_Per_Pixel) {
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

    /* Drawing order.

       Features arrive in Feature_ID order, so what was created last is
       drawn last and covers whatever is beneath it. That is wrong for
       span nodes: they are deliberately placed where something else
       already is — the origin node sits exactly on the substation, and a
       junction node on a cable — so whichever was created more recently
       won, and re-placing a substation would hide the node on it.

       Span nodes are annotation over the network, so they go last and are
       never covered. Everything else keeps its creation order, which is
       what makes a later-drawn cable sit over an earlier one. */
    /* Span nodes are drawn in a pass of their own, after everything —
       see the end of this function. Being last within this loop was not
       enough: they are deliberately placed where other things already
       are, and anything drawn afterwards, including a line's own label
       box or a marker, would cover them. */
    /* Cleared each frame, filled as labels are drawn. */
    labelHits.current = [];

    /* A proposed route, over everything else.

       Drawn as an overlay rather than by restyling the trenches: the
       proposal is not part of the drawing yet, and a candidate that
       merely looks different from its neighbours is easy to mistake for
       one that has been changed. */
    /* Gaps, drawn over everything.

       A ring at each loose end and a line to what it nearly meets, so
       the fault is visible at the zoom somebody is already at rather
       than only when they happen to be on top of it. */
    const paintGaps = () => {
      if (!gapList?.length) return;
      ctx.save();
      for (const g of gapList) {
        const a2 = toPx(g.at);
        const b2 = toPx(g.to);

        ctx.beginPath();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = "#dc2626";
        ctx.lineWidth = 2;
        ctx.moveTo(a2.x, a2.y);
        ctx.lineTo(b2.x, b2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(a2.x, a2.y, 9, 0, Math.PI * 2);
        ctx.strokeStyle = "#dc2626";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        /* The size, because half a metre and half a centimetre are
           different mistakes. */
        const t = `${g.gapM} m`;
        ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const w = ctx.measureText(t).width + 8;
        ctx.fillStyle = "rgba(255,255,255,.9)";
        ctx.fillRect(a2.x - w / 2, a2.y - 24, w, 14);
        ctx.fillStyle = "#dc2626";
        ctx.fillText(t, a2.x, a2.y - 17);
      }
      ctx.restore();
    };

    /* One meter's route, over everything else.

       Drawn from the meter itself rather than from where it tees in, so
       the service is part of what is shown — on a plot set well back
       that is most of the run and the part most likely to be wrong. */
    /* Runs already committed to a call-off, in pink.

       Drawn whether or not the call-off panel is open: knowing what has
       been asked for is worth having while looking at the drawing for
       any reason, not only while raising another one.

       Under the picking highlight, so a run being picked now reads as
       yellow over pink rather than being hidden by it — that pair is
       exactly the case somebody needs to notice. */
    /* Where the length being marked starts. */
    const paintMark = () => {
      if (!markFrom) return;
      const q = toPx(markFrom.point);
      ctx.save();
      ctx.beginPath();
      ctx.arc(q.x, q.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = statusColour(marking?.status) || "#1e3a5f";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    };

    /* The trench being inspected, so the panel and the drawing are
       plainly about the same length. */
    const paintInspect = () => {
      /* The stretch, not the whole feature — the highlight has to agree
         with what the panel is listing. */
      const g = inspect?.stretch?.geometry?.length >= 2
        ? inspect.stretch.geometry
        : inspect?.trench?.Geometry;
      if (!g || g.length < 2) return;
      ctx.save();
      for (const [colour, width] of [["#fff", 12], ["#7c3aed", 8]]) {
        ctx.beginPath();
        ctx.strokeStyle = colour;
        ctx.lineWidth = width;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        g.forEach((pt, i) => {
          const q = toPx(pt);
          if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
        });
        ctx.stroke();
      }
      ctx.restore();
    };

    const paintCalledOff = () => {
      /* Only while a new call-off is being picked.

         Shown all the time to begin with, on the reasoning that knowing
         what has been asked for is always useful. It is not: on an
         ordinary look at the drawing it is one more colour competing
         with the trace, the circuits and the levels check, and it
         answers a question nobody is asking at that moment.

         While picking a run it answers exactly the question in hand. */
      if (!callOffOpen) return;
      if (!calledOffSpans.length) return;
      ctx.save();
      for (const sp of calledOffSpans) {
        const g = sp.geometry;
        if (!g || g.length < 2) continue;
        ctx.beginPath();
        ctx.strokeStyle = "#ec4899";
        ctx.lineWidth = 8;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        g.forEach((pt, i) => {
          const q = toPx(pt);
          if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
        });
        ctx.stroke();
      }
      ctx.restore();
    };

    /* What has been picked for a call-off.

       The node waiting for its pair, and the runs already chosen. Drawn
       on the plan rather than only listed in the panel, because a range
       named "A9 to A14" means nothing until you can see which run it
       is. */
    const paintCallOff = () => {
      if (!callOffOpen) return;
      ctx.save();

      /* The trench of each span, highlighted along its length.

         A straight line from one node to the other crossed whatever was
         between them and gave no idea which trench was being called
         off. This follows the trench as drawn, clipped at each node. */
      for (const r of callOff?.ranges || []) {
        for (const sp of r.spans) {
          const g = sp.geometry;
          if (!g || g.length < 2) continue;

          /* A dark casing under the yellow, so it reads on a pale
             background plan as well as on a dark one. */
          for (const [colour, width] of [["#78350f", 11], ["#facc15", 7]]) {
            ctx.beginPath();
            ctx.strokeStyle = colour;
            ctx.lineWidth = width;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            g.forEach((pt, i) => {
              const q = toPx(pt);
              if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
            });
            ctx.stroke();
          }
        }
      }

      /* The node waiting for its pair, so a half-made range is obvious
         rather than looking like nothing happened. */
      if (pick) {
        const q = toPx(pick.Geometry[0]);
        ctx.beginPath();
        ctx.arc(q.x, q.y, 13, 0, Math.PI * 2);
        ctx.strokeStyle = "#d97706";
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    };

    const paintStep = () => {
      if (stepAt == null || !routePlan?.ok) return;

      /* Everything else knocked back first.

         The route was drawn at five pixels over trace bands up to
         eleven wide, so it read as a stripe inside the network rather
         than as a route through it. Dimming what is not part of this
         meter's path is what makes the path visible — a wider purple
         line on top of a wider coloured one is still two lines. */
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,.62)";
      /* The same w and h the frame is cleared with, rather than the
         canvas element's own width — those differ wherever the context
         is scaled, and a dimming wash that covers only part of the frame
         is worse than none. */
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      const all = [...(routePlan.served || []), ...(routePlan.unreachable || [])];
      const item = all[stepAt];
      if (!item) return;

      const m = item.meter ?? item;
      ctx.save();

      /* The service trench, where one was found. */
      /* Drawn twice: a white casing, then the line. On a plan with dark
         linework underneath, a coloured line alone disappears into
         whatever it crosses. */
      const stroke = (pts, width) => {
        for (const [colour, w] of [["#fff", width + 4], ["#7c3aed", width]]) {
          ctx.beginPath();
          ctx.strokeStyle = colour;
          ctx.lineWidth = w;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          pts.forEach((pt, i) => {
            const q = toPx(pt);
            if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
          });
          ctx.stroke();
        }
      };

      const sg = item.serviceGeometry;
      if (sg?.length >= 2) stroke(sg, 5);

      /* Then the mains route back to the board. */
      for (const ei of item.path || []) {
        const e = routePlan.graph.edges[ei];
        if (!e) continue;
        stroke([routePlan.graph.nodes[e.u], routePlan.graph.nodes[e.v]], 7);
      }

      /* The substation end, so it is clear the route got there. */
      const rootPt = routePlan.graph.nodes[routePlan.root];
      if (rootPt) {
        const q = toPx(rootPt);
        ctx.beginPath();
        ctx.arc(q.x, q.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = "#7c3aed";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      /* The meter, ringed, so it is findable even where the route is
         short or hidden under other lines. */
      const p2 = toPx((m.Geometry || [])[0] || [0, 0]);
      ctx.beginPath();
      ctx.arc(p2.x, p2.y, 11, 0, Math.PI * 2);
      ctx.strokeStyle = "#7c3aed";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    };

    const paintRoute = () => {
      if (!routePlan?.ok) return;
      const g = routePlan.graph;

      ctx.save();
      /* Everything drawn but not needed, dimmed first so the live
         sections read against it. */
      ctx.strokeStyle = "rgba(148,163,184,.45)";
      ctx.lineWidth = 2;
      /* Which sections are in use, whichever question was asked — the
         cheapest network lists its edges, the trace counts them. */
      const liveSet = routePlan.traced
        ? new Set([...routePlan.uses.keys()])
        : new Set(routePlan.liveEdges);
      g.edges.forEach((e, i) => {
        if (liveSet.has(i)) return;
        const a2 = toPx(g.nodes[e.u]);
        const b2 = toPx(g.nodes[e.v]);
        ctx.beginPath();
        ctx.moveTo(a2.x, a2.y);
        ctx.lineTo(b2.x, b2.y);
        ctx.stroke();
      });

      /* Shaded by how many meters trace through, where that is what is
         being shown.

         Width carries the count rather than colour alone: a line twice
         as thick reads as carrying twice as much at a glance and across
         a printed drawing, where a colour ramp does not. Colour deepens
         with it for the same reason the levels check uses colour —
         two cues are readable where one may not be. */
      if (routePlan.traced) {
        const peak = Math.max(1, routePlan.peak);
        for (const e of routePlan.used) {
          const a2 = toPx(routePlan.graph.nodes[e.u]);
          const b2 = toPx(routePlan.graph.nodes[e.v]);
          const share = e.uses / peak;
          ctx.beginPath();
          ctx.setLineDash(e.generated ? [7, 5] : []);
          /* Pale green for a spur, deep blue for the trunk. */
          ctx.strokeStyle = e.generated
            ? "#d97706"
            : `rgb(${Math.round(74 - share * 45)},${Math.round(222 - share * 130)},${Math.round(128 + share * 60)})`;
          ctx.lineWidth = 2.5 + share * 9;
          ctx.moveTo(a2.x, a2.y);
          ctx.lineTo(b2.x, b2.y);
          ctx.stroke();
        }
        ctx.setLineDash([]);

        /* The count on the heaviest sections, so the shading can be read
           as a number where it matters. Only the busiest, or a dense
           drawing becomes a wall of digits. */
        ctx.save();
        ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        /* One number per stretch, not per segment.

           A drawn trench is split at every service foot, so labelling
           each piece would put a number every metre or two along a run
           that carries the same count throughout. Grouping by trench and
           count gives one label per length where the figure is
           constant — which is the thing being asked: how many traces run
           along this trench.

           The longest piece in each group carries the label, so it lands
           on the part with room for it. */
        /* Grouped by contiguous run, not by trench and count.

           Keying on the trench meant one label per count per trench —
           so a trench carrying 1 in two separate places got a single
           number, on whichever stretch was longer, and the other looked
           like it carried nothing at all.

           Two stretches of the same trench with the same count are two
           different lengths of dig if there is anything between them.
           What makes them one label is being joined end to end, so that
           is what this groups on. */
        const byNode = new Map();
        for (const e of routePlan.used) {
          for (const n of [e.u, e.v]) {
            if (!byNode.has(n)) byNode.set(n, []);
            byNode.get(n).push(e);
          }
        }

        const seenEdge = new Set();
        const groups = [];
        for (const start of routePlan.used) {
          if (seenEdge.has(start.index)) continue;

          /* Flood outwards from this edge through neighbours carrying
             the same count on the same trench. */
          const chain = [];
          const queue = [start];
          seenEdge.add(start.index);
          while (queue.length) {
            const e = queue.pop();
            chain.push(e);
            for (const n of [e.u, e.v]) {
              for (const nb of byNode.get(n) || []) {
                if (seenEdge.has(nb.index)) continue;
                if (nb.uses !== e.uses) continue;
                if ((nb.trench?.Feature_ID ?? null)
                  !== (e.trench?.Feature_ID ?? null)) continue;
                seenEdge.add(nb.index);
                queue.push(nb);
              }
            }
          }

          /* One number per run, at its middle.

             Repeating it every six metres was meant to keep the figure
             legible wherever somebody was looking. It did the opposite:
             a run carrying four became "4 4 4 4 4" down the road, and
             beside a neighbouring run's numbers it read as a sequence
             changing along one trench rather than one figure repeated
             along several.

             A section carries one number. That is what makes it
             readable, and it is what was asked for. */
          let total = 0;
          for (const e of chain) total += e.len;

          /* Half way along the run by length, not the middle of its
             longest piece — on a run that bends, those are different
             places and the first is the one that looks central. */
          let walked = 0;
          let at = null;
          for (const e of chain) {
            if (walked + e.len >= total / 2) {
              const A = routePlan.graph.nodes[e.u];
              const B = routePlan.graph.nodes[e.v];
              const t = e.len ? (total / 2 - walked) / e.len : 0.5;
              at = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
              break;
            }
            walked += e.len;
          }
          if (at) groups.push({ uses: chain[0].uses, at });
        }

        /* Drawn last, with anything that would land on top of something
           already drawn left out.

           The spacing is in metres, so at a zoom where the whole site
           fits, six metres is a few pixels and every number would sit on
           its neighbour. Dropping the ones that collide keeps the run
           readable at every zoom without changing where the numbers are
           on the ground. */
        const placed = [];
        for (const g of groups) {
          const p2 = toPx(g.at);
          const t = String(g.uses);
          const w = ctx.measureText(t).width + 8;

          const clash = placed.some((q) =>
            Math.abs(q.x - p2.x) < (q.w + w) / 2 + 3
            && Math.abs(q.y - p2.y) < 17);
          if (clash) continue;
          placed.push({ x: p2.x, y: p2.y, w });

          ctx.fillStyle = "rgba(255,255,255,.9)";
          ctx.fillRect(p2.x - w / 2, p2.y - 8, w, 15);
          ctx.strokeStyle = "rgba(30,58,95,.25)";
          ctx.lineWidth = 1;
          ctx.strokeRect(p2.x - w / 2, p2.y - 8, w, 15);
          ctx.fillStyle = "#1e3a5f";
          ctx.fillText(t, p2.x, p2.y);
        }

        ctx.restore();
      }

      /* The sections that must be dug. */
      for (const e of routePlan.live || []) {
        const a2 = toPx(g.nodes[e.u]);
        const b2 = toPx(g.nodes[e.v]);
        ctx.beginPath();
        /* A link the router invented is dashed — it is a proposal about
           where to dig, not a section of something already drawn. */
        ctx.setLineDash(e.generated ? [7, 5] : []);
        ctx.strokeStyle = e.generated ? "#d97706" : "#16a34a";
        ctx.lineWidth = e.generated ? 4 : 5;
        ctx.moveTo(a2.x, a2.y);
        ctx.lineTo(b2.x, b2.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      /* Where each run stops. */
      for (const end of routePlan.ends) {
        const p2 = toPx(end.point);
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#16a34a";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      /* Meters that cannot be reached, ringed so the gap is visible
         rather than only counted. */
      /* Either shape: the trace names a reason per meter, the cheapest
         network returns the meters alone. Read as one so the drawing
         does not care which question was asked. */
      /* Traced but outside a limit: ringed amber, so it is told apart
         from one that could not be traced at all. Different colour for
         a different problem — a long service wants a trench nearer, a
         meter with no route wants a junction joining. */
      for (const f of routePlan.flagged || []) {
        const p2 = toPx((f.meter.Geometry || [])[0] || [0, 0]);
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = "#d97706";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      for (const u of routePlan.unreachable) {
        const m = u?.meter ?? u;
        const p2 = toPx((m.Geometry || [])[0] || [0, 0]);
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, 9, 0, Math.PI * 2);
        ctx.strokeStyle = "#dc2626";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      ctx.restore();
    };

    /* Cables above their trenches, whatever order they were drawn in.

       Creation order meant a trench dug after its cable covered it, and
       a run redrawn late disappeared into the ground it lies in. */
    const drawOrder = inDrawOrder(
      visible.filter((f) => f.Feature_Role !== "spannode"),
      (typeKey) => isTrenchType(typeKey, lineTypes),
    );

    /* ── Easements ──────────────────────────────────────────────────

       The strip of land a trench has a right to cross, hatched under
       everything else.

       Its own pass, over every feature rather than the visible ones.
       The flag is on the trench, so drawing it inside the trench's own
       draw call meant isolating gas hid the trench and took the
       easement with it \u2014 but the easement is what the gas is laid in,
       and it does not stop being there because the layer filter is on.
       Span nodes are exempted from the filter for the same reason and
       in the same way.

       The trench line itself still follows the filter. What survives is
       the ground, not the dig. */
    for (const f of features) {
      if (f.Feature_Type !== "line" || !isEasement(f)) continue;
      const band = easementBand((f.Geometry || []).map(toPx),
        EASEMENT_WIDTH_M * view.scale);
      if (band.length < 3) continue;
      ctx.save();
      ctx.beginPath();
      band.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.closePath();
      ctx.fillStyle = hatchPattern(ctx, EASEMENT_COLOUR);
      ctx.fill();
      /* An edge as well as the hatch: zoomed out the mesh is too fine
         to read, and the boundary is the part that matters on site. */
      ctx.strokeStyle = EASEMENT_COLOUR;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.stroke();
      ctx.restore();
    }

    drawOrder.forEach((f) => {
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
        /* Seeds take the bedroom colour used everywhere else for plots.

           From seedStyle, which reads the bedroom count off the plot
           record. This line used to read f.Attributes.Bedrooms directly —
           the copy stored on the seed when it was placed — so seedStyle's
           colour was computed and then thrown away, and changing a house
           type left every seed the colour of the type it used to be. */
        /* Resolved once for the whole point, because the label below
           needs it as well as the symbol does. */
        const pointStyle = styleFor(f);
        const ss = isSeed ? seedStyle(f, on) : null;
        /* What this point is painted with.

           A seed takes the bedroom colour, which is its own thing. Every
           other point took `colour` — the layer's, read straight off
           GIS_Layer — and so ignored the style cascade entirely: a style
           row could change a meter's symbol and its size but not its
           colour, because the resolved colour was computed into `ps` and
           then only ever used for stroke-only symbols.

           Which is why setting "Gas (layer default)" to red moved the
           gas mains and left the gas meters where they were.

           styleFor falls back to the line type, then the layer, then
           grey, so a point with no style row saying anything is painted
           exactly as it was. */
        let fill = isSeed ? ss.colour : colour;

        if (isSeed) {
          symbolPath(ctx, ss.symbol, p.x, p.y, ss.symbolPx);
                } else {
          /* Symbol, size and colour come from the style, so a DNO that
             draws meters as hexagons in its own green gets both without
             a code change. */
          const ps = pointStyle;
          fill = ps.colour ?? fill;

          /* ── A service valve ──

             A bar across the pipe, a metre of real ground wide, with SV
             beside it. Not a symbol from the style table: every symbol
             there is drawn about its own centre with no direction, and
             a valve is only meaningful turned to the main it sits in.

             Angle_Deg is the bearing of the pipe. The bar is drawn
             square to it, turned here rather than stored that way, so
             the drawing and the stored fact cannot come apart.

             The screen's y grows downward and the drawing's does not
             flip it — toPx is a plain scale and translate — so the
             normal is (-sin, cos) with no sign correction. Negating y
             here was what put the bar at a mirror of the right angle:
             square on a pipe running north or east, visibly wrong on
             anything diagonal, which is why the axis-aligned tests all
             passed. */
          if (f.Feature_Role === "servicevalve") {
            const deg = Number(f.Attributes?.Angle_Deg);
            const rad = Number.isFinite(deg) ? (deg * Math.PI) / 180 : 0;
            const halfPx = (VALVE_WIDTH_M / 2) * view.scale;
            const nx = -Math.sin(rad) * halfPx;
            const ny = Math.cos(rad) * halfPx;

            ctx.save();
            ctx.strokeStyle = on ? "#1d4ed8" : fill;
            ctx.lineWidth = Math.max(2, Math.min(6, 0.12 * view.scale));
            ctx.lineCap = "butt";
            ctx.beginPath();
            ctx.moveTo(p.x - nx, p.y - ny);
            ctx.lineTo(p.x + nx, p.y + ny);
            ctx.stroke();

            if (view.scale > 2) {
              /* The letters take the style's label colour, and fall back
                 to the bar's own rather than to the near-black every
                 other label uses.

                 A valve is a bar and two letters that mean one thing, so
                 they match unless somebody says otherwise — defaulting
                 them to black would have changed how every existing
                 drawing reads on the strength of adding a setting. Set
                 Label colour on a style row scoped to the service valve
                 role to part them. */
              ctx.fillStyle = on ? "#1d4ed8" : styleFor(f, { labelColour: fill }).labelColour;
              ctx.font = "700 11px ui-sans-serif, system-ui, sans-serif";
              ctx.textAlign = "left";
              ctx.textBaseline = "middle";
              ctx.fillText("SV", p.x + nx + 4, p.y + ny);
              ctx.textBaseline = "alphabetic";
            }
            ctx.restore();
            /* Nothing else to draw: the bar is the symbol. Returning
               here skips the fill and stroke below, which would put a
               circle on top of it. */
            return;
          }
          const r = (on ? 1.3 : 1) * (isMeter ? ps.symbolPx * 0.6 : ps.symbolPx);

          /* The circuit this meter is on, drawn round it.

             Outside the symbol rather than recolouring it: the symbol
             says what the thing is and a DNO may draw meters as
             hexagons, so the circuit has to be said without taking that
             over. */
          if (isMeter && circuitRings) {
            /* A proposed group takes precedence over a real circuit:
               while a suggestion is being looked at, the rings have to
               show what is being suggested rather than what is already
               there.

               Circuit colours come through circuitIdOf, which is how
               feederColour keys its map — numbers, not strings. Looking
               it up with String() returned undefined every time and drew
               no ring at all, silently. */
            const gi = proposedGroup.get(Number(f.Feature_ID));
            const cid = circuitIdOf(f);
            const colour = gi != null
              ? feederColourAt(gi)
              : (cid != null ? ringColours.get(cid) : null);
            if (colour) {
              ctx.save();
              ctx.beginPath();
              ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
              ctx.strokeStyle = colour;
              ctx.lineWidth = 2;
              ctx.stroke();
              ctx.restore();
              ctx.beginPath();
            }
          }

          symbolPath(ctx, ps.symbol, p.x, p.y, r);
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
        /* Labels are a layer of their own: on a drawing this dense they
           are the difference between reading it and not, and sometimes
           the difference between seeing the geometry and not. Selection
           still labels, so clicking something always tells you what it
           is. */
        if (f.Label && (on || showLabels) && view.scale > 2.5
            && !isMeter && f.Feature_Role !== "spannode") {
          ctx.fillStyle = pointStyle.labelColour;
          ctx.font = "600 11px ui-monospace, Menlo, monospace";
          ctx.textAlign = "center";
          ctx.fillText(f.Label, p.x, p.y - (isSeed ? 15 : 11));
        }
      } else {
        const st = styleFor(f);
        /* An LV feeder main carries its own colour so one run can be told
           from another, and is nudged sideways where it shares a trench
           with one. The nudge is in screen pixels, so the two stay
           legibly apart at any zoom rather than merging as you zoom out.

           Only feeder mains are in the plan; everything else draws
           exactly as it did. */
        const fp = feederPlan.get(Number(f.Feature_ID));
        const line = fp?.offsetPx ? offsetPolyline(pts, fp.offsetPx) : pts;

        ctx.beginPath();
        line.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        if (f.Feature_Type === "polygon") ctx.closePath();
        ctx.strokeStyle = on ? "#1d4ed8" : (fp?.colour ?? st.colour);
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

        /* ── Where a gas main stops ──

           A bar across the pipe with a short return off each end of it,
           facing back down the main: the mark for a capped end.

           Drawn from the geometry rather than from a feature of its
           own, for the reasons gasEnds.js gives, and drawn solid
           whatever the pipe is drawn with — a planned main is dashed
           because it is not in the ground yet, and dashing the cap as
           well would leave a mark too broken to read at the size it is.

           One path, four points. The E has three strokes and a spine,
           but the middle stroke of it is the main itself arriving, so
           what is left is a single line: back along the pipe, across
           it, and back along it again.

           The screen's y grows downward and toPx does not flip it, so
           the normal is (-dy, dx) with no sign correction — the same
           fact the service valve bar records, and the same place a
           negated y would put the mark at a mirror of the right angle
           on everything except a pipe running due north or east. */
        const caps = f.Feature_Type === "line"
          ? gasCaps.get(Number(f.Feature_ID))
          : null;
        /* Below about four pixels across it is a smudge on the end of a
           line and not a symbol, so it waits until there is room. The
           size is real ground, like the valve bar, so this is a zoom
           threshold rather than a floor on the size. */
        if (caps && (GAS_CAP_SPINE_M / 2) * view.scale >= 2) {
          const halfPx = (GAS_CAP_SPINE_M / 2) * view.scale;
          const armPx = GAS_CAP_ARM_M * view.scale;
          ctx.save();
          ctx.strokeStyle = on ? "#1d4ed8" : st.colour;
          ctx.lineWidth = st.widthPx;
          ctx.lineCap = "butt";
          ctx.lineJoin = "miter";
          for (const cap of caps) {
            const q = toPx(cap.at);
            const nx = -cap.dir[1] * halfPx;
            const ny = cap.dir[0] * halfPx;
            const bx = -cap.dir[0] * armPx;
            const by = -cap.dir[1] * armPx;
            ctx.beginPath();
            ctx.moveTo(q.x + nx + bx, q.y + ny + by);
            ctx.lineTo(q.x + nx, q.y + ny);
            ctx.lineTo(q.x - nx, q.y - ny);
            ctx.lineTo(q.x - nx + bx, q.y - ny + by);
            ctx.stroke();
          }
          ctx.restore();
        }
        /* Markers repeated along the run — an E every ten metres, a tick
           along a ducted section. Configured per style, so a drawing
           standard is a row in GIS_Style rather than a code change.

           Drawn after the stroke and before the vertices: on top of the
           line it annotates, under the handles you grab. */
        if (st.marker && f.Feature_Type === "line" && pts.length > 1) {
          const mk = st.marker;
          const colour = on ? "#1d4ed8" : (mk.colour ?? st.colour);
          for (const { point, angle } of markerPositions(f.Geometry, mk.stepM)) {
            const q0 = toPx(point);
            /* Markers come from the real geometry, so on a run that has
               been nudged aside they would sit beside the cable they
               annotate. Shifted by the same amount, along the same left
               normal offsetPolyline uses, so they travel with it. */
            const q = fp?.offsetPx
              ? { x: q0.x - Math.sin(angle) * fp.offsetPx,
                  y: q0.y + Math.cos(angle) * fp.offsetPx }
              : q0;
            ctx.save();
            ctx.translate(q.x, q.y);
            /* Turned along the run unless the style says otherwise. An
               arrow has to follow the line; a letter usually should, but
               not always. */
            if (mk.rotate) ctx.rotate(angle);
            if (mk.offsetPx) ctx.translate(0, mk.offsetPx);

            /* A gap in the line behind the marker, so a letter sits in
               the run rather than on top of it. */
            if (mk.text && (on || showLabels)) {
              ctx.font = `700 ${mk.sizePx}px ui-monospace, Menlo, monospace`;
              const w = ctx.measureText(mk.text).width;
              ctx.fillStyle = "#fff";
              ctx.fillRect(-w / 2 - 2, -mk.sizePx / 2 - 1, w + 4, mk.sizePx + 2);
              ctx.fillStyle = colour;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(mk.text, 0, 0);
              ctx.textBaseline = "alphabetic";
            }
            if (mk.symbol) {
              ctx.beginPath();
              symbolPath(ctx, mk.symbol, 0, 0, mk.sizePx / 2);
              if (STROKE_ONLY.has(mk.symbol)) {
                ctx.strokeStyle = colour;
                ctx.lineWidth = 1.8;
                ctx.stroke();
              } else {
                ctx.fillStyle = colour;
                ctx.fill();
              }
            }
            ctx.restore();
          }
        }

        // Vertices, so a selected line can be reshaped
        if (on) {
          const last = pts.length - 1;
          /* A closed ring has its two ends in the same place, so marking
             them separately would draw one on top of the other and say
             nothing. Saying it is closed is the more useful answer. */
          const shut = pts.length > 2
            && Math.hypot(pts[0].x - pts[last].x, pts[0].y - pts[last].y) < 2;

          pts.forEach((p, i) => {
            const isStart = i === 0 && !shut;
            const isEnd = i === last && !shut;
            const isEditing = editVertex?.featureId === f.Feature_ID
              && editVertex.index === i;

            ctx.beginPath();
            /* The ends are drawn larger and coloured, because finding
               them is the whole problem on a long run through a dense
               drawing — a ring of identical white dots says where the
               vertices are and nothing about which end is which. */
            ctx.arc(p.x, p.y,
              isEditing ? 6 : ((isStart || isEnd) ? 6.5 : 4.5), 0, Math.PI * 2);
            ctx.fillStyle = isStart ? "#16a34a" : (isEnd ? "#dc2626" : "#fff");
            ctx.fill();
            ctx.strokeStyle = (isStart || isEnd) ? "#fff" : "#1d4ed8";
            ctx.lineWidth = 2;
            ctx.stroke();
          });

          /* Named, not only coloured — green and red are the one pair a
             good few people cannot tell apart, and this is a drawing
             somebody may be reading over a shoulder on site. */
          if (pts.length >= 2 && !shut) {
            ctx.save();
            ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            for (const [p, text, fill] of [
              [pts[0], "START", "#16a34a"],
              [pts[last], "END", "#dc2626"],
            ]) {
              const w = ctx.measureText(text).width + 8;
              ctx.fillStyle = "rgba(255,255,255,.9)";
              ctx.fillRect(p.x - w / 2, p.y - 22, w, 13);
              ctx.fillStyle = fill;
              ctx.fillText(text, p.x, p.y - 15.5);
            }
            ctx.restore();
          }

          /* A closed loop says so once, at the join. */
          if (shut) {
            ctx.save();
            ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const text = "CLOSED LOOP";
            const w = ctx.measureText(text).width + 8;
            ctx.fillStyle = "rgba(255,255,255,.9)";
            ctx.fillRect(pts[0].x - w / 2, pts[0].y - 22, w, 13);
            ctx.fillStyle = "#16a34a";
            ctx.fillText(text, pts[0].x, pts[0].y - 15.5);
            ctx.restore();
          }
        }
        /* Way, circuit and length, once there's room.

           The label can be dragged off the cable, because on a dense
           drawing the midpoint of one run is often on top of another. A
           label that has been moved gets a leader back to the point it
           belongs to — without one, a tag floating between two cables
           belongs to neither as far as anyone reading it can tell. */
        /* Long enough on screen to carry a label. A tag wider than the
           cable it names points at nothing in particular, and a service
           stub does not need a way number. */
        const drawnLenPx = pts.length > 1
          ? pts.reduce((t, q, i) => (i ? t + Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y) : 0), 0)
          : 0;

        if (pts.length > 1 && st.showLabel && view.scale > 1.5
            && (on || (showLabels && drawnLenPx > 34))) {
          /* Half way along the run, not the middle vertex.

             It was pts[Math.floor(pts.length / 2)] — which is the middle
             of the list, and only the middle of the cable when the
             vertices happen to be evenly spaced. They rarely are: a tee
             puts a vertex wherever a service leaves, so a run with three
             vertices bunched at one end had its label pointing there
             while the cable ran on for another forty metres.

             Measured instead: half the drawn length, then walked to
             find where that falls. */
          /* ── Labels on a line ──

             A run has one automatic label and any number placed by
             hand. Add Label appends to Attributes.Labels rather than
             writing a single Label_At, which is what it did at first —
             so a second label moved the first instead of joining it,
             and the one before appeared to vanish. Placements are a
             list because that is what they are.

             Legacy Label_At and Label_Offset are read as one placement,
             so a pipe labelled before this change keeps its label
             exactly where it was put. */
          const placements = (() => {
            const list = f.Attributes?.Labels;
            if (Array.isArray(list) && list.length) return list;
            const at = f.Attributes?.Label_At;
            const off = f.Attributes?.Label_Offset;
            if (at || off) return [{ at, off }];
            return [null];        // the automatic one, at the midpoint
          })();

          /* Half way along the run, not the middle vertex.

             It was pts[Math.floor(pts.length / 2)] — the middle of the
             list, and only the middle of the cable when the vertices
             happen to be evenly spaced. They rarely are: a tee puts a
             vertex wherever a service leaves, so a run with three
             vertices bunched at one end had its label pointing there
             while the cable ran on for another forty metres. */
          const midAnchor = (() => {
            const half = drawnLenPx / 2;
            let acc = 0;
            for (let k = 1; k < pts.length; k++) {
              const a = pts[k - 1];
              const b = pts[k];
              const seg = Math.hypot(b.x - a.x, b.y - a.y);
              if (seg <= 0) continue;
              if (acc + seg >= half) {
                const t = (half - acc) / seg;
                return {
                  x: a.x + t * (b.x - a.x),
                  y: a.y + t * (b.y - a.y),
                  dx: (b.x - a.x) / seg,
                  dy: (b.y - a.y) / seg,
                };
              }
              acc += seg;
            }
            const last = pts[pts.length - 1];
            const prev = pts[pts.length - 2] ?? last;
            const d = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
            return { ...last, dx: (last.x - prev.x) / d, dy: (last.y - prev.y) / d };
          })();

          /* A point on the pipe, and the direction the pipe runs there —
             so a label lies along the length it is actually beside,
             which on a run that bends is not the midpoint's angle. */
          const anchorAt = (put) => {
            if (!Array.isArray(put) || put.length !== 2) return midAnchor;
            const q = toPx([Number(put[0]), Number(put[1])]);
            let best = null;
            for (let k = 1; k < pts.length; k++) {
              const a = pts[k - 1];
              const b = pts[k];
              const seg = Math.hypot(b.x - a.x, b.y - a.y);
              if (seg <= 0) continue;
              const t = Math.max(0, Math.min(1,
                ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / (seg * seg)));
              const cx = a.x + t * (b.x - a.x);
              const cy = a.y + t * (b.y - a.y);
              const d = Math.hypot(q.x - cx, q.y - cy);
              if (!best || d < best.d) {
                best = { d, dx: (b.x - a.x) / seg, dy: (b.y - a.y) / seg };
              }
            }
            return { x: q.x, y: q.y, dx: best?.dx ?? 1, dy: best?.dy ?? 0 };
          };

          const a = f.Attributes || {};
          /* A real circuit if the cable belongs to one, and a hop count
             otherwise — never both, and never the two confused.

             Circuit_Letter comes from Link to Circuit and the feeder
             build: B is a circuit you can point at. Hop_Letter comes
             from the tracer and means how far out the cable sits. They
             used to share the key 'Circuit', so 1B might have been
             either and running the tracer overwrote the real one. */
          const circuit = a.Circuit_Letter;
          const tag = circuit
            ? `${a.Way ?? ""}${circuit}`
            : (a.Way ? `${a.Way}${a.Hop_Letter ?? ""}` : "");

          const spelled = circuit
            ? `${a.Way ? `Way ${a.Way} · ` : ""}Circuit ${circuit}`
            : a.Way
              ? `Feeder ${a.Way}${a.Hop ? ` · hop ${a.Hop}` : ""}`
              : "";

          /* ── What a water main says ──

             The tag above is built from Circuit_Letter and Way, which
             only electric carries — so a water main had no label at
             all, whatever was in its Label field. This is the line's own
             label rather than a circuit's: the size it was built to, and
             how long it is.

             Both read off the drawing rather than off what the build
             wrote, so the length follows a run edited since and the size
             is the one on the pipe now.

             Meters counts as well as a size: a run the table could not
             size carries a plot count and no diameter, and that is the
             length most worth reading.

             Water only. Gas carries a size too and the same line would
             label it, which would put text on every gas main on every
             existing drawing on the strength of a change nobody asked
             for. */
          const sized = f.Layer_Key === "water"
            && (a.Size || a.Water_Pipe_Size_ID != null || a.Meters != null)
            ? `${a.Size ?? "size not set"}  ${lineLength(f.Geometry).toFixed(1)} m`
            : "";

          /* ── What a cable says ──

             The same as a water main: what it was built with, and how
             long it is. A circuit tag alone answers which way the
             current goes and nothing about what is in the ground, so
             the drawing had to be read against a schedule to know
             either.

             Kept beside the tag rather than replacing it — 1B is how a
             circuit is spoken about on site, and dropping it to make
             room for the cable would trade one fact for another.

             Both read off the drawing: the length is measured from the
             geometry, so it follows a run edited since, and the cable is
             the one on the line now, so a size changed in the editor
             shows immediately. */
          const cabled = f.Layer_Key === "electric" && a.VD_Cable_Size_ID != null
            ? `${cableNames.get(Number(a.VD_Cable_Size_ID)) ?? "cable not in the catalogue"}`
              + `  ${lineLength(f.Geometry).toFixed(1)} m`
            : "";

          /* The line's own label, as against the circuit's. Water and
             electric answer the same question in the same shape. */
          const own = sized || cabled;

          const txt = on
            ? [spelled || a.Size, `${lineLength(f.Geometry).toFixed(1)} m`]
              .filter(Boolean).join("  ")
            : [tag, own].filter(Boolean).join("  ");

          if (txt) placements.forEach((pl, idx) => {
            const placed = !!pl;
            const anchor = anchorAt(pl?.at);
            const off = pl?.off ?? (placed ? null : null);
            const mid = off
              ? { x: anchor.x + off[0] * view.scale, y: anchor.y + off[1] * view.scale }
              : anchor;

            /* One tag per place.

               Several cables meeting at a plot each label themselves at
               their own midpoint, and on short stubs those midpoints are
               within a few pixels of each other — so the same "1B"
               appeared three times over one point, once per cable. They
               are not different facts; they are one fact drawn
               repeatedly.

               A label is skipped if the same text has already been drawn
               nearby this frame. The first drawn wins, which is stable
               because the draw order is. A selected line is exempt: if
               you have clicked it you want its label. So is a placed
               one — putting it there was the request. */
            const dup = !on && !placed && !off && labelHits.current.some((r) =>
              r.txt === txt && Math.hypot(r.cx - mid.x, r.cy - mid.y) < 26);
            if (dup) return;

            ctx.font = "700 11px ui-monospace, Menlo, monospace";
            ctx.textAlign = "center";
            const w = ctx.measureText(txt).width + 10;

            /* A leader back to the pipe. Always for a placed label —
               it is pointing at a spot and the line says which — and
               otherwise only once a dragged one has moved far enough
               that the connection is no longer obvious. */
            if (off && (placed
              || Math.hypot(mid.x - anchor.x, mid.y - anchor.y) > 14)) {
              ctx.save();
              ctx.strokeStyle = "#94a3b8";
              ctx.lineWidth = 1;
              ctx.setLineDash([3, 3]);
              ctx.beginPath();
              ctx.moveTo(anchor.x, anchor.y);
              ctx.lineTo(mid.x, mid.y - 12);
              ctx.stroke();
              ctx.restore();
            }

            /* Where the label sits on screen, so a pointer can find it.
               Rebuilt every frame rather than stored: it moves with the
               view, and a stale rect catches clicks in the wrong place.
               The index says which placement was grabbed. */
            labelHits.current.push({
              id: f.Feature_ID, idx: placed ? idx : null, anchor, txt,
              cx: mid.x, cy: mid.y,
              x: mid.x - w / 2, y: mid.y - 20, w, h: 15,
              /* Set below, once the angle is worked out. A rotated label
                 was tested against an upright box: the further from
                 horizontal it sat, the less the box matched what was on
                 screen, so clicks landed beside it or caught a label two
                 rows away. */
              spin: 0,
            });

            /* ── Which way up ──

               A pipe label runs along the pipe. A circuit tag stays
               horizontal: it is a name read at a glance across a
               drawing, and turning it would make a page of them a page
               of scattered angles.

               An angle on the placement overrides the pipe, in degrees,
               and is what the editor's rotate control writes. Null means
               follow the pipe, which is not the same as zero — zero is
               somebody choosing horizontal and having it stay horizontal
               when the run is redrawn.

               Read upright either way: text at 100 degrees is upside
               down, so anything past a right angle is turned a half turn
               to face the other way. */
            const spin = (() => {
              const set = pl?.angle ?? a.Label_Angle;
              if (set != null && Number.isFinite(Number(set))) {
                return (Number(set) * Math.PI) / 180;
              }
              /* Angled when the label is about the line itself. A bare
                 circuit tag stays horizontal: it is a name read at a
                 glance across a page, and turning a hundred of them
                 would scatter them. */
              if (!own) return 0;
              let r = Math.atan2(anchor.dy ?? 0, anchor.dx ?? 1);
              if (r > Math.PI / 2) r -= Math.PI;
              if (r < -Math.PI / 2) r += Math.PI;
              return r;
            })();

            labelHits.current[labelHits.current.length - 1].spin = spin;

            ctx.save();
            if (spin) {
              /* Turned about the label's own anchor, so rotating does
                 not also move it — the offset is a separate thing
                 somebody set by dragging. */
              ctx.translate(mid.x, mid.y);
              ctx.rotate(spin);
              ctx.translate(-mid.x, -mid.y);
            }
            /* The plate, in the line's own colour taken most of the way
               to white.

               It was flat white, which read as a hole cut in the drawing
               and said nothing about which utility a label belonged to
               when four ran side by side. A tint says whose it is and
               still leaves the text at better than fourteen to one
               against the ink.

               Mixed towards white rather than drawn at low opacity: an
               alpha takes the colour of whatever it lands on, so the
               same label would read one way over grass and another over
               a road. */
            /* Drawn as a pill: rounded, filled in the line's own colour
               taken most of the way to white, and edged in that colour
               at a quarter strength.

               The edge does more than decorate. A flat tint on a pale
               basemap has no boundary, so the label has no apparent
               size and there is nothing to aim at; the outline is what
               makes it look like an object worth clicking, which is
               half of why these were awkward to pick up.

               The box is exactly the one recorded for hit testing —
               same origin, same width, same height — so what can be
               clicked is what can be seen. Rounding the corners takes
               nothing off that: the radius is inside the rectangle. */
            const bx = mid.x - w / 2;
            const by = mid.y - 20;
            const bh = 15;
            const rad = 4;

            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(bx, by, w, bh, rad);
            else {
              /* Older canvases have no roundRect. The same shape by
                 hand rather than a square one, so a browser that lacks
                 it does not quietly draw a different label. */
              ctx.moveTo(bx + rad, by);
              ctx.arcTo(bx + w, by, bx + w, by + bh, rad);
              ctx.arcTo(bx + w, by + bh, bx, by + bh, rad);
              ctx.arcTo(bx, by + bh, bx, by, rad);
              ctx.arcTo(bx, by, bx + w, by, rad);
              ctx.closePath();
            }
            ctx.fillStyle = own ? tint(st.colour, 0.86) : "rgba(255,255,255,.92)";
            ctx.fill();
            if (own) {
              ctx.strokeStyle = tint(st.colour, 0.45);
              ctx.lineWidth = 1;
              ctx.stroke();
            }
            /* The white plate stays white whatever the text is. It
               exists so a tag can be read over a trench, and colouring
               it with the label would take that away just where it is
               needed most. */
            ctx.fillStyle = st.labelColour;
            ctx.fillText(txt, mid.x, mid.y - 9);
            ctx.restore();
          });
        }
      }
    });

    /* ── Boundary points ──

       Where a plot's services stop being the network's and start being
       the property's. Drawn here, in a pass of their own over every
       seed rather than inside the one that draws them.

       It used to be drawn with the seed, which meant it was hidden with
       the seed — and isolating a utility hides the plot layer, because
       a seed carries no utility's keys. So Isolate Water took the
       boundary points with it, at exactly the moment somebody is
       looking at where the water stops.

       A boundary point belongs to every utility rather than to any one
       of them, so it is shown while anything it relates to is shown:
       the plots themselves, or any utility layer. Only when all of them
       are off does it go.

       Neutral, not the water colour it had. It marks one point for
       electric, gas and water alike, and painting it in one of their
       colours says it belongs to that one. */
    if (boundaryShown) {
      for (const f of features) {
        if (f.Feature_Role !== "plot") continue;
        const at = f.Attributes?.Boundary_At;
        if (!Array.isArray(at) || at.length !== 2) continue;
        const b = toPx([Number(at[0]), Number(at[1])]);
        if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
        const on = selected.includes(f.Feature_ID);

        ctx.save();
        ctx.globalAlpha = on ? 0.95 : 0.7;

        /* A leader back to the seed, only while the seed is there to
           lead to. With the plots hidden it would point at nothing. */
        if (!hidden.includes("plot") && (f.Geometry || []).length) {
          const p0 = toPx(f.Geometry[0]);
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = "#64748b";
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        const isWater = waterShown && f.Plot_ID != null
          && waterPlots.has(Number(f.Plot_ID));

        if (isWater && view.scale > 3) {
          const r = 9;
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
          /* White behind it, so the ring reads over a trench or a
             basemap line running under it. */
          ctx.fillStyle = "#fff";
          ctx.fill();
          ctx.strokeStyle = BOUNDARY_INK;
          ctx.lineWidth = 2.5;
          ctx.stroke();

          ctx.fillStyle = BOUNDARY_INK;
          ctx.font = `700 ${Math.round(r * 1.5)}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("A", b.x, b.y + 0.5);
          ctx.textBaseline = "alphabetic";
        } else {
          ctx.beginPath();
          ctx.moveTo(b.x, b.y - 4);
          ctx.lineTo(b.x + 4, b.y);
          ctx.lineTo(b.x, b.y + 4);
          ctx.lineTo(b.x - 4, b.y);
          ctx.closePath();
          ctx.fillStyle = "#fff";
          ctx.fill();
          ctx.strokeStyle = "#64748b";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

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

      if (boundaryFor) {
        /* A dashed leader back to the seed, and a hollow diamond at the
           cursor: the same language as the meter prompt, in a shape
           that is not a meter. */
        const c = toPx(cursor);
        const origin = toPx(boundaryFor.seedPoint);

        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(c.x, c.y);
        ctx.strokeStyle = "#0f172a";
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y - 6);
        ctx.lineTo(c.x + 6, c.y);
        ctx.lineTo(c.x, c.y + 6);
        ctx.lineTo(c.x - 6, c.y);
        ctx.closePath();
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.globalAlpha = 1;
        const label = `${boundaryFor.plot.plot_number} boundary`;
        ctx.font = "700 11px ui-monospace, Menlo, monospace";
        ctx.textAlign = "center";
        const w = ctx.measureText(label).width + 12;
        ctx.fillStyle = "rgba(15,23,42,.85)";
        ctx.fillRect(c.x - w / 2, c.y - 32, w, 17);
        ctx.fillStyle = "#fff";
        ctx.fillText(label, c.x, c.y - 20);
      } else if (meterFor) {
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

    /* The highlighted leg, drawn over the network but under the span
       nodes — the nodes are what a leg runs between, so they stay
       readable on top of it. */
    if (trace && traceLeg != null && trace.legs[traceLeg]?.path?.length > 1) {
      const path = trace.legs[traceLeg].path;
      ctx.save();
      ctx.strokeStyle = "#1d4ed8";
      ctx.lineWidth = 7;
      ctx.globalAlpha = 0.35;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      path.forEach((m, i) => {
        const q = toPx(m);
        if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      });
      ctx.stroke();
      ctx.restore();
    }

    /* ── Span nodes, above everything ──
       A0 sits exactly on the substation and a junction node exactly on a
       cable, so anything sharing their position and drawn later would
       hide them. Drawn here, after every feature and every overlay, they
       cannot be covered by construction rather than by ordering luck. */
    for (const f of visible) {
      if (f.Feature_Role !== "spannode") continue;
      const g = f.Geometry || [];
      if (!g.length) continue;
      const on = selected.includes(f.Feature_ID);
      const ps = styleFor(f);
      /* Its zoom band, like every other feature.

         This pass never asked, so Min_Scale and Max_Scale did nothing to
         a span node however they were set — the check lives in the main
         draw loop and span nodes are deliberately not in it. A style that
         appears to be ignored is worse than one that cannot be set.

         Selection still shows it: hiding the thing someone has just
         clicked reads as a deletion. */
      if (!on && !ps.visible) continue;

      const q = toPx(g[0]);
      const code = f.Attributes?.Span_Label ?? "";

      /* The circle is sized by the style, and the text sized to fit it.

         It used to be the other way round — the radius was the larger of
         the style size and whatever a fixed 10px label happened to
         measure, so on any label of two characters or more the text won
         and Symbol_Size_Px did nothing at all. Anyone setting it saw no
         change and reasonably concluded the field was broken.

         Now the style decides, and the label is scaled to sit inside.
         Below about seven pixels there is no room for a legible code, so
         it is dropped rather than drawn as an unreadable smudge — the
         node is still there and still says where it is. */
      const r = Math.max(3, ps.symbolPx) * (on ? 1.25 : 1);
      /* Floored, and capped at the radius rather than just over it: a
         monospace cap is about 0.72 of its point size, so a font of r
         gives a glyph comfortably inside a circle of diameter 2r. Round
         rather than floor let an 11px label into a 10px radius. */
      const fontPx = Math.floor(Math.min(r, r * 2 / Math.max(1, code.length) * 1.15));

      /* A white ring under the fill, so the node reads as sitting on top
         of whatever it covers rather than merging into it. */
      ctx.beginPath();
      ctx.arc(q.x, q.y, r + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
      ctx.fillStyle = on ? "#1d4ed8" : (ps.colour ?? "#0f172a");
      ctx.fill();

      /* Past its limit on loop impedance or volt drop.

         Drawn outside the node rather than by recolouring it: the node's
         own colour says which circuit it is on, and a design that is out
         of tolerance still needs reading. A gap between the two keeps
         the ring legible against a dark node. */
      if (traceOver.has(Number(f.Feature_ID))) {
        ctx.beginPath();
        ctx.arc(q.x, q.y, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = "#dc2626";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      /* Not part of the Labels layer. A span node without its code is an
         unmarked dot, and the codes are what the trace, the circuit
         report and the cable schedule are all read against — hiding them
         hides the drawing's index rather than tidying it. */
      if (code && fontPx >= 7 && view.scale > 1.2) {
        ctx.font = `700 ${fontPx}px ui-monospace, Menlo, monospace`;
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(code, q.x, q.y);
        ctx.textBaseline = "alphabetic";
      }
    }

    /* Last, so the proposal sits over the drawing rather than under the
       span node labels. */
    paintRoute();
    paintInspect();
    paintMark();
    paintCalledOff();
    paintCallOff();
    paintStep();
    paintGaps();
  }, [visible, selected, view, toPx, layerOf, styleFor, seedStyle, draft, cursor, snapHit, lineTypes, editVertex, typeOf, lineType, bgImage, basemap, showBasemap, showLabels, showGrid, isPdfMap, pdf.tile, pdf.size, placing, meterFor, boundaryFor, nextPlot, utilities, waterPlots, waterShown, boundaryShown, waterColour, trace, traceLeg, traceOver, circuitRings, ringColours, proposedGroup, routePlan, gapList, stepAt, callOffOpen, callOff, pick, calledOffSpans, marking, markFrom, inspect]);

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

    /* Working on the drawing puts the levels check away.

       The panel covers a good part of the canvas and the reason for
       opening it is usually to go and look at something underneath —
       so reaching past it should not mean finding the close button
       first.

       Collapsed rather than cleared: the rings stay on the drawing and
       the badge brings it straight back, so nothing is lost by a stray
       click. That distinction already exists for the close button and
       this uses it. */
    if (traceOpen) setTraceOpen(false);

    /* Right-click is for the context menu and nothing else — it used to
       pan on empty space as well, which meant a right-click that missed
       a feature by a few pixels moved the drawing instead of offering a
       menu. Panning is the middle button, and space-drag below.

       Nothing happens here: onContextMenu builds the menu, and
       pointerdown fires first, so acting now would beat it to it. */
    if (e.button === 2) {
      e.preventDefault();
      return;
    }
    if (e.button === 1) {
      e.preventDefault();
      drag.current = { mode: "pan", startPx: [px, py], startView: { ...view } };
      return;
    }
    if (e.button !== 0) return;

    /* Space and drag, for a mouse with no middle button. */
    if (spaceHeld) {
      drag.current = { mode: "pan", startPx: [px, py], startView: { ...view } };
      return;
    }

    /* A label is picked up before the feature under it: it sits on top,
       and anyone clicking a label means the label. Searched newest first
       so the one drawn last — the one visibly on top — wins. */
    if (!drawing && !placing) {
      /* Tested in the label's own frame.

         The pointer is turned back about the label's anchor by however
         far the label was turned forward, and then compared with the
         upright box it was drawn from. A box that does not rotate with
         what it stands for is the whole reason these were hard to
         catch. */
      const inLabel = (r) => {
        let x = px;
        let y = py;
        if (r.spin) {
          const dx = px - r.cx;
          const dy = py - r.cy;
          const cos = Math.cos(-r.spin);
          const sin = Math.sin(-r.spin);
          x = r.cx + dx * cos - dy * sin;
          y = r.cy + dx * sin + dy * cos;
        }
        /* Six pixels of slack on every side, not four on two of them.

           A label is fifteen pixels tall and often the smallest thing
           on the drawing; asking for a click inside those fifteen is
           asking for precision nobody has with a trackpad on a moving
           plan. The padding is even, so aiming slightly left is as
           forgiving as aiming slightly high. */
        const PAD = 6;
        return x >= r.x - PAD && x <= r.x + r.w + PAD
          && y >= r.y - PAD && y <= r.y + r.h + PAD;
      };
      const lab = [...labelHits.current].reverse().find(inLabel);
      if (lab) {
        const f = features.find((x) => x.Feature_ID === lab.id);
        drag.current = {
          mode: "label", featureId: lab.id, startPx: [px, py],
          /* From the label that was hit — `lab` — and not from `hit`,
             which is the name the feature hit test uses further down
             this function and does not exist yet up here. Reading a
             property off it threw, the click handler stopped where it
             stood, and every label became unpickable. */
          labelIdx: lab.idx ?? null,
          startOffset: (lab.idx != null
            ? f?.Attributes?.Labels?.[lab.idx]?.off
            : f?.Attributes?.Label_Offset) ?? [0, 0],
        };
        return;
      }
    }

    /* Picking the two ends of a length to mark. */
    if (marking && e.button === 0) {
      const at = toM(px, py);
      const hit = features.find((f) => f.Feature_Type === "line"
        && isTrenchType(f.Attributes?.Line_Type, lineTypes)
        && alongLine(at, f.Geometry || []).d <= HIT_PX / view.scale);

      if (!hit) return;

      if (!markFrom) {
        setMarkFrom({ feature: hit, point: alongLine(at, hit.Geometry).point });
        return;
      }
      /* Both points have to be on the same trench: a length that spans
         two features is two lengths, and marking them together would
         quietly do something different from what was asked. */
      if (hit.Feature_ID !== markFrom.feature.Feature_ID) {
        setError("Both ends must be on the same trench.");
        setMarkFrom(null);
        return;
      }
      applyMark(markFrom.feature, markFrom.point,
        alongLine(at, hit.Geometry).point);
      return;
    }

    /* Picking span nodes for a mains call-off.

       Taken before drawing and before selection, because while the mode
       is on a click means one thing only — and a click that both picked
       a node and moved the selection would be two actions from one
       press. */
    if (callOffOpen && e.button === 0) {
      const at = toM(px, py);
      const hit = features.find((f) =>
        f.Feature_Role === "spannode"
        && Math.hypot((f.Geometry?.[0]?.[0] ?? 0) - at[0],
                      (f.Geometry?.[0]?.[1] ?? 0) - at[1])
           <= HIT_PX / view.scale);

      if (!hit) return;

      if (!pick) { setPick(hit); return; }
      if (hit.Feature_ID === pick.Feature_ID) { setPick(null); return; }

      /* A run that is already called off cannot be called off again.

         Refused here rather than found at save time: somebody picking a
         second run wants to know now, while looking at the pink, not
         after filling in the dates. */
      const wanted = rangesToSpans(features, [{
        fromId: pick.Feature_ID, toId: hit.Feature_ID,
      }], {
        isTrench: (f) => f.Feature_Type === "line"
          && isTrenchType(f.Attributes?.Line_Type, lineTypes),
      });
      const taken = new Set(calledOffSpans.map((sp) => `${sp.fromId}:${sp.toId}`));
      const clash = (wanted.spans || []).filter((sp) =>
        taken.has(`${sp.fromId}:${sp.toId}`) || taken.has(`${sp.toId}:${sp.fromId}`));

      if (clash.length) {
        setError(`${clash.map((sp) => `${sp.from}\u2013${sp.to}`).join(", ")} `
          + `already called off \u2014 pick a run that is not pink.`);
        setPick(null);
        return;
      }

      setRanges((rs) => [...rs, {
        fromId: pick.Feature_ID,
        toId: hit.Feature_ID,
        from: spanNodeLabel(pick) ?? pick.Attributes?.Span_Label,
        to: spanNodeLabel(hit) ?? hit.Attributes?.Span_Label,
      }]);
      setPick(null);
      /* Asked rather than assumed.

         The panel used to say "click another span node to add a second
         run", which is a hint somebody has to notice and act on. Being
         asked outright is what makes the two-run case as easy as the
         one-run case, and it says plainly that answering No commits
         what has been picked. */
      setAskAnother(true);
      return;
    }

    if (drawing) {
      const raw = toM(px, py);
      const { point } = resolve(raw[0], raw[1]);

      /* Clicking the start point closes the loop and ends the line.

         Without this the click merely added a vertex on top of the
         first one and drawing carried on — so closing a ring meant
         clicking the start and then pressing Escape, and anyone who
         double-clicked instead got a stray vertex at the join. */
      if (draft.length >= 3
        && Math.hypot(point[0] - draft[0][0], point[1] - draft[0][1]) <= CONNECT_M) {
        const closed = [...draft, [draft[0][0], draft[0][1]]];
        setDraft(closed);
        /* Finished from the closed geometry rather than from state,
           which has not updated yet. */
        finishDrawing(closed);
        return;
      }

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
          /* A locked feature keeps its shape. Said out loud rather than
             ignored — a handle that does not drag reads as a broken
             canvas, and the message names which lock is holding it. */
          if (locked(f)) { setError(whyLocked(f)); return; }
          if (e.altKey) { removeVertex(f, idx); return; }
          drag.current = {
            mode: "vertex", featureId: f.Feature_ID, index: idx, startPx: [px, py],
            /* The shape before the drag. Dragging rewrites the feature in
               state as it moves, so by the time the button comes up the
               original is gone — and without it there is nothing for undo
               to put back. Copied, not referenced, for the same reason. */
            startGeom: (f.Geometry || []).map((q) => [...q]),
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
          /* Adding a vertex reshapes the feature as surely as dragging
             one does, and this sits past the guard above — which only
             fires when a handle is under the cursor. */
          if (locked(f)) { setError(whyLocked(f)); return; }
          const seg = segmentAt(f, px, py);
          if (seg) { addVertex(f, seg.index, seg.point); return; }
        }
      }
    }

    /* ── The property boundary point ──

       Grabbed before the ordinary hit test, because it sits on top of a
       plot seed's leader and often within a few metres of the seed
       itself — asking for candidates first would hand back the seed
       every time and the point could never be caught.

       It is an attribute of the seed rather than a feature of its own,
       so there is nothing to select in the usual sense: picking it up
       selects the seed, which is the thing that will be saved, and
       drags the attribute. */
    if (tool === "select" && boundaryShown && !e.altKey) {
      const grabbed = boundaryAt(px, py);
      if (grabbed) {
        if (locked(grabbed)) { setError(whyLocked(grabbed)); return; }
        setSelected([grabbed.Feature_ID]);
        drag.current = {
          mode: "boundary",
          featureId: grabbed.Feature_ID,
          /* Where it was, so a failed save has something to put back
             and undo has something to restore. */
          startAt: [...grabbed.Attributes.Boundary_At],
        };
        return;
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

      /* Selecting is always allowed; moving is not. A locked feature can
         still be clicked, read, edited and reported on — the lock is
         against the slip of a hand, not against working with the thing.

         Any locked feature in the set stops the whole drag rather than
         moving the rest: a selection dragged with some of it pinned
         would tear the drawing apart. */
      const pinned = next
        .map((id) => features.find((x) => x.Feature_ID === id))
        .filter((x) => x && locked(x));
      if (pinned.length) {
        setError(pinned.length === 1
          ? whyLocked(pinned[0])
          : `${pinned.length} of these are locked.`);
        return;
      }

      drag.current = { mode: "move", startPx: [px, py], ids: next, origin: {}, rubber: [] };
      next.forEach((id) => {
        const f = features.find((x) => x.Feature_ID === id);
        if (f) drag.current.origin[id] = f.Geometry;
      });

      /* Moving a point that a line ends on drags that end with it.

         A meter or a joint sits on the network because a cable reaches
         it; sliding the point away and leaving the cable behind breaks
         a connection that was never meant to change. So each line end
         within tolerance of a moved point is recorded here and moved by
         the same delta.

         Only ends, not middle vertices: a line passing near a point is
         not attached to it, and treating it as though it were would drag
         the network about whenever something was nudged. */
      /* Span nodes are excluded.

         A meter or a joint is *on* the network because something
         reaches it, so dragging one has to bring that end along. A span
         node is not: it is a marker placed on the trench to measure
         from, and the trench is what defines where it sits rather than
         the other way round.

         Dragging one used to pull the trench end with it, and the
         easement band \u2014 which is drawn from the trench's own geometry
         \u2014 came too, so the hatching appeared tied to the node. Moving
         the marker now moves the marker. */
      const movedPoints = next
        .map((id) => features.find((x) => x.Feature_ID === id))
        .filter((f) => f && f.Feature_Type === "point" && (f.Geometry || []).length)
        .filter((f) => f.Feature_Role !== "spannode");

      for (const pt of movedPoints) {
        const at = pt.Geometry[0];
        for (const line of features) {
          if (line.Feature_Type !== "line") continue;
          if (next.includes(line.Feature_ID)) continue;   // already moving whole
          const g = line.Geometry || [];
          if (g.length < 2) continue;
          for (const idx of [0, g.length - 1]) {
            if (Math.hypot(g[idx][0] - at[0], g[idx][1] - at[1]) <= CONNECT_M) {
              drag.current.rubber.push({ id: line.Feature_ID, index: idx });
              if (!drag.current.origin[line.Feature_ID]) {
                drag.current.origin[line.Feature_ID] = g;
              }
            }
          }
        }
      }
    } else if (!e.shiftKey) {
      /* Nothing under the pointer, so drag the drawing.

         This is what a map does, and it does not depend on having a
         middle button — a Magic Mouse has none, and on macOS a
         third-party one is often taken by the system before the browser
         sees it. Middle-drag and space-drag still work; this is the
         route that always does.

         The selection is cleared on release rather than now, and only if
         the pointer barely moved: a drag is a pan, a click is a click. */
      drag.current = {
        mode: "pan", startPx: [px, py], startView: { ...view }, mayClear: true,
      };
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

    /* Including the line being drawn, so it can be closed onto itself. */
    const t = findSnap(allTargets, [mx, my], view.scale, SNAP_PX);
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
    if (d.mode === "label") {
      /* Held in metres, not pixels, so a label stays where it was put
         when the drawing is zoomed. */
      const dm = [(px - d.startPx[0]) / view.scale, (py - d.startPx[1]) / view.scale];
      const moved = [d.startOffset[0] + dm[0], d.startOffset[1] + dm[1]];
      setFeatures((fs) => fs.map((f) => {
        if (f.Feature_ID !== d.featureId) return f;
        /* One of several, or the automatic one. Written into its own
           entry so dragging the third label does not move the first. */
        if (d.labelIdx != null && Array.isArray(f.Attributes?.Labels)) {
          const list = f.Attributes.Labels.map((pl, i) =>
            (i === d.labelIdx ? { ...pl, off: moved } : pl));
          return { ...f, Attributes: { ...f.Attributes, Labels: list } };
        }
        return { ...f, Attributes: { ...f.Attributes, Label_Offset: moved } };
      }));
      return;
    }

    /* Follows the cursor absolutely, like a vertex and unlike a label,
       so it belongs above the line that takes a delta. Snapped the same
       way anything else is dragged: a boundary point often wants to sit
       on the plot line or the back of the footway. */
    if (d.mode === "label") {
      /* Told apart from a click, so releasing without moving can mean
         something different from finishing a drag. */
      d.moved = true;
    }

    if (d.mode === "boundary") {
      const { point } = resolve(raw[0], raw[1]);
      setFeatures((fs) => fs.map((f) => (f.Feature_ID === d.featureId
        ? { ...f, Attributes: { ...f.Attributes, Boundary_At: point } }
        : f)));
      return;
    }

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

      /* An end dragged onto its own next vertex means "shorten to there".
         Self-snapping is excluded generally — a vertex would stick to its
         own neighbour and never reach anything else — but for an end
         landing on the one adjacent point it is the whole intent, so it
         is allowed as a specific exception and marked for the release
         handler to act on. */
      let closeTo = null;
      if (isEnd) {
        const f = features.find((x) => x.Feature_ID === featureId);
        const g = f?.Geometry || [];
        const neighbour = index === 0 ? 1 : g.length - 2;
        if (g[neighbour]) {
          const q = toPx(g[neighbour]);
          const cursor = toPx(point);
          drag.current.collapse =
            Math.hypot(q.x - cursor.x, q.y - cursor.y) <= HIT_PX ? neighbour : null;
        }

        /* The other end of the same line: closing it into a loop.

           Self-snapping is excluded generally, or a vertex would stick to
           its own neighbour and never reach anything else. Two exceptions
           earn their place: the adjacent vertex, which means "shorten to
           there", and the far end, which means "close the ring".

           Without this a loop could only be closed while drawing it, and
           a ring drawn in two sittings — or one whose join was nudged
           open later — could never be shut. A gap of a few centimetres
           looks closed and leaves the network in two pieces. */
        const other = index === 0 ? g.length - 1 : 0;
        if (g.length >= 3 && g[other]) {
          const q = toPx(g[other]);
          const cursor = toPx(point);
          if (Math.hypot(q.x - cursor.x, q.y - cursor.y) <= HIT_PX) {
            closeTo = [g[other][0], g[other][1]];
          }
        }
      }

      /* Landed exactly on the far end, so the two are the same place and
         the ring is genuinely shut rather than nearly. */
      const at = closeTo ?? point;
      drag.current.closing = !!closeTo;

      setSnapHit(closeTo
        ? { point: at, kind: "end", label: "Close the loop" }
        : hit);
      setFeatures((fs) => fs.map((f) =>
        f.Feature_ID === featureId
          ? { ...f, Geometry: f.Geometry.map((g, i) => (i === index ? at : g)) }
          : f));
      return;
    }

    if (!d.startPx) return;
    const dx = px - d.startPx[0], dy = py - d.startPx[1];

    if (d.mode === "pan") {
      /* Once it has moved, it is a pan and not a click. */
      if (!d.moved && Math.hypot(px - d.startPx[0], py - d.startPx[1]) > 3) d.moved = true;
      const { x: sx, y: sy } = d.startView;
      setView((v) => ({ ...v, x: sx + dx, y: sy + dy }));
      return;
    }

    const dm = [dx / view.scale, dy / view.scale];
    const origin = d.origin;
    const rubber = d.rubber || [];
    setFeatures((fs) => fs.map((f) => {
      const orig = origin[f.Feature_ID];
      if (!orig) return f;

      /* A line caught by a moved point moves only the ends that were
         attached. The rest of it stays put, so the run stretches rather
         than sliding — which is what "connected" means on a drawing. */
      const ends = rubber.filter((r) => r.id === f.Feature_ID).map((r) => r.index);
      if (ends.length && !d.ids.includes(f.Feature_ID)) {
        return {
          ...f,
          Geometry: orig.map((pnt, i) =>
            (ends.includes(i) ? [pnt[0] + dm[0], pnt[1] + dm[1]] : pnt)),
        };
      }
      return { ...f, Geometry: orig.map(([x, y]) => [x + dm[0], y + dm[1]]) };
    }));
  }

  async function onUp() {
    const d = drag.current;
    drag.current = null;
    setEditVertex(null);

    if (d?.mode === "pan") {
      /* A click on empty space clears the selection; a drag does not. */
      if (d.mayClear && !d.moved) setSelected([]);
      return;
    }

    if (d?.mode === "label") {
      const f = features.find((x) => x.Feature_ID === d.featureId);
      if (!f) return;

      /* A click that did not move selects the line the label is on.

         Clicking a label did nothing at all unless it was dragged: the
         line it names stayed unselected, the editor stayed shut, and
         the label is the easiest part of a thin cable to hit. So it
         behaves like clicking the cable, which is what somebody aiming
         at it means.

         Nothing is written either — a click is not an edit, and saving
         on one puts a row through the database every time somebody
         touches a label to see what it belongs to. */
      if (!d.moved) {
        setSelected([f.Feature_ID]);
        return;
      }

      try {
        await bulkUpdateFeatures(projectId, [{
          Feature_ID: f.Feature_ID,
          /* The whole attributes object: a drag may have written into
             Labels rather than Label_Offset, and naming one key saved
             the wrong thing. */
          Attributes: { ...f.Attributes },
        }]);
      } catch (e) { setError(e.message); await load(projectId); }
      return;
    }

    if (d?.mode === "boundary") {
      setSnapHit(null);
      const f = features.find((x) => x.Feature_ID === d.featureId);
      if (!f) return;
      /* Nothing to save where it did not actually move — a click that
         happens to land on it should not write to the database. */
      const at = f.Attributes?.Boundary_At;
      if (!at || (at[0] === d.startAt[0] && at[1] === d.startAt[1])) return;
      try {
        await bulkUpdateFeatures(projectId, [{
          Feature_ID: f.Feature_ID,
          Attributes: { ...f.Attributes, Boundary_At: at },
        }]);
        setError("");
      } catch (e) {
        setFeatures((fs) => fs.map((x) => (x.Feature_ID === d.featureId
          ? { ...x, Attributes: { ...x.Attributes, Boundary_At: d.startAt } }
          : x)));
        setError(e.message);
      }
      return;
    }

    if (d?.mode === "vertex") {
      setSnapHit(null);
      const f = features.find((x) => x.Feature_ID === d.featureId);
      if (!f) return;

      /* Dropped on its own neighbour: the end is removed rather than
         left sitting on top of another point. Two coincident vertices
         look like one and behave like two — they make a zero-length
         segment that shows up as an extra node and confuses every
         length and trace that walks the line. */
      if (d.collapse != null) {
        const g = f.Geometry || [];
        if (g.length > 2) {
          removeVertex(f, d.index);
          setStatus("Line shortened to the next node");
          setTimeout(() => setStatus(""), 4000);
        } else {
          setError("A line needs two points \u2014 delete the whole line instead.");
          await load(projectId);
        }
        return;
      }

      try {
        await moveFeatures(projectId, [{ Feature_ID: f.Feature_ID, Geometry: f.Geometry }]);

        /* Said out loud when a ring is shut.

           A closed loop and one that is a few centimetres open look
           identical at any working zoom, and the difference is the
           whole point — an open ring routes the long way round and can
           put a plot hundreds of metres from the substation. Confirming
           it saves someone zooming to the join to check. */
        if (d.closing) {
          setStatus("Loop closed");
          setTimeout(() => setStatus(""), 4000);
        }

        /* Reshaping is the easiest thing to do by accident on this
           canvas — a cable is dragged out of place with one slip of the
           mouse — so it is the thing undo most has to cover. Recorded
           from the shape captured when the drag began, since the feature
           in state has already been rewritten. */
        await recordAction("Reshape line", [{ ...f, Geometry: d.startGeom }], [f]);

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
          /* Every feature, not the visible ones. A join to something
             switched off is still a join, and recording it only when the
             other end happens to be on screen would make the network
             depend on what someone was looking at. */
          const others = connectedTo(f.Geometry, withTees, f.Feature_ID);
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
    /* The lines dragged along by a moved point have to be saved too, or
       they snap back to where they were on the next load and the
       connection is lost. */
    const touched = [...new Set([...d.ids, ...(d.rubber || []).map((r) => r.id)])];
    const updates = touched
      .map((id) => features.find((f) => f.Feature_ID === id))
      .filter(Boolean)
      .map((f) => ({ Feature_ID: f.Feature_ID, Geometry: f.Geometry }));
    if (!updates.length) return;
    try {
      await moveFeatures(projectId, updates);

      /* Dragging something out of place is the accident undo exists for.

         The before-state comes from d.origin, which the drag captured at
         the start and rebuilds from on every frame rather than mutating —
         so it still holds the geometry as it was. Line ends dragged along
         by a moved point are in there too, and they have to be, or undo
         would put the point back and leave the cables stretched to where
         it used to be. */
      const beforeRows = updates
        .map((u) => {
          const now = features.find((f) => f.Feature_ID === u.Feature_ID);
          const was = d.origin?.[u.Feature_ID];
          return now && was ? { ...now, Geometry: was } : null;
        })
        .filter(Boolean);
      const afterRows = updates
        .map((u) => features.find((f) => f.Feature_ID === u.Feature_ID))
        .filter(Boolean);
      const moved = afterRows.length;
      await recordAction(
        moved === 1
          ? `Move ${classLabel(afterRows[0], lineTypes) || "feature"}`
          : `Move ${moved} feature(s)`,
        beforeRows, afterRows,
      );

      const dragged = (d.rubber || []).length;
      if (dragged) {
        setStatus(`${dragged} connected line end(s) moved with it`);
        setTimeout(() => setStatus(""), 4000);
      }
    } catch (e) { setError(e.message); await load(projectId); }
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
    setBoundaryFor(null);
    setTool("select");
    setSelected([]);
  }

  function stopPlacing() {
    setQueue([]);
    setMeterFor(null);
    /* A seed waiting for its boundary point was never written, so
       cancelling has to take it off the drawing too. Leaving it would
       show a plot that exists on screen and in nothing else. */
    if (boundaryFor?.tempId) rollback(boundaryFor.tempId);
    setBoundaryFor(null);
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

    /* The property boundary point, for the plot just seeded.

       Where the dig stops. A service trench comes off the main, crosses
       the verge and ends at the boundary; everything past it is inside
       the property and is the plot's own pipework. Auto Service has no
       way to work that point out — a meter is wherever the plot puts
       it, and the seed is at the dwelling — so it is asked for.

       The seed is written here rather than on its own click. It is
       shown from the moment it is clicked, so placing still feels
       immediate, but nothing reaches the database until both points are
       known: a seed saved without its boundary, and then abandoned,
       would be a plot Auto Service quietly treats as one of the old
       ones. */
    if (boundaryFor) {
      const { plot, seedPoint, tempId } = boundaryFor;
      const draftFeature = {
        Project_ID: Number(projectId),
        Layer_Key: "plot",
        Feature_Type: "point",
        Feature_Role: "plot",
        Geometry: [seedPoint],
        Label: plot.plot_number,
        Plot_ID: plot.plot_id,
        Attributes: {
          Bedrooms: plot.bedrooms ?? null,
          Config: plot.config_code ?? null,
          Boundary_At: point,
        },
      };
      setFeatures((f) => f.map((x) =>
        (x.Feature_ID === tempId ? { ...draftFeature, Feature_ID: tempId } : x)));
      setBoundaryFor(null);

      if (utilities.length) {
        setMeterFor({
          plot, seedPoint, utility: utilities[0], all: utilities, placed: [],
        });
      } else {
        markPlaced(plot.plot_id);
      }

      try { reconcile(tempId, await createFeature(projectId, draftFeature)); }
      catch (e) { rollback(tempId); setMeterFor(null); setError(e.message); }
      return;
    }

    // The seed itself
    const plot = queue.find((q) => !q.done);
    if (!plot) return;

    /* Drawn now, written once the boundary point is known. */
    const tempId = addOptimistic({
      Project_ID: Number(projectId),
      Layer_Key: "plot",
      Feature_Type: "point",
      Feature_Role: "plot",
      Geometry: [point],
      Label: plot.plot_number,
      Plot_ID: plot.plot_id,
      Attributes: { Bedrooms: plot.bedrooms ?? null, Config: plot.config_code ?? null },
    });
    setBoundaryFor({ plot, seedPoint: point, tempId });
  }

  async function finishDrawing(geometry) {
    /* One finish per line, however many times this is called.

       Closing a loop by clicking the start point drew the trench twice:
       the click finishes the line, and the write is asynchronous, so
       anything that calls this again before the first write returns —
       a second pointer event, an Enter key, a click that registers
       twice — starts a second identical feature. Neither call knows
       about the other, and both succeed.

       A ref rather than state: state does not update until the next
       render, which is far too late to stop a call in the same tick. */
    if (finishing.current) return;
    finishing.current = true;

    try {
      await doFinishDrawing(geometry);
    } finally {
      finishing.current = false;
    }
  }

  async function doFinishDrawing(geometry) {
    /* The geometry passed in where the caller has it — closing a loop
       finishes in the same tick as the click that closed it, and state
       has not caught up. Falls back to the draft for every other
       route in. */
    const g = Array.isArray(geometry) && geometry.length ? geometry : draft;

    if (tool === "circuit") {
      if (g.length < 3) { setDraft([]); setTool("select"); return; }
      await finishCircuit(g);
      return;
    }
    const isPoly = tool === "boundary" || tool === "devarea";
    if (g.length < (isPoly ? 3 : 2)) { setDraft([]); return; }
    const t = typeOf(lineType);

    if (isPoly) {
      /* A developer area is the same shape on the same layer as the site
         boundary, told apart by carrying a developer. Anything else — a
         layer of its own, a role — would need a lookup row seeding
         before the feature could exist. */
      const dev = tool === "devarea"
        ? developers.find((x) => Number(x.Project_Developer_ID) === Number(areaFor))
        : null;
      if (tool === "devarea" && !dev) {
        setError("Choose which developer this area is for first.");
        return;
      }
      try {
        const made = await createFeature(projectId, {
          Layer_Key: "boundary", Feature_Type: "polygon",
          /* The geometry as finished, which for a closed loop includes
             the point that closes it. Reading draft here would drop it
             and leave the ring a segment short. */
          Geometry: g,
          Label: dev ? `${dev.label} area` : "Site boundary",
          Attributes: dev
            ? { Project_Developer_ID: Number(dev.Project_Developer_ID) }
            : {},
        });
        if (made?.Feature_ID) {
          await recordAction(dev ? `Draw ${dev.label} area` : "Draw site boundary", [], [made]);
        }
        setDraft([]); setSnapHit(null);
        setTool("select");
        await load(projectId);
        if (dev) {
          setStatus(`${dev.label} area drawn \u2014 `
            + "run Assign by Developer Area to apply it");
          setTimeout(() => setStatus(""), 9000);
        }
      } catch (e) { setError(e.message); }
      return;
    }

    /* A run that leaves the site is stored as two features, not one row
       with a flag. The halves have different lengths, costs and
       consents, and Length_m is one number per row.

       With no boundary drawn, site comes back null and one feature is
       created as before. Calling everything on-site because nobody has
       drawn the red line yet would put the wrong figure in a quote. */
    /* features, not visible. Hiding the boundary layer is a view
       preference; it must not stop what is drawn being classified. That
       is why trenches drawn inside the boundary were coming out
       Unclassified — the boundary was switched off, so as far as this
       line was concerned there wasn't one. */
    const runs = splitByBoundary(draft, boundaryPolygons(features));

    try {
      const made = [];
      for (const run of runs) {
        made.push(await createFeature(projectId, {
          Layer_Key: t?.Layer_Key ?? "note",
          Feature_Type: "line",
          Geometry: run.geometry,
          Label: t?.Label ?? "Line",
          Attributes: {
            /* What this project says runs of this kind are made of.
               Spread first so anything chosen on the toolbar still wins:
               a default is where to start, not what to insist on. */
            ...defaultsFor(lineType),
            Line_Type: lineType,
            /* Written by which kind of run this is, not by whatever was
               last typed into a field that is now hidden. */
            Size: isTrenchType(lineType, lineTypes)
              ? null
              : (size || defaultsFor(lineType).Size || null),
            Surface_Type: isTrenchType(lineType, lineTypes)
              ? surfaceFor(run.site, surface, surfaceTypes) : null,
            Site: run.site,
            // Recorded at draw time using the metre tolerance, not the
            // pixel one — what it touches, not what it looked near.
            Connects: connectedTo(run.geometry, features, null),
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

      /* Give whatever this line landed on a node at the meeting point.

         Snapping puts the end exactly on the other line, which looks
         joined and records a connection — but the feeder router builds
         its graph from vertices, so without one there the join is
         invisible to routing. Auto Service and dragging an end already
         tee; drawing did not, which is why a hand-drawn service trench
         could touch the mains and still be unroutable.

         teeIntoMains returns null when a vertex is already close enough,
         so nothing is inserted twice. */
      const teed = [];
      for (const m of made) {
        const g = m.Geometry || [];
        if (g.length < 2) continue;
        for (const end of [g[0], g[g.length - 1]]) {
          for (const other of features) {
            if (other.Feature_Type !== "line") continue;
            if (made.some((x) => x.Feature_ID === other.Feature_ID)) continue;
            const already = teed.find((x) => x.Feature_ID === other.Feature_ID);
            const base = already ? already.Geometry : other.Geometry;
            const next = teeIntoMains(base, end, CONNECT_M);
            if (!next) continue;
            if (already) already.Geometry = next;
            else teed.push({ Feature_ID: other.Feature_ID, Geometry: next });
          }
        }
      }
      /* A tee changes the trench it lands on, so a locked one is left
         alone.

         This was exempt by function name rather than checked — the
         exemption existed because finishDrawing mostly creates rather
         than moves, and the tee was the one write in it that does move
         something. Locking a trench against moving and then having a new
         run silently put a vertex into it is the fault the lock exists
         to prevent.

         The new run is still drawn; it simply does not modify what it
         meets. */
      const movable = teed.filter((t) => {
        const f = features.find((x) =>
          Number(x.Feature_ID) === Number(t.Feature_ID));
        return !f || !isFeatureLocked(f, lockedClasses);
      });
      if (movable.length < teed.length) {
        setStatus(`${teed.length - movable.length} locked trench(es) not teed into`);
        setTimeout(() => setStatus(""), 6000);
      }
      if (movable.length) await moveFeatures(projectId, movable);

      /* The new run, and the tee vertices it put into whatever it landed
         on, as one step — undoing the line has to take its tees with it
         or the drawing keeps vertices belonging to a line that has
         gone. */
      const drawn = made.filter((m) => m?.Feature_ID);
      if (drawn.length) {
        const teedBefore = teed
          .map((t) => features.find((f) => f.Feature_ID === t.Feature_ID))
          .filter(Boolean);
        const teedAfter = teedBefore.map((f) => ({
          ...f,
          Geometry: teed.find((t) => t.Feature_ID === f.Feature_ID).Geometry,
        }));
        await recordAction(
          drawn.length === 1
            ? `Draw ${t?.Label ?? "line"}`
            : `Draw ${t?.Label ?? "line"} (${drawn.length} runs)`,
          teedBefore, [...drawn, ...teedAfter],
        );
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
      /* "joints" is no longer an operation here. Place Feeder Joints
         does that job from the routed network; the routine this called
         put joints on the trench layer with no role, which the rest of
         the application does not recognise as joints at all. */
      if (op === "trace") {
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
    try {
      await bulkUpdatePlots(projectId, [plotId], changes);
      /* The load is not among the fields patched above, and it changes
         anyway: it is looked up from the house type on bedrooms and
         heat source together, so editing either moves it. Patching the
         two inputs and leaving the answer behind left the circuit report
         quoting the load for a heat source that had just been replaced,
         with nothing on screen to say it was stale.

         Re-read rather than recomputed here: the rule lives in
         gis_unplaced_plots and a copy of it in the browser would be a
         second rule to keep in step. */
      const pl = await listPlacementPlots(projectId).catch(() => null);
      if (pl?.plots) setPlotList(pl.plots);
    }
    catch (e) { setError(e.message); await load(projectId); throw e; }
  }

  /* ── vertices ──
     Geometry is the only thing sent. gis_length_trg recomputes
     Attributes.Length_m on any change to it, so the stored length can't
     fall behind the shape, and the label on screen reads the live
     geometry so it moves while you drag. */
  /* The closest vertex to a click, whether or not it is within the hit
     radius. Delete node should act on what you were pointing at, and a
     click a few pixels off a corner still means that corner. */
  function nearestVertexIndex(f, px, py) {
    let bi = -1, bd = Infinity;
    (f.Geometry || []).forEach((m, i) => {
      const q = toPx(m);
      const d = Math.hypot(q.x - px, q.y - py);
      if (d < bd) { bd = d; bi = i; }
    });
    return bi;
  }

  /* The plot seed whose boundary point is under the cursor.

     Ten pixels, not metres: it is a handle being grabbed, and a handle
     has to be the same size to catch at every zoom. The nearest one
     wins, so two plots whose boundary points are close together still
     give you the one you aimed at. */
  function boundaryAt(px, py) {
    let best = null;
    for (const f of features) {
      if (f.Feature_Role !== "plot") continue;
      const at = f.Attributes?.Boundary_At;
      if (!Array.isArray(at) || at.length !== 2) continue;
      const b = toPx([Number(at[0]), Number(at[1])]);
      const d = Math.hypot(b.x - px, b.y - py);
      if (d <= 10 && (!best || d < best.d)) best = { d, f };
    }
    return best?.f ?? null;
  }

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

  /* Two features that must not be linked to each other.

     Circuits are separate networks: each takes its own way on the
     substation, and two of them sharing a trench are not joined however
     close their cables run. Linking them put a span node of one circuit
     into the graph of another, and Connects is what distancesFrom walks
     for the circuit report — so a meter could be measured back to the
     substation along a cable that does not feed it.

     Only where both carry a circuit. A trench, a substation or a service
     cable belongs to no circuit and links to whatever it touches. */
  const linkable = useCallback((a, b) => {
    const ca = a?.Attributes?.Circuit_ID;
    const cb = b?.Attributes?.Circuit_ID;
    if (ca == null || cb == null) return true;
    return String(ca) === String(cb);
  }, []);

  const linksFor = useCallback((f, pool) =>
    connectedTo(f.Geometry, pool.filter((x) => linkable(f, x)), f.Feature_ID),
  [linkable]);

  /* Moving something changes what it is joined to.

     Connects is computed from geometry, so a feature that moves is
     joined to whatever is at its new position and no longer joined to
     what was at the old one — but nothing recomputed it, and the graph
     went on describing where things used to be. Dragging a span node a
     few metres to see the routing more clearly left it linked to cables
     it no longer touched, and the circuit report went on measuring
     through those links.

     Recomputed for the feature and for everything on either side of the
     move: what it used to touch has to be asked again too, or those
     features keep a link to something that has left. That set is small —
     the neighbours of one feature — so this costs a handful of rows
     rather than a pass over the drawing. */
  async function writeGeometry(id, geometry) {
    /* The last gate before the write.

       The interaction paths are guarded individually, but they are
       several and easy to add to — the alt-click that inserts a vertex
       sat past the first guard for exactly that reason. Checking here
       too means a new path cannot quietly bypass a lock, at the cost of
       one lookup. */
    const f0 = features.find((x) => Number(x.Feature_ID) === Number(id));
    if (f0 && locked(f0)) { setError(whyLocked(f0)); return; }
    const before = features.find((f) => f.Feature_ID === id);
    const moved = { ...(before || {}), Feature_ID: id, Geometry: geometry };
    const next = features.map((f) => (f.Feature_ID === id ? moved : f));
    setFeatures(next);

    try {
      await moveFeatures(projectId, [{ Feature_ID: id, Geometry: geometry }]);

      /* Only features that carry links are worth recomputing: a plot
         seed or a meter holds none and cannot go stale. */
      const wasLinked = (before?.Attributes?.Connects || []).map(Number);
      const nowLinked = linksFor(moved, next).map(Number);
      const touched = new Set([id, ...wasLinked, ...nowLinked]);

      const rows = next
        .filter((f) => touched.has(Number(f.Feature_ID))
          && (f.Feature_Type === "line" || f.Feature_Role === "spannode"))
        .map((f) => ({ f, Connects: linksFor(f, next) }))
        .filter(({ f, Connects }) => {
          const was = f.Attributes?.Connects || [];
          return [...was].sort().join(",") !== [...Connects].sort().join(",");
        })
        .map(({ f, Connects }) => ({
          Feature_ID: f.Feature_ID,
          Attributes: { ...f.Attributes, Connects },
        }));

      if (rows.length) {
        setFeatures((fs) => fs.map((f) => {
          const u = rows.find((r) => r.Feature_ID === f.Feature_ID);
          return u ? { ...f, Attributes: u.Attributes } : f;
        }));
        await bulkUpdateFeatures(projectId, rows);
      }

      /* The geometry change and the link changes it caused, as one step.
         Undoing the shape without the links would leave the drawing
         right and the network wrong. */
      const affected = new Set([Number(id), ...rows.map((r) => Number(r.Feature_ID))]);
      const beforeRows = features.filter((f) => affected.has(Number(f.Feature_ID)));
      const afterRows = beforeRows.map((f) => {
        const u = rows.find((r) => Number(r.Feature_ID) === Number(f.Feature_ID));
        const g = Number(f.Feature_ID) === Number(id) ? geometry : f.Geometry;
        return { ...f, Geometry: g, ...(u ? { Attributes: u.Attributes } : {}) };
      });
      await recordAction(
        `Edit ${classLabel(before, lineTypes) || "feature"} shape`,
        beforeRows, afterRows,
      );
    }
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

  /* The span node a cable run feeds.

     Volt drop is totalled span by span and each stretch uses the cable
     of the node it arrives at, so the figure the trace reads lives on
     the node rather than on the drawn section. Changing the cable on a
     section therefore changed nothing anyone could see: both pickers
     look the same and are filled from the same catalogue, and only one
     of them is read.

     Which node a section feeds is decided by Span_Seq rather than by
     which end of the geometry it is, because a line redrawn or joined
     can run either way round while the numbering always counts outward
     from the substation. The node with the higher sequence is the one
     downstream, and downstream is what the run feeds. */
  const nodeFedBy = useCallback((line) => {
    const g = line?.Geometry || [];
    if (g.length < 2) return null;
    const cid = line.Attributes?.Circuit_ID;
    if (cid == null) return null;
    const ends = [g[0], g[g.length - 1]];

    const near = features.filter((f) =>
      f.Feature_Role === "spannode"
      && String(f.Attributes?.Circuit_ID) === String(cid)
      && Number(f.Attributes?.Span_Seq) !== 0      // nothing feeds the origin
      && (f.Geometry || []).length
      && ends.some((e) =>
        Math.hypot(f.Geometry[0][0] - e[0], f.Geometry[0][1] - e[1]) <= CONNECT_M));

    if (!near.length) return null;
    return near.reduce((a, b) =>
      (Number(b.Attributes?.Span_Seq ?? -1) > Number(a.Attributes?.Span_Seq ?? -1) ? b : a));
  }, [features]);

  /* Putting a suggested change on the drawing.

     Two places, not one. The trace reads the cable from the span node;
     the bill reads it from the drawn section. Writing only the node
     would improve the figures and leave the schedule ordering the old
     cable — the exact drift that had a section saying 185 and its node
     saying 95 earlier today.

     Then the trace is re-run over what was just written, from the node
     it started at, so the result on screen is the design as it now is
     rather than as it was. */
  async function applyScenario(suggestion) {
    const startId = trace?.startId;
    const rows = [];

    for (const ch of suggestion.changes || []) {
      const node = features.find((f) => Number(f.Feature_ID) === Number(ch.featureId));
      if (!node) continue;
      rows.push({
        Feature_ID: node.Feature_ID,
        Attributes: { ...node.Attributes, VD_Cable_Size_ID: ch.toCable.Cable_Size_ID },
      });
      /* The runs that feed it. nodeFedBy answers the other way round, so
         the sections are found by asking each which node it feeds — the
         same rule, so the two cannot disagree about which run is which. */
      for (const line of features) {
        if (line.Feature_Type !== "line" || line.Layer_Key !== "electric") continue;
        if (line.Attributes?.Line_Type !== "elec_main") continue;
        const fed = nodeFedBy(line);
        if (!fed || Number(fed.Feature_ID) !== Number(node.Feature_ID)) continue;
        rows.push({
          Feature_ID: line.Feature_ID,
          Attributes: { ...line.Attributes, VD_Cable_Size_ID: ch.toCable.Cable_Size_ID },
        });
      }
    }

    if (!rows.length) { setError("Those span nodes are no longer on the drawing."); return; }

    setBusy("scenario");
    try {
      const before = features.filter((f) =>
        rows.some((r) => Number(r.Feature_ID) === Number(f.Feature_ID)));

      for (let i = 0; i < rows.length; i += 100) {
        await bulkUpdateFeatures(projectId, rows.slice(i, i + 100));
      }
      await recordAction(
        `Upsize ${suggestion.changes
          .map((c) => `${c.fromLabel}\u2192${c.spanLabel}`).join(", ")}`,
        before,
        before.map((f) => ({
          ...f,
          Attributes: rows.find((r) => Number(r.Feature_ID) === Number(f.Feature_ID)).Attributes,
        })),
      );

      /* One read, and the same array used for all three things: the
         canvas state, the re-run, and the record of what was traced.

         It used to read once, set the features, then call load() — which
         reads again and replaces them with a second array of identical
         content — and then trace against the first. The staleness test
         compares arrays by identity, so the panel declared itself out of
         date the instant it finished re-running.

         load() is not needed here in any case: a cable change touches
         features and nothing else, and everything load re-reads besides
         them is unchanged. */
      const fresh = await listGis(projectId);
      const after = fresh.features || [];
      setFeatures(after);

      setScenario(null);
      if (startId != null) runFullTrace({ srcFeatures: after, startId });

      setStatus(`${suggestion.changes
        .map((c) => `${c.fromLabel}\u2192${c.spanLabel} now ${c.toLabel}`).join(", ")}`
        + ` \u2014 ${rows.length} feature(s) updated, trace re-run`);
      setTimeout(() => setStatus(""), 9000);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  async function saveFeature(id, changes) {
    const before = features.find((x) => x.Feature_ID === id);
    setFeatures((f) => f.map((x) => (x.Feature_ID === id ? { ...x, ...changes } : x)));
    try {
      await updateFeature(projectId, id, changes);
      if (before) {
        await recordAction(
          `Edit ${classLabel(before, lineTypes) || "feature"}`,
          [before], [{ ...before, ...changes }],
        );
      }

      /* Carry a changed cable through to the node that reads it.

         Only when it actually changed, and only onto a node that was
         carrying the old size — a node someone has deliberately set to
         something else is a decision, and overwriting it because a
         section beneath it was edited would undo that silently. A node
         with nothing set is filled in, since no figure at all makes
         everything beyond it unknowable. */
      const wasCable = before?.Attributes?.VD_Cable_Size_ID ?? null;
      const nowCable = changes?.Attributes?.VD_Cable_Size_ID ?? null;
      const isFeeder = before?.Feature_Type === "line"
        && before?.Layer_Key === "electric";

      if (isFeeder && nowCable != null && String(nowCable) !== String(wasCable)) {
        const node = nodeFedBy({ ...before, ...changes });
        const nodeCable = node?.Attributes?.VD_Cable_Size_ID ?? null;
        if (node && (nodeCable == null || String(nodeCable) === String(wasCable))) {
          const attrs = { ...node.Attributes, VD_Cable_Size_ID: nowCable };
          setFeatures((f) => f.map((x) =>
            (x.Feature_ID === node.Feature_ID ? { ...x, Attributes: attrs } : x)));
          await updateFeature(projectId, node.Feature_ID, { Attributes: attrs });
          setStatus(`Cable also set on ${node.Attributes?.Span_Label ?? "the span node"} `
            + "\u2014 that is the figure the trace reads");
          setTimeout(() => setStatus(""), 8000);
        } else if (node && nodeCable != null) {
          /* Left alone, but said out loud: the trace will go on using
             the node's figure and the two now disagree. */
          setStatus(`${node.Attributes?.Span_Label ?? "The span node"} keeps its own cable `
            + "\u2014 the trace reads that, not this section");
          setTimeout(() => setStatus(""), 9000);
        }
      }
    }
    catch (e) { setError(e.message); await load(projectId); throw e; }
  }

  async function deleteFeature(id) {
    const gone = features.find((x) => x.Feature_ID === id);
    setFeatures((f) => f.filter((x) => x.Feature_ID !== id));
    setSelected((sel) => sel.filter((x) => x !== id));

    /* Deleting a seed frees its plot to be placed again.

       Placing marks a plot placed in this list, but nothing marked it
       back, so a deleted seed left the plot looking placed until the page
       was reloaded — and the placement panel would not offer it. */
    if (gone?.Feature_Role === "plot" && gone.Plot_ID != null) {
      setPlotList((l) => l.map((x) =>
        (Number(x.plot_id) === Number(gone.Plot_ID) ? { ...x, placed: false } : x)));
    }

    try {
      await deleteFeatures(projectId, [id]);
      /* Recorded from the row itself rather than by reading the drawing
         twice: what was deleted is already in hand, so the delta is
         exact and costs nothing. */
      if (gone) await recordAction(`Delete ${classLabel(gone, lineTypes) || "feature"}`, [gone], []);
    }
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
  async function placeNode(role, forLayer = null) {
    if (!projectId) return;
    /* The layer is named by the caller where it matters.

       It used to fall back to utilities[0] for anything that was not a
       substation, so a gas POC placed from the gas menu landed on
       whichever utility happened to be first — usually electric, and on
       a project with no electric scope, wherever else. The menu knows
       which utility it is; asking it is better than guessing. */
    const layerKey = forLayer
      ?? (role === "substation" || role === "poc" ? "electric" : (utilities[0]?.layer_key ?? "electric"));

    if (role === "poc") {
      const existing = features.find((f) => f.Feature_Role === "poc" && f.Layer_Key === layerKey);
      if (existing) {
        setError(`There is already a ${layerKey} POC. Move or delete it rather than adding a second.`);
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

    /* A governor snaps to a trench like a substation does: it is fixed
       plant standing in the ground, not a point on a main. Snapping it
       to the nearest gas main would put it wherever the pipe happens to
       run rather than where the kiosk goes. */
    /* A service valve goes on the main itself, and needs to know which
       way the main runs so the bar can be drawn across it. */
    const isValve = role === "servicevalve";
    const toTrench = role === "substation" || role === "governor";
    const targets = toTrench
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
    /* The bearing of the main under it, where there is one.

       Taken from the segment the snap landed on, which is the length of
       pipe the valve is actually in — not from the line's first and
       last point, which on a main that turns a corner would be a
       direction the pipe never runs.

       Null where no main was found. The valve is still placed, drawn
       across nothing in particular, and can be turned by hand: a valve
       somebody has put down and cannot angle is worse than one pointing
       the wrong way. */
    let angle = null;

    if (best) {
      point = best.q;
      note = ` on ${best.line.Label ?? "the network"}`;
      if (isValve) {
        const g = best.line.Geometry || [];
        const a = g[best.index - 1];
        const b = g[best.index];
        if (a && b) {
          const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (d) angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
        }
      }
    } else {
      note = toTrench
        ? " \u2014 not on a trench yet, draw one through it to join the network"
        : isValve
          ? " \u2014 not on a main, so it is drawn square to the screen. Turn it in the editor."
          : " \u2014 not on a main yet, draw the main through it later";
    }

    const count = features.filter((f) => f.Feature_Role === role).length + 1;
    const utilityName = utilities.find((u) => u.layer_key === layerKey)?.utility
      ?? (layerKey === "gas" ? "Gas" : layerKey === "water" ? "Water" : "Electric");
    const label = role === "substation" ? `Substation ${count}`
      : role === "governor" ? `Gas Governor ${count}`
        : isValve ? `SV ${count}`
          : `${utilityName} POC`;

    try {
      await createFeature(projectId, {
        Layer_Key: layerKey,
        Feature_Type: "point",
        Feature_Role: role,
        Geometry: [point],
        Label: label,
        Attributes: role === "substation" ? {}
          /* Angle_Deg is the bearing of the pipe, not of the bar. The
             bar is drawn square to it, and storing the thing being
             measured rather than the thing being drawn means the two
             cannot disagree about which is which. */
          : isValve ? { Angle_Deg: angle }
            : { Output: null },
      });
      await load(projectId);
      setStatus(`${label} placed${note}`);
      setTimeout(() => setStatus(""), 7000);
      setError("");
    } catch (e) { setError(e.message); }
  }

  /* Making a circuit out of a known set of meters.

     The half of finishCircuit that has nothing to do with how the meters
     were chosen: allocate the number, letter and way, write membership,
     and put the origin node on the substation. Drawing round the plots
     and ticking them in the report are two ways of naming the same set,
     and they must produce identical circuits — a second implementation
     would drift, and the way allocation is the part that would drift
     silently. */
  async function createCircuitFrom(meters, how) {
    const sub = features.find((f) => f.Feature_Role === "substation");
    if (!sub) {
      setError("Place a substation first \u2014 a circuit has to feed back to one.");
      return false;
    }
    if (!meters.length) {
      setError("No meters to put on a circuit.");
      return false;
    }
    const circuitId = nextCircuitId(features);
    const letter = circuitLetter(circuitId);
    const name = `Circuit ${circuitId}`;
    const kva = circuitKva(meters, (id) => plotList.find((p) => p.plot_id === id));
    const way = assignWay(sub, circuitId, kva);

    if (way.full) {
      setError(`All ${way.ways} LV ways are taken. Add a way on the substation, or free one by deleting a circuit.`);
      return false;
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
      setError("");
      setStatus(
        `${name} (${letter}) \u00B7 node ${spanLabel(letter, 0)} at the substation: `
        + `${how}, ${meters.length} meter(s), `
        + `${kva} kVA on LV way ${way.way}`
        + (way.over ? ` \u2014 ~${way.amps} A exceeds the ${way.fuse} A fuse` : "")
      );
      setTimeout(() => setStatus(""), 10000);
      return true;
    } catch (e) { setError(e.message); return false; }
    finally { setBusy(""); }
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
    const made = await createCircuitFrom(meters, `${seeds.length} plot(s)`);
    if (made) {
      setTool("select");
      setDraft([]);
    }
  }

  /* The same thing, reached from the Circuit Report by ticking meters
     that are reachable but on no circuit.

     Needed because Link to Circuit can only take plots that sit together
     — it works from an outline drawn on the canvas. Meters left over at
     the end of a design rarely do sit together, and a lasso round
     scattered plots takes in the ones already spoken for. */
  async function createCircuitFromMeters(meterIds = []) {
    const ids = meterIds.map(Number);
    const meters = features.filter((f) =>
      f.Feature_Role === "meter"
      && f.Layer_Key === "electric"
      && ids.includes(Number(f.Feature_ID))
      /* Already on a circuit is not an error worth stopping for, but it
         must not be moved silently — Remove from circuit is the way to
         take a meter off one, and doing it here would reassign without
         freeing the old circuit's way. */
      && f.Attributes?.Circuit_ID == null);

    if (!meters.length) {
      setError("Those meters are already on a circuit.");
      return;
    }
    const skipped = ids.length - meters.length;
    await createCircuitFrom(meters,
      `picked from the report${skipped ? `, ${skipped} already on a circuit skipped` : ""}`);
  }

  /* Force every span node's cable to match the run that feeds it.

     The saving path carries a cable through as it is changed, but only
     onto a node that had not been set to something else — a node someone
     chose deliberately is a decision and must not be overwritten because
     a section beneath it was edited. That guard is right for one edit
     and useless for a drawing where the two have already drifted apart,
     which is every drawing where a cable was changed before the carry
     existed.

     So this is the deliberate reconciliation: it says how many disagree,
     names them, and only then writes. What the trace reads becomes what
     the sections say. */
  async function syncNodeCables() {
    const lines = features.filter((f) =>
      f.Feature_Type === "line"
      && f.Layer_Key === "electric"
      && f.Attributes?.Circuit_ID != null
      && f.Attributes?.VD_Cable_Size_ID != null);

    const updates = new Map();
    for (const line of lines) {
      const node = nodeFedBy(line);
      if (!node) continue;
      const want = line.Attributes.VD_Cable_Size_ID;
      if (String(node.Attributes?.VD_Cable_Size_ID ?? "") === String(want)) continue;
      /* Last one wins where two sections meet at a node, which cannot
         happen on a routed network — a node has one run feeding it. */
      updates.set(node.Feature_ID, {
        node,
        Attributes: { ...node.Attributes, VD_Cable_Size_ID: want },
      });
    }

    if (!updates.size) {
      setStatus("Every span node already matches the run feeding it.");
      setTimeout(() => setStatus(""), 6000);
      return;
    }

    const sizeName = (id) => (lookups?.cableSizes || [])
      .find((c) => String(c.Cable_Size_ID) === String(id))?.Size_Label ?? id;
    const names = [...updates.values()]
      .map((u) => `${u.node.Attributes?.Span_Label ?? u.node.Feature_ID}`
        + ` \u2192 ${sizeName(u.Attributes.VD_Cable_Size_ID)}`)
      .slice(0, 12);

    if (!window.confirm(
      `Set the cable on ${updates.size} span node(s) to match the run feeding each?\n\n`
      + names.join("\n")
      + (updates.size > names.length ? `\n\u2026and ${updates.size - names.length} more` : "")
      + "\n\nThe trace reads these figures, so its results will change."
    )) return;

    setBusy("circuit");
    try {
      const rows = [...updates.values()].map((u) => ({
        Feature_ID: u.node.Feature_ID, Attributes: u.Attributes,
      }));
      for (let i = 0; i < rows.length; i += 100) {
        await bulkUpdateFeatures(projectId, rows.slice(i, i + 100));
      }
      await load(projectId);
      setStatus(`${rows.length} span node cable(s) updated \u2014 re-run the trace to see it`);
      setTimeout(() => setStatus(""), 9000);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  /* Joints on the LV feeders, classified by what meets at each point.

     Breech where a feeder divides, service where a service cable leaves
     it, straight where the cable changes — either because the customer
     count has crossed another cable's worth or because a different size
     has been specified beyond that point.

     Worked out from the routed network rather than from where line ends
     happen to coincide, which is what the older database routine does:
     that groups endpoints across every line in the drawing, so it cannot
     tell a feeder from a water main nor a service from a spur, and calls
     everything either "tee" or "straight".

     Feature_Role is set, which the database routine never did — the
     Electric menu's Joints row and Bulk Delete's "All joints" both look
     for it, so joints placed by that routine appear in neither. */
  async function placeFeederJoints({ silent = false, srcFeatures = null } = {}) {
    const src = srcFeatures || features;
    const circuits = circuitsFrom(src);
    if (!circuits.length) {
      if (!silent) setError("No circuits defined yet — use Link to Circuit first.");
      return 0;
    }

    const planned = planJoints(src, circuits, {
      lineTypes,
      plotById: (id) => plotList.find((p) => p.plot_id === id),
      /* For the drum rule: how much cable comes on one drum, per size.
         A size with none recorded places no drum joints. */
      cableById: (id) => (lookups?.cableSizes || [])
        .find((c) => String(c.Cable_Size_ID) === String(id)) || null,
    });
    const existing = src.filter((f) =>
      f.Feature_Role === "joint" || f.Attributes?.Joint_Type != null);
    const { add, update, stale } = reconcileJoints(planned, existing, CONNECT_M);

    if (!add.length && !update.length) {
      if (!silent) {
        setStatus(planned.length
          ? `All ${planned.length} joint(s) already in place`
          : "No joints needed on the feeders yet");
        setTimeout(() => setStatus(""), 6000);
      }
      return 0;
    }

    const tally = (list, get) => {
      const t = {};
      for (const x of list) { const k = get(x); t[k] = (t[k] || 0) + 1; }
      return Object.entries(t).map(([k, n]) => `${n} ${JOINT_KINDS[k]?.label ?? k}`).join(", ");
    };

    if (!silent && !window.confirm(
      `Place joints on the LV feeders?\n\n`
      + (add.length ? `Add: ${tally(add, (j) => j.kind)}\n` : "")
      + (update.length ? `Reclassify: ${tally(update, (u) => u.plan.kind)}\n` : "")
      + (stale.length ? `\n${stale.length} existing joint(s) the network no longer calls for `
        + "will be left alone.\n" : "")
    )) return 0;

    const attrsFor = (j) => ({
      Joint_Type: j.kind,
      Joint_Code: JOINT_KINDS[j.kind]?.code ?? null,
      /* Every reason, not only the winning one, so a breech that is also
         serving a plot can still say so. */
      Joint_Reasons: j.reasons,
      Ways_In: j.ways,
      Services: j.services,
      /* One circuit. A joint joins one network's cables; two circuits
         passing the same point each get their own. */
      Circuit_ID: j.circuitId ?? null,
      Generated: true,
    });

    if (!silent) setBusy("joints");
    try {
      for (const j of add) {
        await createFeature(projectId, {
          Layer_Key: "electric",
          Feature_Type: "point",
          Feature_Role: "joint",
          Geometry: [j.point],
          Label: JOINT_KINDS[j.kind]?.label ?? "Joint",
          Attributes: attrsFor(j),
        });
      }
      if (update.length) {
        const rows = update.map((u) => ({
          Feature_ID: u.feature.Feature_ID,
          Attributes: { ...u.feature.Attributes, ...attrsFor(u.plan) },
        }));
        for (let i = 0; i < rows.length; i += 100) {
          await bulkUpdateFeatures(projectId, rows.slice(i, i + 100));
        }
      }
      if (!silent) await load(projectId);
      setStatus(`${add.length} joint(s) placed`
        + (update.length ? `, ${update.length} reclassified` : "")
        + (stale.length ? `, ${stale.length} left alone` : ""));
      setTimeout(() => setStatus(""), 9000);
      setError("");
      return add.length + update.length;
    } catch (e) { setError(e.message); return 0; }
    finally { if (!silent) setBusy(""); }
  }

  /* The incoming supply, from the point of connection to the substation.

     Routed along the trenches rather than drawn straight: the cable lies
     in a dig like everything else, and the length that goes into the
     bill and the volt drop is the one it travels.

     One run, and only one. A second POC route on the same drawing is
     almost always a mistake rather than a design with two incomers, so
     an existing one is replaced rather than added to — and it is said
     out loud before anything is written. */
  async function routeSupply() {
    const r = routePocToSubstation(features, { lineTypes });
    if (r.error) { setError(r.error); return; }

    const existing = features.filter((f) =>
      f.Feature_Type === "line"
      && f.Layer_Key === "electric"
      && f.Attributes?.Poc_Route === true);

    const type = lineTypes.find((t) => t.Type_Key === "elec_hv");
    if (!window.confirm(
      `Route the supply from ${r.poc.Label || "the POC"} to `
      + `${r.substation.Label || "the substation"}?\n\n`
      + `${r.metres} m along the trenches`
      + (type ? ` as ${type.Label}` : "")
      + (existing.length ? `\n\nThe existing route will be replaced.` : "")
    )) return;

    setBusy("route");
    try {
      if (existing.length) {
        await deleteFeatures(projectId, existing.map((f) => f.Feature_ID));
      }
      const made = await createFeature(projectId, {
        Layer_Key: "electric",
        Feature_Type: "line",
        Geometry: r.geometry,
        Label: "Supply from POC",
        Attributes: {
          Line_Type: "elec_hv",
          /* Marks this as the incomer so a rerun can find and replace it
             without touching an HV run drawn by hand. */
          Poc_Route: true,
          Generated: true,
          Connects: connectedTo(r.geometry, features, null),
        },
      });
      await recordAction("Route POC to substation",
        existing, [...(made?.Feature_ID ? [made] : [])]);
      await load(projectId);
      setStatus(`Supply routed \u2014 ${r.metres} m from `
        + `${r.poc.Label || "POC"} to ${r.substation.Label || "the substation"}`);
      setTimeout(() => setStatus(""), 9000);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  /* Applying the developer areas to what is drawn.

     Splitting is the reason this asks first. A trench crossing from one
     developer's ground to another cannot be one row — the same reason
     the site boundary splits it — but splitting changes the drawing, and
     that is worth seeing before agreeing to. */
  async function assignByDeveloper() {
    const plan = planDeveloperAssignment(features);
    if (plan.error) { setError(plan.error); return; }

    const nameOf = (id) => developers
      .find((d) => Number(d.Project_Developer_ID) === Number(id))?.label ?? `developer ${id}`;

    if (!plan.label.length && !plan.split.length && !plan.clear.length) {
      setStatus(`Nothing to change \u2014 ${plan.untouched} feature(s) already right, `
        + `${plan.shared} shared.`);
      setTimeout(() => setStatus(""), 8000);
      return;
    }

    if (!window.confirm(
      "Assign what is drawn to the developer whose area it stands in?\n\n"
      + (plan.label.length ? `${plan.label.length} feature(s) assigned\n` : "")
      + (plan.split.length
        ? `${plan.split.length} crossing an area edge will be SPLIT into separate runs\n`
        : "")
      + (plan.clear.length ? `${plan.clear.length} no longer in any area, cleared\n` : "")
      + `\n${plan.shared} shared item(s) left alone `
      + "(substations, points of connection, the incomer).\n"
      + (plan.overlaps.length
        ? `\nWarning: ${plan.overlaps.length} pair(s) of areas overlap. `
          + "Where they do, the first drawn wins."
        : "")
    )) return;

    setBusy("developer");
    try {
      /* Labels first: a bulk write, and nothing about the drawing
         changes shape. */
      if (plan.label.length) {
        const rows = plan.label.map((x) => ({
          Feature_ID: x.feature.Feature_ID,
          Attributes: { ...x.feature.Attributes, Project_Developer_ID: x.developerId },
        }));
        for (let i = 0; i < rows.length; i += 100) {
          await bulkUpdateFeatures(projectId, rows.slice(i, i + 100));
        }
      }
      if (plan.clear.length) {
        const rows = plan.clear.map((x) => {
          const a = { ...x.feature.Attributes };
          delete a.Project_Developer_ID;
          return { Feature_ID: x.feature.Feature_ID, Attributes: a };
        });
        for (let i = 0; i < rows.length; i += 100) {
          await bulkUpdateFeatures(projectId, rows.slice(i, i + 100));
        }
      }

      /* Splits: the first run keeps the original feature, the rest are
         new. Keeping the row means its links, labels and anything
         referring to it survive for the part that has not moved. */
      for (const s of plan.split) {
        const [head, ...tail] = s.runs;
        await moveFeatures(projectId, [{
          Feature_ID: s.feature.Feature_ID, Geometry: head.geometry,
        }]);
        await updateFeature(projectId, s.feature.Feature_ID, {
          Attributes: {
            ...s.feature.Attributes,
            Project_Developer_ID: head.developerId ?? null,
          },
        });
        for (const r of tail) {
          await createFeature(projectId, {
            Layer_Key: s.feature.Layer_Key,
            Feature_Type: s.feature.Feature_Type,
            Feature_Role: s.feature.Feature_Role ?? null,
            Geometry: r.geometry,
            Label: s.feature.Label,
            Plot_ID: s.feature.Plot_ID ?? null,
            Attributes: {
              ...s.feature.Attributes,
              Project_Developer_ID: r.developerId ?? null,
            },
          });
        }
      }

      await load(projectId);
      setStatus(`${plan.label.length} assigned`
        + (plan.split.length ? `, ${plan.split.length} split` : "")
        + (plan.clear.length ? `, ${plan.clear.length} cleared` : "")
        + `, ${plan.shared} shared left alone`);
      setTimeout(() => setStatus(""), 10000);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  /* Splitting the estate into circuits automatically.

     Above about seventy properties one LV circuit runs out, and dividing
     an estate by hand means dragging plots into groups and re-running
     the levels check until it passes.

     Grouped along the trench tree rather than by position on the map:
     two houses either side of a road are close on the map and far apart
     along the cable, so map proximity produces circuits that interleave
     and both run the same length of trench.

     Shown before it is done. Creating circuits reassigns every meter on
     the drawing, and an automatic answer nobody has agreed to is not one
     to apply quietly. */
  /* Suggesting a grouping. Nothing is written.

     Run on a drawing that is a mains trench, plot seeds and meters and
     nothing else — before any circuit exists, before any service is
     drawn. So there is nothing to reassign and nothing to undo: the
     answer is shown as coloured rings and waits.

     Grouped along the trench tree rather than by position on the map:
     two houses either side of a road are close on the map and far apart
     along the cable, so map proximity produces groups that interleave
     and both run the same length of trench. */
  function suggestGroups() {
    const plan = planCircuitGroups(features, {
      lineTypes,
      plotById: (id) => plotList.find((p) => p.plot_id === id),
    });
    if (plan.error) { setError(plan.error); setGroupPlan(null); return; }
    if (!plan.groups.length) {
      setGroupPlan(null);
      setStatus(plan.reason ?? "Nothing to split.");
      setTimeout(() => setStatus(""), 8000);
      return;
    }
    setGroupPlan(plan);
    setCircuitRings(true);
    setError("");
  }

  /* Accepting it. Only now is anything created. */
  async function acceptGroups() {
    const plan = groupPlan;
    if (!plan?.groups?.length) return;

    setBusy("group");
    try {
      for (const g of plan.groups) {
        /* Through the same call the Circuit Report uses, so a circuit
           made from a suggestion is indistinguishable from one made by
           hand — same numbering, same way allocation. */
        await createCircuitFromMeters(g.meters.map((m) => m.Feature_ID));
      }
      setGroupPlan(null);
      setStatus(`${plan.groups.length} circuits created \u2014 ${plan.sizes.join(", ")}`);
      setTimeout(() => setStatus(""), 10000);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  /* Locking or unlocking what is selected.

     Written to the features, so it survives a reload and follows the
     drawing to whoever opens it next — unlike a class lock, which is one
     person's working preference. */
  async function setLockOn(lock) {
    const rows = planLock(selectedFeatures, lock);
    if (!rows.length) {
      setStatus(lock ? "Already locked." : "None of these were locked.");
      setTimeout(() => setStatus(""), 5000);
      return;
    }
    setBusy("lock");
    try {
      const before = features.filter((f) =>
        rows.some((r) => Number(r.Feature_ID) === Number(f.Feature_ID)));
      for (let i = 0; i < rows.length; i += 100) {
        await bulkUpdateFeatures(projectId, rows.slice(i, i + 100));
      }
      setFeatures((fs) => fs.map((f) => {
        const r = rows.find((x) => Number(x.Feature_ID) === Number(f.Feature_ID));
        return r ? { ...f, Attributes: r.Attributes } : f;
      }));
      await recordAction(`${lock ? "Lock" : "Unlock"} ${rows.length} feature(s)`,
        before,
        before.map((f) => ({
          ...f,
          Attributes: rows.find((r) =>
            Number(r.Feature_ID) === Number(f.Feature_ID)).Attributes,
        })));
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  /* Working out which candidate trenches have to be dug.

     Nothing is written: the plan is held on screen, the live sections
     are drawn bold and the rest dimmed, and it is accepted or discarded.
     Accepting deletes the candidates that are not needed, which is a
     large and irreversible-looking change — so it is undoable as one
     step and says how many before it does anything. */
  /* Tracing every meter home, and shading the trench by how many use it.

     A different question from "what is the cheapest network": each meter
     takes its own shortest route, so nobody is further from the
     substation than the site allows, and the shading says which sections
     are carrying the site. */
  /* Placing span nodes on the trench network.

     They mark where a run divides or stops, which is a fact about the
     dig — so they can be placed the moment the trenches are drawn,
     before any circuit exists. A mains call-off names a run as "A1 to
     A5" and could not be raised until an LV network had been built,
     which had it backwards.

     Existing nodes are matched by position and renumbered rather than
     replaced: one somebody moved or added by hand is theirs, and
     deleting it to put an identical one back would lose whatever else
     was set on it. */
  async function placeSpanNodes() {
    const trenches = features.filter((f) =>
      f.Feature_Type === "line" && isTrenchType(f.Attributes?.Line_Type, lineTypes));
    /* Every utility's origin, not the first plant on the drawing.

       `features.find` returned whichever came first, so a site with a
       substation and a gas POC gave electric its E0 and left gas to be
       numbered as an ordinary span — which is how a generic A-number
       ended up on a gas POC.

       Substation first, so the A-numbers count outward from it. */
    const origins = [...originsOf(features).values()].map((o) => o.feature);
    const plant = origins.sort((a, b) =>
      (a.Feature_Role === "substation" ? -1 : 0) - (b.Feature_Role === "substation" ? -1 : 0));

    /* The meters, so a trench with one on its end is recognised as a
       service and skipped. Nothing is placed where a service joins a
       main, nor at the service's own end. */
    /* Which trench types are services.

       The key, not the label. There are two trench types and they are
       seeded by migration 0050 as trench_main and trench_service — the
       key is fixed, the label is text somebody may edit. Matching the
       label meant a renamed type stopped being recognised, and the only
       symptom would be span nodes appearing where services tee in.

       Any additional service type is picked up too, so a site with more
       than one does not need this changing. */
    const serviceTypes = new Set(lineTypes
      .filter((t) => t.Layer_Key === "trench"
        && (t.Type_Key === "trench_service" || /service/i.test(t.Type_Key)))
      .map((t) => t.Type_Key));

    /* Belt and braces: the key straight off the feature, for anything
       drawn before the type list was loaded. */
    serviceTypes.add("trench_service");

    const plan = planSpanNodes(trenches, plant, { serviceTypes });
    if (plan.error) { setError(plan.error); return; }

    setBusy("spannodes");
    /* Each node is its own round trip, so a site with a couple of
       hundred of them takes long enough that a still screen reads as a
       hung one. Same bar and the same Stop button as Auto Service and
       the network builds — this was the one long run that had neither. */
    cancelRef.current = false;
    setProgress({
      done: 0,
      total: plan.nodes.length,
      label: `Placing ${plan.nodes.length} span node(s)`,
    });
    try {
      const existing = features.filter((f) => f.Feature_Role === "spannode");
      const claimed = new Set();
      let made = 0;
      let moved = 0;
      let doneCount = 0;
      let stopped = false;

      /* Name the origins on the drawing.

         E0, G0 and W0 are what a levels check counts from and what a
         call-off names a run against, but nothing had ever written them
         onto the plant \u2014 the labels existed only in the code, so the
         drawing showed a substation and a gas POC with no origin marked
         and the first junction reading A1 as though it were the start.

         Written here because this is the run that decides the
         numbering: the origins and the spans have to agree, and doing
         them together is the only way they cannot drift. */
      for (const [, origin] of originsOf(features)) {
        const f = origin.feature;
        if (f.Attributes?.Span_Label === origin.label) continue;
        await bulkUpdateFeatures(projectId, [{
          Feature_ID: f.Feature_ID,
          Label: origin.label,
          Attributes: { ...f.Attributes, Span_Label: origin.label, Span_Seq: 0 },
        }]);
        moved += 1;
      }

      for (const nd of plan.nodes) {
        /* Stopping part-way is safe here, as it is for Auto Service: a
           node already placed is matched and claimed on the next run
           rather than duplicated, so running it again carries on rather
           than starting over. */
        if (cancelRef.current) { stopped = true; break; }
        setProgress({
          done: doneCount,
          total: plan.nodes.length,
          label: `Node ${doneCount + 1} of ${plan.nodes.length} \u00b7 ${nd.label}`,
        });
        doneCount += 1;

        const match = existing.find((f) => !claimed.has(f.Feature_ID)
          && Math.hypot((f.Geometry?.[0]?.[0] ?? 0) - nd.at[0],
                        (f.Geometry?.[0]?.[1] ?? 0) - nd.at[1]) < 1);

        if (match) {
          claimed.add(match.Feature_ID);
          /* Only where the label actually changes — replacing every node
             on every run would churn the drawing for nothing. */
          if (match.Attributes?.Span_Label !== nd.label) {
            await bulkUpdateFeatures(projectId, [{
              Feature_ID: match.Feature_ID,
              Label: `Point ${nd.label}`,
              Attributes: {
                ...match.Attributes,
                Span_Seq: nd.seq, Span_Label: nd.label, Span_Kind: nd.kind,
              },
            }]);
            moved += 1;
          }
          continue;
        }

        await createFeature(projectId, {
          /* On the trench layer, because that is what it belongs to —
             with its own class so it can be hidden without hiding the
             trenches it sits on. */
          Layer_Key: "trench",
          Feature_Type: "point",
          Feature_Role: "spannode",
          Geometry: [nd.at],
          Label: `Point ${nd.label}`,
          Attributes: {
            Span_Seq: nd.seq, Span_Label: nd.label, Span_Kind: nd.kind,
            Connects: [],
          },
        });
        made += 1;
      }

      /* Nodes the plan did not want. Left alone rather than deleted:
         somebody put them there, and a run they are measuring from is
         theirs to remove.

         Only meaningful on a run that finished — stopping part-way
         leaves every node past that point unclaimed, and calling those
         "left alone" would report a hundred nodes as spare when they
         were simply never reached. */
      const spare = stopped
        ? 0
        : existing.filter((f) => !claimed.has(f.Feature_ID)).length;

      setProgress({
        done: plan.nodes.length, total: plan.nodes.length, label: "Reloading",
      });
      await load(projectId);
      /* What was ignored as a service, so a classification that found
         nothing is visible rather than showing up as nodes in the wrong
         places. */
      setStatus((stopped
        ? `Stopped after ${doneCount} of ${plan.nodes.length} node(s). ` : "")
        + `${made} placed, ${moved} renumbered`
        + (spare ? `, ${spare} left alone` : "")
        + ` \u00b7 ${plan.servicesIgnored} service trench(es) ignored`
        + (plan.plant ? `, plant is ${plan.plant.label}` : "")
        + (stopped ? " \u2014 run it again to carry on where it stopped." : ""));
      setTimeout(() => setStatus(""), stopped ? 12000 : 10000);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); setProgress(null); cancelRef.current = false; }
  }

  async function submitCallOff() {
    if (!callOff?.spans?.length) return;

    const workType = (lookups?.workTypes || [])
      .find((w) => w.Selection_Mode === "Span");
    if (!workType) {
      setError("No work type with a Span selection mode \u2014 check Admin.");
      return;
    }

    setBusy("calloff");
    try {
      const created = await createCallOff(projectId, {
        Project_ID: projectId,
        Work_Type_ID: workType.Work_Type_ID,
        Selection_Mode: "Span",
        Contact_Name: raisedByName || "Site",
        Contact_Phone: "N/A",
        /* Today, as the earliest anybody could turn up. Changed on the
           call-off itself, which is where the dates belong. */
        Preferred_Date: new Date().toISOString().slice(0, 10),
        /* The name, which is what "Raised by" shows. The email is the
           login and belongs in the audit trail, not on a call-off. */
        Created_By: raisedByName || user?.email || null,
        /* The ranges, not the spans — a row per run as it was asked
           for, named "Span Node A1 to A5". */
        items: toCallOffRows(callOff.ranges),
        utility_ids: callOffUtils,
      });

      setRanges([]);
      setPick(null);
      setAskAnother(false);
      setCallOffUtils([]);
      /* Straight into finishing it, rather than closing and leaving it
         to be found later. */
      setRaised({
        Submission_ID: created?.Submission_ID,
        spans: callOff.spans.length,
        totalM: callOff.totalM,
        Preferred_Date: new Date().toISOString().slice(0, 10),
        Alternative_Date: "",
        Contact_Name: raisedByName || "",
        Contact_Phone: "",
        Notes: "",
        Obstruction_Free: "",
        Ground_Unmade: "",
        Line_Level_Required: "",
      });
      setError(created?.warning || "");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  /* Finishing the call-off just raised. */
  async function saveRaised() {
    if (!raised?.Submission_ID) { setRaised(null); setCallOffOpen(false); return; }
    setBusy("calloff");
    try {
      await updateCallOff(projectId, raised.Submission_ID, {
        Preferred_Date: raised.Preferred_Date || null,
        Alternative_Date: raised.Alternative_Date || null,
        Contact_Name: raised.Contact_Name || "Site",
        Contact_Phone: raised.Contact_Phone || "N/A",
        Notes: raised.Notes || null,
        Obstruction_Free: raised.Obstruction_Free || null,
        Ground_Unmade: raised.Ground_Unmade || null,
        Line_Level_Required: raised.Line_Level_Required || null,
      });
      setStatus(`Mains call-off #${raised.Submission_ID} raised \u2014 `
        + `${raised.spans} span(s), ${raised.totalM} m`);
      setTimeout(() => setStatus(""), 12000);
      setRaised(null);
      setCallOffOpen(false);
      setError("");
      /* So the run just called off turns pink without a reload. */
      listCallOffs(projectId).then((res) => {
        const spans = [];
        for (const co of res.rows || []) {
          if (co.Selection_Mode !== "Span") continue;
          for (const it of co.items || []) {
            if (it.From_Node_ID == null || it.To_Node_ID == null) continue;
            spans.push({ fromId: it.From_Node_ID, toId: it.To_Node_ID });
          }
        }
        setCalledOff(spans);
      }).catch(() => {});
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  /* Applying a build status to a length of trench.

     Splitting a run is a real change to the drawing, so it says what it
     is about to do and waits. Somebody marking half a road expects half
     a road marked; they do not necessarily expect one feature to become
     three, and finding that out afterwards is worse than being asked. */
  async function applyMark(trench, fromPoint, toPoint) {
    const plan = planMark(trench, fromPoint, toPoint, marking.status);
    if (plan.error) { setError(plan.error); setMarkFrom(null); return; }

    if (plan.splits > 0) {
      const ok = window.confirm(
        `Mark ${plan.markedM} m as ${statusLabel(marking.status)}?\n\n`
        + `This splits the trench into ${plan.splits + 1} sections.`);
      if (!ok) { setMarkFrom(null); return; }
    }

    if (isFeatureLocked(trench, lockedClasses)) {
      setError("That trench is locked against changes.");
      setMarkFrom(null);
      return;
    }

    setBusy("mark");
    try {
      /* The offcuts first. If one of these fails the original is still
         whole, which is recoverable; shortening it first and then
         failing would lose the rest of the run. */
      for (const piece of plan.creates) {
        await createFeature(projectId, {
          Layer_Key: trench.Layer_Key,
          Feature_Type: "line",
          Geometry: piece.geometry,
          Attributes: {
            ...trench.Attributes,
            ...(piece.status
              ? { Build_Status: piece.status }
              : { Build_Status: undefined }),
          },
        });
      }

      const attrs = { ...trench.Attributes, Build_Status: marking.status };
      if (plan.update.geometry) {
        await moveFeatures(projectId, [{
          Feature_ID: trench.Feature_ID, Geometry: plan.update.geometry,
        }]);
      }
      await bulkUpdateFeatures(projectId, [{
        Feature_ID: trench.Feature_ID, Attributes: attrs,
      }]);

      setMarkFrom(null);
      await load(projectId);
      setStatus(`${plan.markedM ?? "Whole run"} marked as `
        + `${statusLabel(marking.status)}`
        + (plan.splits ? `, split into ${plan.splits + 1}` : ""));
      setTimeout(() => setStatus(""), 8000);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  /* Marking the selected trench off site, or clearing it. */
  async function toggleOffSite(on) {
    const mine = features.filter((f) => selected.includes(f.Feature_ID)
      && f.Feature_Type === "line"
      && isTrenchType(f.Attributes?.Line_Type, lineTypes));

    if (!mine.length) { setError("Select some trench first."); return; }

    const locked = mine.filter((f) => isFeatureLocked(f, lockedClasses));
    if (locked.length) {
      setError(`${locked.length} of those are locked against changes.`);
      return;
    }

    setBusy("offsite");
    try {
      await bulkUpdateFeatures(projectId, mine.map((f) => {
        const attrs = { ...f.Attributes };
        /* Cleared rather than set false, so a drawing nobody has marked
           carries nothing and the flag means what it says. */
        if (on) attrs.Off_Site = true; else delete attrs.Off_Site;
        return { Feature_ID: f.Feature_ID, Attributes: attrs };
      }));
      await load(projectId);
      setStatus(`${mine.length} section(s) ${on ? "marked off site" : "cleared"}`);
      setTimeout(() => setStatus(""), 8000);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  function inspectTrench(f, at) {
    /* The stretch between the span nodes either side of the click, not
       the whole feature.

       A trench runs past several junctions, and a cable that turns off
       at A1 is not in the length between A1 and A2. Inspecting the whole
       feature reported everything anywhere along it, which on a run
       through three junctions is three answers at once. */
    const nodes = features.filter((x) => x.Feature_Role === "spannode");
    const stretch = at ? stretchAt(f, at, nodes) : null;
    const subject = stretch?.geometry?.length >= 2
      ? { ...f, Geometry: stretch.geometry }
      : f;

    /* Which types are services, from the configured list.

       A mains trench carries mains and a service trench carries
       services — without this, every service pipe running along a road
       was reported as being in the mains trench beside it. */
    const serviceLineTypes = new Set(lineTypes
      .filter((t) => t.Layer_Key !== "trench" && /service/i.test(t.Type_Key))
      .map((t) => t.Type_Key));
    const serviceTrenchTypes = new Set(["trench_service", ...lineTypes
      .filter((t) => t.Layer_Key === "trench" && /service/i.test(t.Type_Key))
      .map((t) => t.Type_Key)]);

    const res = contentsOf(subject, features, {
      serviceLineTypes,
      serviceTrenchTypes,
      isTrench: (x) => x.Feature_Type === "line"
        && isTrenchType(x.Attributes?.Line_Type, lineTypes),
      /* What the thing is, not what it feeds.

         A cable's Label is its circuit and way — "1A" — which says
         which run it is and nothing about what was laid. Somebody
         asking what is in a trench wants the cable type: whether that
         185mm² will take another circuit is the question, and "1A" does
         not answer it.

         The size where there is one, then the line type's own name, and
         the label only as a last resort. */
      labelOf: (x) => {
        const sizeId = x.Attributes?.Cable_Size_ID ?? x.Attributes?.VD_Cable_Size_ID;
        const size = sizeId != null
          ? (lookups?.cableSizes || []).find((c) =>
            String(c.Cable_Size_ID) === String(sizeId))?.Size_Label
          : null;
        if (size) return size;

        /* Gas and water carry their size as free text on the feature —
           there is no catalogue for pipe the way there is for cable.
           Shown the same way, because "63mm PE" answers the same
           question about a gas main that a cable size answers about a
           feeder: whether what is in the ground is big enough.

           With the type name beside it, since "63mm PE" alone does not
           say what it carries. */
        const typeName = lineTypes
          .find((t) => t.Type_Key === x.Attributes?.Line_Type)?.Label ?? null;
        const pipe = String(x.Attributes?.Size ?? "").trim();
        if (pipe) return typeName ? `${pipe} ${typeName}` : pipe;

        return typeName ?? x.Label ?? null;
      },
    });
    if (res.error) { setError(res.error); return; }

    /* How wide and deep this length has to be dug, from what is in it.

       Worked out here rather than stored, so it follows the drawing: a
       cable added to a trench widens it without anybody remembering to
       revise a number. The diameters come off the features where they
       carry one \u2014 gas and water hold a size, cable does not, and a
       nominal width is used for those and said to be nominal. */
    const njug = trenchSize((res.contents || []).map((c) => {
      const size = String(c.feature?.Attributes?.Size ?? "");
      const mm = Number(size.replace(/[^0-9.]/g, ""));
      return {
        utility: c.utility,
        outsideDiameterMM: mm > 0 ? mm : null,
        label: c.label,
      };
    }));

    setInspect({ ...res, stretch, njug });
    setError("");
  }

  function findGaps() {
    const list = gaps(features, {
      isTrench: (f) => isTrenchType(f.Attributes?.Line_Type, lineTypes),
    });
    setGapList(list);
    setError(list.length
      ? `${list.length} trench end(s) close to another trench but not joined.`
      : "");
    if (!list.length) {
      setStatus("Every trench end is either joined or clear of the others");
      setTimeout(() => setStatus(""), 8000);
    } else {
      /* Straight to the narrowest, which is the worst: it looks joined
         at any sensible zoom, so nobody goes looking, and the network
         is severed there. A list of coordinates is no use on a site
         this size. */
      zoomToPoints([list[0].at]);
    }
  }

  /* Stepping through, tracing first if nothing has been traced.

     Returns nothing useful and sets state instead, because the trace may
     fail — no substation, no trenches — and the message for that belongs
     on screen rather than in a return value nobody reads. */
  function stepThrough() {
    if (!routePlan?.ok || !routePlan.traced) {
      traceRoute();
      /* traceRoute sets the plan for the next render; the stepper reads
         it from state, so it only has to be told where to start. */
    }
    setStepAt(0);
  }

  function traceRoute() {
    const trenches = features.filter((f) =>
      f.Feature_Type === "line" && isTrenchType(f.Attributes?.Line_Type, lineTypes));
    const meters = features.filter((f) =>
      f.Feature_Role === "meter" && f.Layer_Key === "electric");
    const sub = features.find((f) => f.Feature_Role === "substation");

    const plan = traceAll(trenches, meters, sub);
    if (plan.error) { setError(plan.error); setRoutePlan(null); return; }
    setRoutePlan({ ...plan, traced: true });
    /* Grouped by reason, with the plot numbers.

       "12 meters left out" says nothing about what to do. Three faults
       end up in that number and each has its own fix — draw a trench
       nearer, join a junction, or accept a longer run — so the message
       says how many of each and which plots. */
    /* Flagged first, since with every meter now traced these are the
       common finding and unreachable is the rare one. */
    /* Grouped by kind, and reported as a range.

       Blanking the number out of the sentence to group them printed
       "Service is N m" — a message with the one figure that mattered
       removed. The warnings carry their kind and their distance now, so
       the group can say what the distances actually are. */
    const notes = [];
    if (plan.flagged?.length) {
      const byKind = new Map();
      for (const f of plan.flagged) {
        for (const w of f.warnings) {
          if (!byKind.has(w.kind)) byKind.set(w.kind, { w, rows: [] });
          byKind.get(w.kind).rows.push({ plot: plotLabel(f.meter), m: w.m });
        }
      }
      for (const [kind, { w, rows }] of byKind) {
        const ms = rows.map((r) => r.m);
        const lo = Math.min(...ms);
        const hi = Math.max(...ms);
        const range = lo === hi ? `${lo} m` : `${lo}\u2013${hi} m`;
        /* The furthest first: those are the ones worth looking at, and a
           list in drawing order buries them. */
        const worst = [...rows].sort((a2, b2) => b2.m - a2.m);
        const shown = worst.slice(0, 5).map((r) => `${r.plot} ${r.m} m`).join(", ");
        const more = worst.length > 5 ? ` and ${worst.length - 5} more` : "";
        notes.push(kind === "service"
          ? `${rows.length} meters are ${range} from the nearest trench, `
            + `over the ${w.limit} m service limit \u2014 ${shown}${more}`
          : `${rows.length} meters are ${range} from the substation along the `
            + `trench, over the ${w.limit} m limit \u2014 ${shown}${more}`);
      }
    }

    if (!plan.unreachable.length) {
      setError(notes.join("  \u00b7  "));
      return;
    }

    const byReason = new Map();
    for (const u of plan.unreachable) {
      const why = u?.why ?? "Not reachable.";
      if (!byReason.has(why)) byReason.set(why, []);
      byReason.get(why).push(plotLabel(u?.meter ?? u));
    }
    setError([...notes, ...[...byReason].map(([why, plots]) => {
      /* A few named, then a count. Forty plot numbers in an error is a
         paragraph nobody reads. */
      const shown = plots.slice(0, 6).join(", ");
      const more = plots.length > 6 ? ` and ${plots.length - 6} more` : "";
      return `${plots.length}: ${why} (${shown}${more})`;
    })].join("  \u00b7  "));
  }

  /* A meter named by its plot.

     Plot_ID is a column on the feature, not something in Attributes —
     which is where this looked first, so every meter fell through to its
     Label and the message read "Electric Meter 1, Electric Meter 2",
     which names nothing anybody can find on a drawing.

     The plot number comes from the plot list, so it is the number
     written on the plan rather than an internal id. */
  function plotLabel(m) {
    const pid = m?.Plot_ID ?? m?.Attributes?.Plot_ID;
    if (pid != null) {
      /* The plot list uses lowercase field names and the features use
         uppercase for the same thing, so both spellings are tried. This
         is the third time today that difference has cost a bug. */
      const p = plotList?.find((x) =>
        Number(x.plot_id ?? x.Plot_ID) === Number(pid));
      const num = p?.plot_number ?? p?.Plot_Number;
      if (num) return `Plot ${num}`;
      return `Plot ${pid}`;
    }
    return m?.Label ?? `#${m?.Feature_ID}`;
  }

  function suggestRoute() {
    const trenches = features.filter((f) =>
      f.Feature_Type === "line" && isTrenchType(f.Attributes?.Line_Type, lineTypes));
    const meters = features.filter((f) =>
      f.Feature_Role === "meter" && f.Layer_Key === "electric");
    const sub = features.find((f) => f.Feature_Role === "substation");

    const plan = planRoute(trenches, meters, sub);
    if (plan.error) { setError(plan.error); setRoutePlan(null); return; }
    setRoutePlan(plan);
    /* Two quite different reasons a meter can be left out, and the fix
       differs: no candidate near enough to service, or no route short
       enough to feed it. Saying which saves someone drawing more trench
       where the problem is the distance. */
    setError(plan.unreachable.length
      ? `${plan.unreachable.length} meter(s) left out \u2014 no trench within `
        + `10 m to service them, or no route under ${plan.maxRunM} m from the substation.`
      : "");
  }

  /* Accepting it.

     Nothing is deleted. Every candidate keeps its geometry; the ones
     that are needed are marked, with the length actually required — a
     trench live for fifty of its two hundred metres is marked and
     recorded as fifty, so a schedule quotes the dig rather than the
     drawing.

     The links the router invented are created, because a marked network
     with gaps in it is not a network. */
  async function acceptRoute() {
    const plan = routePlan;
    if (!plan?.ok) return;

    setBusy("route");
    try {
      const byId = new Map(plan.liveByTrench.map((x) => [Number(x.Feature_ID), x.liveM]));
      const rows = features
        .filter((f) => f.Feature_Type === "line"
          && isTrenchType(f.Attributes?.Line_Type, lineTypes))
        .map((f) => {
          const liveM = byId.get(Number(f.Feature_ID)) ?? null;
          const attrs = { ...f.Attributes };
          if (liveM == null) {
            /* Cleared rather than set false, so a drawing nobody has
               routed carries nothing and a second run starts clean. */
            delete attrs.Route_Live;
            delete attrs.Route_Live_M;
            delete attrs.Route_Meters;
          } else {
            attrs.Route_Live = true;
            attrs.Route_Live_M = liveM;
            /* How many properties the busiest part of this trench
               carries, where a trace produced the plan.

               Worth keeping: it is what decides the cable size, and it
               is a figure nobody can recover from the drawing afterwards
               without running the trace again. */
            const peak = plan.liveByTrench
              .find((x) => Number(x.Feature_ID) === Number(f.Feature_ID))?.peakUses;
            if (peak != null) attrs.Route_Meters = peak;
            else delete attrs.Route_Meters;
          }
          return { Feature_ID: f.Feature_ID, Attributes: attrs };
        })
        /* Only what actually changes. */
        .filter((r, i, arr) => {
          const f = features.find((x) => Number(x.Feature_ID) === Number(r.Feature_ID));
          return JSON.stringify(f.Attributes) !== JSON.stringify(r.Attributes);
        });

      const before = features.filter((f) =>
        rows.some((r) => Number(r.Feature_ID) === Number(f.Feature_ID)));

      for (let i = 0; i < rows.length; i += 100) {
        await bulkUpdateFeatures(projectId, rows.slice(i, i + 100));
      }

      /* The invented links, drawn as ordinary mains trench so everything
         downstream — the bill, the levels check, Auto Service — treats
         them as what they are. */
      for (const link of plan.newLinks) {
        await createFeature(projectId, {
          Layer_Key: "trench",
          Feature_Type: "line",
          Geometry: [link.from, link.to],
          Attributes: {
            Line_Type: "trench_main",
            Route_Live: true,
            Route_Live_M: link.len,
            /* Marked as the router's, so it can be told from a trench
               somebody surveyed. */
            Route_Generated: true,
          },
        });
      }

      if (rows.length) {
        await recordAction(`Route: mark ${rows.length} trench(es)`, before,
          before.map((f) => ({
            ...f,
            Attributes: rows.find((r) =>
              Number(r.Feature_ID) === Number(f.Feature_ID)).Attributes,
          })));
      }

      setRoutePlan(null);
      await load(projectId);
      setStatus(`${plan.mainsM} m marked live`
        + (plan.newLinks.length ? `, ${plan.newLinks.length} link(s) added` : ""));
      setTimeout(() => setStatus(""), 10000);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  /* Renaming a circuit.

     The name is not held in one place — it is stamped on every meter,
     span node and cable section of the circuit, which is what lets the
     circuit report and the trace name it without looking anything up.
     So a rename is a bulk write across all of them, and missing any one
     kind would leave two names for one circuit depending on which screen
     you were on. */
  async function renameCircuits(renames = []) {
    const byId = new Map(renames.map((r) => [Number(r.circuitId), r.name]));
    const touched = features.filter((x) =>
      x.Attributes?.Circuit_ID != null
      && byId.has(Number(x.Attributes.Circuit_ID)));
    if (!touched.length) return;

    setBusy("circuit");
    try {
      const updates = touched.map((x) => ({
        Feature_ID: x.Feature_ID,
        Attributes: {
          ...x.Attributes,
          Circuit_Name: byId.get(Number(x.Attributes.Circuit_ID)),
        },
      }));
      for (let i = 0; i < updates.length; i += 100) {
        await bulkUpdateFeatures(projectId, updates.slice(i, i + 100));
      }
      await load(projectId);
      setStatus(`${renames.length} circuit(s) renamed across ${touched.length} feature(s)`);
      setTimeout(() => setStatus(""), 6000);
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

  /* Moving meters from one circuit to another.

     Not a remove followed by an add: the two circuits' ways on the
     substation do not change, only which meters hang off them, and
     unassigning first would leave the meters circuitless if the second
     write failed.

     The feeder cables are the thing that has to follow. A meter that
     has moved to another circuit is still physically fed by the cable
     the old circuit drew, and the drawing would show it that way until
     someone happened to rebuild — so the rebuild happens here, but only
     where a network already exists to be wrong. */
  async function moveToCircuit(meterIds = [], targetCircuitId) {
    const ids = meterIds.map(Number);
    const target = circuitsFrom(features)
      .find((c) => Number(c.id) === Number(targetCircuitId));
    if (!target) { setError("That circuit no longer exists."); return; }

    const rows = features.filter((f) =>
      f.Feature_Role === "meter"
      && f.Layer_Key === "electric"
      && ids.includes(Number(f.Feature_ID))
      && Number(f.Attributes?.Circuit_ID) !== Number(target.id));
    if (!rows.length) {
      setError(`Those meters are already on ${target.name}.`);
      return;
    }

    /* Whether the router has ever run. Generated is the discriminator
       the rebuild itself uses, so the two agree about what counts as a
       built network. */
    const built = features.some((f) => f.Attributes?.Generated
      && f.Layer_Key === "electric");

    if (!window.confirm(
      `Move ${rows.length} meter(s) to ${target.name}?`
      + (built ? "\n\nThe LV feeder network will be rebuilt." : "")
    )) return;

    setBusy("circuit");
    try {
      await bulkUpdateFeatures(projectId, rows.map((m) => ({
        Feature_ID: m.Feature_ID,
        Attributes: {
          ...m.Attributes,
          Circuit_ID: target.id,
          Circuit_Name: target.name,
          Circuit_Letter: target.letter,
        },
      })));

      /* Read back before rebuilding, and hand the result to the rebuild
         directly. State set above has not reached this closure, so the
         router would otherwise plan against the membership as it was
         before the move. */
      const fresh = await listGis(projectId);
      setFeatures(fresh.features || []);

      setStatus(`${rows.length} meter(s) moved to ${target.name}`
        + (built ? " \u2014 rebuilding the network\u2026" : ""));

      if (built) {
        setBusy("");
        await buildLvNetwork({ silent: true, srcFeatures: fresh.features || [] });
      } else {
        await load(projectId);
        setTimeout(() => setStatus(""), 6000);
      }
      setError("");
    } catch (e) { setError(e.message); await load(projectId); }
    finally { setBusy(""); }
  }

  /* Deleting a circuit unassigns its meters, frees its way on the
     substation and removes its span nodes. The meters and the trenches
     stay: they are physical things that exist whatever the circuit plan
     says, and deleting them would turn a planning change into a redraw. */
  async function deleteCircuit(circuit) {
    const mine = (f) => Number(f.Attributes?.Circuit_ID) === Number(circuit.id);

    const meters = features.filter((f) => f.Feature_Role === "meter" && mine(f));
    const nodes = features.filter((f) => f.Feature_Role === "spannode" && mine(f));

    /* The feeders the circuit was drawn as.

       They exist only because the circuit did — Build LV Network draws
       them from its membership — so leaving them behind leaves cable on
       the drawing feeding a circuit that is gone: counted in the bill,
       traced through by the report, and belonging to nothing.

       Service cables are not touched. They belong to a plot, and the
       plot and its meter both stay. */
    const feeders = features.filter((f) =>
      f.Feature_Type === "line"
      && f.Layer_Key === "electric"
      && f.Attributes?.Line_Type === "elec_main"
      && mine(f));

    /* The joints on those feeders.

       A joint belongs to one circuit — two circuits are separate
       networks and a joint serving both would connect them — so this is
       a plain match with no shared case to consider.

       Joints left over from before that rule, carrying a Circuits list
       naming more than one, are left alone: they should not exist, and
       deleting one on the strength of a list that should not be there
       would take a junction out of a circuit nobody asked to change.
       Re-running Place Feeder Joints replaces them properly. */
    const joints = features.filter((f) => {
      if (f.Feature_Role !== "joint") return false;
      const list = f.Attributes?.Circuits;
      if (Array.isArray(list) && list.length > 1) return false;
      return mine(f);
    });

    const shared = features.filter((f) =>
      f.Feature_Role === "joint"
      && Array.isArray(f.Attributes?.Circuits)
      && f.Attributes.Circuits.length > 1
      && f.Attributes.Circuits.some((c) => Number(c) === Number(circuit.id))).length;

    if (!window.confirm(
      `Delete ${circuit.name}?\n\n`
      + `${feeders.length} feeder cable(s) and ${nodes.length} span node(s) deleted\n`
      + `${joints.length} joint(s) deleted\n`
      + `${meters.length} meter(s) unassigned \u2014 the meters, services and trenches stay`
      + (shared
        ? `\n\n${shared} joint(s) recorded against two circuits are left in place \u2014 `
          + "run Place Feeder Joints to replace them."
        : "")
    )) return;

    /* Deleting a circuit is four writes over as many features as it had,
       and on a large one that is a long silence with a greyed-out button.
       The steps are named rather than counted alone: "unassigning 51
       meters" says what is happening to what, where "3 of 4" says only
       that something is.

       Reported through a state the report itself renders — the canvas
       progress bar sits under the modal at z-index 8 against its 1000,
       so it would run where nobody could see it. */
    const steps = [
      meters.length && "meters",
      (nodes.length + feeders.length + joints.length) && "features",
      "way",
      "reload",
    ].filter(Boolean).length;
    let step = 0;
    const say = (label) => setCircuitProgress({ done: step, total: steps, label });

    setBusy("circuit");
    say(`Deleting ${circuit.name}\u2026`);
    try {
      if (meters.length) {
        say(`Unassigning ${meters.length} meter(s)`);
        await bulkUpdateFeatures(projectId, meters.map((m) => {
          const A = { ...m.Attributes };
          delete A.Circuit_ID; delete A.Circuit_Name; delete A.Circuit_Letter;
          return { Feature_ID: m.Feature_ID, Attributes: A };
        }));
        /* Counted, not just announced. Without this the bar reached
           three of four and stopped short of the end while the work
           carried on, which reads as a stall. */
        step += 1;
      }
      /* One call rather than a loop: the span nodes of a circuit go
         together, and a partial failure halfway through a loop would
         leave a circuit that is neither deleted nor intact. */
      /* Nodes, feeders and joints in one call for the same reason: they
         go together, and a partial failure would leave a circuit neither
         deleted nor intact. */
      const gone = [...nodes, ...feeders, ...joints].map((f) => f.Feature_ID);
      if (gone.length) {
        step += 1;
        for (let i = 0; i < gone.length; i += 100) {
          const from = i + 1;
          const to = Math.min(i + 100, gone.length);
          say(`Removing cables, nodes and joints \u2014 ${to} of ${gone.length}`);
          await deleteFeatures(projectId, gone.slice(i, i + 100));
        }
      }

      /* The way it held goes back into the pool, or the substation fills
         up with circuits that no longer exist. */
      step += 1;
      say("Freeing the way on the substation");
      const sub = features.find((f) => f.Feature_Role === "substation");
      if (sub) {
        const rel = releaseWays(sub, circuit.id);
        if (rel.changed) {
          await updateFeature(projectId, sub.Feature_ID, {
            Attributes: { ...sub.Attributes, Way_Circuits: rel.map },
          });
        }
      }
      step += 1;
      say("Reloading the drawing");
      await load(projectId);
      setStatus(`${circuit.name} deleted \u2014 ${feeders.length} cable(s), `
        + `${nodes.length} node(s), ${joints.length} joint(s) removed, `
        + `${meters.length} meter(s) unassigned`);
      setTimeout(() => setStatus(""), 7000);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); setCircuitProgress(null); }
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
  async function buildLvNetwork(opts = {}) {
    /* Points the walk wanted and did not find. See below: the build no
       longer creates span nodes. */
    let missingNodes = 0;
    /* Nodes already spoken for by a circuit earlier in this run.

       `src` is a snapshot taken before any of this, so a node adopted by
       circuit A still reads as unassigned when circuit B comes to look
       at it, and both would claim the same point. */
    const takenNodes = new Set();
    /* And points that are where this circuit wants one but belong to
       another circuit, which is a different problem from none being
       there and reads differently on the status line. */
    let contested = 0;
    /* The drawing to route from, and whether to ask first.

       Both exist for the automatic rebuild after a meter is moved
       between circuits. That runs straight after a save, and `features`
       in this closure is still the state from before it — React has not
       re-rendered yet — so routing from it would rebuild the network
       against the old circuit membership and quietly undo the move.
       The caller passes what it just read back instead.

       silent skips the confirmation: the person has already agreed to
       the move, and asking again about the consequence they were told
       about is a second question for one decision. */
    const { silent = false, srcFeatures = null } = (opts && opts.nativeEvent) ? {} : opts;
    const src = srcFeatures || features;

    const circuits = circuitsFrom(src);
    if (!src.some((f) => f.Feature_Role === "substation")) {
      return setError("Place a substation first \u2014 feeders route back to it.");
    }
    if (!circuits.length) {
      return setError("No circuits defined yet \u2014 use Link to Circuit first.");
    }

    /* Generated is the discriminator, not the type: a rebuild must
       replace what the router drew and leave alone what anyone drew by
       hand, and both are electric mains.

       On the electric layer, though. Generated alone was every layer,
       which was harmless while this was the only thing generating
       anything — and the moment Build Gas Network drew a gas main,
       rebuilding the LV feeders would have deleted it. */
    const old = src.filter((f) => f.Attributes?.Generated
      && f.Layer_Key === "electric");

    if (!silent && !window.confirm(
      `Build the LV feeder network for ${circuits.length} circuit(s)?`
      + (old.length ? `\n\nThis redraws ${old.length} existing feeder cable(s).` : "")
    )) return;

    setBusy("feeder");
    try {
      /* Plan every circuit before writing anything.

         Two reasons. A routing failure on the third circuit no longer
         leaves the first two built and the third missing — either the
         whole network is rebuilt or none of it is. And the total number
         of runs is known before the first one is created, so the progress
         bar can count runs rather than circuits: on two circuits a
         per-circuit bar is two steps and gone before it registers. */
      setProgress({ done: 0, total: circuits.length, label: "Routing" });

      const planned = [];
      const failed = [];
      const stranded = [];

      for (const [i, c] of circuits.entries()) {
        setProgress({ done: i, total: circuits.length, label: `Routing ${c.name}` });

        const seedIds = new Set();
        for (const m of c.meters) {
          const sid = m.Attributes?.Seed_Feature_ID;
          if (sid != null) { seedIds.add(Number(sid)); continue; }
          const seed = src.find((f) => f.Feature_Role === "plot"
            && m.Plot_ID != null && Number(f.Plot_ID) === Number(m.Plot_ID));
          if (seed) seedIds.add(Number(seed.Feature_ID));
        }
        if (!seedIds.size) {
          failed.push(`${c.name}: its meters aren't linked to a plot seed`);
          continue;
        }

        const r = feederSections(src, {
          lineTypes,
          plotById: (id) => plotList.find((p) => p.plot_id === id),
          seedIds,
        });
        if (r.error) { failed.push(`${c.name}: ${r.error}`); continue; }
        if (!r.sections.length) {
          failed.push(`${c.name}: nothing to route \u2014 its meters reach the network but no run leads back to the substation`);
          continue;
        }
        if (r.skipped?.length) stranded.push(...r.skipped);

        /* Junctions and ends together. A junction is where the feeder
           divides; an end is where it stops, and that far point is what
           every volt-drop figure is quoted at — both want marking.

           The origin comes first and is numbered zero, because every
           other node on the circuit is measured from it. Link to Circuit
           creates one, but a circuit made before that did, or one whose
           node has been deleted, would have none — so the build makes
           sure rather than assuming. */
        const originAt = src.find((f) => f.Feature_Role === "substation")?.Geometry?.[0];
        const haveOrigin = !!originNodeFor(src, c.id);

        /* Numbered by a walk outward from the substation, nearest branch
           first, rather than by the order the graph produced them. A
           schedule then reads down the network instead of jumping about
           it: A1 is the node closest to the substation, and everything
           A1 feeds is numbered before anything on another branch. */
        const marks = [
          ...junctionNodes(r.model).map((j) => ({ ...j, kind: "junction" })),
          ...endOfLineNodes(r.model).map((e) => ({ ...e, kind: "end" })),
        ];
        const byIndex = new Map(marks.map((m) => [m.index, m]));
        const walked = orderNodesFromRoot(r.model, marks.map((m) => m.index))
          .map((i) => byIndex.get(i))
          .filter(Boolean);

        planned.push({
          circuit: c,
          sections: r.sections,
          nodes: [
            ...(!haveOrigin && originAt
              ? [{ point: originAt, kind: "origin", seq: 0 }] : []),
            ...walked,
          ],
        });
      }

      /* Every generated run and every node it creates starts on the
         smallest LV mains cable. Design works upward — put the smallest
         on everything, trace, and upsize what fails — and it means a
         freshly built network reports real figures rather than "cable
         not set" on every leg. Anything set by hand is left alone. */
      /* The cable the generated runs are drawn with.

         The project's own default wins where one is set: it is a
         decision someone has made about this scheme, and defaultFeederCable
         is a sensible starting size chosen from the catalogue when nobody
         has. Falling back to the calculation rather than to nothing keeps
         a project with no default working exactly as before. */
      const scopeDefault = (() => {
        const layer = layers.find((l) => l.Layer_Key === "electric");
        const scope = scopeDefaults
          .find((sc) => Number(sc.Utility_ID) === Number(layer?.Utility_ID));
        const id = scope?.Default_Main_Cable_Size_ID;
        return id != null
          ? (lookups?.cableSizes || []).find((c) => Number(c.Cable_Size_ID) === Number(id))
          : null;
      })();
      const startCable = scopeDefault || defaultFeederCable(
        lookups?.cableSizes || [], lookups?.cableTypes || []);

      const totalRuns = planned.reduce((t, x) => t + x.sections.length, 0);
      const totalNodes = planned.reduce((t, x) => t + x.nodes.length, 0);
      if (!totalRuns) {
        setError(failed.length ? `Couldn\u2019t route: ${failed.join(" \u00B7 ")}`
          : "Nothing to route.");
        return;
      }

      const old = src.filter((f) => f.Attributes?.Generated
        && f.Layer_Key === "electric");
      if (old.length) await deleteFeatures(projectId, old.map((f) => f.Feature_ID));

      let step = 0;
      const total = totalRuns + totalNodes;
      let runs = 0, cables = 0, renumbered = 0;

      for (const { circuit: c, sections, nodes } of planned) {
        for (const [i, sec] of sections.entries()) {
          await createFeature(projectId, {
            Layer_Key: "electric",
            Feature_Type: "line",
            Geometry: sec.pts,
            Label: `${c.letter}${i + 1}`,
            Attributes: {
              Line_Type: "elec_main",
              Circuit_ID: c.id, Circuit_Name: c.name, Circuit_Letter: c.letter,
              Meters: sec.meters, KVA: sec.kva, Cables: sec.cables,
              ...(startCable ? { VD_Cable_Size_ID: startCable.Cable_Size_ID } : {}),
              Generated: true,
            },
          });
          runs += 1;
          cables += sec.cables;
          step += 1;
          setProgress({ done: step, total, label: `${c.letter}: run ${i + 1} of ${sections.length}` });
        }

        /* Every node on this circuit is renumbered, not just the new
           ones.

           Numbering used to continue from the highest existing sequence,
           so a rebuild left old nodes on their old numbers and gave new
           ones A18, A19, A20 — the numbering became a function of how
           many times the network had been built rather than of the
           network. If the build decides where nodes go it has to decide
           what they are called, or the two disagree.

           A node already within a metre of a planned position keeps its
           identity — its cable, and anything referring to its id — and
           takes the new number. */
        /* This circuit's own nodes. Used at the end to renumber the
           ones the walk did not ask for — those are this circuit's to
           renumber and nobody else's. */
        const existing = src.filter((f) => f.Feature_Role === "spannode"
          && Number(f.Attributes?.Circuit_ID) === Number(c.id));

        /* And the nodes this circuit may adopt: its own, plus any that
           belong to no circuit yet.

           This is the fix for a break between two routines that each
           looked correct on its own. Trench › Place Span Nodes puts
           nodes on the trench and gives them no circuit, because a span
           node is a fact about the dig — the note below says so, and it
           is right. The build then looked for nodes that already carried
           this circuit's id, so it never saw them, counted every one as
           missing, and left the drawing with a single span node: the
           origin, created when the circuit was linked.

           Nothing else assigns Circuit_ID to a span node, so the gap was
           permanent, and its symptom was silent. A levels check filters
           its stops by circuit, found only A0, and every leg therefore
           ran to a dead end — which the tracer labels with the meters
           it ends at. The table read "A0 → Electric Meter 15" where it
           should have read "A0 → A1", and looked like a naming fault
           rather than an empty circuit.

           A node belonging to a different circuit is left alone. Two
           circuits can run through the same trench, and taking a point
           the other one is measuring from would move its schedule. */
        const adoptable = src.filter((f) => f.Feature_Role === "spannode"
          && !takenNodes.has(f.Feature_ID)
          && (f.Attributes?.Circuit_ID == null
            || Number(f.Attributes.Circuit_ID) === Number(c.id)));
        const claimed = new Set();
        const renumber = [];
        let seq = 0;

        for (const nd of nodes) {
          step += 1;
          setProgress({ done: step, total, label: `${c.letter}: nodes` });

          const num = nd.kind === "origin" ? 0 : (seq += 1);
          const label = spanLabel(c.letter, num);

          const near = (f) => Math.hypot(f.Geometry[0][0] - nd.point[0],
                                         f.Geometry[0][1] - nd.point[1]) < 1;
          const match = adoptable.find((f) => !claimed.has(f.Feature_ID) && near(f));

          if (match) {
            claimed.add(match.Feature_ID);
            takenNodes.add(match.Feature_ID);
            /* Only where something actually differs — a rebuild that
               changes nothing should write nothing. Membership counts as
               a difference: a node sitting in the right place with the
               right number and no circuit is the case this whole thing
               was failing on, and skipping it as unchanged would leave
               it exactly as it was. */
            if (String(match.Attributes?.Span_Seq) !== String(num)
                || match.Attributes?.Span_Kind !== nd.kind
                || Number(match.Attributes?.Circuit_ID) !== Number(c.id)) {
              renumber.push({
                Feature_ID: match.Feature_ID,
                Label: `Point ${label}`,
                Attributes: {
                  ...match.Attributes,
                  Circuit_ID: c.id, Circuit_Name: c.name, Circuit_Letter: c.letter,
                  Span_Seq: num, Span_Label: label, Span_Kind: nd.kind,
                  /* A node that had no cable gets the default; one that
                     has a cable someone chose keeps it. */
                  ...(startCable && nd.kind !== "origin"
                      && match.Attributes?.VD_Cable_Size_ID == null
                    ? { VD_Cable_Size_ID: startCable.Cable_Size_ID } : {}),
                },
              });
            }
            continue;
          }

          /* No longer created here.

             Span nodes belong to the trench network — they mark where a
             run divides or stops, which is a fact about the dig and not
             about a circuit design. Creating them here meant a mains
             call-off naming "A1 to A5" could not be raised until an LV
             network had been built, which is the wrong way round: the
             trench is dug first.

             The build now uses the nodes that are already there and
             numbers them into circuits. A point the walk expects and
             cannot find is reported rather than made, because the fix is
             to place the nodes on the trench — Trench → Place Span
             Nodes — not to have two places that create them and
             disagree. */
          if (src.some((f) => f.Feature_Role === "spannode" && near(f))) contested += 1;
          else missingNodes += 1;
        }

        /* Nodes the build did not place — put there by hand, or left
           behind by an earlier network. Numbered after the walk rather
           than deleted: someone put them there on purpose. */
        for (const f of existing) {
          if (claimed.has(f.Feature_ID)) continue;
          if (Number(f.Attributes?.Span_Seq) === 0) continue;   // the origin
          seq += 1;
          const label = spanLabel(c.letter, seq);
          if (f.Attributes?.Span_Label === label) continue;
          renumber.push({
            Feature_ID: f.Feature_ID,
            Label: `Point ${label}`,
            Attributes: { ...f.Attributes, Span_Seq: seq, Span_Label: label },
          });
        }

        if (renumber.length) {
          await bulkUpdateFeatures(projectId, renumber);
          renumbered += renumber.length;
        }
      }

      /* Link everything the build has drawn.

         The runs and nodes were created with no Connects, so as far as
         tracing was concerned the whole generated network did not exist —
         "Nothing runs downstream of A2" was literally true of the graph,
         however the drawing looked. Connects cannot be written at
         creation time because the features being linked to do not have
         ids until they exist, so it is a pass of its own once they all
         do.

         Recomputed from geometry across every line and span node, not
         just the new ones: a run that now meets an existing cable
         changes that cable's links too. */
      setProgress({ done: total, total, label: "Linking the network" });
      const fresh = await listGis(projectId);
      const all = fresh.features || [];
      const links = all
        .filter((f) => f.Feature_Type === "line" || f.Feature_Role === "spannode")
        .map((f) => ({
          Feature_ID: f.Feature_ID,
          Attributes: { ...f.Attributes, Connects: linksFor(f, all) },
        }))
        /* Only where it changed, so a large drawing is not rewritten in
           full every time the network is rebuilt. */
        .filter((u) => {
          const was = all.find((f) => f.Feature_ID === u.Feature_ID)?.Attributes?.Connects || [];
          return [...was].sort().join(",") !== [...u.Attributes.Connects].sort().join(",");
        });
      for (let i = 0; i < links.length; i += 100) {
        await bulkUpdateFeatures(projectId, links.slice(i, i + 100));
      }

      /* Joints, from what has just been routed.

         Classified against `all` — the drawing as read back after the
         runs and nodes were created — and not against `features`, which
         in this closure is still the drawing as it was before the build
         and would place joints for the network as it used to be.

         The link pass above only writes Connects, which nothing here
         reads: the classification works from geometry and load, so the
         set read before those writes is the right one. */
      let jointsMade = 0;
      try {
        jointsMade = await placeFeederJoints({ silent: true, srcFeatures: all });
      } catch { /* A joint that cannot be placed must not fail the build. */ }

      await load(projectId);

      if (failed.length) setError(`Couldn\u2019t route: ${failed.join(" \u00B7 ")}`);
      else setError("");

      setStatus(`LV network: ${runs} run(s), ${cables} cable(s) across ${planned.length} circuit(s)`
        + (jointsMade ? `, ${jointsMade} joint(s)` : "")
        /* What the build wanted and could not find, so the gap is
           reported rather than filled in silently. */
        + (contested
          ? `, ${contested} span node(s) belong to another circuit` : "")
        + (missingNodes
          ? `, ${missingNodes} span node(s) missing \u2014 place them from `
            + "Trench \u2192 Place Span Nodes"
          : "")
        + (renumbered ? `, ${renumbered} renumbered` : "")
        + (startCable
          ? `, on ${cableName(startCable)}`
          : ", no LV cable in the catalogue to default to")
        + (links.length ? `, ${links.length} link(s) recorded` : "")
        + (stranded.length ? ` \u2014 ${stranded.length} meter(s) not on the trench network` : ""));
      setTimeout(() => setStatus(""), 14000);
    } catch (e) { setError(e.message); await load(projectId); }
    finally { setBusy(""); setProgress(null); }
  }

  /* ── Build Gas Network ──

     Pipe along every length of mains trench the gas POC can reach.

     Much shorter than the LV build above, and for a reason worth
     stating: there is nothing to design. The feeder build has to work
     out load, cable counts and where a run divides because of them;
     this only has to cover the trench that has already been dug. So the
     work is in gasNetwork.js, which decides the geometry, and this
     writes it — the same split as everywhere else, and what lets the
     routing be tested without a project.

     Services are left alone. The main runs past each service trench and
     the spur is the service pipe's job, which is what "up to each
     service trench" means on a drawing: the tee is a place the main
     goes past, not a place it stops. */
  /* ── Gas levels ──────────────────────────────────────────────────

     What each span node sits at, given the pressure the POC offers and
     what the pipe between them costs.

     The same walk the gas build does, re-run for pressure rather than
     for size: every length of main carries what is downstream of it,
     diversified once on the count of dwellings, and each length's drop
     comes off the pressure at its upstream node.

     Reads the sizes already on the drawing rather than sizing again. A
     network that has not been built has no sizes, and the check says so
     instead of guessing at pipe nobody has chosen. */
  /* The pressure the network starts from, for banding the table. */
  const sourceOf = (r) => (r?.legs?.length
    ? Math.max(...r.legs.map((l) => l.at)) : 0) || 23;

  /* Gas at 39.5 MJ/m³ gross, so 24 kW is 2.19 m³/h.

     Gross rather than net, and worth saying because the two differ by
     17% \u2014 which at the square of flow is about 37% of the pressure
     drop. Net (33.6) would read as the more conservative choice; gross
     is what the meter and the operator quote. */
  const kwToM3h = (kw) => (Number(kw) || 0) * 3600 / 39500;

  async function runGasLevelsCheck({ srcFeatures = null } = {}) {
    if (!projectId) return;
    setBusy("gaslevels");
    try {
      /* The features to measure. Passed in when a suggestion has just
         been applied, because setFeatures has not landed yet and
         reading state here would measure the network as it was before
         the change \u2014 which then reports the same failure again. */
      const src = srcFeatures || features;
      const poc = src.find((f) => f.Feature_Role === "poc" && f.Layer_Key === "gas");
      if (!poc) {
        setError("There is no gas POC on this drawing to measure from.");
        return;
      }
      const sourceMBar = Number(poc.Attributes?.Output_Pressure_mBar);
      if (!(sourceMBar > 0)) {
        setError("Set the gas POC's output pressure before running the check \u2014 "
          + "right-click it and fill in Output pressure (mbar).");
        return;
      }

      const mainType = lineTypes.find((t) => t.Layer_Key === "gas"
        && /main/i.test(t.Type_Key) && !/service/i.test(t.Type_Key));
      const mains = src.filter((f) => f.Feature_Type === "line"
        && f.Attributes?.Line_Type === mainType?.Type_Key)
        .map((f) => ({ id: f.Feature_ID, geometry: f.Geometry || [] }));
      const services = src.filter((f) => f.Feature_Type === "line"
        && f.Layer_Key === "gas" && /service/i.test(f.Attributes?.Line_Type || ""))
        .map((f) => ({ id: f.Feature_ID, geometry: f.Geometry || [] }));

      /* Tees counted off the drawing rather than entered: the model we
         calibrated against carried fittings that did not correspond to
         where the services are, and a count nobody maintains goes stale
         the first time a service moves. */
      const tees = serviceTees({ mains, services });

      const plan = gasMainRuns(src, {
        lineTypes,
        pipeSizes: lookups?.gasPipeSizes || [],
        pipeSizeOperators: lookups?.gasPipeSizeOperators || [],
        diversity: lookups?.gasDiversity || [],
        diversityOperators: lookups?.gasDiversityOperators || [],
        tier: "LP",
        /* The plot behind each gas meter, which is where the load is.

           Without this every meter reads as carrying nothing: the load
           is on the plot, not on the meter, and a service with no load
           is skipped before it can add to a node. So every run came
           back at 0 kW, every flow at 0 m3/h, and every length sized to
           the smallest pipe in the table \u2014 which is why the bore read
           52.0 the whole way down.

           The gas build passes this. The check has to pass the same
           thing or it is measuring a different network. */
        plotById: (id) => plotList.find((p) => p.plot_id === id),
      });

      /* Said plainly, and said why.

         A network carrying no load is not a network at 23 mbar
         throughout; it is a question that has not been answered, and a
         table of identical figures reads as an answer. The build
         already works out which of the three things went wrong, so the
         message names it rather than leaving somebody to guess. */
      const carried = (plan.runs || []).reduce((t, r) => t + (Number(r.kw) || 0), 0);
      if (!carried) {
        const why = [];
        if (plan.noLoad?.length) {
          why.push(`${plan.noLoad.length} plot`
            + `${plan.noLoad.length === 1 ? " has" : "s have"} no gas load set`);
        }
        if (plan.unattachedServices?.length) {
          why.push(`${plan.unattachedServices.length} service trench`
            + `${plan.unattachedServices.length === 1 ? "" : "es"} `
            + "do not reach a meter");
        }
        if (plan.strandedMeters?.length) {
          why.push(`${plan.strandedMeters.length} meter`
            + `${plan.strandedMeters.length === 1 ? " is" : "s are"} on no service`);
        }
        setError("No gas load reached the mains, so every length carries 0 kW "
          + "and sizes to the smallest pipe."
          + (why.length ? ` ${why.join("; ")}.` : " Check the plots have a gas "
            + "load and each has a meter on a service joined to the main."));
        return;
      }

      /* What the drawing calls each end of a run.

         gasMainRuns numbers its own graph internally, so fromNode and
         endNode are indices — "138" and "21" mean nothing to anybody
         reading a levels table. The drawing's own names are on the span
         nodes and on the origin, so each end of a run is matched to
         whichever of those it sits on.

         A run end with nothing on it is a bend rather than a node, and
         is shown as a dash rather than an invented name. */
      /* A point `back` metres in from the end of a polyline. */
      const backAlong = (pts, back) => {
        if (!pts?.length) return null;
        let left = back;
        for (let i = pts.length - 1; i > 0; i--) {
          const a = pts[i];
          const b = pts[i - 1];
          const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (seg >= left) {
            const t = seg ? left / seg : 0;
            return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          }
          left -= seg;
        }
        return pts[0];
      };

      const labelAt = (pt, opts = {}) => {
        if (!pt) return null;
        let best = null;
        for (const f of src) {
          const lbl = f.Attributes?.Span_Label;
          if (!lbl) continue;
          const q = (f.Geometry || [])[0];
          if (!q) continue;
          const d = Math.hypot(q[0] - pt[0], q[1] - pt[1]);
          if (d <= (opts.within ?? 1.5) && (!best || d < best.d)) best = { lbl, d };
        }
        return best?.lbl ?? null;
      };

      /* Every setting, not two of them.

         The minimum and the amber band were read here and the rest were
         left to their defaults, so changing the tee allowance, the
         efficiency or the temperature in Admin did nothing at all \u2014
         the fields were there and the answer never moved.

         Gathered into one object and passed on, so a setting added to
         the table later is one edit rather than three. */
      const gs = lookups?.gasPressureSettings?.[0] || {};
      const minMBar = Number(gs.Min_Pressure_mBar ?? 19);
      const amberPct = Number(gs.Amber_Pct ?? 80);
      const teeDiameters = Number(gs.Tee_Diameters ?? TEE_DIAMETERS);
      const gasOpts = {
        ...(gs.Efficiency != null ? { efficiency: Number(gs.Efficiency) } : {}),
        ...(gs.Temperature_C != null ? { temperatureC: Number(gs.Temperature_C) } : {}),
      };

      /* The size actually on the drawing, where a pipe carries one.

         gasMainRuns works out what each length ought to be from the
         load it carries. That is the right answer for a build, and the
         wrong one for a check: it meant the levels check re-sized the
         network from scratch every time and never looked at the pipe.
         So changing a size by hand, or pressing Make change, moved
         nothing at all \u2014 the next run computed the same size again and
         reported the same pressures.

         Read off the features on the run, falling back to the computed
         size where nothing has been chosen. A size somebody has picked
         wins over one the build would have picked. */
      const sizeOnDrawing = (pts) => {
        if (!pts?.length) return null;
        for (const f of src) {
          if (f.Feature_Type !== "line") continue;
          if (f.Attributes?.Line_Type !== mainType?.Type_Key) continue;
          if (f.Attributes?.Gas_Pipe_Size_ID == null) continue;
          /* On the run's line, not on its vertices. A pipe drawn along
             a run has points between the run's own, and comparing
             vertex to vertex missed every one of them. */
          if (!lineFollows(f.Geometry || [], pts)) continue;
          const row = (lookups?.gasPipeSizes || []).find((x) =>
            Number(x.Gas_Pipe_Size_ID) === Number(f.Attributes.Gas_Pipe_Size_ID));
          if (row) return row;
        }
        return null;
      };

      const result = gasLevels({
        runs: (plan.runs || []).map((r, i) => ({
          ...r,
          /* The gas main length label \u2014 G1, G2 \u2014 which is what a
             length of main is called. Not a node: the nodes are G0 and
             the A-numbers. */
          id: r.id ?? `G${i + 1}`,
          fromLabel: labelAt((r.pts || [])[0]),
          /* The far end of a run, with the cap taken off.

             A gas main is drawn END_EXTEND_M past its last node so the
             end cap has pipe to sit on. The run's final point is
             therefore about 1.5m beyond the span node it ends at \u2014
             exactly the tolerance this searched within, so the label
             was found or missed on rounding and several runs showed a
             dash where a node plainly exists.

             Stepped back along the polyline rather than searched for in
             a wider circle: widening to 3m would reach a neighbouring
             node on a tight run, and answering with the wrong node is
             worse than answering with none. */
          toLabel: (() => {
            const pts = r.pts || [];
            const end = pts[pts.length - 1];
            return labelAt(backAlong(pts, END_EXTEND_M)) || labelAt(end);
          })(),
          /* Chosen on the drawing if it has been; otherwise what the
             build worked out. */
          ...(() => {
            const chosen = sizeOnDrawing(r.pts);
            return chosen
              ? {
                bore: Number(chosen.Diameter_mm) - 11,
                maxKw: Number(chosen.Max_kW) || null,
              }
              : {
                bore: r.size?.diameter ? r.size.diameter - 11 : null,
                /* What this size is rated to carry, so the check can say
                   when a minimum-size build has outrun it. */
                maxKw: r.size?.maxKw ?? null,
              };
          })(),
          services: tees.get(String(r.featureId ?? "")) ?? r.services ?? 0,
        })),
        source: (plan.runs || [])[0]?.fromNode,
        sourceMBar,
        /* The load the build already worked out for this run: what lies
           beyond it, summed and multiplied by the diversity factor for
           how many supplies that is.

           Read off the run rather than recomputed. Doing the lookup
           again here got it wrong \u2014 it asked the table for a `kw`
           field that does not exist, so every flow came back zero and
           every pressure stayed at the POC's. The build already applies
           the factor per node against what is beyond that node, which
           is the reading the standard wants and the one that gets the
           spine and its legs right. */
        flowFor: (r) => kwToM3h(r.kw ?? 0),
        /* The allowance per service tee, from Admin. */
        teeDiameters,
      }, gasOpts);

      if (result.error) { setError(result.error); return; }

      /* The limit, from Admin rather than from here. A floor that lives
         in the code is one nobody can change when an operator asks for
         a different one. */
      /* What would fix it, worked out the same way the electric check
         suggests cable changes: apply the best single upsize, re-run,
         and repeat until it holds or nothing helps. */
      const sizes = (lookups?.gasPipeSizes || [])
        .filter((x) => Number(x.Diameter_mm) > 0)
        .map((x) => ({
          bore: Number(x.Diameter_mm) - 11,
          label: `${x.Diameter_mm}mm`,
          maxKw: Number(x.Max_kW) || null,
        }));
      const advice = suggestPipeChanges({
        runs: result.runsUsed, source: (plan.runs || [])[0]?.fromNode, sourceMBar,
        flowFor: (r) => kwToM3h(r.kw ?? 0), minMBar, sizes, teeDiameters,
      }, gasOpts);

      setGasLevelsResult({ ...result, minMBar, amberPct, advice });
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  /* Apply one suggested pipe change, then measure again.

     ── Which features are this run ──

     A run is a length of main between two nodes and may be drawn as
     several features; gasMainRuns does not carry their ids. They are
     found by geometry: a gas main whose points all lie on the run's
     polyline is part of it. The same matching the labels use, so the
     two cannot disagree about which pipe a suggestion names.

     ── Re-run from what was just read ──

     The features are read once and that same array is used to set the
     canvas and to re-run the check. Reading twice gave two arrays of
     identical content, and the staleness test compares by identity — so
     the panel declared itself out of date the moment it finished. The
     electric scenario had exactly this bug; its comment says so. */
  async function applyGasSuggestion(sug) {
    if (!projectId || !sug) return;
    setBusy(`gasfix:${sug.runId}`);
    try {
      const size = (lookups?.gasPipeSizes || [])
        .filter((x) => (x.Pressure_Tier ?? "LP") === "LP")
        .find((x) => Number(x.Diameter_mm) - 11 === Number(sug.toBore));
      if (!size) {
        setError(`No pipe size matches a ${sug.toBore}mm bore.`);
        return;
      }

      /* Same rule as the check uses to read a size, so Make change
         writes to exactly the features the report measured. */
      const onRun = (f) => lineFollows(f.Geometry || [], sug.runPts || []);
      const mainType = lineTypes.find((t) => t.Layer_Key === "gas"
        && /main/i.test(t.Type_Key) && !/service/i.test(t.Type_Key));
      const rows = features
        .filter((f) => f.Feature_Type === "line"
          && f.Attributes?.Line_Type === mainType?.Type_Key
          && onRun(f))
        .map((f) => ({
          Feature_ID: f.Feature_ID,
          Attributes: {
            ...f.Attributes,
            Gas_Pipe_Size_ID: size.Gas_Pipe_Size_ID,
            Size: size.Size_Label || `${Number(size.Diameter_mm)}mm`,
          },
        }));

      if (!rows.length) {
        setError(`Could not find the pipe for ${sug.runId} on the drawing.`);
        return;
      }

      const before = features.filter((f) =>
        rows.some((r) => Number(r.Feature_ID) === Number(f.Feature_ID)));
      for (let i = 0; i < rows.length; i += 100) {
        await bulkUpdateFeatures(projectId, rows.slice(i, i + 100));
      }
      await recordAction(
        `Upsize ${sug.runId} to ${sug.sizeLabel}`,
        before,
        before.map((f) => ({
          ...f,
          Attributes: rows.find((r) =>
            Number(r.Feature_ID) === Number(f.Feature_ID)).Attributes,
        })),
      );

      const fresh = await listGis(projectId);
      setFeatures(fresh.features || []);
      setStatus(`${sug.runId} is now ${sug.sizeLabel} \u2014 re-running the levels check`);
      setTimeout(() => setStatus(""), 6000);
      setError("");
      await runGasLevelsCheck({ srcFeatures: fresh.features || [] });
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  async function buildGasNetwork() {
    if (!projectId) return;
    const src = features;

    /* The mains type from the configured list rather than the string
       "gas_main". Renaming a line type in admin is a thing somebody may
       do, and a build that then draws pipe with a type nothing renders
       fails invisibly — the features exist, the drawing looks empty. */
    const mainType = lineTypes.find((t) => t.Layer_Key === "gas"
      && /main/i.test(t.Type_Key) && !/service/i.test(t.Type_Key));
    if (!mainType) {
      return setError("No gas mains line type is configured \u2014 add one in "
        + "Admin \u203a GIS Styles before building.");
    }

    /* ── Whether this project should have a gas main at all ──

       Two facts, neither of them on the drawing, and both of them
       reasons the canvas is the wrong place to find out: a scheme with
       no gas design and no gas asset value agreement is one where
       somebody has drawn gas by mistake, or on the wrong project, and a
       main laid there is quantities against work nobody is doing.

       Checked here rather than in gasNetwork.js because they are facts
       about the project. Keeping the routing module to geometry alone
       is what lets it be tested against a drawing with no database
       behind it.

       Refused rather than warned. A confirm box that says "there is no
       gas design, carry on?" is answered yes by everybody, which makes
       it a slower way of not having a check. */
    const gasLayer = layers.find((l) => l.Layer_Key === "gas");
    const utilityId = gasLayer?.Utility_ID;
    if (utilityId == null) {
      return setError("The gas layer has no utility set, so there is no design or "
        + "agreement to check it against \u2014 set it in Admin \u203a GIS Styles.");
    }

    /* The outline design for gas. scopeDefaults is the project's scope
       rows, one per utility, which is what the Outline Designs tab
       edits — a row for gas is what "this project does gas" means
       everywhere else in the app, so it means it here too. */
    const design = scopeDefaults.find((sc) => Number(sc.Utility_ID) === Number(utilityId));
    if (!design) {
      return setError("This project has no gas design \u2014 add gas on the Outline "
        + "Designs tab before laying a main.");
    }

    /* And the agreement. Read at build time rather than held in state:
       it is checked once, when somebody asks for a main, and a value
       loaded with the drawing would be however old the tab is. */
    let agreement = null;
    try {
      const { rows = [] } = await listAgreements(projectId);
      agreement = rows.find((a) => Number(a.Utility_ID) === Number(utilityId));
    } catch (e) {
      /* Not treated as an absent agreement: "there isn't one" and "we
         couldn't ask" are different, and only one of them is the user's
         to fix. */
      return setError(`Couldn\u2019t check the gas asset value agreement: ${e.message}`);
    }
    if (!agreement) {
      return setError("No gas asset value agreement on this project \u2014 the main is "
        + "adopted work, so it is drawn once there is an agreement to adopt it "
        + "under. Add one on the Asset Value tab.");
    }

    /* Whose standard sizes this. The adopting operator from the
       agreement just checked, and the DNO on the gas design — a rule may
       be written against either, so both are offered and the rules
       decide which one they were meant for. Same three-way resolution
       the water build uses. */
    const gasOperatorIds = [
      agreement.IDNO_Organisation_ID ?? null,
      design.DNO_Organisation_ID ?? null,
    ].filter((x) => x != null);

    const plan = gasMainRuns(src, {
      lineTypes,
      pipeSizes: lookups?.gasPipeSizes || [],
      pipeSizeOperators: lookups?.gasPipeSizeOperators || [],
      diversity: lookups?.gasDiversity || [],
      diversityOperators: lookups?.gasDiversityOperators || [],
      operatorIds: gasOperatorIds,
      /* ── LP, and not yet a choice ──

         Nothing in the schema records what tier a scheme runs at, so
         this is the assumption rather than a reading: a housing estate
         is low pressure unless somebody says otherwise, and most are.

         Hard-coded on purpose instead of reaching for a column that
         does not exist. `design.Pressure_Tier` would have read as
         undefined, fallen through to "LP", and looked for all the world
         like it was configurable — which is how a named column that was
         never in the schema gets into three more call sites before
         anyone notices. When MP schemes need sizing, the column goes on
         Project_Scope and this line reads it. */
      tier: "LP",
      /* Everything at the smallest pipe, and the levels check decides
         what has to grow.

         The alternative sizes each length to the load it carries, which
         produces a network that is right on capacity and says nothing
         about pressure. Starting small makes the levels check the one
         place that judges the design \u2014 and it is how a designer works:
         lay it, check it, upsize what fails. */
      minimumSize: true,
      plotById: (id) => plotList.find((p) => p.plot_id === id),
    });
    if (plan.error) return setError(plan.error);
    if (!plan.runs.length) {
      return setError("Nothing to lay \u2014 the POC is on the network but no "
        + "mains trench leads away from it.");
    }

    /* Generated and gas: a rebuild replaces what this drew and leaves
       a pipe somebody drew by hand exactly where it is. */
    const old = src.filter((f) => f.Feature_Type === "line"
      && f.Layer_Key === "gas"
      && !!f.Attributes?.Generated);

    if (!window.confirm(
      `Lay ${plan.runs.length} run(s) of gas main \u2014 ${plan.totalM} m `
      + `to ${plan.services} service trench(es), ${plan.meters} gas meter(s)?`
      /* The stub past each end is in that total, so it is named. A
         quantity that grew since the last build with nothing on the
         drawing to account for it is the sort of thing that gets
         checked twice and believed neither time. */
      + (plan.endCaps
        ? `\n\n${plan.extendedM} m of that is the ${plan.endCaps} capped end(s), `
          + "run on past the last service."
        : "")
      /* The schedule, and the two figures behind it. A diversified load
         on its own cannot be argued with — the raw sum and the factor
         that shrank it are what somebody checks. */
      + (plan.sized
        ? `\n\n${plan.bySize.map((b) => `${b.label}: ${b.metres} m`).join("\n")}`
          + `\n\n${plan.rawKw} kW summed peak, ${plan.kw} kW diversified.`
          + `\nSized by ${plan.sizeRules} pipe rule(s)`
          + (plan.operatorRules
            ? `, ${plan.operatorRules} set for this project\u2019s operator,`
            : " \u2014 the standard rules, none for this project\u2019s operator \u2014")
          + ` and ${plan.diversityRules} diversity rule(s).`
        : "")
      /* Every pipe upstream of a plot with no figure is sized light,
         which is the dangerous direction. Said before it is drawn. */
      + (plan.noLoad?.length
        ? `\n\n${plan.noLoad.length} gas meter(s) have no load on their plot and `
          + "count as nothing. Every main upstream of them is sized light." : "")
      + (plan.oversized?.length
        ? `\n\n${plan.oversized.length} run(s) carry more than the largest `
          + "configured pipe and will be drawn without a size." : "")
      + (plan.overDiverse?.length
        ? "\n\nMore supplies than the diversity table covers at "
          + `${plan.overDiverse.length} point(s).` : "")
      + (plan.diversityInversions?.length
        ? `\n\n${plan.diversityInversions.length} diversity rule(s) diversify less `
          + "at a higher supply count than at a lower one \u2014 check the table." : "")
      + (old.length ? `\n\nThis redraws ${old.length} existing gas main(s).` : "")
      /* Said before it happens, not after. The two are different kinds
         of gap — one is trench nobody joined up, the other is trench
         with no gas beyond it — and only the first is a fault. */
      + (plan.unservedM
        ? `\n\n${plan.unservedM} m of mains trench has no gas service beyond it `
          + "and will get no pipe." : "")
      + (plan.unreachable.length
        ? `\n\n${plan.unreachable.length} mains trench(es) aren\u2019t joined to the `
          + "POC and will get no pipe." : "")
      /* Said before it happens, not only in the status line afterwards.

         This is the fault that takes meters off the count while every
         other check passes: the spur touches the main, shares a node
         with it, and that node sits on a length of trench the POC
         cannot reach. Services to mains does not test reachability, so
         it reports all clear — and the only sign was a total quietly
         one short. */
      + (plan.unattachedServices.length
        ? `\n\n${plan.unattachedServices.length} service trench(es) reach a gas meter `
          + "but not the main, so their meters are not counted: "
          + plan.unattachedServices.slice(0, 5).map((u) => u.label).join(", ")
          + (plan.unattachedServices.length > 5 ? "\u2026" : "") : "")
      + (plan.strandedMeters.length
        ? `\n\n${plan.strandedMeters.length} gas meter(s) sit on no service trench.` : "")
    )) return;

    setBusy("gasnet");
    try {
      setProgress({ done: 0, total: plan.runs.length, label: "Laying gas main" });
      if (old.length) await deleteFeatures(projectId, old.map((f) => f.Feature_ID));

      for (const [i, r] of plan.runs.entries()) {
        await createFeature(projectId, {
          Layer_Key: "gas",
          Feature_Type: "line",
          Geometry: r.pts,
          Label: `G${i + 1}`,
          Attributes: {
            Line_Type: mainType.Type_Key,
            /* The size from the outline design, where it sets one.

               Gas holds its size as free text with no catalogue behind
               it, so there is nothing to calculate — but the design
               records a default main size, and that is a decision
               somebody made about this scheme. defaultsFor is the same
               helper a hand-drawn run uses, so a generated pipe and a
               drawn one start on the same size rather than on two
               answers to one question. Nothing is invented where the
               design sets nothing. */
            ...defaultsFor(mainType.Type_Key),
            /* The size worked out for this length, as both the
               reference and the text.

               Same pair the water build writes, and for the reason its
               comment gives: the id is what a schedule joins on, and
               Size is what every existing display already reads —
               trench contents labels a pipe with it. Naming them
               anything else produces a sized main that looks unsized,
               which is exactly what the first version of this did.

               Written after defaultsFor rather than before, so a
               calculated size wins over the scheme-wide default. The
               design's default answers "what do we normally lay here";
               this answers "what does this length have to carry".

               Spread rather than assigned, so an unsized build — no
               rules configured — leaves the default exactly as it was
               instead of overwriting it with undefined. */
            ...(r.size ? {
              Gas_Pipe_Size_ID: r.size.id,
              Size: r.size.label,
              /* What decided that size, so the drawing carries its own
                 reasoning and the number can be checked without
                 rerunning anything. */
              Load_kW: r.kw,
              Raw_Load_kW: r.rawKw,
              Supplies: r.supplies,
            } : {}),
            /* How many services come off this length, and how many
               meters they carry — the numbers somebody would otherwise
               count off the drawing by hand when checking a quantity. */
            Services: r.services,
            Meters: r.meters,
            Generated: true,
          },
        });
        setProgress({ done: i + 1, total: plan.runs.length, label: `Run ${i + 1} of ${plan.runs.length}` });
      }

      /* Link what has just been drawn.

         Same pass as the LV build, and for the same reason: Connects
         cannot be written at creation time because the features being
         linked to have no ids until they exist. Recomputed across every
         line, not only the new ones, since a pipe that now meets a
         service trench changes that trench's links too — and only
         written where it changed, so a large drawing is not rewritten
         in full each time. */
      setProgress({ done: plan.runs.length, total: plan.runs.length, label: "Linking" });
      const fresh = await listGis(projectId);
      const all = fresh.features || [];
      const links = all
        .filter((f) => f.Feature_Type === "line" || f.Feature_Role === "spannode")
        .map((f) => ({
          Feature_ID: f.Feature_ID,
          Attributes: { ...f.Attributes, Connects: linksFor(f, all) },
        }))
        .filter((u) => {
          const was = all.find((f) => f.Feature_ID === u.Feature_ID)?.Attributes?.Connects || [];
          return [...was].sort().join(",") !== [...u.Attributes.Connects].sort().join(",");
        });
      for (let i = 0; i < links.length; i += 100) {
        await bulkUpdateFeatures(projectId, links.slice(i, i + 100));
      }

      await load(projectId);
      setError("");
      /* The shortfall, kept on screen and clickable.

         Cleared on a clean build rather than left showing the last
         one — a panel naming a meter that is now served is worse than
         no panel, because it sends somebody to look at a plot that is
         already right. */
      setGasUnserved(plan.unservedMeters?.length ? plan.unservedMeters : null);
      setStatus(`Gas network: ${plan.runs.length} run(s), ${plan.totalM} m of main`
        + (plan.endCaps
          ? ` (${plan.extendedM} m of it past ${plan.endCaps} capped end(s))` : "")
        + `, ${plan.services} service trench(es), ${plan.meters} gas meter(s)`
        + (plan.sized
          ? ` \u2014 ${plan.bySize.map((b) => `${b.label}: ${b.metres} m`).join(", ")}`
            + ` at ${plan.kw} kW diversified`
          : "")
        + (links.length ? `, ${links.length} link(s) recorded` : "")
        + (plan.noLoad?.length
          ? ` \u2014 ${plan.noLoad.length} gas meter(s) with no plot load` : "")
        + (plan.oversized?.length
          ? ` \u2014 ${plan.oversized.length} run(s) over the largest configured pipe` : "")
        /* What got no pipe, and why. A build that quietly covers most
           of a site reads as a build that worked. */
        + (plan.unservedM
          ? ` \u2014 ${plan.unservedM} m of mains trench with no gas beyond it` : "")
        + (plan.unreachable.length
          ? ` \u2014 ${plan.unreachable.length} mains trench(es) not joined to the POC: `
            + plan.unreachable.slice(0, 3).map((u) => u.label).join(", ")
            + (plan.unreachable.length > 3 ? "\u2026" : "")
          : "")
        + (plan.unattachedServices.length
          ? ` \u2014 ${plan.unattachedServices.length} service trench(es) reach a meter `
            + "but not the main" : "")
        + (plan.strandedMeters.length
          ? ` \u2014 ${plan.strandedMeters.length} gas meter(s) on no service trench` : ""));
      setTimeout(() => setStatus(""), 14000);
    } catch (e) { setError(e.message); await load(projectId); }
    finally { setBusy(""); setProgress(null); }
  }

  /* ── Build Water Network ──

     Pipe from the water POC along the mains trench, sized by the plots
     it feeds.

     The same shape as the gas build above — the routing is in
     waterNetwork.js, this writes what it decides — with one difference
     worth naming: every run arrives carrying a size, because in water
     the size *is* the design. Gas has nothing to work out and electric
     works it out from physics; water reads it off a table against a
     count, and that count changes along the network as services tee
     off. So a run here ends where the size changes as well as where the
     main divides.

     No gate on a water design or an agreement. Gas has both because
     they were asked for; adding them here unasked would be this build
     deciding a commercial rule on its own. */
  async function buildWaterNetwork() {
    if (!projectId) return;
    const src = features;

    const mainType = lineTypes.find((t) => t.Layer_Key === "water"
      && /main/i.test(t.Type_Key) && !/service/i.test(t.Type_Key));
    if (!mainType) {
      return setError("No water mains line type is configured \u2014 add one in "
        + "Admin \u203a GIS Styles before building.");
    }

    /* ── Whether this project should have a water main at all ──

       The same two questions gas asks, with a stricter second one: not
       any water agreement, but a Water NAV Clean. A scheme adopted for
       waste and not for clean water is a scheme somebody else is laying
       the clean main on, and drawing one here is quantities against
       work this business is not doing.

       Refused rather than warned, for the reason the gas gate gives:
       a confirm box asking whether to carry on regardless is answered
       yes by everybody. */
    const waterLayer = layers.find((l) => l.Layer_Key === "water");
    const utilityId = waterLayer?.Utility_ID;
    if (utilityId == null) {
      return setError("The water layer has no utility set, so there is no design or "
        + "agreement to check it against \u2014 set it in Admin \u203a GIS Styles.");
    }

    const design = scopeDefaults.find((sc) => Number(sc.Utility_ID) === Number(utilityId));
    if (!design) {
      return setError("This project has no water outline design \u2014 add water on the "
        + "Outline Designs tab before laying a main.");
    }

    /* The agreement type, by name.

       A name rather than an id because the requirement is a name: the
       row is seeded by migration 0062 and the id it happens to have
       differs between databases. Matched loosely on case and spacing,
       since somebody retyping it in admin will not match the seed
       exactly. */
    const WANTED = "water nav clean";
    const wantedType = (lookups?.avAgreementTypes || []).find((t) =>
      String(t.AV_Agreement_Type || "").trim().toLowerCase() === WANTED);
    if (!wantedType) {
      /* Its own message. "No agreement" sends somebody to the Asset
         Value tab to add one; this sends them to the agreement types,
         which is where the problem actually is. */
      return setError("No agreement type called \u201cWater NAV Clean\u201d is "
        + "configured, so there is nothing to check against \u2014 add it in "
        + "Admin \u203a AV Agreement Type.");
    }

    let agreement = null;
    try {
      const { rows = [] } = await listAgreements(projectId);
      agreement = rows.find((a) =>
        Number(a.AV_Agreement_Type_ID) === Number(wantedType.AV_Agreement_Type_ID));
    } catch (e) {
      /* Not the same as not having one: only one of the two is the
         user's to fix. */
      return setError(`Couldn\u2019t check the water asset value agreement: ${e.message}`);
    }
    if (!agreement) {
      return setError("This project has no Water NAV Clean asset value agreement \u2014 "
        + "the clean water main is adopted work, so it is drawn once there is an "
        + "agreement to adopt it under. Add one on the Asset Value tab.");
    }

    /* ── Whose rules to size by ──

       A pipe size rule may name operators, so the build has to know
       which one this scheme is with. An organisation, not an IDNO row:
       the same company can hold both roles and the rules are recorded
       against the company.

       Three places carry it, asked in the order of how firmly they mean
       it:

         the NAV Clean agreement     who has agreed to adopt it
         the water outline design    who the design is being done for
         the water POC application   who was approached

       The agreement first here, unlike the gate above, because it is
       the only one of the three that records an organisation directly.
       The other two hold a legacy IDNO id, which is followed to its
       organisation through the IDNO list — every IDNO row carries one.

       No operator found is not an error. It means the house standard
       applies, which is what an unconfigured project should get. */
    const orgOfIdno = (id) => (id == null ? null
      : (lookups?.idnos || []).find((x) =>
        Number(x.IDNO_ID) === Number(id))?.Organisation_ID ?? null);

    let adopting = agreement.IDNO_Organisation_ID
      ?? orgOfIdno(design.IDNO_ID)
      ?? orgOfIdno(agreement.IDNO_ID)
      ?? null;

    if (adopting == null) {
      try {
        const { rows: pocs = [] } = await listPoc(projectId);
        const mine = pocs.find((r) => Number(r.Utility_ID) === Number(utilityId));
        adopting = orgOfIdno(mine?.IDNO_ID) ?? null;
      } catch {
        /* Swallowed, unlike the agreement check above. The POC is the
           last of three fallbacks and only refines which rules are
           read; refusing to draw because a POC list would not load
           would be failing on the least important of the three. */
      }
    }

    /* And the DNO recorded on the water design. A rule may be written
       against either operator, so both are offered and the rules
       decide which one they were meant for. */
    const operatorIds = [adopting, design.DNO_Organisation_ID].filter((x) => x != null);

    const plan = waterMainRuns(src, {
      lineTypes,
      pipeSizes: lookups?.waterPipeSizes || [],
      pipeSizeOperators: lookups?.waterPipeSizeOperators || [],
      operatorIds,
    });
    if (plan.error) return setError(plan.error);
    if (!plan.runs.length) {
      return setError("Nothing to lay \u2014 the POC is on the network but no "
        + "mains trench leads away from it.");
    }

    const old = src.filter((f) => f.Feature_Type === "line"
      && f.Layer_Key === "water"
      && !!f.Attributes?.Generated);

    if (!window.confirm(
      `Lay ${plan.runs.length} run(s) of water main \u2014 ${plan.totalM} m `
      + `to ${plan.meters} water meter(s)?`
      + `\n\n${plan.bySize.map((b) => `${b.label}: ${b.metres} m`).join("\n")}`
      /* Which rules these sizes came from. A figure somebody disagrees
         with is nearly always a rule they did not know applied. */
      + `\n\nSized by ${plan.sizeRules} rule(s)`
      + (plan.operatorRules
        ? `, ${plan.operatorRules} of them set for this project\u2019s operator.`
        : " \u2014 the standard rules, none set for this project\u2019s operator.")
      + (old.length ? `\n\nThis redraws ${old.length} existing water main(s).` : "")
      /* Said before anything is drawn. A run carrying more than the
         table allows is a design question, and finding it in a status
         line after the fact is finding it too late. */
      + (plan.oversized.length
        ? `\n\n${plan.oversized.length} run(s) feed more than ${plan.largest.max} `
          + `meters, which is the most ${plan.largest.label} will carry. They will be `
          + "drawn with no size set \u2014 add a larger pipe in Admin \u203a Water "
          + "Pipe Sizes." : "")
      + (plan.unservedM
        ? `\n\n${plan.unservedM} m of mains trench has no water service beyond it `
          + "and will get no pipe." : "")
      + (plan.strandedMeters.length
        ? `\n\n${plan.strandedMeters.length} water meter(s) sit on no service trench.` : "")
    )) return;

    setBusy("waternet");
    try {
      setProgress({ done: 0, total: plan.runs.length, label: "Laying water main" });
      if (old.length) await deleteFeatures(projectId, old.map((f) => f.Feature_ID));

      for (const [i, r] of plan.runs.entries()) {
        await createFeature(projectId, {
          Layer_Key: "water",
          Feature_Type: "line",
          Geometry: r.pts,
          Label: `W${i + 1}`,
          Attributes: {
            Line_Type: mainType.Type_Key,
            /* The size, as both the reference and the text.

               The id is what the editor edits and what a schedule can
               join on; Size is what every existing display already
               reads \u2014 trench contents labels a pipe with it. Written
               together here and together in the editor, so there is one
               place either of them changes and they cannot drift into
               naming different pipes.

               Left unset where the table does not reach: a run whose
               size nobody has configured should look unset, because it
               is. */
            ...(r.size
              ? { Water_Pipe_Size_ID: r.size.id, Size: r.size.label }
              : {}),
            /* What decided that size, so the drawing carries its own
               reasoning and the number can be checked without rerunning
               anything. */
            Meters: r.meters,
            Services: r.services,
            Generated: true,
          },
        });
        setProgress({ done: i + 1, total: plan.runs.length, label: `Run ${i + 1} of ${plan.runs.length}` });
      }

      setProgress({ done: plan.runs.length, total: plan.runs.length, label: "Linking" });
      const fresh = await listGis(projectId);
      const all = fresh.features || [];

      /* ── Service valves ──

         A bar across each spur, a metre and a half down from the tee.
         Worked out from the mains that have just been drawn, which is
         why this reads them back rather than using the plan: the runs
         are geometry, and where a spur leaves is a fact about the
         network they form.

         Real features, not something drawn each frame. A valve has to
         be selectable and deletable — a drawing has valves somebody
         adds and takes away — and a mark computed at render time can be
         neither.

         Generated ones are replaced on every rebuild, like the pipe.
         One placed by hand is left exactly where it is, for the same
         reason a hand-drawn cable survives Build LV Network. */
      const oldValves = all.filter((f) => f.Feature_Role === "servicevalve"
        && f.Layer_Key === "water"
        && !!f.Attributes?.Generated);
      if (oldValves.length) {
        await deleteFeatures(projectId, oldValves.map((f) => f.Feature_ID));
      }

      const { valves } = serviceValves(all, { lineTypes });
      let valveCount = 0;
      for (const [i, v] of valves.entries()) {
        await createFeature(projectId, {
          Layer_Key: "water",
          Feature_Type: "point",
          Feature_Role: "servicevalve",
          Geometry: [v.at],
          Label: `SV ${i + 1}`,
          Attributes: {
            /* The bearing of the pipe it sits in. The bar is drawn
               square to this. */
            Angle_Deg: Math.round(
              (Math.atan2(v.dir[1], v.dir[0]) * 180) / Math.PI * 10) / 10,
            Generated: true,
          },
        });
        valveCount += 1;
      }

      const links = all
        .filter((f) => f.Feature_Type === "line" || f.Feature_Role === "spannode")
        .map((f) => ({
          Feature_ID: f.Feature_ID,
          Attributes: { ...f.Attributes, Connects: linksFor(f, all) },
        }))
        .filter((u) => {
          const was = all.find((f) => f.Feature_ID === u.Feature_ID)?.Attributes?.Connects || [];
          return [...was].sort().join(",") !== [...u.Attributes.Connects].sort().join(",");
        });
      for (let i = 0; i < links.length; i += 100) {
        await bulkUpdateFeatures(projectId, links.slice(i, i + 100));
      }

      await load(projectId);
      setError("");
      /* Rings named separately. A length of ring carries the size the
         whole loop needed rather than the size its own count asked
         for, so a figure that looks too generous has a reason and the
         status is where to find it. */
      const looped = plan.runs.filter((r) => r.inLoop).length;
      setStatus(`Water network: ${plan.runs.length} run(s), ${plan.totalM} m`
        + (looped ? `, ${looped} of them ring main sized as one` : "")
        + (valveCount ? `, ${valveCount} service valve(s)` : "")
        + `, ${plan.meters} water meter(s) \u2014 `
        + plan.bySize.map((b) => `${b.label} ${b.metres} m`).join(", ")
        + (plan.oversized.length
          ? ` \u2014 ${plan.oversized.length} run(s) over ${plan.largest.label} capacity` : "")
        + (plan.unservedM
          ? ` \u2014 ${plan.unservedM} m of mains trench with no water beyond it` : "")
        + (plan.unreachable.length
          ? ` \u2014 ${plan.unreachable.length} mains trench(es) not joined to the POC` : "")
        + (plan.strandedMeters.length
          ? ` \u2014 ${plan.strandedMeters.length} water meter(s) on no service trench` : ""));
      setTimeout(() => setStatus(""), 14000);
    } catch (e) { setError(e.message); await load(projectId); }
    finally { setBusy(""); setProgress(null); }
  }

  /* Start drawing a particular line type. The menus name the thing being
     drawn — Mains trench, LV feeder — rather than putting the tool and a
     type picker side by side and leaving them to be combined. */
  const drawAs = useCallback((typeKey) => {
    setLineType(typeKey);
    setTool("line");
    setSelected([]);
    setDraft([]);
  }, []);

  /* isDrawing, not drawing: `drawing` above already means "is any drawing
     tool active". Two different questions, and one name for both broke
     the build once already. */
  const isDrawing = (typeKey) => tool === "line" && lineType === typeKey;

  /* Bring a set of features into view.

     Selecting something on a plan the size of a housing estate is only
     half an answer — the thing selected is usually off screen. This
     frames it, with room around it so it reads in context. */
  /* Frame a set of points.

     The framing itself, separated from finding the points, because a
     trace leg is a path between two nodes rather than a feature — it can
     cross several cables and belongs to none of them, so there is no id
     to look up. Two copies of the fitting arithmetic would be two places
     for the padding and the clamps to drift apart. */
  const zoomToPoints = useCallback((pts) => {
    if (!pts?.length) return;

    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    const el = canvasRef.current;
    const w = el?.clientWidth ?? 800;
    const h = el?.clientHeight ?? 500;
    const pad = 60;

    /* A single point has no extent, so fitting to it would divide by
       zero. Fall back to a working scale and centre on it. */
    const spanX = Math.max(maxX - minX, 0.001);
    const spanY = Math.max(maxY - minY, 0.001);
    const scale = (maxX - minX < 0.01 && maxY - minY < 0.01)
      ? Math.max(view.scale, 4)
      : Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);

    const clamped = Math.max(0.05, Math.min(scale, 40));
    setView({
      x: w / 2 - ((minX + maxX) / 2) * clamped,
      y: h / 2 - ((minY + maxY) / 2) * clamped,
      scale: clamped,
    });
  }, [view.scale]);

  /* Bring a set of features into view, by id. */
  const zoomTo = useCallback((ids) => {
    zoomToPoints(features
      .filter((f) => ids.includes(f.Feature_ID))
      .flatMap((f) => f.Geometry || []));
  }, [features, zoomToPoints]);

  /* Breaking a line in two at a point.

     The second half is a new feature carrying the same attributes, so a
     trench broken in half is still two trenches of the same type and
     surface — the break is a change of extent, not of kind.

     Connects is recomputed for both from geometry rather than copied:
     the half that no longer reaches something must stop claiming to, and
     the two now touch each other. */
  async function breakLineAt(f, atM) {
    /* A manual reshape like any other. The automated routines below —
       Auto Service teeing into a main, Build LV Network adding nodes —
       deliberately ignore locks: those are asked for explicitly and a
       lock is a guard against a slip of the hand, not against a routine
       someone has just chosen from a menu. Being asked to unlock the
       trenches before every Auto Service run is how people leave
       everything unlocked. */
    if (locked(f)) { setError(whyLocked(f)); return; }
    const parts = splitPolylineAt(f.Geometry, atM, CONNECT_M * 4);
    if (!parts) {
      setError("Pick a point along the line, not one of its ends.");
      return;
    }
    setBusy("break");
    try {
      const [head, tail] = parts;
      await moveFeatures(projectId, [{ Feature_ID: f.Feature_ID, Geometry: head }]);
      const made = await createFeature(projectId, {
        Layer_Key: f.Layer_Key,
        Feature_Type: "line",
        Feature_Role: f.Feature_Role,
        Plot_ID: f.Plot_ID ?? null,
        Geometry: tail,
        Label: f.Label,
        Attributes: { ...f.Attributes },
      });
      await load(projectId);

      const fresh = await listGis(projectId);
      const all = fresh.features || [];
      const ids = new Set([f.Feature_ID, made?.Feature_ID]);
      for (const x of all) {
        for (const c of x.Attributes?.Connects || []) if (ids.has(c)) ids.add(x.Feature_ID);
      }
      const updates = [...ids].map((id) => all.find((x) => x.Feature_ID === id)).filter(Boolean)
        .map((x) => ({
          Feature_ID: x.Feature_ID,
          Attributes: { ...x.Attributes, Connects: linksFor(x, all) },
        }));
      if (updates.length) await bulkUpdateFeatures(projectId, updates);
      await load(projectId);

      setSelected(made?.Feature_ID ? [made.Feature_ID] : []);
      setStatus("Line broken in two \u2014 the far half is selected");
      setTimeout(() => setStatus(""), 5000);
      setError("");
    } catch (e) { setError(e.message); await load(projectId); }
    finally { setBusy(""); }
  }

  /* Deleting a category. Batched rather than one at a time: the original
     issued a request per feature, which on four hundred trenches is four
     hundred round trips. */
  async function runBulkDelete(ids, catCount) {
    if (!window.confirm(
      `Delete ${ids.length} feature(s) across ${catCount} categor${catCount === 1 ? "y" : "ies"}?`
      + "\n\nUndo will bring them back, but not anything else that has "
      + "happened since."
    )) return;

    /* Captured before the first batch goes, or there is nothing left to
       record: the rows are the only description of what was deleted. */
    const doomed = features.filter((f) => ids.includes(f.Feature_ID));

    setBusy("bulkdel");
    setProgress({ done: 0, total: ids.length, label: "Deleting" });
    const CHUNK = 100;
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const batch = ids.slice(i, i + CHUNK);
        await deleteFeatures(projectId, batch);
        const done = Math.min(i + batch.length, ids.length);
        setProgress({ done, total: ids.length, label: `Deleting ${done} of ${ids.length}` });
      }
      await recordAction(`Delete ${ids.length} feature(s)`, doomed, []);
      setBulkDelOpen(false);
      await load(projectId);
      setSelected([]);
      setStatus(`Deleted ${ids.length} feature(s)`);
      setTimeout(() => setStatus(""), 6000);
      setError("");
    } catch (e) { setError(e.message); await load(projectId); }
    finally { setBusy(""); setProgress(null); }
  }

  /* Add the nodes that hand-drawn services are missing.

     A service touching the mains with no vertex at the meeting point is
     connected on paper and invisible to routing. This does in one pass
     what dragging each end would, using the same teeIntoMains. */
  async function addMissingNodes(rows) {
    if (!rows.length) return;
    setBusy("tee");
    setProgress({ done: 0, total: rows.length, label: "Adding nodes" });
    try {
      const teed = new Map();
      let done = 0;
      for (const row of rows) {
        const sv = features.find((f) => f.Feature_ID === row.id);
        const g = sv?.Geometry || [];
        if (g.length >= 2) {
          for (const end of [g[0], g[g.length - 1]]) {
            for (const other of features) {
              if (other.Feature_Type !== "line") continue;
              if (other.Feature_ID === sv.Feature_ID) continue;
              if (String(other.Attributes?.Line_Type || "").includes("service")) continue;
              const base = teed.get(other.Feature_ID) ?? other.Geometry;
              const next = teeIntoMains(base, end, CONNECT_M);
              if (next) teed.set(other.Feature_ID, next);
            }
          }
        }
        done += 1;
        setProgress({ done, total: rows.length, label: `Adding nodes (${done} of ${rows.length})` });
      }

      if (teed.size) {
        await moveFeatures(projectId,
          [...teed].map(([Feature_ID, Geometry]) => ({ Feature_ID, Geometry })));
      }
      await load(projectId);
      setSvcCheck(null);
      setStatus(teed.size
        ? `Nodes added to ${teed.size} mains trench(es) \u2014 run the check again to confirm`
        : "Nothing to add \u2014 they already have nodes.");
      setTimeout(() => setStatus(""), 8000);
      setError("");
    } catch (e) { setError(e.message); await load(projectId); }
    finally { setBusy(""); setProgress(null); }
  }

  /* Classify what is already drawn against the boundary.

     Two kinds of change, and the second is why this asks first: a feature
     wholly on one side just gets a Site, but one crossing the boundary
     has to become two features, because one row cannot be both on and
     off site and the reinstatement differs. */
  function previewClassification() {
    const plan = planClassification(features, {
      polygons: boundaryPolygons(features),
      surfaceTypes,
      includeClassified: reclass,
      isTrench: (f) => isTrenchType(f.Attributes?.Line_Type, lineTypes),
    });
    if (plan.error) { setError(plan.error); return; }
    setClassPlan(plan);
    setError("");
  }

  async function applyClassification(plan) {
    setBusy("classify");
    const total = plan.label.length + plan.split.length;
    setProgress({ done: 0, total, label: "Classifying" });
    try {
      /* Labelling first: it changes no geometry, so if the splitting half
         fails the drawing is improved rather than half-rebuilt. */
      for (let i = 0; i < plan.label.length; i += 100) {
        await bulkUpdateFeatures(projectId,
          plan.label.slice(i, i + 100).map(({ feature, site, surface }) => ({
            Feature_ID: feature.Feature_ID,
            Attributes: {
              ...feature.Attributes,
              Site: site,
              ...(surface !== undefined ? { Surface_Type: surface } : {}),
            },
          })));
        setProgress({ done: Math.min(i + 100, plan.label.length), total, label: "Classifying" });
      }

      let made = 0;
      let done = plan.label.length;
      for (const { feature, runs } of plan.split) {
        /* The original keeps the first run, so it keeps its Feature_ID and
           with it every Connects entry other features hold against it. */
        const [first, ...rest] = runs;
        await moveFeatures(projectId, [
          { Feature_ID: feature.Feature_ID, Geometry: first.geometry },
        ]);
        await bulkUpdateFeatures(projectId, [{
          Feature_ID: feature.Feature_ID,
          Attributes: {
            ...feature.Attributes,
            Site: first.site,
            ...(first.surface !== undefined ? { Surface_Type: first.surface } : {}),
          },
        }]);
        for (const r of rest) {
          await createFeature(projectId, {
            Layer_Key: feature.Layer_Key,
            Feature_Type: "line",
            Feature_Role: feature.Feature_Role,
            Plot_ID: feature.Plot_ID ?? null,
            Geometry: r.geometry,
            Label: feature.Label,
            Attributes: {
              ...feature.Attributes,
              Site: r.site,
              ...(r.surface !== undefined ? { Surface_Type: r.surface } : {}),
            },
          });
          made += 1;
        }
        done += 1;
        setProgress({ done, total, label: `Splitting (${done} of ${total})` });
      }

      if (plan.split.length) {
        const fresh = await listGis(projectId);
        const all = fresh.features || [];
        const updates = all.filter((x) => x.Feature_Type === "line").map((x) => ({
          Feature_ID: x.Feature_ID,
          Attributes: { ...x.Attributes, Connects: linksFor(x, all) },
        }));
        for (let i = 0; i < updates.length; i += 100) {
          await bulkUpdateFeatures(projectId, updates.slice(i, i + 100));
        }
      }

      await load(projectId);
      setClassPlan(null);
      setStatus(`Classified ${plan.label.length} feature(s)`
        + (plan.split.length
          ? `, split ${plan.split.length} at the boundary into ${made} extra run(s)` : ""));
      setTimeout(() => setStatus(""), 10000);
      setError("");
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

    /* Every trench, whether shown or not. A hidden mains trench is still
       the one a service should tee into. */
    const trenches = mainsTrenches(features, (f) => isTrenchType(f.Attributes?.Line_Type, lineTypes));
    if (!trenches.length) { setError("Draw a mains trench first."); return; }

    const serviceType = lineTypes.find((t) => t.Type_Key === "trench_service") || {};
    const polys = boundaryPolygons(features);

    /* A seed is already done if a service trench is bound to it. The
       link is stored on the trench rather than inferred from position,
       so moving either afterwards doesn't make the plot look unserved
       and get a second trench on the next run.

       It has to be the trench specifically. Cables and meters carry
       Seed_Feature_ID too, so accepting any of them let a plot with a
       meter but no dig count as serviced — the planner skipped it and
       the repair below found no trench to work from, leaving it in a
       state neither path would touch. */
    /* Which plots already have a service, however it was drawn.

       This used to look only for a trench stamped with the seed's id,
       which Auto Service writes and a hand-drawn trench does not — so a
       plot someone had already dug to got a second trench and a second
       cable laid over the first, both feeding the same meter.

       isServed also asks whether any service trench simply ends at one
       of the plot's meters, which is what a hand-drawn one looks like. */
    const svcTrenches = features.filter((f) =>
      f.Feature_Type === "line" && isTrenchType(f.Attributes?.Line_Type, lineTypes));
    const allMeters = features.filter((f) => f.Feature_Role === "meter");
    const serviced = new Set(seeds
      .filter((sd) => isServed(sd, allMeters, svcTrenches))
      .map((sd) => Number(sd.Feature_ID)));

    /* A meter with a trench already running to it is left alone, even
       where the rest of its plot still needs doing. Per meter rather
       than per plot: a plot with gas dug by hand and electric not needs
       the electric doing and the gas leaving. */
    const meterServed = (point) => meterHasService(point, svcTrenches);

    /* Which heat sources mean gas, by name rather than by id.

       This read `heat_source_id !== 1`, with 1 taken to be gas. It is
       whatever the table happened to be seeded with, and on this
       database 1 is ASHP and gas is 3 — so the test excluded gas from
       every gas plot and included it on every air source one. Auto
       Service laid no gas services at all and nobody could see why:
       the plots were right, the drawing was right, and the rule was
       reading a different row.

       Matched the way 0053 and gis_unplaced_plots match it, on the
       word rather than the number, so renaming a lookup in Admin
       cannot break it and the database and the canvas cannot disagree
       about which plots take gas. */
    const gasSourceIds = new Set((lookups?.heatSources || [])
      .filter((h) => /(^|[^a-z])gas([^a-z]|$)/i.test(String(h.Heat_Source || "")))
      .map((h) => Number(h.Heat_Source_ID)));

    const utilitiesFor = (seed) => {
      const plot = plotList.find((p) => p.plot_id === seed.Plot_ID);
      return utilities.filter((u) => {
        if (u.layer_key !== "gas") return true;
        /* No plot behind the seed, or no heat source recorded: left as
           it was, which is to offer gas. A seed with nothing known
           about it is not evidence that it takes no gas, and dropping
           the meter would hide the gap rather than show it. */
        if (!plot || plot.heat_source_id == null) return true;
        /* And where the lookup could not be read at all, the same:
           better a gas meter to delete than a plot silently missed. */
        if (!gasSourceIds.size) return true;
        return gasSourceIds.has(Number(plot.heat_source_id));
      });
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

    /* Mains geometry as this run has it, with every tee worked out so
       far already composed in.

       Kept in one map rather than written where each tee is decided,
       because the mains is PATCHed as a whole array. Two plots teeing
       into the same run would each read the original geometry and write
       it back with only their own vertex added, so the second write
       discarded the first — and a plot whose vertex was discarded sits
       exactly on a mains it is not joined to. That is invisible on the
       drawing and shows up only as a meter the Circuit Report cannot
       trace back to the substation. */
    const teeGeom = new Map();
    const liveGeom = (f) => teeGeom.get(Number(f.Feature_ID)) ?? f.Geometry;

    /* Give a main a vertex where a service meets it.

       connectedTo matches endpoints against vertices, never against
       segments, so a service ending part-way along a run is on the line
       and connected to nothing. The vertex goes at the foot of the
       perpendicular rather than at the service's own end, which keeps
       the main straight; the two are within CONNECT_M of each other by
       the time we get here, which is what makes the link form.

       teeIntoMains returns null when a vertex is already close enough,
       so running this over work that is already teed changes nothing. */
    const teeAt = (candidates, point) => {
      if (!point) return;
      let best = null;
      for (const f of candidates) {
        const g = liveGeom(f);
        if ((g || []).length < 2) continue;
        const r = nearestOnPolyline(point, g);
        if (r && (!best || r.d < best.r.d)) best = { f, g, r };
      }
      if (!best || best.r.d > CONNECT_M) return;
      const next = teeIntoMains(best.g, best.r.q, CONNECT_M);
      if (next) teeGeom.set(Number(best.f.Feature_ID), next);
    };

    /* The utility's own main, for the service cable. Teeing the dig into
       the mains trench joins the trenches to each other; the cable still
       has to meet the cable, or an electric trace stops at the junction
       even though the trenches are continuous. */
    const mainsOf = (layerKey) => features.filter((f) =>
      f.Feature_Type === "line"
      && f.Layer_Key === layerKey
      && (f.Geometry || []).length >= 2
      && String(f.Attributes?.Line_Type || "").endsWith("_main"));

    /* Repairs to services that already exist.

       A seed with a service trench is skipped as done, which is right
       when the trench and its cables were drawn together and wrong once
       a cable has been deleted — the plot then has a dig with nothing in
       it, and the only way back was to draw it by hand.

       Two separate repairs, deliberately independent. A plot can have
       every cable it needs and still not be joined to the mains, so the
       tee is checked whether or not a cable is missing; making it
       conditional on the cable was why re-running reported nothing to do
       and changed nothing.

       The cable follows the trench, so redrawing it needs no routing at
       all: the trench geometry is the route. Done before planning, so a
       seed that only needs a repair is repaired rather than skipped. */
    const refill = [];
    for (const seed of seeds) {
      const sid = Number(seed.Feature_ID);
      if (!serviced.has(sid)) continue;      // no trench: the planner handles it

      const trench = features.find((f) => f.Feature_Type === "line"
        && Number(f.Attributes?.Seed_Feature_ID) === sid
        && isTrenchType(f.Attributes?.Line_Type, lineTypes));
      if (!trench || (trench.Geometry || []).length < 2) continue;

      /* Both ends. The planner builds the dig as [foot, seed], but a
         service split at the boundary can arrive either way round, and
         only an end genuinely within CONNECT_M of a main tees at all. */
      teeAt(trenches, trench.Geometry[0]);
      teeAt(trenches, trench.Geometry[trench.Geometry.length - 1]);

      for (const u of utilitiesFor(seed)) {
        const cable = features.find((f) => f.Feature_Type === "line"
          && f.Layer_Key === u.layer_key
          && Number(f.Attributes?.Seed_Feature_ID) === sid);
        if (cable) {
          const cg = cable.Geometry || [];
          if (cg.length >= 2) {
            const mains = mainsOf(u.layer_key);
            teeAt(mains, cg[0]);
            teeAt(mains, cg[cg.length - 1]);
          }
          continue;
        }

        /* From the main to the meter, the same route the planner
           builds.

           Both used to run the whole dig and then hop to the meter,
           which put a bend at the seed. The seed marks which plot this
           is; it is not a point the cable passes through. Replacing one
           and not the other would have a re-run draw a different shape
           from the original.

           Where there is no meter yet the dig's own end stands in, so a
           service drawn before its meter still has a cable to show. */
        const meterAt = existingMeter(seed, u);
        const foot = trench.Geometry[0];
        const end = meterAt ?? trench.Geometry[trench.Geometry.length - 1];
        const apart = Math.hypot(end[0] - foot[0], end[1] - foot[1]) > CONNECT_M;
        refill.push({
          seed, utility: u,
          geometry: apart ? [foot, end] : [...trench.Geometry],
        });
      }
    }

    /* ── What a water service is laid in ──

       Read from the service rules rather than fixed at 25mm in this
       file. A service feeds one property, so the size is the smallest
       service rule that carries one meter — which with the standard
       25mm rule is 25mm, and follows an operator who rules otherwise
       without this code being touched.

       The operator here is taken from the water design alone, not from
       the agreement and the POC as the mains build does. Auto Service
       runs across every utility on the drawing and should not fetch two
       endpoints to size a spur; the design is the one of the three that
       is already loaded, and it is the one somebody sets deliberately.

       Nothing is written where no service rule fits. A spur with no
       size shows as "pipe size not set" on the bill, which is true and
       findable, and better than a number this file invented. */
    const serviceSize = (() => {
      const waterLayer = layers.find((l) => l.Layer_Key === "water");
      const design = waterLayer?.Utility_ID != null
        ? scopeDefaults.find((sc) => Number(sc.Utility_ID) === Number(waterLayer.Utility_ID))
        : null;
      const orgOfIdno = (id) => (id == null ? null
        : (lookups?.idnos || []).find((x) =>
          Number(x.IDNO_ID) === Number(id))?.Organisation_ID ?? null);
      const operatorIds = [orgOfIdno(design?.IDNO_ID), design?.DNO_Organisation_ID]
        .filter((x) => x != null);

      const table = sizeTable(lookups?.waterPipeSizes || [], {
        kind: "service",
        operatorIds,
        operators: lookups?.waterPipeSizeOperators || [],
      });
      return sizeFor(table, 1);
    })();

    const { plans, skipped } = planAutoService(seeds, trenches, utilitiesFor, {
      alreadyServiced: (s) => serviced.has(Number(s.Feature_ID)),
      meterServed,
      existingMeter,
    });
    if (!plans.length && !refill.length && !teeGeom.size) {
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
              Connects: connectedTo(run.geometry, features, null),
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
              ...defaultsFor(lineTypes.find((t) => t.Layer_Key === c.utility.layer_key
                && String(t.Type_Key).endsWith("_service"))?.Type_Key),
              Line_Type: lineTypes.find((t) => t.Layer_Key === c.utility.layer_key
                && String(t.Type_Key).endsWith("_service"))?.Type_Key ?? null,
              Seed_Feature_ID: plan.seed.Feature_ID,
              /* The size of a water service, off the same table the
                 mains are sized from. */
              ...(c.utility.layer_key === "water" && serviceSize
                ? { Water_Pipe_Size_ID: serviceSize.id, Size: serviceSize.label }
                : {}),
              Connects: connectedTo(c.geometry, features, null),
            },
          });
          /* The cable has to meet its own main as well as sharing the
             dig, or the trenches trace through and the network doesn't. */
          teeAt(mainsOf(c.utility.layer_key), c.geometry[0]);
          cableCount++;
        }

        /* Give the mains a vertex where the service tees in. Without it
           the two lines cross without meeting and tracing stops at the
           junction.

           Composed into teeGeom and written once at the end rather than
           PATCHed here: the geometry read is the live one, so a second
           plot teeing into the same run adds to the first plot's vertex
           instead of replacing it. */
        const teed = teeIntoMains(liveGeom(plan.mains), plan.foot, CONNECT_M);
        if (teed) teeGeom.set(Number(plan.mains.Feature_ID), teed);
        doneCount++;
        setProgress((p) => (p ? { ...p, done: doneCount } : p));
      }

      /* Cables put back into trenches that already existed. Drawn after
         the planned work so the geometry they connect to is current. */
      let refilled = 0;
      for (const r of refill) {
        if (cancelRef.current) break;
        await createFeature(projectId, {
          Layer_Key: r.utility.layer_key,
          Feature_Type: "line",
          Geometry: r.geometry,
          Label: `${r.utility.utility} service ${r.seed.Label ?? ""}`.trim(),
          Plot_ID: r.seed.Plot_ID ?? null,
          Attributes: {
            ...defaultsFor(lineTypes.find((t) => t.Layer_Key === r.utility.layer_key
              && String(t.Type_Key).endsWith("_service"))?.Type_Key),
            Line_Type: lineTypes.find((t) => t.Layer_Key === r.utility.layer_key
              && String(t.Type_Key).endsWith("_service"))?.Type_Key ?? null,
            Seed_Feature_ID: r.seed.Feature_ID,
            Connects: connectedTo(r.geometry, features, null),
          },
        });
        refilled += 1;
        cableCount += 1;
      }

      /* Mains geometry, one write per run rather than one per tee, with
         every vertex this run worked out already composed in. Written
         before the relink below so the rebuilt links see the vertices. */
      let teedCount = 0;
      if (teeGeom.size) {
        const teeUpdates = [...teeGeom.entries()]
          .map(([Feature_ID, Geometry]) => ({ Feature_ID, Geometry }));
        for (let i = 0; i < teeUpdates.length; i += 100) {
          await moveFeatures(projectId, teeUpdates.slice(i, i + 100));
        }
        teedCount = teeUpdates.length;
      }

      /* Link everything this run drew, from fresh data.

         Connects was computed against `features` as it stood before the
         run, so a cable drawn late could miss a mains that was teed
         earlier in the same pass — and a meter never had its own links
         rebuilt at all, which is why one could sit on a cable and still
         be unreachable from the substation.

         Recomputed across every line and every meter, and written only
         where it changed. */
      const fresh = await listGis(projectId);
      const all = fresh.features || [];
      const relink = all
        .filter((f) => f.Feature_Type === "line" || f.Feature_Role === "meter")
        .map((f) => ({
          Feature_ID: f.Feature_ID,
          Attributes: { ...f.Attributes, Connects: linksFor(f, all) },
        }))
        .filter((u) => {
          const was = all.find((f) => f.Feature_ID === u.Feature_ID)?.Attributes?.Connects || [];
          return [...was].sort().join(",") !== [...u.Attributes.Connects].sort().join(",");
        });
      for (let i = 0; i < relink.length; i += 100) {
        await bulkUpdateFeatures(projectId, relink.slice(i, i + 100));
      }

      await load(projectId);
      setError("");
      setStatus(
        (stopped ? `Stopped after ${doneCount} of ${plans.length} plot(s). ` : "")
        + `Auto service: ${trenchCount} trench(es), ${meterCount} meter(s), ${cableCount} service(s)`
        + (refilled ? `, ${refilled} put back into an existing trench` : "")
        + (teedCount ? `, ${teedCount} main(s) teed` : "")
        + (relink.length ? `, ${relink.length} link(s) rebuilt` : "")
        + (keptCount ? `, ${keptCount} existing meter(s) kept` : "")
        + (skipped.length ? `, ${skipped.length} skipped` : "")
        /* Plots with no boundary point, dug to their furthest meter
           instead. Said rather than left to be noticed: the two shapes
           look alike on a drawing, and the difference is which point
           decided where the trench stops. */
        + ((() => {
          const old = plans.filter((x) => !x.boundary).length;
          return old
            ? ` \u2014 ${old} plot(s) have no boundary point, so the dig ran to `
              + "their furthest meter"
            : "";
        })())
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
  /* Full trace from a span node.

     Built on the feeder model, as the original is. The Connects graph
     cannot answer this properly: it has no notion of which circuit a
     branch serves, so a shared trench leading to another circuit's plots
     came back as part of this one — and it has no running count of what
     lies beyond a point, which is the figure that decides the cable
     into it.

     A0 is the substation. Sequence zero starts the walk at the model's
     root rather than at the node's own position, because the origin node
     marks where the circuit begins rather than sitting somewhere along
     it — so tracing from A0 means tracing the whole circuit. */
  /* Legs ordered by where each starts, then by where it goes.

     The walk produces them depth first, which follows the cable but
     reads as a jumble in a table: A0, A1, A5, A5, A7, A11, A13, A13,
     A11. Grouping by start puts every leg out of a node together, which
     is how anyone reads a schedule — and A11 sorts after A5, not
     between A1 and A13, because the number is a number. */
  const nodeOrder = (label) => {
    const m = /^([A-Z]+)(\d+)$/.exec(String(label ?? ""));
    return m ? [m[1], Number(m[2])] : [String(label ?? ""), 0];
  };

  const tracePlan = useMemo(() => {
    if (!trace?.legs) return [];
    /* Filtered after ordering, so the ends keep the order they were
       shown in rather than jumping about when the filter goes on. */
    const ordered = traceOrder === "chain"
      ? byConnectivity(trace.legs, trace.from)
      : null;
    if (ordered) return traceEnds ? endsOnly(ordered) : ordered;
    const sorted = trace.legs
      .map((leg, i) => ({ leg, i }))
      .sort((a, b) => {
        const [al, an] = nodeOrder(a.leg.from);
        const [bl, bn] = nodeOrder(b.leg.from);
        if (al !== bl) return al < bl ? -1 : 1;
        if (an !== bn) return an - bn;
        const [tl, tn] = nodeOrder(a.leg.to);
        const [ul, un] = nodeOrder(b.leg.to);
        if (tl !== ul) return tl < ul ? -1 : 1;
        return tn - un;
      });
    return traceEnds ? endsOnly(sorted) : sorted;
    /* traceOrder and traceEnds are in here because the body reads them.
       A memo that reads a value and does not depend on it recomputes
       only when something else changes — which on the bill of materials
       meant the cards followed a filter and the table did not. */
  }, [trace, traceOrder, traceEnds]);

  function exportTrace() {
    if (!trace) return;
    const rows = tracePlan.map(({ leg: l }) => ({
      From: l.from,
      To: l.to ?? "dead end",
      "Length (m)": l.metres,
      /* Named as they read on screen, so a sheet and the panel can be
         compared line by line. */
      "Volts in": l.volts ?? null,
      Cable: l.cable ?? null,
      Distribution: l.distribution,
      Terminal: l.terminal,
      ...(trace.hasVd && !l.vd?.missing ? {
        "Phase current (A)": Number(l.vd.amps.toFixed(1)),
        "Loop impedance (ohms)": Number(l.vd.ohms.toFixed(4)),
        "Volt drop (%)": Number(l.vd.pct.toFixed(3)),
      } : trace.hasVd ? {
        "Phase current (A)": null,
        "Loop impedance (ohms)": null,
        "Volt drop (%)": null,
      } : {}),
    }));
    const wb = XLSX.utils.book_new();
    /* Named for the feature it came from. A file called "Trace" landing
       in someone's downloads from a menu item called Run Levels Check is
       one more thing to reconcile. */
    const what = trace.levels ? "Levels check" : "Full trace";
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), trace.levels ? "Levels" : "Trace");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb,
      `${what} ${project?.Project_Ref ?? ""} ${trace.circuitName} from ${trace.from} ${stamp}.xlsx`
        .replace(/\s+/g, " ").trim());
  }

  /* The voltage arriving at a leg, and the cable it is made of.

     The volt drop columns say how much has been lost by the far end; the
     voltage at the near end is what someone reading a schedule actually
     works from — it is the figure the next length of cable starts with.
     Worked out from the same cumulative sum, at the node the leg begins
     at rather than the one it ends at.

     Written once and used by both checks, so the plain and advanced
     tables cannot disagree about a leg they both contain. */
  const legExtras = useCallback((leg, part, ctx) => {
    if (!part?.model || !leg) return {};

    const startV = Number(ctx.voltageV) || 400;
    let volts = null;
    if (leg.fromIdx != null) {
      const at = cumulativeToNode({
        model: part.model, targetIdx: leg.fromIdx, spanNodes: part.spanNodes,
        /* The same cable, so the voltage arriving here advances between
           junctions instead of repeating the figure at the last span
           node — the drop to this point includes the run up to it. */
        partialCableId: leg.cableSizeId ?? null,
        cableById: ctx.cableById, transformer: ctx.transformer,
        voltageV: startV, settings: ctx.settings,
      });
      volts = Math.round(startV * (1 - (Number(at.pct) || 0) / 100) * 10) / 10;
    }

    /* The cable on this leg.

       Taken from the leg, which carries it — including for a junction,
       which is deliberately absent from spanNodes so that it reports a
       figure without changing how the figure is computed. Falls back to
       the span node for legs recorded before that was so. */
    const id = leg.cableSizeId
      ?? (part.spanNodes || []).find((x) => x.index === leg.endIdx)?.cableSizeId
      ?? null;
    const cable = id != null ? ctx.cableById(id) : null;
    const type = cable
      ? (ctx.cableTypes || []).find((t) => t.Cable_Type_ID === cable.Cable_Type_ID)
      : null;

    return {
      volts,
      cable: cable ? [type?.Cable_Type, cable.Size_Label].filter(Boolean).join(" ") : null,
    };
  }, []);

  /* Span nodes whose cable no longer matches the run feeding them.

     The cable size is held twice: on the feeder section, which is the
     cable, and on the span node, which is what the trace reads. Change
     one and the other is stale, and the check reports the old figure
     with nothing to say it is old — a cable put back from 300 to 95
     still traced as 300.

     Two places for one fact is the underlying fault and not something to
     fix by hand at this point in the drawing's life. Saying so before
     the figures are read is the next best thing. */
  const cablesOutOfStep = useMemo(() => {
    const out = [];
    for (const line of features) {
      if (line.Feature_Type !== "line" || line.Layer_Key !== "electric") continue;
      if (line.Attributes?.Circuit_ID == null) continue;
      if (line.Attributes?.VD_Cable_Size_ID == null) continue;
      const node = nodeFedBy(line);
      if (!node) continue;
      if (String(node.Attributes?.VD_Cable_Size_ID ?? "")
        !== String(line.Attributes.VD_Cable_Size_ID)) out.push(node);
    }
    return out;
  }, [features, nodeFedBy]);

  /* The levels check: every circuit, from the substation outward.

     Run from each circuit's origin node — A0, B0 — rather than from
     whatever happens to be selected, because the question it answers is
     about the design rather than about a point in it: does anything on
     this scheme sit outside its limits.

     Each circuit is traced separately, since a trace walks one network
     from one source, and the results are put together for reading. The
     per-circuit models are kept as `parts` so the suggestion search can
     work on each — a cable change is always within one circuit. */
  function runLevelsCheck(opts = {}) {
    const { srcFeatures = null, stopAt = "spannodes" } =
      (opts && opts.nativeEvent) ? {} : opts;
    const src = srcFeatures || features;

    const circuits = circuitsFrom(src);
    if (!circuits.length) {
      setError("No circuits defined yet — use Link to Circuit first.");
      return;
    }

    const parts = [];
    const failed = [];
    for (const c of circuits) {
      const origin = originNodeFor(src, c.id);
      if (!origin) { failed.push(`${c.name}: no origin node`); continue; }
      const r = spanTrace(src, origin.Feature_ID, {
        lineTypes,
        plotById: (id) => plotList.find((p) => p.plot_id === id),
        stopAt,
      });
      if (r.error) { failed.push(`${c.name}: ${r.error}`); continue; }
      r.startId = origin.Feature_ID;
      parts.push(r);
    }

    if (!parts.length) {
      setError(failed.length ? failed.join(" \u00B7 ") : "Nothing to check.");
      setTrace(null);
      return;
    }

    /* Volt drop per leg, on each circuit against its own substation. */
    const cables = lookups?.cableSizes || [];
    let hasVd = false;
    if (cables.length) {
      const station = src.find((f) => f.Feature_Role === "substation");
      /* The same limits the levels come from — built here rather than
         referenced from the other function, and from the same lookup
         row, so the two cannot disagree about what "in tolerance"
         means. */
      const limits = { ...VD_DEFAULTS, ...(lookups?.vdSettings?.[0] ? {
        unbalanced: !!lookups.vdSettings[0].Unbalanced,
        maxLoopOhms: Number(lookups.vdSettings[0].Max_Loop_Ohms),
        maxVoltDropPct: Number(lookups.vdSettings[0].Max_Volt_Drop_Pct),
        unbalancedConstant: Number(lookups.vdSettings[0].Unbalanced_Constant),
        distributedLoadFactor: Number(lookups.vdSettings[0].Distributed_Load_Factor),
      } : {}) };
      for (const part of parts) {
        const ctx = {
          cableById: (id) => cables.find((c) => String(c.Cable_Size_ID) === String(id)) || null,
          cableTypes: lookups?.cableTypes || [],
          transformer: (lookups?.transformerSizes || []).find((t) =>
            String(t.Transformer_Size_ID)
              === String(station?.Attributes?.VD_Transformer_Size_ID)) || null,
          voltageV: Number(station?.Attributes?.Output_V) || 400,
          settings: limits,
        };
        for (const leg of part.legs) {
          leg.vd = cumulativeToNode({
            model: part.model, targetIdx: leg.endIdx, spanNodes: part.spanNodes,
            /* The cable this leg is made of, so the length between the
               last span node and this point is charged rather than left
               out — without it every junction on a run reports the
               figure at the run's start. */
            partialCableId: leg.cableSizeId ?? null,
            ...ctx,
          });
          Object.assign(leg, legExtras(leg, part, ctx));
        }
        part.limits = limits;
      }
      /* The panel is driven by this: it decides the width, the four volt
         drop columns, their cells and the footer. The levels check
         computed the figures and never set it, so the same information
         was worked out and then not shown — a narrower table missing the
         columns that are the point of running it. */
      hasVd = true;
    }

    /* One object for the panel: the legs of every circuit in order, with
       the parts kept alongside so a suggestion can be worked out against
       the circuit it belongs to. */
    setTrace({
      levels: true,
      advanced: stopAt === "junctions",
      hasVd,
      from: "the substation",
      circuitName: parts.length === 1 ? parts[0].circuitName : `${parts.length} circuits`,
      legs: parts.flatMap((p) => p.legs.map((l) => ({ ...l, circuitName: p.circuitName }))),
      parts,
      model: parts[0].model,
      spanNodes: parts[0].spanNodes,
      limits: parts[0].limits,
      startId: parts[0].startId,
      totalMetres: Math.round(parts.reduce((t, p) => t + (p.totalMetres || 0), 0) * 10) / 10,
      /* The customer count, which the panel header reads.

         spanTrace returns totalMetres and totalMeters — the length and
         the number of customers, one letter apart — and this returned
         only the first, so the header read "undefined meter(s)". Summed
         across the circuits, because a levels check covers all of them
         and the header is describing the whole check. */
      totalMeters: parts.reduce((t, p) => t + (p.totalMeters || 0), 0),
    });
    setScenario(null);
    setTraceOpen(true);
    /* The advanced check is mostly joints named for the plots they feed,
       and those do not sort into any useful order by name — so it opens
       along the cable. The ordinary check has numbered nodes and opens by
       node, as it always has. Either can be switched once open. */
    setTraceOrder(stopAt === "junctions" ? "chain" : "label");
    /* The drawing these figures came from, which is `src` and not
       necessarily `features`.

       When a suggestion is applied the check is re-run over data just
       read back, while `features` in this closure is still the drawing
       from before the write. Recording the closure's copy left the panel
       comparing the new figures against the old drawing and declaring
       itself out of date the moment it finished. */
    setTraceAt({ features: src, lookups });
    setError(failed.length ? `Not checked \u2014 ${failed.join(" \u00B7 ")}` : "");
  }

  /* The trace, optionally over a drawing just read back and from a node
     named rather than selected.

     Both exist for re-running after a suggested change has been applied:
     `features` in this closure is still the drawing from before the
     write, and the selection may have moved. Tracing from either would
     report the design as it was and appear to have changed nothing. */
  function runFullTrace(opts = {}) {
    const { srcFeatures = null, startId = null } = (opts && opts.nativeEvent) ? {} : opts;
    const src = srcFeatures || features;

    const node = startId != null
      ? src.find((f) => Number(f.Feature_ID) === Number(startId))
      : selectedFeatures.find((f) => f.Feature_Role === "spannode");
    if (!node) { setError("Select a span node to trace from."); return; }

    const r = spanTrace(src, node.Feature_ID, {
      lineTypes,
      plotById: (id) => plotList.find((p) => p.plot_id === id),
    });
    if (r.error) { setError(r.error); setTrace(null); return; }

    /* Volt drop per leg, if the specs are there to work it out from. The
       columns appear only when a cable catalogue exists — a table of
       dashes would suggest the figures are zero rather than unknown. */
    const cables = lookups?.cableSizes || [];
    const settings = { ...VD_DEFAULTS, ...(lookups?.vdSettings?.[0] ? {
      unbalanced: !!lookups.vdSettings[0].Unbalanced,
      maxLoopOhms: Number(lookups.vdSettings[0].Max_Loop_Ohms),
      maxVoltDropPct: Number(lookups.vdSettings[0].Max_Volt_Drop_Pct),
      unbalancedConstant: Number(lookups.vdSettings[0].Unbalanced_Constant),
      distributedLoadFactor: Number(lookups.vdSettings[0].Distributed_Load_Factor),
    } : {}) };

    r.startId = node.Feature_ID;

    if (cables.length) {
      const station = src.find((f) => f.Feature_Role === "substation");
      const transformer = (lookups?.transformerSizes || []).find((t) =>
        String(t.Transformer_Size_ID)
          === String(station?.Attributes?.VD_Transformer_Size_ID));
      const voltageV = Number(station?.Attributes?.Output_V) || 400;

      const ctx = {
        cableById: (id) => cables.find((c) => String(c.Cable_Size_ID) === String(id)) || null,
        cableTypes: lookups?.cableTypes || [],
        transformer: transformer || null,
        voltageV,
        settings,
      };
      for (const leg of r.legs) {
        leg.vd = cumulativeToNode({
          model: r.model, targetIdx: leg.endIdx, spanNodes: r.spanNodes,
          partialCableId: leg.cableSizeId ?? null,
          ...ctx,
        });
        Object.assign(leg, legExtras(leg, r, ctx));
      }
      r.hasVd = true;
      r.limits = settings;
    }

    setTrace(r);
    /* Any suggestion belonged to the previous figures. Leaving it up
       beside new ones would have it recommending a change to a design
       that has moved. */
    setScenario(null);
    setTraceOpen(true);
    /* The drawing traced, not the one in this closure — see the note in
       runLevelsCheck. */
    setTraceAt({ features: src, lookups });
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

  async function applyBulk(updates, plotChange) {
    if (updates.length) await bulkUpdateFeatures(projectId, updates);

    /* The house type lives on the plot, not on the seed that marks it.

       Written separately because it is a different table, and the load
       is looked up from bedrooms and heat source together — so changing
       the type moves the kVA on every plot touched, and anything already
       worked out from it is stale until re-run. */
    if (plotChange?.plotIds?.length) {
      const { plotIds, ...changes } = plotChange;
      await bulkUpdatePlots(projectId, plotIds, changes);
    }

    await load(projectId);
    const n = plotChange?.plotIds?.length || updates.length;
    setStatus(`${n} ${plotChange?.plotIds?.length ? "plot" : "feature"}${n === 1 ? "" : "s"} updated`);
    setTimeout(() => setStatus(""), 5000);
  }

  async function removeSelected() {
    if (!selected.length) return;
    const withPlots = features.filter((f) => selected.includes(f.Feature_ID) && f.Plot_ID);
    if (withPlots.length && !window.confirm(
      `${withPlots.length} of these are plot markers. Deleting removes the marker, not the plot. Continue?`
    )) return;
    const rows = features.filter((f) => selected.includes(f.Feature_ID));
    try {
      await deleteFeatures(projectId, selected);
      await recordAction(`Delete ${rows.length} feature(s)`, rows, []);
      setSelected([]);
      await load(projectId);
    } catch (e) { setError(e.message); }
  }

  // keyboard
  useEffect(() => {
    const onKey = (e) => {
      /* Undo and redo, but never while someone is typing.

         A label field, a filter box and a plot range all take Z, and a
         browser's own undo inside a text box is what anyone pressing it
         there means. Checking the focused element is the only way to
         tell the two apart. */
      const el = e.target;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA"
        || el.tagName === "SELECT" || el.isContentEditable);
      /* Find, where hands already go for it.

         Allowed while typing, unlike undo: pressing it inside the find
         box itself should refocus rather than do nothing, and there is
         no browser behaviour worth preserving — the page's own find
         cannot search a canvas. */
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        /* Focus and select, so a second press replaces the last search
           rather than appending to it. */
        findRef.current?.focus();
        findRef.current?.select();
        return;
      }

      if (!typing && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) runRedo(1); else runUndo(1);
        return;
      }
      /* Ctrl+Y as well: it is redo on Windows and costs nothing to
         accept alongside Ctrl+Shift+Z. */
      if (!typing && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        runRedo(1);
        return;
      }

      if (e.key === "Escape" && historyOpen) { setHistoryOpen(false); return; }
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
  /* How a project reads in the list.

     Display_Ref rather than Project_Ref: it is generated by the database
     as the reference with its option letter, and 0077 put it there
     precisely so that four screens would not format it four ways. The
     revision is added here because it is not in that column — revision 0
     is the first issue rather than the absence of one, so it is always
     shown.

     Without these, two options of one project are two identical lines:
     "2607.002 — Cedar Trees" twice, with nothing to say which is which. */
  const projectLabel = (p) =>
    `${p.Display_Ref ?? p.Project_Ref} Rev ${p.Revision ?? 0}`
    + ` \u2014 ${p.Site_Name || "Unnamed site"}`;

  const shownProjects = q
    ? projects.filter((p) => projectLabel(p).toLowerCase().includes(q))
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
      }}
      tabIndex={-1}
      onKeyDown={(e) => {
        /* Not while typing: space belongs to the field that has focus. */
        if (e.key === " " && !e.target?.closest?.("input, textarea, select, [contenteditable]")) {
          e.preventDefault();
          setSpaceHeld(true);
        }
      }}
      onKeyUp={(e) => { if (e.key === " ") setSpaceHeld(false); }}
      /* Losing focus mid-drag would leave it stuck on. */
      onBlur={() => setSpaceHeld(false)}
      onClick={() => setCtx(null)}>
      <style>{CSS}</style>

      <div className="gis-bar">
        <div className="gis-proj">
          <input className="gis-search" value={search} placeholder="&#128269; Find a project&hellip;"
            aria-label="Search Projects" onChange={(e) => setSearch(e.target.value)} />
          <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setSelected([]); }}
            aria-label="Project">
            <option value="">&mdash; Select a project &mdash;</option>
            {shownProjects.map((p) => (
              <option key={p.Project_ID} value={p.Project_ID}>
                {projectLabel(p)}
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
            </div>

            {/* Undo and redo.

                Named, not bare arrows: "Undo" alone leaves you pressing
                it and watching to find out what it did, which on an
                action that redrew sixty plots is no way to work. The
                caret opens the history so several steps can go at once —
                undoing four things one at a time means four round trips
                and four intermediate states nobody wanted to see. */}
            <div className="gis-undo" role="group" aria-label="History">
              <button className="gu-b" disabled={!canUndo(stack) || undoBusy}
                title={undoLabel(stack)}
                onClick={() => runUndo(1)}>
                &#8630; Undo
              </button>
              <button className="gu-b" disabled={!canRedo(stack) || undoBusy}
                title={redoLabel(stack)}
                onClick={() => runRedo(1)}>
                Redo &#8631;
              </button>
              <button className="gu-c" disabled={!canUndo(stack) || undoBusy}
                title="Undo several steps at once"
                aria-label="History"
                onClick={() => setHistoryOpen((v) => !v)}>
                &#9662;
              </button>

              {historyOpen && canUndo(stack) && (
                <div className="gu-list" role="menu">
                  <p className="gu-head">Undo back to&hellip;</p>
                  {/* Newest first, and pressing one undoes everything
                      down to and including it — which is what "go back to
                      before I did that" means. */}
                  {[...stack.past].reverse().map((e, i) => (
                    <button key={e.id ?? i} className="gu-item"
                      onClick={() => { setHistoryOpen(false); runUndo(i + 1); }}>
                      <span>{e.label}</span>
                      <span className="gu-n">
                        {i === 0 ? "last" : `${i + 1} steps`}
                        {" \u00B7 "}{deltaSize(e.delta)} feature(s)
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* The line type is chosen from a menu now — Trench > Mains,
                Electric > LV feeder — so only the surface is left, and
                only where it applies. Size was removed: it is a property
                of the cable, set in the editor once drawn, not a mode to
                be in while drawing. */}
            {tool === "line" && isTrenchType(lineType, lineTypes) && (
              <select className="gis-type" value={surface} aria-label="Surface Type"
                onChange={(e) => setSurface(e.target.value)}
                title="Surface for any part outside the boundary. On-site runs are set to Unmade automatically.">
                <option value="">Surface&hellip;</option>
                {surfaceTypes.map((x) => (
                  <option key={x.Surface_Key} value={x.Surface_Key}>{x.Label}</option>
                ))}
              </select>
            )}

            <MenuBar>
              {({ open, setOpen }) => (
                <>
                  <Menu id="setup" label="Setup" open={open} setOpen={setOpen}>
                    <MenuItem label={basemap?.Metres_Per_Pixel ? "Background Plan" : "Set Up Plan & Scale"}
                      hint={basemap?.Metres_Per_Pixel ? "Scaled" : "Not set yet"}
                      onClick={() => setSetupOpen(true)} />
                    <MenuItem label={tool === "boundary" ? "Drawing Boundary\u2026" : "Draw Site Boundary"}
                      active={tool === "boundary"}
                      hint="Classifies runs as on or off site"
                      onClick={() => {
                        setTool(tool === "boundary" ? "select" : "boundary");
                        setSelected([]); setDraft([]);
                      }} />
                    {/* Developer areas.

                        Only where there is more than one developer: with
                        one, everything on the site is theirs already and
                        an area would be a division of nothing. The whole
                        block is absent rather than disabled, because a
                        greyed-out item invites the question of how to
                        enable it. */}
                    {developers.length > 1 && (
                      <>
                        <div className="gm-sep" />
                        <MenuGroup label="Developers" />
                        {developers.map((d) => {
                          const drawn = developerAreas(features)
                            .some((a) => Number(a.id) === Number(d.Project_Developer_ID));
                          const on = tool === "devarea"
                            && Number(areaFor) === Number(d.Project_Developer_ID);
                          return (
                            <MenuItem key={d.Project_Developer_ID}
                              label={on ? `Drawing ${d.label}\u2026` : `Draw ${d.label} Area`}
                              hint={drawn ? "An area is already drawn \u2014 this adds another"
                                : "Outline the ground that is theirs"}
                              active={on}
                              onClick={() => {
                                setAreaFor(d.Project_Developer_ID);
                                setTool(on ? "select" : "devarea");
                                setSelected([]); setDraft([]);
                              }} />
                          );
                        })}
                        <MenuItem label={busy === "developer" ? "Assigning\u2026" : "Assign by Developer Area"}
                          hint="Splits anything crossing an area edge. Substations, POCs and the incomer are left alone."
                          disabled={!!busy || !developerAreas(features).length}
                          onClick={assignByDeveloper} />
                        <div className="gm-sep" />
                      </>
                    )}

                    {/* One item, not two. Adding plots and placing them
                        were separate entries opening much the same thing;
                        the modal already offers both, so the menu should
                        offer the job rather than the two halves of it. */}
                    <MenuItem label="Plots"
                      hint={`${plotList.filter((p) => !p.placed).length} still to place`}
                      active={placeOpen || queue.length > 0}
                      onClick={() => setPlaceOpen(true)} />
                    <div className="gm-sep" />
                    <MenuGroup label="Drawing Standard" />
                    <div className="gm-item" style={{ padding: "2px 9px 6px" }}>
                      <select className="gis-type" value={standard} aria-label="Drawing Standard"
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
                    <MenuItem label="Snap to Geometry" active={snapOn}
                      onClick={() => setSnapOn(!snapOn)} />
                    <MenuItem label="Classify Against the Boundary…"
                      hint="Set on-site / off-site on what is already drawn"
                      disabled={!projectId || !!busy}
                      onClick={previewClassification} />
                    <MenuItem label="Grid" active={showGrid}
                      hint={`${GRID_M} m spacing`}
                      onClick={() => setShowGrid(!showGrid)} />
                    <MenuItem label="Reset View"
                      onClick={() => setView({ x: 60, y: 60, scale: 4 })} />
                  </Menu>

                  {/* Two columns: what is shown on the left, what is
                      locked and the tools on the right.

                      One list meant the lock rows sat below the fold on
                      a laptop, and locking a layer is exactly the thing
                      somebody opens this menu to do. */}
                  <Menu id="layers" label="Layers" open={open} setOpen={setOpen}
                    columns={2}>
                    {/* Above the layers, not below them.

                        It undoes whatever hiding is in force, so it is
                        the first thing wanted by somebody who has lost
                        track of what is off — and it was at the foot of
                        a list they would have to scroll to reach.

                        Under a heading of its own, so both columns start
                        with one and the two line up — a column beginning
                        with a button against one beginning with a
                        heading sits a few pixels out and reads as a
                        wobble. */}
                    <MenuGroup label="Everything" />
                    <MenuItem label="Show Everything"
                      disabled={!hidden.length && isolatedCircuit == null
                        && !liveTrenchOnly
                        && (showBasemap || !basemap?.Metres_Per_Pixel)}
                      hint="Unhides every layer and ends any circuit isolation"
                      onClick={() => {
                        setHidden([]); setSolo(null); setShownOnly([]); setIsolatedCircuit(null);
                        setShowBasemap(true); setLiveTrenchOnly(false);
                      }} />
                    <div className="gm-sep" />
                    <MenuGroup label="Show or Hide" />
                    <p className="gm-note">
                      H hides a layer and hides it again to bring it back.
                      S shows only the layers whose S is lit — as many as you
                      like. I is the same with room for one. The same switches
                      as on the other menus.
                    </p>

                    {/* ── The order ──

                        Listed the way somebody reads a drawing rather
                        than in the order the layers were added to the
                        database: the plan underneath, then what bounds
                        the site, then what is being built on it, then
                        the utilities, then the writing on top.

                        Held as a list of keys rather than a Sort_Order
                        column, because two of these rows are not layers
                        at all — the boundaries are one layer split in
                        two, and span nodes are a role — and a column
                        could not order them among the rest.

                        Anything not named here still appears, after the
                        ones that are. A layer added later should show up
                        somewhere obvious rather than not at all. */}
                    {(() => {
                      const ORDER = ["trench", "electric", "gas", "water", "lighting", "note"];
                      const RENAME = { plot: "Plot Seeds" };
                      const named = new Set([...ORDER, "plot", "boundary"]);
                      const rowFor = (l) => (
                        <MenuLayer key={l.Layer_Key} label={RENAME[l.Layer_Key] ?? l.Label}
                          colour={l.Colour}
                          count={classCount[l.Layer_Key] || 0}
                          hidden={hidden.includes(l.Layer_Key)}
                          solo={solo === l.Layer_Key}
                          onHide={() => hideClass(l.Layer_Key)}
                          onShow={() => showClass(l.Layer_Key)}
                          shown={shownOnly.includes(l.Layer_Key)}
                          onSolo={() => soloClass(l.Layer_Key)} />
                      );
                      const byKey = (k) => layers.find((l) => l.Layer_Key === k);
                      const plot = byKey("plot");
                      return (
                        <>
                          {/* The survey underneath everything. Only when
                              one is attached — an entry for a plan that
                              does not exist is a control that does
                              nothing. */}
                          {basemap?.Metres_Per_Pixel && (
                            <MenuLayer label="Background Plan" colour="#94a3b8"
                              count={1}
                              /* Only its own H can hide it — no pick
                                 sweeps it away — so the row reads from
                                 that one switch. */
                              hidden={!showBasemap}
                              solo={solo === BASEMAP_KEY}
                              shown={shownOnly.includes(BASEMAP_KEY)}
                              /* H toggles. Hiding it while it is one of
                                 the picks takes it off that list too,
                                 otherwise S stays lit over a plan that
                                 is not on screen — and dropping the
                                 only pick brings the drawing back,
                                 which is what H does everywhere else. */
                              onHide={() => {
                                if (showBasemap && shownOnly.includes(BASEMAP_KEY)) {
                                  applyShown(shownOnly.filter((x) => x !== BASEMAP_KEY));
                                }
                                setShowBasemap((v) => !v);
                              }}
                              onShow={() => {
                                /* Picking it also undoes its own H.
                                   Otherwise S would light up and
                                   nothing would appear, because the
                                   other switch was still off. */
                                setShowBasemap(true);
                                showClass(BASEMAP_KEY);
                              }}
                              onSolo={() => {
                                setShowBasemap(true);
                                soloClass(BASEMAP_KEY);
                              }} />
                          )}

                          {/* The two boundaries separately, and the
                              layer they share not at all.

                              That layer had a row of its own, which is
                              the second Site Boundary in this menu: one
                              entry hid the red line and the developer
                              areas together, the other hid only the red
                              line, and both were called the same thing.
                              The layer row is gone; these two cover
                              everything on it between them. */}
                          <MenuLayer label="Site Boundary" colour={byKey("boundary")?.Colour}
                            count={classCount["boundary:site"] || 0}
                            hidden={hidden.includes("boundary:site")}
                            solo={solo === "boundary:site"}
                            onHide={() => hideClass("boundary:site")}
                            onShow={() => showClass("boundary:site")}
                            shown={shownOnly.includes("boundary:site")}
                            onSolo={() => soloClass("boundary:site")} />
                          <MenuLayer label="Developer Boundary" colour={byKey("boundary")?.Colour}
                            count={classCount["boundary:dev"] || 0}
                            hidden={hidden.includes("boundary:dev")}
                            solo={solo === "boundary:dev"}
                            onHide={() => hideClass("boundary:dev")}
                            onShow={() => showClass("boundary:dev")}
                            shown={shownOnly.includes("boundary:dev")}
                            onSolo={() => soloClass("boundary:dev")} />

                          {plot && rowFor(plot)}

                          <MenuLayer label="Span Nodes" colour="#334155"
                            count={classCount["role:spannode"] || 0}
                            hidden={hidden.includes("role:spannode")}
                            solo={solo === "role:spannode"}
                            onHide={() => hideClass("role:spannode")}
                            onShow={() => showClass("role:spannode")}
                            shown={shownOnly.includes("role:spannode")}
                            onSolo={() => soloClass("role:spannode")} />

                          {ORDER.map(byKey).filter(Boolean).map(rowFor)}
                          {layers.filter((l) => !named.has(l.Layer_Key)).map(rowFor)}
                        </>
                      );
                    })()}

                    <div className="gm-sep" />
                    {/* Moved from Tools rather than added there as well:
                        two controls for one setting is how they drift out
                        of step. This menu is what you can see, and a
                        label is something you can see. */}
                    {/* Way and circuit labels are part of the Labels
                        layer now — this switched the same thing under a
                        narrower name, which is how someone turns off
                        "way and circuit labels" and loses plot numbers
                        with no idea why. */}

                    <div className="gm-sep" />
                    {/* Labelling as a layer.

                        Plot numbers, joint names, way and circuit
                        labels, and the letters repeated along a run —
                        all of it off together. On a dense estate the
                        labels cover the geometry they describe, and
                        turning them off one kind at a time is four
                        decisions to make the one you wanted. */}
                    <div className="gm-sep" />
                    <MenuGroup label="Labels" newColumn />
                    {/* Under its own heading, and shaped like every other
                        layer row.

                        It had drifted below the locked section, leaving
                        the Labels heading with nothing under it and the
                        control itself unexplained where it landed. And
                        it was a plain item where its neighbours are
                        layers with an H button — the same question asked
                        two different ways in one menu. */}
                    <MenuLayer label="Labels" colour="#64748b"
                      hidden={!showLabels}
                      onHide={() => setShowLabels(false)}
                      onShow={() => setShowLabels(true)} />

                    <div className="gm-sep" />
                    <MenuGroup label="Locked against moving" />
                    {/* Per layer, which is the coarsest and most useful
                        grain: a layer is usually finished all at once.
                        Line types are locked from the right-click menu,
                        where the thing being locked is under the cursor. */}
                    {layers.filter((l) => classCount[l.Layer_Key]).map((l) => {
                      const isLocked = lockedClasses.includes(l.Layer_Key);
                      return (
                        <MenuItem key={l.Layer_Key}
                          /* A padlock, not only a highlight.

                             Highlighting alone says "this row is
                             different" and leaves which way round to be
                             guessed — on a list where some are locked
                             and some are not, the highlighted ones read
                             as selected as easily as locked. An open
                             padlock on the rest keeps the column
                             aligned, so the two states are read by
                             shape rather than by which rows have an
                             icon at all. */
                          /* A padlock only where it is locked.

                             The open and closed padlock glyphs are very
                             nearly the same shape at menu size, so
                             showing both left the two states harder to
                             tell apart than showing one. An unlocked row
                             gets a space of the same width instead, so
                             the names still line up and the icon is a
                             presence rather than a shape to squint at. */
                          label={`${isLocked ? "\uD83D\uDD12" : "\u2003"}  ${l.Label}`}
                          active={isLocked}
                          keepOpen
                          hint={isLocked
                            ? "Locked \u2014 cannot be moved"
                            : "Unlocked \u2014 can be moved"}
                          onClick={() => setLockedClasses((x) =>
                            toggleClassLock(x, l.Layer_Key))} />
                      );
                    })}
                    <div className="gm-sep" />

                    {/* Circuit rings are controlled from the circuit
                        report, which is where the question they answer
                        is being asked. Two controls for one setting is
                        one more place to look when it does not work. */}

                    {/* Everything back, whatever put it away.

                        Circuit isolation is held apart from the hidden
                        set so the two do not undo each other, and this
                        was the cost of that: with a circuit isolated and
                        nothing else hidden, the one item that brings
                        things back was greyed out, and the only way out
                        was a right-click on a feature of the isolated
                        circuit. Anyone who could not find one was stuck
                        with meters they could not see and no way to say
                        so. */}
                    {/* Find is on the toolbar now, beside Tools &
                        Reporting. It was in here because the layer
                        menu is where hiding things happens and finding
                        one is the other half of that — but it is not a
                        layer control, and it was two clicks deep for
                        something reached constantly. */}

                    {/* The background plan counts as hidden too.

                        It is listed with the layers, so leaving it off
                        while saying everything is shown is the same
                        quiet inconsistency as the circuit isolation this
                        already had to be taught about. */}
                  </Menu>

                  {/* Two columns, grouped by what somebody is doing.

                      One list of sixteen actions with "Route" and "Show
                      or Hide" each appearing twice, and the off-site
                      items filed under "Route" — the order was an
                      accident of the order they were added in, and it
                      had grown past the height of the screen.

                      Drawing and marking on the left, routing and
                      checking on the right. */}
                  <Menu id="trench" label="Trench" open={open} setOpen={setOpen}
                    columns={2}>
                    <MenuGroup label="Draw" />
                    {typesOn("trench").map((t) => (
                      <MenuItem key={t.Type_Key} label={t.Label} indent
                        active={isDrawing(t.Type_Key)}
                        onClick={() => drawAs(t.Type_Key)} />
                    ))}

                    {/* Build status and Off site were here, as a set of
                        buttons that marked whatever was selected. Both
                        are properties of one object, and the trench
                        editor is where an object's properties are set —
                        two ways to change one field is two places for
                        them to disagree, and the menu was the one with
                        no record of what it had just changed. */}

                    <div className="gm-sep" />
                    <MenuGroup label="Show or Hide" />
                    <MenuLayer label="Span nodes" colour="#1e3a5f"
                      count={classCount["role:spannode"] || 0}
                      hidden={hidden.includes("role:spannode")}
                      solo={solo === "role:spannode"}
                      onHide={() => hideClass("role:spannode")}
                      onShow={() => showClass("role:spannode")}
                      shown={shownOnly.includes("role:spannode")}
                      onSolo={() => soloClass("role:spannode")} />
                    {typesOn("trench").map((t) => (
                      <MenuLayer key={t.Type_Key} label={t.Label} colour={t.Colour}
                        count={classCount[`lt:${t.Type_Key}`] || 0}
                        hidden={hidden.includes(`lt:${t.Type_Key}`)}
                        solo={solo === `lt:${t.Type_Key}`}
                        onHide={() => hideClass(`lt:${t.Type_Key}`)}
                      onShow={() => showClass(`lt:${t.Type_Key}`)}
                      shown={shownOnly.includes(`lt:${t.Type_Key}`)}
                        onSolo={() => soloClass(`lt:${t.Type_Key}`)} />
                    ))}

                    {/* The second column. */}
                    <MenuGroup label="Span nodes and call-offs" newColumn />
                    <MenuItem label="Place Span Nodes"
                      hint="At every junction and end of the trench network, A1 upwards"
                      disabled={!!busy || !projectId}
                      onClick={placeSpanNodes} />
                    <MenuItem label="New Mains Call-off"
                      hint="Pick two span nodes for each run to be laid"
                      active={callOffOpen}
                      disabled={!!busy || !projectId}
                      onClick={() => {
                        setCallOffOpen(!callOffOpen);
                        setPick(null);
                        setAskAnother(false);
                        if (callOffOpen) setRanges([]);
                      }} />

                    {/* Routing was here: Trace All Meters, Step Through
                        Traces, Suggest Trench Route, Only Live Trench.

                        The code behind them is still in this file and is
                        now unreachable — nothing else opens a trace.
                        Left rather than torn out, because deleting four
                        features' worth of working machinery on the
                        strength of a menu change is a bigger decision
                        than a menu change. */}

                    <div className="gm-sep" />
                    <MenuGroup label="Services" />
                    <MenuItem label={busy === "autoservice" ? "Auto Service\u2026" : "Auto Service"}
                      hint="Draw the service trench and cable for every meter without one"
                      disabled={!!busy || !projectId}
                      onClick={() => withUndo("Auto Service", runAutoService)} />
                    <MenuItem label="Check Services Reach the Mains"
                      disabled={!projectId}
                      onClick={() => setSvcCheck(serviceTrenchCheck(features, { lineTypes }))} />

                    <div className="gm-sep" />
                    <MenuGroup label="Checks" />
                    <MenuItem label="Check Trench Joins"
                      hint="Trench ends close to another trench but not joined"
                      disabled={!!busy || !projectId}
                      onClick={findGaps} />
                    <MenuItem label="Check Trench Connectivity"
                      disabled={!projectId}
                      onClick={() => setTrenchCheck(trenchComponents(features, { lineTypes }))} />
                  </Menu>

                  <Menu id="electric" label="Electric" open={open} setOpen={setOpen} columns={2}>
                    <MenuGroup label="Show or Hide" />
                    {/* The whole utility at once, as a named action rather
                        than the S beside a row. Isolating one utility is
                        the common gesture on a busy drawing — everything
                        electric, nothing else — and reaching it meant
                        knowing that S on a layer row did that.

                        The same soloClass the rows use, so pressing it
                        twice restores everything and it cannot disagree
                        with the S buttons about what is isolated. */}
                    <MenuItem label={solo === "electric" ? "Show all layers" : "Isolate Electric"}
                      hint={solo === "electric"
                        ? "Bring back everything that was hidden"
                        : "Show only electric objects, hiding every other utility"}
                      active={solo === "electric"}
                      disabled={!(classCount.electric > 0)}
                      onClick={() => soloClass("electric")} />
                    <div className="gm-sep" />
                    {/* POC and substation first: they are the two fixed
                        points a designer orients by, and everything else
                        is described relative to them. */}
                    {[["poc", "POCs"], ["substation", "Substations"]].map(([role, label]) => (
                      <MenuLayer key={role} label={label}
                        count={classCount[`role:${role}`] || 0}
                        hidden={hidden.includes(`role:${role}`)}
                        solo={solo === `role:${role}`}
                        onHide={() => hideClass(`role:${role}`)}
                      onShow={() => showClass(`role:${role}`)}
                      shown={shownOnly.includes(`role:${role}`)}
                        onSolo={() => soloClass(`role:${role}`)} />
                    ))}
                    {typesOn("electric").map((t) => (
                      <MenuLayer key={t.Type_Key} label={t.Label} colour={t.Colour}
                        count={classCount[`lt:${t.Type_Key}`] || 0}
                        hidden={hidden.includes(`lt:${t.Type_Key}`)}
                        solo={solo === `lt:${t.Type_Key}`}
                        onHide={() => hideClass(`lt:${t.Type_Key}`)}
                      onShow={() => showClass(`lt:${t.Type_Key}`)}
                      shown={shownOnly.includes(`lt:${t.Type_Key}`)}
                        onSolo={() => soloClass(`lt:${t.Type_Key}`)} />
                    ))}
                    <MenuLayer label="Electric Meters"
                      count={classCount["electric:role:meter"] || 0}
                      hidden={hidden.includes("electric:role:meter")}
                      solo={solo === "electric:role:meter"}
                      onHide={() => hideClass("electric:role:meter")}
                      onShow={() => showClass("electric:role:meter")}
                      shown={shownOnly.includes("electric:role:meter")}
                      onSolo={() => soloClass("electric:role:meter")} />
                    {[["joint", "Joints"], ["linkbox", "Link boxes"],
                      ["spannode", "Span nodes"]].map(([role, label]) => (
                        <MenuLayer key={role} label={label}
                          count={classCount[`role:${role}`] || 0}
                          hidden={hidden.includes(`role:${role}`)}
                          solo={solo === `role:${role}`}
                          onHide={() => hideClass(`role:${role}`)}
                      onShow={() => showClass(`role:${role}`)}
                      shown={shownOnly.includes(`role:${role}`)}
                          onSolo={() => soloClass(`role:${role}`)} />
                      ))}
                    {/* The layer as a whole, matching the row the gas and
                        water menus end with. Hiding it takes everything
                        electric with it, including anything above that is
                        currently shown. */}
                    <div className="gm-sep" />
                    <MenuLayer label="Whole Electric layer"
                      colour={layers.find((l) => l.Layer_Key === "electric")?.Colour}
                      count={classCount.electric || 0}
                      hidden={hidden.includes("electric")}
                      solo={solo === "electric"}
                      onHide={() => hideClass("electric")}
                      onShow={() => showClass("electric")}
                      shown={shownOnly.includes("electric")}
                      onSolo={() => soloClass("electric")} />

                    <div className="gm-sep" />
                    <MenuGroup label="Network" newColumn />
                    <MenuItem label="+ POC" hint="Snaps to the nearest main"
                      disabled={!projectId} onClick={() => placeNode("poc", "electric")} />
                    <MenuItem label="+ Substation" hint="Snaps to the nearest trench"
                      disabled={!projectId} onClick={() => placeNode("substation", "electric")} />
                    <MenuItem label={busy === "route" ? "Routing\u2026" : "Route POC to Substation"}
                      hint="Shortest path along the trenches, as HV feeder"
                      disabled={!!busy || !projectId}
                      onClick={routeSupply} />

                    <MenuGroup label="Draw" />
                    {[["elec_main", "LV feeder"], ["elec_hv", "HV feeder"]].map(([key, label]) => {
                      const t = lineTypes.find((x) => x.Type_Key === key);
                      return t ? (
                        <MenuItem key={key} label={label} indent
                          active={isDrawing(key)} onClick={() => drawAs(key)} />
                      ) : null;
                    })}

                    <MenuItem label={tool === "circuit" ? "Drawing Circuit\u2026" : "Link to Circuit"}
                      active={tool === "circuit"} disabled={!projectId}
                      hint="Draw round the plot seeds it serves"
                      onClick={() => {
                        setTool(tool === "circuit" ? "select" : "circuit");
                        setSelected([]); setDraft([]);
                      }} />
                    <MenuItem label={busy === "feeder" ? "Building\u2026" : "Build LV Network"}
                      hint="Routes each circuit's cables along the trenches"
                      disabled={busy === "feeder" || !circuitsFrom(features).length}
                      onClick={() => withUndo("Build LV Network", () => buildLvNetwork())} />
                    <MenuItem label={busy === "joints" ? "Working\u2026" : "Place Feeder Joints"}
                      hint="Breech where a feeder divides, service where a service leaves it, straight where the cable changes"
                      disabled={!!busy || !circuitsFrom(features).length}
                      onClick={() => withUndo("Place Feeder Joints", () => placeFeederJoints())} />
{/* The older Place Joints is gone. It grouped coincident line ends
                        across every utility, so it could not tell a feeder from a
                        water main, wrote no Feature_Role, and put what it made on
                        the trench layer — where nothing in the application
                        recognised it as a joint. Place Feeder Joints above does
                        the same job from the routed network and writes the layer,
                        role, type and code properly. */}

                    <div className="gm-sep" />
                    <MenuGroup label="Tools & Reporting" />
                    <MenuItem label="Suggest Circuit Groups"
                      hint="Rings the meters by proposed group. Nothing is created until you accept."
                      disabled={!!busy || !projectId}
                      onClick={suggestGroups} />
                    <MenuItem label="Circuit Report"
                      hint="Meters by feeder, with distances from the substation"
                      disabled={!features.some((f) => f.Feature_Role === "substation")}
                      onClick={() => setReportOpen(true)} />
                    {/* Every circuit, from its own origin node outward.

                        Nothing has to be selected: the question is
                        whether anything on the scheme is outside its
                        limits, which is about the design rather than
                        about a point in it. Tracing from one selected
                        node answered a narrower question and left the
                        rest of the drawing unchecked. */}
                    <MenuItem label="Run Levels Check"
                      hint="Loop impedance and volt drop on every circuit, from the substation"
                      disabled={!circuitsFrom(features).length}
                      onClick={() => runLevelsCheck()} />
                    {/* The same figures, reported at every place the
                        network does something rather than only where a
                        span node was placed — so a service joint has a
                        row of its own. Same walk and the same sums; only
                        where a leg ends differs. */}
                    <MenuItem label="Advanced Levels Check"
                      hint="Every junction, including each service joint"
                      disabled={!circuitsFrom(features).length}
                      onClick={() => runLevelsCheck({ stopAt: "junctions" })} />
                    <MenuItem label="Apply Cable Sizes to Span Nodes"
                      hint="Sets each span node's cable to match the run feeding it — that is what the trace reads"
                      disabled={!!busy}
                      onClick={() => withUndo("Apply cable sizes to span nodes", syncNodeCables)} />
                  </Menu>

                  {/* Gas and Water, the two menus built from the layer
                      list rather than written out.

                      The fallback is the name, not the key. It was the
                      key — so for the second or two between the canvas
                      mounting and the layers arriving, the bar read
                      "gas" and "water" in lower case beside Electric
                      and Street Lighting, and then changed under the
                      reader. A menu heading that rewrites itself looks
                      like a fault whatever it settles on.

                      Written out rather than capitalised from the key,
                      on the same argument the bill makes for its role
                      names: "Gas" is a fact about what the thing is
                      called, not about the string 'gas', and a key that
                      needs two words or an acronym would come out
                      wrong. The layer's own Label still wins the moment
                      it loads, so renaming one in Admin still works. */}
                  {[["gas", "Gas"], ["water", "Water"]].map(([key, name]) => {
                    const layer = layers.find((l) => l.Layer_Key === key);
                    return (
                      <Menu key={key} id={key} label={layer?.Label ?? name}
                        open={open} setOpen={setOpen}>
                        <MenuGroup label="Show or Hide" />
                        {/* As on the Electric menu: the whole utility as
                            a named action, not only the S on the layer
                            row below. */}
                        <MenuItem
                          label={solo === key
                            ? "Show all layers"
                            : `Isolate ${layer?.Label ?? name}`}
                          hint={solo === key
                            ? "Bring back everything that was hidden"
                            : `Show only ${layer?.Label ?? name} objects, hiding every other utility`}
                          active={solo === key}
                          disabled={!(classCount[key] > 0)}
                          onClick={() => soloClass(key)} />
                        <div className="gm-sep" />
                        {typesOn(key).map((t) => (
                          <MenuLayer key={t.Type_Key} label={t.Label} colour={t.Colour}
                            count={classCount[`lt:${t.Type_Key}`] || 0}
                            hidden={hidden.includes(`lt:${t.Type_Key}`)}
                            solo={solo === `lt:${t.Type_Key}`}
                            onHide={() => hideClass(`lt:${t.Type_Key}`)}
                      onShow={() => showClass(`lt:${t.Type_Key}`)}
                      shown={shownOnly.includes(`lt:${t.Type_Key}`)}
                            onSolo={() => soloClass(`lt:${t.Type_Key}`)} />
                        ))}
                        <MenuLayer label="Meters"
                          count={classCount[`${key}:role:meter`] || 0}
                          hidden={hidden.includes(`${key}:role:meter`)}
                          solo={solo === `${key}:role:meter`}
                          onHide={() => hideClass(`${key}:role:meter`)}
                      onShow={() => showClass(`${key}:role:meter`)}
                      shown={shownOnly.includes(`${key}:role:meter`)}
                          onSolo={() => soloClass(`${key}:role:meter`)} />
                        <div className="gm-sep" />
                        {/* The fixed plant on this utility. Gas has a
                            governor where electric has a substation —
                            the point the incoming supply is reduced and
                            metered before it feeds the site. Offered on
                            gas alone, since nothing else has one. */}
                        <div className="gm-sep" />
                        <MenuGroup label="Network" />
                        <MenuItem label="+ POC" hint="Snaps to the nearest main"
                          disabled={!projectId}
                          onClick={() => placeNode("poc", key)} />
                        {key === "gas" && (
                          <MenuItem label="+ Gas Governor" hint="Snaps to the nearest trench"
                            disabled={!projectId}
                            onClick={() => placeNode("governor", key)} />
                        )}
{/* Gas and water each build their own.

                            They looked like one routine with a layer
                            argument, and stopped looking like it the
                            moment water needed sizing: gas covers the
                            trench, water covers it and works out what
                            diameter each length is from the plots
                            beyond. Two modules sharing their walk
                            rather than one with a flag deciding
                            whether half of it runs. */}
                        {key === "gas" && (
                          <MenuItem
                            label={busy === "gasnet" ? "Building\u2026" : "Build Gas Network"}
                            hint="Lays gas main from the POC along mains trench that has a gas service to a meter beyond it. Needs a gas design and a gas asset value agreement"
                            disabled={!projectId || !!busy}
                            onClick={() => withUndo("Build Gas Network", () => buildGasNetwork())} />
                        )}
                        {/* Beside the build, because it reads what the
                            build laid: the sizes on the drawing are
                            what each length's drop is worked out from.
                            It was under Electric with the volt drop
                            check, which put a gas answer behind an
                            electric heading. */}
                        {key === "gas" && (
                          <MenuItem label={busy === "gaslevels"
                            ? "Checking\u2026" : "Run Gas Levels Check"}
                            hint="Pressure at every span node, from the gas POC's output pressure"
                            disabled={!!busy || !features.some((f) =>
                              f.Feature_Role === "poc" && f.Layer_Key === "gas")}
                            onClick={() => runGasLevelsCheck()} />
                        )}
                        {key === "water" && (
                          <MenuItem label="+ Service Valve"
                            hint="Snaps to the nearest water main and takes its angle"
                            disabled={!projectId}
                            onClick={() => placeNode("servicevalve", "water")} />
                        )}
                        {key === "water" && (
                          <MenuItem
                            label={busy === "waternet" ? "Building\u2026" : "Build Water Network"}
                            hint="Lays water main from the POC along mains trench, sized by the plots each length feeds. Needs a water outline design and a Water NAV Clean agreement"
                            disabled={!projectId || !!busy}
                            onClick={() => withUndo("Build Water Network", () => buildWaterNetwork())} />
                        )}

                        <div className="gm-sep" />
                        <MenuLayer label={`Whole ${layer?.Label ?? key} layer`}
                          colour={layer?.Colour} count={classCount[key] || 0}
                          hidden={hidden.includes(key)}
                          solo={solo === key}
                          onHide={() => hideClass(key)}
                      onShow={() => showClass(key)}
                      shown={shownOnly.includes(key)}
                          onSolo={() => soloClass(key)} />
                      </Menu>
                    );
                  })}

                  <Menu id="lighting" label="Street Lighting" open={open} setOpen={setOpen}>
                    <MenuGroup label="Show or Hide" />
                    {typesOn("lighting").map((t) => (
                      <MenuLayer key={t.Type_Key} label={t.Label} colour={t.Colour}
                        count={classCount[`lt:${t.Type_Key}`] || 0}
                        hidden={hidden.includes(`lt:${t.Type_Key}`)}
                        solo={solo === `lt:${t.Type_Key}`}
                        onHide={() => hideClass(`lt:${t.Type_Key}`)}
                      onShow={() => showClass(`lt:${t.Type_Key}`)}
                      shown={shownOnly.includes(`lt:${t.Type_Key}`)}
                        onSolo={() => soloClass(`lt:${t.Type_Key}`)} />
                    ))}
                    <MenuLayer label="Columns" count={classCount["role:column"] || 0}
                      hidden={hidden.includes("role:column")}
                      solo={solo === "role:column"}
                      onHide={() => hideClass("role:column")}
                      onShow={() => showClass("role:column")}
                      shown={shownOnly.includes("role:column")}
                      onSolo={() => soloClass("role:column")} />
                    {!typesOn("lighting").length && (
                      <MenuItem label="Lighting Layer Missing" hint="run migration 0072" disabled />
                    )}
                  </Menu>

                  <Menu id="tools" label="Tools & Reporting" open={open} setOpen={setOpen}>
                    <MenuItem label="Bill of Materials"
                      hint="Quantities by site, utility and surface"
                      disabled={!projectId} onClick={() => setBomOpen(true)} />
                    <div className="gm-sep" />
                    <MenuGroup label="Network" />
                    {/* Number Ways and Circuits is hidden rather than
                        removed.

                        It predates the circuit and feeder work: for
                        electric, Build LV Network now assigns real
                        circuits and their ways, and all the tracer adds
                        is a hop count nothing reads. Its remaining use is
                        gas and water, where there are no circuits and
                        "which main leaves the source" is the right
                        question — so the code, the endpoint and the
                        function stay, and this is one line to restore.

                        runNetwork("trace") is still called by the context
                        menu on a point, which is deliberate: it is
                        reachable when wanted without sitting in a menu
                        that is otherwise about circuits. */}
                    <MenuItem label={busy === "meters" ? "Working\u2026" : "Assign Meters"}
                      hint="Match meters to their plots"
                      disabled={!!busy} onClick={() => runNetwork("meters")} />
                    <div className="gm-sep" />
                    <MenuGroup label="Selection" />
                    <MenuItem label={`Edit ${selected.length}`}
                      disabled={selected.length < 2 || !selectionClass}
                      hint={selected.length > 1 && !selectionClass
                        ? "Everything selected has to be the same kind of thing" : undefined}
                      onClick={() => setBulkOpen(true)} />
                    <MenuItem label={busy === "join" ? "Joining\u2026" : `Join ${selected.length}`}
                      disabled={!joinable || busy === "join"} onClick={joinSelected} />
                    <MenuItem label={`Delete ${selected.length}`} danger
                      disabled={!selected.length} onClick={removeSelected} />
                    <MenuItem label="Bulk Delete…" danger
                      hint="Whole categories at once"
                      disabled={!projectId || !features.length}
                      onClick={() => setBulkDelOpen(true)} />
                  </Menu>

                  {/* Find, as a box on the bar rather than a button
                      that opens one.

                      It was a dialog, which meant a click to open, a
                      type, a click to close, and a panel sitting over
                      the top-left of the drawing while you read it.
                      Finding a plot is not a task with a beginning and
                      an end — it is something done twenty times in a
                      session, between other things — so the field is
                      simply there, and the results hang under it only
                      while there is something typed.

                      The wrapper is what the results are positioned
                      against, so the list follows the box wherever the
                      bar wraps to. */}
                  <div className="gis-findbox">
                    <input className="gis-find-in" value={findQ} ref={findRef}
                      placeholder="&#128269; Plot 34, A12, substation&hellip;"
                      aria-label="Find a feature"
                      /* Examples rather than a list of the fields it
                         searches. It read "Find a plot, span or kind",
                         and "kind" is this file's word for what a thing
                         is — the line type's label, or the role — not a
                         word anybody would use out loud, so it named
                         the implementation and left the reader none the
                         wiser about what to type.

                         Three examples cover the three ways in: a plot
                         number, a span code, and the name of a kind of
                         thing. The tooltip spells it out for anyone who
                         wants the full answer. */
                      title={"Find by plot number, span code, label, or what a thing is"
                        + " \u2014 34, A12, substation, service trench (Ctrl/Cmd + F)"}
                      onFocus={() => setFindFocus(true)}
                      onBlur={() => setFindFocus(false)}
                      onChange={(e) => setFindQ(e.target.value)}
                      onKeyDown={(e) => {
                        /* Escape clears rather than closes: there is
                           nothing to close now, and a box holding a
                           search nobody can see the results of is the
                           thing to get rid of. */
                        if (e.key === "Escape") { setFindQ(""); e.currentTarget.blur(); return; }
                        /* Enter takes the first result, so a plot number
                           and a return key is the whole interaction. */
                        if (e.key === "Enter" && found.shown[0]) {
                          const f = found.shown[0].feature;
                          setSelected([f.Feature_ID]);
                          zoomTo([f.Feature_ID]);
                          setTool("select");
                        }
                      }} />
                    {findQ && (
                      <button className="gf-x" onClick={() => { setFindQ(""); findRef.current?.focus(); }}
                        aria-label="Clear find">&times;</button>
                    )}

                    {findQ && (
                      <div className="gf-list"
                        /* Keeps the cursor in the box when a row is
                           clicked. Without it the input blurs first,
                           the strays list unmounts under the pointer,
                           and the click lands on nothing. */
                        onMouseDown={(e) => e.preventDefault()}>
                        {!found.shown.length && (
                          <p className="gf-none">Nothing matches that.</p>
                        )}
                        {found.shown.map((r) => (
                          <button key={r.feature.Feature_ID} className="gf-row"
                            onClick={() => {
                              setSelected([r.feature.Feature_ID]);
                              zoomTo([r.feature.Feature_ID]);
                              setTool("select");
                            }}>
                            <span className="gf-l">{r.label}</span>
                            <span className="gf-w">{r.where}</span>
                          </button>
                        ))}
                        {found.total > found.shown.length && (
                          <p className="gf-more">
                            and {found.total - found.shown.length} more &mdash; narrow it down
                          </p>
                        )}
                      </div>
                    )}

                    {/* Offered without being asked for, because somebody
                        who clicks into Find often does not know what is
                        missing — only that something is. */}
                    {!findQ && wanderers.length > 0 && (
                      <div className="gf-list" onMouseDown={(e) => e.preventDefault()}>
                        <p className="gf-none">
                          {wanderers.length} feature{wanderers.length === 1 ? "" : "s"} sitting
                          well away from the rest of the drawing:
                        </p>
                        {wanderers.slice(0, 10).map((f) => (
                          <button key={f.Feature_ID} className="gf-row"
                            onClick={() => {
                              setSelected([f.Feature_ID]);
                              zoomTo([f.Feature_ID]);
                              setTool("select");
                            }}>
                            <span className="gf-l">
                              {f.Label ?? f.Attributes?.Span_Label
                                ?? `${f.Feature_Role ?? f.Attributes?.Line_Type ?? "Feature"}`}
                            </span>
                            <span className="gf-w">{layerOf(f.Layer_Key)?.Label ?? ""}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

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
            /* The rings are one setting with two ways in — this and the
               Layers menu — so turning them on here shows the same thing
               and the menu agrees afterwards. */
            rings={circuitRings}
            onToggleRings={() => setCircuitRings(!circuitRings)}
            projectRef={project?.Project_Ref}
            siteName={project?.Site_Name}
            /* The capacity the whole drawing is working within, so the
               report can say when it has been exceeded rather than
               leaving it to be worked out. */
            pocOutput={poc?.Attributes?.Output != null && poc.Attributes.Output !== ""
              ? Number(poc.Attributes.Output) : null}
            onClose={() => setReportOpen(false)}
            busy={busy === "circuit"}
            onRemoveFromCircuit={(ids, c) =>
              withUndo(`Remove ${ids.length} meter(s) from ${c.name}`,
                () => removeFromCircuit(ids, c))}
            onDeleteCircuit={(c) => withUndo(`Delete ${c.name}`, () => deleteCircuit(c))}
            progress={circuitProgress}
            onCreateCircuit={(ids) =>
              withUndo("Assign meters to a new circuit",
                () => createCircuitFromMeters(ids))}
            onMoveToCircuit={(ids, target) =>
              withUndo(`Move ${ids.length} meter(s) to another circuit`,
                () => moveToCircuit(ids, target))}
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
            /* Framing it matters as much as selecting it: on an estate-sized
               plan the piece adrift is almost always off screen, and a
               selection you cannot see is not an answer. */
            zoomTo(ids);
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
          allFeatures={features}
          onSave={saveFeature}
          onSavePlot={savePlot}
          onRenameCircuits={renameCircuits}
          onIsolateCircuit={isolateCircuit}
          circuitIsolated={editing?.Attributes?.Circuit_ID != null
            && String(isolatedCircuit) === String(editing.Attributes.Circuit_ID)}
          onDelete={deleteFeature}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Beside the other modals, outside the canvas wrapper.

          That wrapper is overflow: hidden, so a fixed-position backdrop
          rendered inside it is clipped to the canvas box and never
          appears — which is exactly what happened when this sat with the
          on-canvas badges. Every other modal is here for the same
          reason.

          Drawn from the whole check rather than the filtered table: a
          schematic with the middle of every run missing is not one. */}
      {schematic && trace && (
        <SchematicModal trace={trace} onClose={() => setSchematic(false)}
          voltageV={Number(features.find((f) => f.Feature_Role === "substation")
            ?.Attributes?.Output_V) || 400} />
      )}

      {bulkDelOpen && projectId && (
        <BulkDelete
          features={features}
          lineTypes={lineTypes}
          layers={layers}
          busy={busy === "bulkdel"}
          onDelete={runBulkDelete}
          onClose={() => setBulkDelOpen(false)}
        />
      )}

      {bomOpen && projectId && (
        <BomModal
          projectId={projectId}
          projectName={project?.Project_Name ?? project?.Project_Ref}
          /* The layers carry the colour, resolved the same way the
             canvas resolves it; the Utility rows are only what turns a
             section's name into the layer it belongs to. */
          utilities={lookups?.utilities || []}
          layers={layers}
          /* On-site and off-site trench are coloured by resolving the
             same style rows the canvas draws them with, so the bill
             follows the GIS Styles screen rather than holding its own
             copy of the answer. */
          styles={styles}
          standard={standard}
          onClose={() => setBomOpen(false)}
        />
      )}

      {bulkOpen && selectedFeatures.length > 1 && (
        <BulkEditor
          features={selectedFeatures}
          configs={lookups?.propertyConfigs || []}
          propertyTypes={lookups?.propertyTypes || []}
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
              className={spaceHeld ? "grab"
                : drawing || placing ? "crosshair"
                : "pannable"}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={(e) => { e.currentTarget.releasePointerCapture?.(e.pointerId); onUp(); }}
              onPointerCancel={() => { drag.current = null; setEditVertex(null); }}
              onPointerLeave={() => { drag.current = null; setCursor(null); }}
              onContextMenu={(e) => {
                e.preventDefault();
                /* Right-click opens the menu on whatever is under the
                   cursor, and selects it — the options act on that
                   feature, so it has to be the one highlighted. */
                const r = e.currentTarget.getBoundingClientRect();
                const px = e.clientX - r.left;
                const py = e.clientY - r.top;
                const hit = featureAt(px, py);
                if (!hit) { setCtx(null); return; }
                setSelected([hit.Feature_ID]);
                setCtx({ feature: hit, atM: toM(px, py), px, py, x: px, y: py });
              }}
              onAuxClick={(e) => e.preventDefault()}
            />
            {picker && (
              /* Offered where the click landed, nudged in from the
                 edges so a click near the right or bottom doesn't put
                 the list off the canvas. */
              <div className="gis-picker" role="dialog" aria-label="Choose an Object"
                style={{
                  /* 300 = the picker's 290px plus a little air. Tied to
                     the width in the stylesheet: widening one without
                     the other puts the list off the right edge on a
                     click near it. */
                  left: Math.min(picker.x + 10, (wrapRef.current?.clientWidth ?? 900) - 300),
                  top: Math.min(picker.y + 10, (wrapRef.current?.clientHeight ?? 600) - 60
                    - picker.items.length * 30),
                }}>
                <p className="gp-head">{picker.items.length} objects here</p>
                {picker.items.map(({ feature: f, via }) => (
                  /* A row, not a button: selecting and editing are two
                     things you might want from the same object, and a
                     button cannot hold another button. Picking the row
                     still selects, so nothing that worked before has
                     changed. */
                  <div key={f.Feature_ID} className="gp-row"
                    onMouseEnter={() => setSelected([f.Feature_ID])}>
                    <button className="gp-item"
                      onClick={() => { setSelected([f.Feature_ID]); setPicker(null); }}>
                      <span className="gp-sw" style={{
                        /* Through seedStyle, like the canvas — the
                           swatch beside a plot has to be the colour the
                           plot is drawn in, and reading the seed's own
                           stale copy made the two disagree. */
                        background: f.Feature_Role === "plot"
                          ? seedStyle(f, false).colour
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
                    {/* Straight to the editor for this object. Where
                        several things sit on top of each other — a
                        substation with two cable ends on it, which is
                        exactly when this list appears — picking the one
                        you want and then finding it again to open it was
                        the same hunt twice. */}
                    <button className="gp-edit"
                      title={`Edit ${f.Label || classLabel(f, lineTypes) || "this object"}`}
                      onClick={() => {
                        setSelected([f.Feature_ID]);
                        setEditing(f);
                        setPicker(null);
                      }}>
                      Edit
                    </button>
                  </div>
                ))}
                <button className="gp-cancel" onClick={() => setPicker(null)}>
                  Cancel &middot; <kbd>Esc</kbd>
                </button>
              </div>
            )}

            {/* Anything not on screen says so.

                Hiding is easy to do and easy to forget, and the drawing
                gives no sign of it — features simply are not there, which
                looks exactly like features that were never drawn or have
                been deleted. Someone hunting for meters that are merely
                hidden has no way to tell which. So: a standing note of
                what is put away, and one click to bring it back. */}
            {/* The areas have moved since the drawing was assigned.

                A stored assignment is only as good as the last time it
                was worked out, and dragging an area afterwards leaves
                features claiming a developer they are no longer under.
                Said out loud rather than silently reassigned: reassigning
                splits features, which is not something to do to someone
                without asking. */}
            {developers.length > 1 && assignmentStale(features) && (
              <button className="gis-hidden gis-stale"
                title="Some features are assigned to a developer whose area no longer covers them"
                disabled={!!busy}
                onClick={assignByDeveloper}>
                <span>Developer areas have moved</span>
                <strong>Reassign</strong>
              </button>
            )}

            {/* A closed check still showing on the drawing.

                Red rings with no panel and nothing to explain them is
                the same trap as a hidden layer: the drawing looks wrong
                and gives no way to find out why. This says what they
                are, brings the figures back, and lets them be cleared. */}
            {trace && !traceOpen && (
              <div className="gis-checked">
                <span>
                  {traceOver.size
                    ? `${traceOver.size} node(s) outside tolerance`
                    : "Levels checked \u2014 all within tolerance"}
                </span>
                <button onClick={() => setTraceOpen(true)}>Show figures</button>
                <button onClick={() => { setTrace(null); setScenario(null); }}>Clear</button>
              </div>
            )}

            {/* A suggestion on screen, waiting to be taken or not.

                The rings say which meters would go together; this says
                how many and how evenly, and gives the two answers.
                Without it the rings are a change nobody asked for with
                no way to undo them. */}
            {groupPlan && (
              <div className="gis-suggest">
                <span className="gsg-t">
                  Suggested: {groupPlan.groups.length} groups of {groupPlan.sizes.join(", ")}
                </span>
                {groupPlan.groups.map((g, i) => (
                  <span key={i} className="gsg-dot"
                    style={{ background: feederColourAt(i) }}
                    title={`${g.meters.length} propert${g.meters.length === 1 ? "y" : "ies"}`} />
                ))}
                {/* Should never show. If it does, the split is wrong
                    rather than the site being awkward — see the note in
                    balance.js. */}
                {groupPlan.uneven && (
                  <span className="gsg-w">
                    uneven by {groupPlan.spread} &mdash; check before accepting
                  </span>
                )}
                {groupPlan.overLimit > 0 && (
                  <span className="gsg-w">
                    {groupPlan.overLimit} over the limit
                  </span>
                )}
                <button className="gsg-go" disabled={!!busy} onClick={acceptGroups}>
                  {busy === "group" ? "Creating\u2026" : "Accept"}
                </button>
                <button className="gsg-no" disabled={!!busy}
                  onClick={() => setGroupPlan(null)}>Discard</button>
              </div>
            )}

            {/* Locks in force, and a way out of them.

                A feature that will not drag with nothing on screen to
                say why is indistinguishable from a canvas that has
                stopped working. */}
            {/* A proposed route, waiting to be taken or not. */}
            {routePlan?.ok && (
              <div className="gis-suggest">
                <span className="gsg-t">
                  {routePlan.traced
                    ? `${routePlan.served.length} meters traced \u00b7 `
                      + `${routePlan.mainsM} m of ${routePlan.drawnM} drawn`
                    : `${routePlan.mainsM} m of ${routePlan.drawnM} drawn`}
                </span>
                {routePlan.traced && (
                  <span className="gsg-n">
                    {`busiest section carries ${routePlan.peak}`}
                  </span>
                )}
                <span className="gsg-n">
                  {`+ ${routePlan.serviceM} m service \u00b7 `}
                  {`\u00a3${(routePlan.mainsCost + routePlan.serviceCost).toLocaleString()}`}
                  {` against \u00a3${routePlan.drawnCost.toLocaleString()}`}
                </span>
                {routePlan.newLinks.length > 0 && (
                  <span className="gsg-n" style={{ color: "#b45309" }}>
                    {`${routePlan.newLinks.length} new link(s)`}
                  </span>
                )}
                {/* The longest run, which is what decides whether the
                    levels check will pass. Shown always, and in amber
                    once it is within a tenth of the limit — a plan that
                    only just fits is worth knowing about before the
                    cable sizes are chosen. */}
                <span className={routePlan.longestRunM > routePlan.maxRunM * 0.9
                  ? "gsg-w" : "gsg-n"}>
                  {`longest run ${routePlan.longestRunM} m`}
                </span>
                {routePlan.flagged?.length > 0 && (
                  <span className="gsg-n" style={{ color: "#b45309" }}>
                    {`${routePlan.flagged.length} over a limit`}
                  </span>
                )}
                {routePlan.unreachable.length > 0 && (
                  <span className="gsg-w">
                    {`${routePlan.unreachable.length} unreachable`}
                  </span>
                )}
                <button className="gsg-go" disabled={!!busy} onClick={acceptRoute}>
                  {busy === "route" ? "Marking\u2026" : "Accept"}
                </button>
                <button className="gsg-no" disabled={!!busy}
                  onClick={() => setRoutePlan(null)}>Discard</button>
              </div>
            )}

            {/* What is routed inside a trench. */}
            {inspect && (
              <div className="gis-co">
                <div className="gco-head">
                  <strong>
                    {inspect.stretch && !inspect.stretch.wholeRun
                      ? `${inspect.stretch.fromNode?.Attributes?.Span_Label ?? "start"}`
                        + ` to ${inspect.stretch.toNode?.Attributes?.Span_Label ?? "end"}`
                      : "In this trench"}
                  </strong>
                  <span className="gco-hint">
                    {`${inspect.trenchM} m`}
                    {statusLabel(statusOf(inspect.trench))
                      ? ` \u00b7 ${statusLabel(statusOf(inspect.trench))}` : ""}
                    {isOffSite(inspect.trench) ? " \u00b7 off site" : ""}
                  </span>
                  <button className="gco-x" onClick={() => setInspect(null)}>
                    Close
                  </button>
                </div>

                {!inspect.contents.length && (
                  <p className="gco-none">
                    Nothing routed in it yet. The LV feeder comes first,
                    from Build LV Network.
                  </p>
                )}

                {/* How wide and deep this length has to be dug.

                    From what is in it rather than typed, so adding a
                    cable widens the trench without anybody remembering
                    to revise a figure. The working is shown because a
                    dimension on a drawing gets questioned, and "NJUG
                    says so" is not an answer somebody can check. */}
                {!!inspect.njug?.items && (
                  <div className="gco-size">
                    <span className="gco-size-fig">
                      {`${inspect.njug.widthM.toFixed(2)}m wide`}
                    </span>
                    <span className="gco-size-fig">
                      {`${inspect.njug.depthM.toFixed(2)}m deep`}
                    </span>
                    <span className="gco-size-why">
                      {`${inspect.njug.contentWidthM}m of pipe and cable`}
                      {inspect.njug.separationWidthM
                        ? ` + ${inspect.njug.separationWidthM}m between them` : ""}
                      {` + ${inspect.njug.marginWidthM}m working room`}
                      {inspect.njug.atMinimum ? " (at the minimum dig width)" : ""}
                      {`; dug to the ${inspect.njug.deepest} at `}
                      {`${inspect.njug.coverM}m cover`}
                    </span>
                  </div>
                )}

                {/* What was near this stretch but not laid in it used
                    to be listed here.

                    Removed. On a real drawing it came out as nineteen
                    identical "95"s — every cable in the circuit passes
                    within a metre of a junction at some point — which
                    told nobody anything and buried the three lines that
                    mattered underneath it.

                    The panel answers one question: what is in this
                    length. Everything else near it is a different
                    question and belongs to whatever asks it. */}
                {inspect.byUtility.map((u) => (
                  <div className="gco-range" key={u.utility}>
                    <div className="gco-range-head">
                      <strong className="ins-util">{u.utility}</strong>
                      <span className="gco-f">{`${u.totalM} m`}</span>
                    </div>
                    {u.items.map((it) => (
                      <div className="gco-span" key={it.feature.Feature_ID}>
                        <span className="ins-label">{it.label ?? "\u2014"}</span>
                        <span className="gco-m">{it.withinM} m</span>
                        {/* How much of the trench it takes up. A cable
                            running the whole length and one that stops
                            part way are different things to know, and
                            the length alone does not say which. */}
                        <span className="gco-p">
                          {it.shareOfTrench >= 98
                            ? "the whole length"
                            : `${it.shareOfTrench}% of it`}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Marking a length of trench. */}
            {marking && (
              <div className="gis-step">
                <span className="gsp-plot">{statusLabel(marking.status)}</span>
                <span className="gsp-f">
                  {markFrom
                    ? "Now click where the length stops"
                    : "Click where the length starts"}
                </span>
                {markFrom && (
                  <button className="gsp-b" onClick={() => setMarkFrom(null)}>
                    Start again
                  </button>
                )}
                <button className="gsp-x"
                  onClick={() => { setMarking(null); setMarkFrom(null); }}>
                  Done
                </button>
              </div>
            )}

            {/* Raising a mains call-off from the drawing. */}
            {/* Finishing the call-off just raised.

                The runs are captured; this is the part somebody types.
                In the same panel rather than on another page, because
                the alternative is a call-off left half-finished until
                whoever raised it remembers to go back to it. */}
            {raised && (
              <div className="gis-co">
                <div className="gco-head">
                  <strong>Call-off #{raised.Submission_ID}</strong>
                  <span className="gco-hint">
                    {`${raised.spans} span(s) \u00b7 ${raised.totalM} m`}
                  </span>
                </div>

                <div className="gco-fields">
                  {[
                    ["Preferred_Date", "Preferred date", "date"],
                    ["Alternative_Date", "Alternative date", "date"],
                    ["Contact_Name", "Contact", "text"],
                    ["Contact_Phone", "Phone", "text"],
                  ].map(([k, label, type]) => (
                    <label className="gco-fld" key={k}>
                      <span>{label}</span>
                      <input type={type} value={raised[k]}
                        onChange={(e) => setRaised((r) => ({ ...r, [k]: e.target.value }))} />
                    </label>
                  ))}

                  {/* What the gang will find. Asked rather than assumed:
                      a wasted visit costs more than three questions. */}
                  {[
                    ["Obstruction_Free", "Obstruction free"],
                    ["Ground_Unmade", "Ground unmade"],
                    ["Line_Level_Required", "Line and level"],
                  ].map(([k, label]) => (
                    <label className="gco-fld" key={k}>
                      <span>{label}</span>
                      <select value={raised[k]}
                        onChange={(e) => setRaised((r) => ({ ...r, [k]: e.target.value }))}>
                        <option value="">&mdash;</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </label>
                  ))}

                  <label className="gco-fld wide">
                    <span>Notes</span>
                    <textarea rows={2} value={raised.Notes}
                      onChange={(e) => setRaised((r) => ({ ...r, Notes: e.target.value }))} />
                  </label>
                </div>

                <div className="gco-foot">
                  {/* Already saved: this only adds to it. Said plainly,
                      so nobody thinks closing loses the call-off. */}
                  <span className="gco-tot">Raised. Add the rest.</span>
                  <button className="btn ghost sm"
                    onClick={() => { setRaised(null); setCallOffOpen(false); }}>
                    Later
                  </button>
                  <button className="btn accent sm" disabled={!!busy}
                    onClick={saveRaised}>
                    {busy === "calloff" ? "Saving\u2026" : "Save"}
                  </button>
                </div>
              </div>
            )}

            {callOffOpen && !raised && (
              <div className="gis-co">
                {/* After each run: another, or commit what is picked. */}
                {askAnother && (
                  <div className="gco-ask">
                    <strong>Add another span?</strong>
                    <button className="btn ghost sm"
                      onClick={() => { setAskAnother(false); submitCallOff(); }}>
                      No, raise it
                    </button>
                    <button className="btn accent sm"
                      onClick={() => setAskAnother(false)}>
                      Yes
                    </button>
                  </div>
                )}

                <div className="gco-head">
                  <strong>Mains call-off</strong>
                  {/* What to do next, at every point in the picking.

                      "Click a span node, then the one it runs to" was
                      the only thing it ever said, so after a range was
                      added there was nothing to suggest another could
                      be. Adding more was always possible and never
                      said. */}
                  <span className="gco-hint">
                    {pick
                      ? `From ${spanNodeLabel(pick) ?? "\u2014"} \u2014 `
                        + "click the node it runs to"
                      : ranges.length
                        ? "Click another span node to add a second run, "
                          + "or raise the call-off"
                        : "Click a span node, then the one it runs to"}
                  </span>
                  <button className="gco-x"
                    onClick={() => { setCallOffOpen(false); setPick(null); setRanges([]); }}>
                    Cancel
                  </button>
                </div>

                {!ranges.length && (
                  <p className="gco-none">No ranges yet.</p>
                )}

                {callOff?.ranges?.map((r, i) => {
                  const totalM = Math.round(
                    r.spans.reduce((t, x) => t + x.lengthM, 0) * 10) / 10;
                  const plots = [...new Set(r.spans.flatMap((x) => x.plots))];
                  plots.sort((x, y) => {
                    const nx = Number(x);
                    const ny = Number(y);
                    if (Number.isFinite(nx) && Number.isFinite(ny)) return nx - ny;
                    return String(x).localeCompare(String(y));
                  });
                  /* From the spans, not from the labels captured when
                     clicking.

                     The captured pair is in click order and is only
                     right if somebody clicked the run the way it is
                     numbered. The spans carry the labels the run
                     actually has. */
                  const [from, to] = orderPair(
                    r.spans[0]?.from ?? r.from,
                    r.spans[r.spans.length - 1]?.to ?? r.to);

                  return (
                  <div className="gco-range" key={i}>
                    <div className="gco-range-head">
                      {/* The run and its length on one line.

                          A range of one span used to print itself twice
                          — once as the range and once as its only span —
                          with the same two nodes and the same length on
                          both. */}
                      <strong>{from} to {to}</strong>
                      <span className="gco-f">{`${totalM} m`}</span>
                      {/* The word, not a cross. A × reads as "close
                          this panel" at least as readily as "remove
                          this run", and the two are a long way apart in
                          consequence. */}
                      <button className="btn delete sm"
                        onClick={() => setRanges((rs) => rs.filter((_, j) => j !== i))}>
                        Remove
                      </button>
                    </div>
                    {/* The plots on the run, on their own line. */}
                    <div className="gco-plots">
                      {plots.length ? `Plots ${plots.join(", ")}` : "No plots"}
                    </div>

                    {/* The spans within it, only where there is more
                        than one — with a single span the run and the
                        span are the same thing said twice. */}
                    {r.spans.length > 1 && r.spans.map((sp, k) => {
                      const [a2, b2] = orderPair(sp.from, sp.to);
                      return (
                        <div className="gco-span" key={k}>
                          <span className="gco-sp">{a2}&ndash;{b2}</span>
                          <span className="gco-m">{sp.lengthM} m</span>
                          <span className="gco-p">
                            {sp.plots.length
                              ? sp.plots.join(", ")
                              : "no plots"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  );
                })}

                {/* A range that could not be resolved says so rather than
                    disappearing from the list. */}
                {callOff?.errors?.map((e2, i) => (
                  <p className="gco-err" key={i}>
                    {`${e2.range.from} to ${e2.range.to}: ${e2.error}`}
                  </p>
                ))}

                {callOff?.overlaps?.length > 0 && (
                  <p className="gco-warn">
                    {`${callOff.overlaps.join(", ")} named twice \u2014 `}
                    counted twice, as asked.
                  </p>
                )}

                {callOff?.spans?.length > 0 && (
                  <div className="gco-utils">
                    <span className="gco-utils-label">Utilities</span>
                    {(lookups?.utilities || [])
                      .filter((u) => !u.Is_Lighting)
                      .map((u) => (
                        <label className="gco-util" key={u.Utility_ID}>
                          <input type="checkbox"
                            checked={callOffUtils.includes(Number(u.Utility_ID))}
                            onChange={(e) => setCallOffUtils((cur) => (e.target.checked
                              ? [...cur, Number(u.Utility_ID)]
                              : cur.filter((x) => x !== Number(u.Utility_ID))))} />
                          {u.Utility}
                        </label>
                      ))}
                  </div>
                )}

                {callOff?.spans?.length > 0 && (
                  <div className="gco-foot">
                    <span className="gco-tot">
                      {`${callOff.ranges.length} run(s) \u00b7 `}
                      {`${callOff.spans.length} span(s) \u00b7 ${callOff.totalM} m \u00b7 `}
                      {`${callOff.plotCount} plot(s)`}
                    </span>
                    <button className="btn accent sm" disabled={!!busy}
                      onClick={submitCallOff}>
                      {busy === "calloff" ? "Raising\u2026" : "Raise call-off"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Stepping through the traces, one meter at a time. */}
            {/* Said rather than shown empty: a bar that renders with
                nothing in it looks like a fault, and the commonest
                reason is a drawing with no substation on it. */}
            {stepAt != null && !routePlan?.ok && (
              <div className="gis-step">
                <span className="gsp-bad">
                  Nothing to step through &mdash; the trace did not run.
                </span>
                <button className="gsp-x" onClick={() => setStepAt(null)}>Done</button>
              </div>
            )}

            {stepAt != null && routePlan?.ok && (() => {
              const all = [
                ...(routePlan.served || []).map((x) => ({ ...x, kind: "traced" })),
                ...(routePlan.unreachable || []).map((x) => ({ ...x, kind: "none" })),
              ];
              const item = all[stepAt];
              if (!item) return null;
              const m = item.meter ?? item;
              const go = (n) => {
                const next = Math.max(0, Math.min(all.length - 1, n));
                setStepAt(next);
                const nm = all[next].meter ?? all[next];
                zoomToPoints([(nm.Geometry || [])[0] || [0, 0]]);
              };
              return (
                <div className="gis-step">
                  <button className="gsp-b" disabled={stepAt === 0}
                    onClick={() => go(stepAt - 1)}>&larr;</button>
                  <span className="gsp-n">{stepAt + 1} of {all.length}</span>
                  <strong className="gsp-plot">{plotLabel(m)}</strong>

                  {item.kind === "none" ? (
                    <span className="gsp-bad">{item.why}</span>
                  ) : (
                    <>
                      <span className="gsp-f">
                        {`service ${item.serviceM} m`}
                        {item.serviceDrawn ? "" : " (no service trench)"}
                      </span>
                      <span className="gsp-f">{`run ${item.runM} m`}</span>
                      <span className="gsp-f">
                        {`${item.path?.length ?? 0} section(s)`}
                      </span>
                      {item.warnings?.length > 0 && (
                        <span className="gsp-warn">{item.warnings[0].text}</span>
                      )}
                    </>
                  )}

                  <button className="gsp-b" disabled={stepAt >= all.length - 1}
                    onClick={() => go(stepAt + 1)}>&rarr;</button>
                  {/* Straight to the ones that did not trace, which is
                      what somebody stepping through is looking for. */}
                  {routePlan.unreachable?.length > 0 && (
                    <button className="gsp-jump"
                      onClick={() => go((routePlan.served || []).length)}>
                      {`First of ${routePlan.unreachable.length} untraced`}
                    </button>
                  )}
                  <button className="gsp-x" onClick={() => setStepAt(null)}>Done</button>
                </div>
              );
            })()}

            {lockedClasses.length > 0 && (
              <button className="gis-hidden gis-locked"
                title="These classes cannot be moved"
                onClick={() => setLockedClasses([])}>
                <span>
                  {lockedClasses.length} class{lockedClasses.length === 1 ? "" : "es"} locked
                </span>
                <strong>Unlock all</strong>
              </button>
            )}

            {(hidden.length > 0 || isolatedCircuit != null || liveTrenchOnly
              || (!showBasemap && basemap?.Metres_Per_Pixel)) && (
              <button className="gis-hidden"
                title="Unhide every layer and end any circuit isolation"
                onClick={() => {
                  setHidden([]); setSolo(null); setShownOnly([]); setIsolatedCircuit(null);
                  setShowBasemap(true); setLiveTrenchOnly(false);
                  setGapList(null);
                }}>
                {liveTrenchOnly && <span>Showing live trench only</span>}
                {gapList?.length > 0 && (
                  <span>{`${gapList.length} unjoined trench end(s)`}</span>
                )}
                {!showBasemap && basemap?.Metres_Per_Pixel && (
                  <span>Background plan hidden</span>
                )}
                {isolatedCircuit != null && (
                  <span>
                    Showing {circuitsFrom(features)
                      .find((c) => String(c.id) === String(isolatedCircuit))?.name
                      ?? `circuit ${isolatedCircuit}`} only
                  </span>
                )}
                {hidden.length > 0 && (
                  <span>
                    {hidden.length} layer{hidden.length === 1 ? "" : "s"} hidden
                  </span>
                )}
                <strong>Show everything</strong>
              </button>
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
                  boundaryFor={boundaryFor}
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

            {ctx && (
              /* Positioned inside the canvas wrapper, so it travels with
                 the panel rather than sitting at a page coordinate that
                 stops matching the moment anything scrolls. */
              <div className="gis-ctx" ref={ctxRef}
                style={{ left: ctx.x, top: ctx.y }}
                role="menu" onClick={(e) => e.stopPropagation()}>
                <p className="gc-head">{classLabel(ctx.feature, lineTypes)}</p>

                <button className="gc-item" onClick={() => {
                  setEditing(ctx.feature); setCtx(null);
                }}>Edit</button>

                {/* Only where the object belongs to one, and only on the
                    electric layer — that is where circuits live, and the
                    isolate acts on nothing else. A trench serves every
                    circuit that runs through it and has none of its own,
                    so there is nothing to isolate from it. */}
                {ctx.feature.Layer_Key === "electric"
                  && ctx.feature.Attributes?.Circuit_ID != null && (
                  <button className="gc-item" onClick={() => {
                    isolateCircuit(ctx.feature.Attributes.Circuit_ID);
                    setCtx(null);
                  }}>
                    {String(isolatedCircuit) === String(ctx.feature.Attributes.Circuit_ID)
                      ? "Show all circuits"
                      : `Isolate ${ctx.feature.Attributes.Circuit_Name
                          || `circuit ${ctx.feature.Attributes.Circuit_ID}`}`}
                  </button>
                )}

                {ctx.feature.Feature_Type === "line" ? (
                  <>
                    <button className="gc-item" disabled={!!busy} onClick={() => {
                      breakLineAt(ctx.feature, ctx.atM); setCtx(null);
                    }}>Break here</button>
                    <button className="gc-item" onClick={() => {
                      const seg = segmentAt(ctx.feature, ctx.px, ctx.py);
                      if (seg) addVertex(ctx.feature, seg.index, seg.point);
                      else setError("Couldn\u2019t find a segment at that point.");
                      setCtx(null);
                    }}>Insert node</button>
                    {/* Alt-click does this too, but nobody discovers that.
                        Acts on the nearest vertex to where you clicked, so
                        it removes the one you were pointing at rather than
                        an arbitrary end. */}
                    <button className="gc-item" onClick={() => {
                      const idx = nearestVertexIndex(ctx.feature, ctx.px, ctx.py);
                      if (idx >= 0) removeVertex(ctx.feature, idx);
                      else setError("No node near that point.");
                      setCtx(null);
                    }}>Delete node</button>
                  </>
                /* Two different operations sharing a word. A span node
                   wants the downstream trace, which reports legs, lengths
                   and meters in a table. Everything else wants the
                   numbering pass, which walks the network from a source
                   and writes ways and circuits onto the cables — useful,
                   but it displays nothing, and calling it "trace" is why
                   it looked as though nothing had happened.

                   Chained rather than nested: a ternary branch is one
                   expression, so a comment and an expression side by side
                   inside its brackets is two, and the parser stops at the
                   second. */
                ) : (ctx.feature.Feature_Type === "point"
                     && ctx.feature.Layer_Key === "electric"
                     && ctx.feature.Feature_Role === "spannode") ? (
                  /* From here, rather than from the substation. Reached
                     only by right-clicking the point you want to start
                     at, which is the whole of what distinguishes it from
                     the levels check on the menu. */
                  <button className="gc-item" disabled={!!busy} onClick={() => {
                    setSelected([ctx.feature.Feature_ID]);
                    setCtx(null);
                    setTimeout(() => runFullTrace(), 0);
                  }}>Full Trace from Here</button>
                ) : (
                  <button className="gc-item" disabled={!!busy} onClick={() => {
                    setSelected([ctx.feature.Feature_ID]);
                    setCtx(null);
                    setTimeout(() => runNetwork("trace"), 0);
                  }}>Number the Network from Here</button>
                )}

                <div className="gc-sep" />
                {/* Hiding from here saves hunting for the right entry in
                    the Layers menu when the thing you want out of the way
                    is under the cursor. */}
                <button className="gc-item" disabled={!!busy} onClick={() => {
                  setSelected([ctx.feature.Feature_ID]);
                  setLockOn(!isFeatureLocked(ctx.feature));
                  setCtx(null);
                }}>
                  {isFeatureLocked(ctx.feature) ? "Unlock this" : "Lock this"}
                </button>
                {/* Jumping to either end.

                    Colouring the ends only helps when they are on
                    screen. A trench drawn across a whole site has both
                    ends off it at any zoom where the middle is
                    readable, and hunting for the one that will not snap
                    means panning blind. */}
                {ctx.feature.Feature_Type === "line"
                  && (ctx.feature.Geometry || []).length >= 2 && (
                  <>
                    <button className="gc-item" onClick={() => {
                      const g = ctx.feature.Geometry;
                      setSelected([ctx.feature.Feature_ID]);
                      zoomToPoints([g[0]]);
                      setCtx(null);
                    }}>
                      Go to start
                    </button>
                    <button className="gc-item" onClick={() => {
                      const g = ctx.feature.Geometry;
                      setSelected([ctx.feature.Feature_ID]);
                      zoomToPoints([g[g.length - 1]]);
                      setCtx(null);
                    }}>
                      Go to end
                    </button>
                    <div className="gc-sep" />
                  </>
                )}
                {ctx.feature.Attributes?.Line_Type && (
                  <button className="gc-item" onClick={() => {
                    setLockedClasses((l) =>
                      toggleClassLock(l, `lt:${ctx.feature.Attributes.Line_Type}`));
                    setCtx(null);
                  }}>
                    {lockedClasses.includes(`lt:${ctx.feature.Attributes.Line_Type}`)
                      ? "Unlock all " : "Lock all "}
                    {(lineTypes.find((t) =>
                      t.Type_Key === ctx.feature.Attributes.Line_Type)?.Label
                      ?? "of this type").toLowerCase()}
                  </button>
                )}
                <div className="gc-sep" />
                <button className="gc-item" onClick={() => {
                  hideClass(ctx.feature.Layer_Key);
                  setCtx(null);
                }}>
                  Hide {layerOf(ctx.feature.Layer_Key).Label ?? "this"} layer
                </button>
                {ctx.feature.Attributes?.Line_Type && (
                  <button className="gc-item" onClick={() => {
                    hideClass(`lt:${ctx.feature.Attributes.Line_Type}`);
                    setCtx(null);
                  }}>
                    Hide {classLabel(ctx.feature, lineTypes)} only
                  </button>
                )}
                {/* ── Add Label ──

                    Puts the label where the pipe was clicked rather
                    than at its midpoint, with a leader back to that
                    exact point.

                    The anchor is the click projected onto the pipe, not
                    the click itself: a leader has to land on the line it
                    is pointing at, and a right-click lands a few pixels
                    off however carefully it is aimed.

                    Offset to the side the click fell on, so the label
                    goes where there was room — that is what the click
                    was saying. Three metres, which is far enough to
                    clear the pipe and its own plate at any working
                    zoom. */}
                {ctx.feature.Feature_Type === "line"
                  && ctx.feature.Layer_Key === "water" && (
                  <button className="gc-item" onClick={() => {
                    const f = ctx.feature;
                    const at = ctx.atM;
                    setCtx(null);

                    const g = f.Geometry || [];
                    const near = nearestOnPolyline(at, g);
                    if (!near) return;
                    const a = g[near.index - 1];
                    const b = g[near.index];
                    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
                    const dx = (b[0] - a[0]) / len;
                    const dy = (b[1] - a[1]) / len;
                    /* Which side of the pipe the click fell on. */
                    const side = Math.sign(
                      (at[0] - near.q[0]) * -dy + (at[1] - near.q[1]) * dx) || 1;
                    const OFF_M = 3;

                    /* Appended. Writing Label_At moved the one label a
                       pipe was allowed, so adding a second took the
                       first away — which is what "the other labels
                       disappear" was. A pipe can carry as many as
                       somebody wants to put on it.

                       Anything placed before this change is carried into
                       the list first, so the label already on the pipe
                       stays where it was rather than being replaced by
                       the new one. */
                    const held = Array.isArray(f.Attributes?.Labels)
                      ? [...f.Attributes.Labels]
                      : (f.Attributes?.Label_At || f.Attributes?.Label_Offset
                        ? [{ at: f.Attributes.Label_At, off: f.Attributes.Label_Offset }]
                        : []);

                    const A = { ...f.Attributes };
                    delete A.Label_At;
                    delete A.Label_Offset;
                    A.Labels = [...held, {
                      at: near.q,
                      off: [-dy * OFF_M * side, dx * OFF_M * side],
                    }];
                    setFeatures((fs) => fs.map((x) =>
                      (x.Feature_ID === f.Feature_ID ? { ...x, Attributes: A } : x)));
                    bulkUpdateFeatures(projectId, [{ Feature_ID: f.Feature_ID, Attributes: A }])
                      .catch((e) => setError(e.message));
                  }}>Add Label</button>
                )}
                {(ctx.feature.Attributes?.Label_Offset
                  || ctx.feature.Attributes?.Label_At
                  || ctx.feature.Attributes?.Labels?.length) && (
                  <button className="gc-item" onClick={() => {
                    const f = ctx.feature;
                    setCtx(null);
                    const A = { ...f.Attributes };
                    delete A.Label_Offset;
                    /* And where it was anchored, or it would go back to
                       the midpoint's offset while still pointing at the
                       place somebody clicked. */
                    delete A.Label_At;
                    /* Every placed label, not only the first. The entry
                       says "put the label back", and leaving four of
                       them on the pipe is not that. */
                    delete A.Labels;
                    setFeatures((fs) => fs.map((x) =>
                      (x.Feature_ID === f.Feature_ID ? { ...x, Attributes: A } : x)));
                    bulkUpdateFeatures(projectId, [{ Feature_ID: f.Feature_ID, Attributes: A }])
                      .catch((e) => setError(e.message));
                  }}>{ctx.feature.Attributes?.Labels?.length > 1
                    ? "Remove the labels" : "Put the label back"}</button>
                )}

                <div className="gc-sep" />
                <button className="gc-item danger" onClick={() => {
                  const f = ctx.feature;
                  setCtx(null);
                  if (window.confirm(`Delete ${f.Label || classLabel(f, lineTypes)}?`)) {
                    deleteFeature(f.Feature_ID);
                  }
                }}>Delete</button>
              </div>
            )}

            {classPlan && (
              <div className="gis-trace" role="dialog" aria-label="Classify Against the Boundary">
                <div className="gt-head">
                  <strong>Classify against the boundary</strong>
                  <button className="fe-x" onClick={() => setClassPlan(null)}
                    aria-label="Close">&times;</button>
                </div>

                {classPlan.total === 0 ? (
                  <p className="tc-ok">
                    Everything is already classified{classPlan.skipped
                      ? ` (${classPlan.skipped} checked)` : ""}.
                  </p>
                ) : (
                  <>
                    <table className="gt-tbl">
                      <tbody>
                        <tr><td>Label on or off site</td>
                          <td className="num">{classPlan.label.length}</td></tr>
                        <tr><td>Split at the boundary</td>
                          <td className="num">{classPlan.split.length}</td></tr>
                        {classPlan.newFeatures > 0 && (
                          <tr><td>New runs from splitting</td>
                            <td className="num">{classPlan.newFeatures}</td></tr>
                        )}
                      </tbody>
                    </table>
                    <p className="tc-hint">
                      Splitting is the part that changes the drawing: a run crossing the
                      boundary becomes two, because one row can&rsquo;t be both on and off
                      site. On-site trenches are set to Unmade; off-site ones keep the
                      surface already chosen.
                    </p>
                    <button className="btn accent sm" disabled={!!busy}
                      onClick={() => applyClassification(classPlan)}>
                      {busy === "classify" ? "Working\u2026" : "Apply"}
                    </button>
                  </>
                )}
                <label className="cl-again">
                  <input type="checkbox" checked={reclass}
                    onChange={(e) => { setReclass(e.target.checked); setClassPlan(null); }} />
                  Re-check features that already have a classification
                </label>
              </div>
            )}

            {gasLevelsResult && (
        <div className="gl-panel" role="dialog" aria-label="Gas levels">
          <div className="gl-head">
            <strong>Gas levels</strong>
            {/* The verdict, and the lines it was judged against.

                Nothing highlighted is the ordinary result on a design
                that holds up, and it reads exactly like a check that
                did not run. Saying so turns silence into an answer, and
                naming the thresholds lets somebody see that the limit
                they set in Admin is the one being applied. */}
            {(() => {
              const min = gasLevelsResult.minMBar;
              const amberAt = min + (sourceOf(gasLevelsResult) - min)
                * (1 - (gasLevelsResult.amberPct ?? 80) / 100);
              const bad = gasLevelsResult.legs.filter((l) => l.at < min || l.overCapacity);
              const warn = gasLevelsResult.legs.filter((l) =>
                !(l.at < min || l.overCapacity) && l.at < amberAt);
              return (
                <span className={`gl-verdict ${bad.length ? "bad" : warn.length ? "warn" : "ok"}`}>
                  {bad.length
                    ? `${bad.length} out of tolerance`
                    : warn.length
                      ? `${warn.length} close to the limit`
                      : `All ${gasLevelsResult.legs.length} within tolerance`}
                  <span className="gl-thresh">
                    {` \u00b7 red below ${min.toFixed(2)}, `}
                    {`amber below ${amberAt.toFixed(2)} mbar`}
                  </span>
                </span>
              );
            })()}
            {/* The line it is being judged against, on screen rather
                than in Admin. "Nothing is red" and "the limit is not
                what I set" look the same until the figure is shown. */}
            <span className="gl-low">
              {`red below ${gasLevelsResult.minMBar} mbar \u00b7 `}
              {`lowest ${gasLevelsResult.lowest[1].toFixed(2)} mbar`}
              {gasLevelsResult.lowestLabel ? ` at ${gasLevelsResult.lowestLabel}` : ""}
            </span>
            <button className="gl-x" onClick={() => setGasLevelsResult(null)}>&times;</button>
          </div>
          <div className="gl-body">
            <table className="gl-tbl">
              <thead>
                <tr>
                  {/* The main length, then the two ends it runs
                      between. "Main" rather than "Run" because G1 is a
                      length of gas main, not a node \u2014 the nodes are
                      G0 and the A-numbers. */}
                  <th>Main</th><th>From</th><th>To</th>
                  {/* The size a pipe is called and ordered by, not its
                      bore. The bore is what the pressure is worked out
                      from and is nobody's way of naming a pipe: a 63mm
                      main is 63mm on the drawing, on the schedule and in
                      the yard, whatever its wall thickness. */}
                  <th className="num">Pipe size</th><th className="num">Length</th>
                  <th className="num">Tees</th><th className="num">Flow</th>
                  <th className="num">Drop</th><th className="num">Pressure</th>
                </tr>
              </thead>
              <tbody>
                {gasLevelsResult.legs.map((l) => {
                  /* Red below the limit, amber approaching it. A node at
                     19.2 passes and will not survive the next plot being
                     added, and a report that says nothing until it fails
                     is one that gets acted on too late. */
                  const min = gasLevelsResult.minMBar;
                  /* Over capacity is red whatever the pressure says: a
                     main carrying more than its size is rated for is
                     undersized even where the pressure holds. */
                  const band = (l.at < min || l.overCapacity) ? "bad"
                    : l.at < min + (sourceOf(gasLevelsResult) - min)
                      * (1 - (gasLevelsResult.amberPct ?? 80) / 100) ? "warn" : "";
                  return (
                  <tr key={l.id} className={`${band} gl-row`}
                    title={`Zoom to ${l.id}`}
                    onClick={() => {
                      /* The run's own polyline, which the leg carries so
                         a suggestion can be applied to it. Same points,
                         so the row and the drawing cannot disagree about
                         which pipe is which. */
                      const pts = l.runPts || [];
                      if (pts.length) zoomToPoints(pts);
                    }}>
                    <td>{l.id}</td>
                    <td>{l.from ?? "\u2014"}</td>
                    <td>{l.to ?? "\u2014"}</td>
                    <td className="num" title={[
                      `${l.boreMM.toFixed(1)}mm bore`,
                      l.overCapacity
                        ? `carrying ${Number(l.kw).toFixed(0)} kW against a rating `
                          + `of ${Number(l.maxKw).toFixed(0)} kW`
                        : null,
                    ].filter(Boolean).join(" \u00b7 ")}>
                      {`${Math.round(l.boreMM + 11)}mm`}
                      {l.overCapacity ? " \u26a0" : ""}
                    </td>
                    <td className="num">
                      {l.metres.toFixed(1)}
                      {l.fittingsM ? <span className="gl-fit"> +{l.fittingsM}</span> : null}
                    </td>
                    <td className="num">{l.services || ""}</td>
                    <td className="num">{l.flowM3h.toFixed(2)}</td>
                    <td className="num">{l.drop.toFixed(3)}</td>
                    <td className="num">{l.at.toFixed(2)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {!!gasLevelsResult.unreached?.length && (
              <p className="gl-note">
                {`${gasLevelsResult.unreached.length} node`}
                {gasLevelsResult.unreached.length === 1 ? "" : "s"}
                {" not reached from the POC \u2014 a length of main drawn but "}
                not joined to the rest.
              </p>
            )}
            {/* A pass says so.

                Nothing was shown when every node held up, which reads
                exactly like a check that has not run or a feature that
                is missing — and it is the reason the suggestions looked
                absent when in fact there was nothing to suggest. The
                verdict states the limit it was judged against, so a
                pass can be told from a limit nobody set. */}
            {!gasLevelsResult.advice?.failing?.length && (
              <p className="gl-pass">
                {`\u2713 Every node holds above ${gasLevelsResult.minMBar} mbar `}
                {`\u2014 lowest is ${gasLevelsResult.lowest[1].toFixed(2)} mbar`}
                {gasLevelsResult.lowestLabel ? ` at ${gasLevelsResult.lowestLabel}` : ""}.
              </p>
            )}

            {gasLevelsResult.advice?.failing?.length > 0 && (
              <div className="gl-advice">
                <p className="gl-advice-h">
                  {`${gasLevelsResult.advice.failing.length} node`}
                  {gasLevelsResult.advice.failing.length === 1 ? " is" : "s are"}
                  {` below ${gasLevelsResult.minMBar} mbar.`}
                </p>
                {gasLevelsResult.advice.suggestions?.length ? (
                  <>
                    <p className="gl-note">
                      {gasLevelsResult.advice.clearsAll
                        ? "These changes together bring it inside the limit:"
                        : "These help but do not clear it \u2014 the design needs "
                          + "looking at rather than resizing:"}
                    </p>
                    <ul className="gl-fixes">
                      {gasLevelsResult.advice.suggestions.map((x) => (
                        <li key={x.runId}>
                          <span className="gl-fix-t">
                            <strong>{x.runId}</strong>
                            {` ${x.from} to ${x.to}: `}
                            {`${x.fromBore}mm bore \u2192 ${x.sizeLabel}`}
                            <span className="gl-fit">
                              {` \u00b7 lowest becomes ${x.lowestAfter.toFixed(2)} mbar`}
                            </span>
                          </span>
                          {/* Applies it and measures again, so the panel
                              shows the design as it now is rather than
                              as it was when the advice was worked out. */}
                          <button className="btn accent sm"
                            disabled={!!busy}
                            onClick={() => applyGasSuggestion(x)}>
                            {busy === `gasfix:${x.runId}` ? "Changing\u2026" : "Make change"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="gl-note">
                    No single change of pipe size clears it. The route or the
                    point of connection is what needs revisiting.
                  </p>
                )}
              </div>
            )}

            <p className="gl-note">
              Lengths include an allowance for each service tee, counted off the
              drawing. Pressures are within about 1.5% of GASWorkS on the design
              this was validated against.
            </p>
          </div>
        </div>
      )}

      {gasUnserved && (
              <div className="gis-trace" role="dialog"
                aria-label="Gas meters not reached">
                <div className="gt-head">
                  <strong>Gas meters not reached</strong>
                  <button className="fe-x" onClick={() => setGasUnserved(null)}
                    aria-label="Close">&times;</button>
                </div>

                <p className="tc-sum">
                  {gasUnserved.length} gas meter(s) are not fed by the main that
                  was just laid, so they count for nothing in its size.
                </p>

                <table className="gt-tbl">
                  <thead>
                    <tr><th>Plot</th><th>Why</th></tr>
                  </thead>
                  <tbody>
                    {gasUnserved.map((m) => (
                      <tr key={m.id} className="tc-row"
                        onClick={() => {
                          /* The service where there is one, since that
                             is the thing to drag; the meter otherwise,
                             because there is nothing else to look at. */
                          const id = m.serviceId ?? m.id;
                          setSelected([id]); zoomTo([id]); setTool("select");
                        }}
                        title="Select and zoom to it">
                        <td>{(() => {
                          /* The plot number, which is what somebody
                             walks the site with. The meter's own label
                             where there is no plot behind it — a seed
                             placed without one is still a thing on the
                             drawing to go and look at. */
                          const p = plotList?.find((x) =>
                            Number(x.plot_id ?? x.Plot_ID) === Number(m.plotId));
                          return p?.plot_number ?? p?.Plot_Number ?? m.label;
                        })()}</td>
                        <td>{m.why}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="tc-hint">
                  Click a row to find it. A meter on no service trench needs one
                  drawing or Auto Service running; a service that doesn&rsquo;t
                  land needs its end dragging onto the mains. Then build again.
                </p>
              </div>
            )}

            {svcCheck && (
              <div className="gis-trace" role="dialog" aria-label="Service Trench Check">
                <div className="gt-head">
                  <strong>Services to mains</strong>
                  <button className="fe-x" onClick={() => setSvcCheck(null)}
                    aria-label="Close">&times;</button>
                </div>

                {svcCheck.error && <p className="gt-none">{svcCheck.error}</p>}

                {!svcCheck.error && (
                  <>
                    <p className="tc-sum">
                      {svcCheck.connected} of {svcCheck.services} service trenches
                      reach a mains trench.
                    </p>

                    {svcCheck.orphans.length === 0 ? (
                      <p className="tc-ok">Every service reaches the mains.</p>
                    ) : (
                      <table className="gt-tbl">
                        <thead>
                          <tr><th>Not connected</th><th className="num">Length</th>
                            <th className="num">Gap</th></tr>
                        </thead>
                        <tbody>
                          {svcCheck.orphans.map((o) => (
                            <tr key={o.id} className="tc-row"
                              onClick={() => { setSelected([o.id]); zoomTo([o.id]); setTool("select"); }}
                              title="Select and zoom to it">
                              <td>{o.label}</td>
                              <td className="num">{o.metres.toFixed(1)} m</td>
                              <td className="num">{o.gap.toFixed(2)} m</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {/* A second, quieter fault: physically touching but
                        with no shared node, so the router cannot follow
                        it. Worth separating — the fix is one drag, and
                        the symptom is plots silently missing from a
                        feeder build. */}
                    {svcCheck.noNode.length > 0 && (
                      <>
                        <p className="tc-sum" style={{ marginTop: 10 }}>
                          <em>{svcCheck.noNode.length} touch the mains but have no node
                            there, so routing can&rsquo;t follow them.</em>
                        </p>
                        <button className="btn accent sm" disabled={!!busy}
                          style={{ margin: "0 0 6px" }}
                          onClick={() => addMissingNodes(svcCheck.noNode)}>
                          {busy === "tee" ? "Adding\u2026" : `Add the ${svcCheck.noNode.length} missing node(s)`}
                        </button>
                        <table className="gt-tbl">
                          <tbody>
                            {svcCheck.noNode.map((o) => (
                              <tr key={o.id} className="tc-row"
                                onClick={() => { setSelected([o.id]); zoomTo([o.id]); setTool("select"); }}>
                                <td>{o.label}</td>
                                <td className="num">{o.metres.toFixed(1)} m</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}

                    {(svcCheck.orphans.length > 0 || svcCheck.noNode.length > 0) && (
                      <p className="tc-hint">
                        Click a row to find it, then drag its end onto the mains
                        &mdash; that records the join and adds a node at the meeting point.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {trace && traceOpen && (
              <div className={trace.hasVd ? "gis-trace gt-wide gt-vd" : "gis-trace gt-wide"}
                role="dialog" aria-label={trace.levels ? "Levels check" : "Full trace"}>
                <div className="gt-head">
                  <div>
                    <strong>
                      {trace.levels
                        ? (trace.advanced ? "Advanced levels check" : "Levels check")
                        : "Full trace"} from {trace.from}
                    </strong>
                    <p className="gt-sub">
                      {trace.circuitName} &middot; {trace.legs.length} leg(s) &middot;{" "}
                      {trace.totalMeters} meter(s) beyond this point
                    </p>
                  </div>
                  <button className="btn accent sm" onClick={exportTrace}>Export</button>
                  {(traceAt && (traceAt.features !== features || traceAt.lookups !== lookups)) && (
                    <button className="btn sm tr-stale"
                      onClick={() => (trace.levels
                        ? runLevelsCheck({ stopAt: trace.advanced ? "junctions" : "spannodes" })
                        : runFullTrace())}
                      title="The drawing has changed since these figures were worked out">
                      Out of date &mdash; re-run
                    </button>
                  )}
                  {/* Ordered by label, or along the cable.

                      Not a preference to be set once and forgotten:
                      which reads better depends on the check. The
                      ordinary levels check has numbered nodes and sorts
                      well by label; the advanced one is mostly joints
                      named for plots, where only the cable order makes
                      sense. */}
                  {/* The same figures as a network rather than a list.
                      Beside Export because it is the other way of taking
                      the check away with you. */}
                  {/* The figures are computed from the span nodes, so a
                      cable changed on the run itself is not in them.
                      Said here, where the figures are being read, rather
                      than left to be discovered by disbelieving them. */}
                  {cablesOutOfStep.length > 0 && (
                    <button className="btn sm tr-stale" disabled={!!busy}
                      title="Some span nodes hold a different cable from the run feeding them"
                      onClick={() => withUndo("Apply cable sizes to span nodes", syncNodeCables)}>
                      {cablesOutOfStep.length} cable{cablesOutOfStep.length === 1 ? "" : "s"} out of step &mdash; fix
                    </button>
                  )}
                  <button className="btn sm tr-ord"
                    title="Draw this check as a schematic"
                    onClick={() => setSchematic(true)}>
                    Schematic
                  </button>
                  <button className="btn sm tr-ord"
                    title={traceEnds
                      ? "Showing where the runs finish \u2014 show every leg"
                      : "Show only where the runs finish"}
                    onClick={() => setTraceEnds(!traceEnds)}>
                    {traceEnds ? "Ends only" : "All legs"}
                  </button>
                  <button className="btn sm tr-ord"
                    title={traceOrder === "chain"
                      ? "Ordered along the cable \u2014 switch to node order"
                      : "Ordered by node \u2014 switch to follow the cable"}
                    onClick={() => setTraceOrder(traceOrder === "chain" ? "label" : "chain")}>
                    {traceOrder === "chain" ? "Along the cable" : "By node"}
                  </button>
                  {traceOver.size > 0 && (
                    <button className="btn sm tr-fix"
                      title="Work out what cable changes would bring the ringed nodes inside their limits"
                      onClick={runScenario}>
                      {traceOver.size} out of tolerance &mdash; suggest changes
                    </button>
                  )}
                  <button className="fe-x" onClick={() => { setTraceOpen(false); setScenario(null); }}
                    aria-label="Close">
                    &times;
                  </button>
                </div>

                {scenario && (
                  <div className="tr-scn">
                    <div className="tr-scn-h">
                      <strong>Suggested changes</strong>
                      <button onClick={() => setScenario(null)}>Close</button>
                    </div>
                    {scenario.exhausted ? (
                      /* Said plainly. A run too long at any size needs the
                         substation moved, another way off it, or the
                         circuit split — none of which is a cable change,
                         and offering the biggest cable would only delay
                         finding that out. */
                      <p className="tr-scn-n">
                        No cable in the catalogue clears these nodes, up to
                        {" "}{scenario.largest}. This needs the substation moved,
                        another way taken off it, or the circuit split.
                      </p>
                    ) : !scenario.suggestions.length ? (
                      <p className="tr-scn-n">Everything is within its limits.</p>
                    ) : (
                      <>
                        {scenario.pairs && (
                          <p className="tr-scn-n">
                            No single change is enough, so these are pairs.
                          </p>
                        )}
                        <ol className="tr-scn-l">
                          {scenario.suggestions.map((sg, i) => (
                            <li key={i}>
                              <span className="tr-scn-t">
                                {sg.circuitName && trace?.parts?.length > 1 && (
                                  <span className="tr-scn-c">{sg.circuitName}: </span>
                                )}
                                {sg.changes.map((c, j) => (
                                  <span key={j}>
                                    {j > 0 && <span className="tr-scn-p"> and </span>}
                                    {/* Both ends of the run. The cable
                                        covers the stretch between two
                                        nodes, and naming only the far one
                                        left the reader working out which
                                        stretch was meant. */}
                                    <strong>{c.fromLabel} &rarr; {c.spanLabel}</strong>
                                    <span className="tr-scn-m"> ({c.lengthM} m)</span>
                                    {": "}{c.toLabel}
                                  </span>
                                ))}
                              </span>
                              <button className="tr-scn-go" disabled={!!busy}
                                title="Set this cable on the span node and the runs feeding it, then trace again"
                                onClick={() => applyScenario(sg)}>
                                {busy === "scenario" ? "Working\u2026" : "Make the change"}
                              </button>
                            </li>
                          ))}
                        </ol>
                        {/* Named a proxy because it is one: metres times
                            cross-section ranks two answers the way a price
                            would, without a rate card to keep up to date. */}
                        <p className="tr-scn-n">
                          Ordered cheapest first, by length and cross-section.
                          Nothing is changed until you set the cable yourself.
                        </p>
                      </>
                    )}
                  </div>
                )}

                <table className="gt-tbl">
                  <thead>
                    <tr>
                      {/* The voltage this length of cable starts with.

                          The %VD column says how much has been lost by
                          the far end; this says what is arriving at the
                          near one, which is the figure the next length
                          is worked from. Leftmost because it is read
                          before the leg, not after it. */}
                      {trace.hasVd && (
                        <th className="num" title="Voltage arriving at the start of this leg">V</th>
                      )}
                      <th>Leg</th>
                      <th title="The cable this leg is made of">Cable</th>
                      <th className="num">Length</th>
                      {/* The original's two figures, and the pair is the
                          point: Distribution is what this length of cable
                          feeds directly, Terminal is everything beyond its
                          far end. A leg carrying nothing but passing forty
                          meters on still needs sizing for forty. */}
                      <th className="num" title="Meters fed along this leg">Dist.</th>
                      <th className="num" title="Meters beyond the end of this leg">Term.</th>
                      {trace.hasVd && (
                        <>
                          <th className="num" title="Phase current at the end of this leg">A</th>
                          <th className="num" title="Loop impedance from the substation">&#937;</th>
                          <th className="num" title="Volt drop from the substation">%VD</th>
                        </>
                      )}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {tracePlan.map(({ leg: l, i }) => (
                      <tr key={i} className={traceLeg === i ? "gt-on" : undefined}>
                        {trace.hasVd && (
                          <td className="num gt-v">
                            {l.volts != null ? `${l.volts.toFixed(1)} V` : "\u2014"}
                          </td>
                        )}
                        <td>
                          {/* Each leg carries its own start: the table is
                              a route down the network, not a list of
                              things measured from one point. */}
                          <strong>{l.from}</strong> &rarr;{" "}
                          {l.to ?? <em className="gt-dead">dead end, no meter</em>}
                        </td>
                        {/* A run with no cable set is not a run with no
                            cable; saying so is more use than a blank. */}
                        <td className="gt-cable">
                          {l.cable ?? <em className="gt-dead">not set</em>}
                        </td>
                        <td className="num">{l.metres.toFixed(1)} m</td>
                        <td className="num">{l.distribution}</td>
                        <td className="num strong">{l.terminal}</td>
                        {trace.hasVd && (l.vd?.missing ? (
                          /* Named rather than dashed: which spec is
                             missing decides where to go and put it. */
                          <td colSpan={3} className="num vd-gap"
                            title={l.vd.missingTransformer
                              ? "Set a transformer on the substation"
                              : "Set a cable on every span node along this route"}>
                            {l.vd.missingTransformer ? "transformer not set" : "cable not set"}
                          </td>
                        ) : (
                          <>
                            <td className="num">{l.vd.amps.toFixed(1)}</td>
                            <td className={l.vd.overOhms ? "num vd-over" : "num"}>
                              {l.vd.ohms.toFixed(3)}
                            </td>
                            <td className={l.vd.overPct ? "num vd-over" : "num"}>
                              {l.vd.pct.toFixed(2)}
                            </td>
                          </>
                        ))}
                        <td className="num">
                          {/* Reading a leg off a table is one thing;
                              finding it on an estate-sized plan is
                              another. */}
                          <button className="gt-hi"
                            onClick={() => {
                              const on = traceLeg === i;
                              setTraceLeg(on ? null : i);
                              /* Highlighting a leg on an estate-sized
                                 plan only helps if it is on screen.
                                 Framed from the leg's own path rather
                                 than from a feature id — a leg runs
                                 between two points and may cross several
                                 cables, so there is no one feature to
                                 frame. */
                              if (!on && (l.path || []).length) zoomToPoints(l.path);
                            }}>
                            {traceLeg === i ? "Hide" : "Show"}
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr className="gt-tot">
                      <td colSpan={trace.hasVd ? 3 : 2}>{trace.legs.length} leg(s)</td>
                      <td className="num">{trace.totalMetres.toFixed(1)} m</td>
                      <td className="num">
                        {trace.legs.reduce((t, l) => t + l.distribution, 0)}
                      </td>
                      <td className="num">{trace.totalMeters}</td>
                      {trace.hasVd && <td colSpan={3} className="num vd-note">
                        limits {trace.limits.maxLoopOhms}&#937; / {trace.limits.maxVoltDropPct}%
                      </td>}
                      <td />
                    </tr>
                  </tbody>
                </table>
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
.gis-canvas-wrap canvas.grab { cursor: grab; }
/* Empty space invites a drag, so say so — but only in select mode,
   where a click is not about to draw something. */
.gis-canvas-wrap canvas.pannable:active { cursor: grabbing; }
.gis-canvas-wrap canvas.grab:active { cursor: grabbing; }
/* Top left, clear of the panels that report on a selection — plots are
   placed while looking at the drawing, not at a table. */
.gis-place { position: absolute; left: 12px; top: 12px; z-index: 7; width: 258px;
  max-height: 78%; overflow-y: auto; background: var(--white);
  border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px;
  box-shadow: 0 10px 30px rgba(15,23,42,.18); }
.gp-x { position: absolute; right: 8px; top: 8px; }
/* Used by the service check and classification panels. Both were written
   referring to these names after the styles had gone with an earlier
   panel, so both were rendering unstyled. */
.tc-sum { font-size: 12px; margin: 0 0 8px; }
.tc-sum em { font-style: normal; color: #92400e; }
.tc-ok { font-size: 12.5px; font-weight: 600; color: var(--ok-text); margin: 0; }
.tc-row { cursor: pointer; }
.tc-row:hover { background: var(--accent-light); }
.tc-hint { font-size: 10.5px; color: var(--muted); margin: 7px 0 0; }
.cl-again { display: flex; align-items: center; gap: 7px; margin: 10px 0 0; font-size: 11px;
  color: var(--muted); cursor: pointer; }
.tr-stale { background: #fffbeb; border: 1px solid #fcd34d; color: #92400e;
  border-radius: 6px; cursor: pointer; font: 700 11px inherit; padding: 4px 10px;
  margin-right: 8px; }
.tr-stale:hover { border-color: #d97706; }
.tr-stale { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px;
  cursor: pointer; font: 700 11px inherit; padding: 4px 10px; margin-right: 8px;
  color: #b45309; }
.tr-stale:hover { background: #fef3c7; }
.tr-ord { background: var(--white); border: 1px solid var(--border); border-radius: 6px;
  cursor: pointer; font: 600 11px inherit; padding: 4px 10px; margin-right: 8px;
  color: var(--accent); }
.tr-ord:hover { border-color: var(--accent); }
.tr-fix { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; border-radius: 6px;
  cursor: pointer; font: 700 11px inherit; padding: 4px 10px; margin-right: 8px; }
.tr-fix:hover { border-color: #dc2626; }
.tr-scn { border-bottom: 1px solid var(--border); background: var(--bg); padding: 11px 16px; }
.tr-scn-h { display: flex; justify-content: space-between; align-items: baseline; }
.tr-scn-h button { background: none; border: none; cursor: pointer; font: 600 11px inherit;
  color: var(--muted); }
.tr-scn-l { margin: 7px 0; padding-left: 20px; display: grid; gap: 6px; font-size: 12.5px; }
.tr-scn-l li { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.tr-scn-t { min-width: 0; }
.tr-scn-go { flex: none; background: var(--white); border: 1px solid var(--border);
  border-radius: 6px; cursor: pointer; font: 600 11px inherit; padding: 3px 10px;
  color: var(--accent); }
.tr-scn-go:hover:not(:disabled) { border-color: var(--accent); }
.tr-scn-go:disabled { opacity: .5; cursor: not-allowed; }
.tr-scn-m { color: var(--muted); font-size: 11px; }
.tr-scn-p { color: var(--muted); }
.tr-scn-c { color: var(--muted); font-weight: 600; }
.tr-scn-n { margin: 5px 0 0; font-size: 11.5px; color: var(--muted); line-height: 1.45; }
.gis-ctx { position: absolute; z-index: 30; background: var(--white);
  border: 1px solid var(--border); border-radius: 9px; padding: 5px; min-width: 168px;
  box-shadow: 0 10px 28px rgba(15,23,42,.2);
  /* The backstop for a menu taller than the panel it sits in, where
     flipping it cannot help: it starts at the top and scrolls, rather
     than running off the bottom either way. */
  max-height: 80%; overflow-y: auto; }
.gc-head { margin: 3px 8px 5px; font-size: 9.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: var(--muted); }
.gc-item { display: block; width: 100%; text-align: left; background: none; border: none;
  border-radius: 6px; cursor: pointer; font: 500 12.5px inherit; color: var(--text);
  padding: 6px 9px; }
.gc-item:hover:not(:disabled) { background: var(--bg); }
.gc-item:disabled { color: var(--muted); cursor: not-allowed; }
.gc-item.danger { color: #b91c1c; }
.gc-item.danger:hover { background: #fef2f2; }
.gc-sep { height: 1px; background: var(--border); margin: 4px 0; }
/* Wide enough to read a leg on one line.

   At 380px "A16 → A20" wrapped onto two rows and the row grew to fit,
   which on twenty legs is a table that scrolls twice as far as it needs
   to. The columns are short — two labels, a length and two counts — so
   the width was the constraint rather than the content.

   Capped against the viewport so it cannot run off a laptop screen, and
   the volt drop variant stays proportionally wider for its four extra
   columns. */
.gt-wide { width: min(760px, 46vw); }
.gis-trace.gt-vd { width: min(1120px, 62vw); }
.vd-over { color: #dc2626; font-weight: 700; }
.gt-v { font-weight: 700; color: #0f172a; white-space: nowrap; }
.gt-cable { color: var(--muted); font-size: 11px; white-space: nowrap; }
.vd-gap { font-size: 10.5px; color: #b45309; font-style: italic; }
.vd-note { font-size: 10px; color: var(--muted); font-weight: 500; }
.gt-sub { margin: 2px 0 0; font-size: 11px; color: var(--muted); }
.gt-dead { color: var(--muted); font-style: italic; font-size: 11.5px; }
.gt-hi { background: none; border: 1px solid var(--border); border-radius: 5px; cursor: pointer;
  font: 600 10.5px inherit; padding: 2px 7px; color: var(--muted); }
.gt-hi:hover { border-color: var(--accent); color: var(--accent); }
.dt .gt-on, .gt-tbl tr.gt-on { background: var(--accent-light); }
/* The step-through bar. Sits with the other floating panels rather than
   in a dialog: the point of it is watching the drawing while moving from
   meter to meter. */
/* The call-off panel, floating like the others: the point is picking
   nodes on the drawing, so it must not cover it. */
.gis-co { position: absolute; right: 16px; top: 70px; z-index: 40; width: 320px;
  max-height: 70vh; overflow-y: auto; background: var(--white);
  border: 1px solid var(--border); border-radius: 10px; padding: 11px 13px;
  box-shadow: 0 4px 18px rgba(0,0,0,.13); font-size: 12px; }
.gco-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.gco-head strong { font-size: 13px; }
.gco-hint { flex: 1; font-size: 10.5px; color: var(--muted); }
.gco-x { background: none; border: none; cursor: pointer; color: var(--muted);
  font: 600 11px inherit; padding: 0 3px; }
.gco-x:hover { color: #b91c1c; }
.gco-size { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px;
  padding: 9px 0; border-bottom: 1px solid var(--border); }
.gco-size-fig { font: 700 13px inherit; color: var(--text); }
.gco-size-why { flex-basis: 100%; font-size: 11.5px; color: var(--muted);
  line-height: 1.5; }

.gco-none { color: var(--muted); font-style: italic; margin: 6px 0; }
.gco-range { border: 1px solid var(--border); border-radius: 7px; padding: 7px 9px;
  margin-bottom: 6px; }
.gco-range-head { display: flex; align-items: center; gap: 7px; margin-bottom: 4px; }
.gco-f { flex: 1; font-size: 10.5px; color: var(--muted); }
.ins-util { text-transform: capitalize; }
/* Wide enough for a cable size — "185mm\u00b2 WF Al" is longer than the
   circuit label it replaced, and a truncated cable size is a cable size
   nobody can act on. */
.ins-label { font-weight: 700; flex: 1 1 auto; min-width: 0; }
.gco-plots { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.gco-span { display: flex; gap: 8px; font-size: 11px; padding: 1px 0;
  margin-top: 3px; }
.gco-sp { font-weight: 700; width: 62px; }
.gco-m { width: 52px; color: var(--muted); }
.gco-p { flex: 1; color: var(--muted); }
.gco-err { color: #b91c1c; font-weight: 600; font-size: 11px; margin: 4px 0; }
.gco-warn { color: #b45309; font-weight: 600; font-size: 11px; margin: 4px 0; }
.gl-panel { position: absolute; right: 16px; bottom: 16px; z-index: 40;
  width: min(680px, calc(100vw - 32px)); max-height: 60vh; display: flex;
  flex-direction: column; background: var(--white); border: 1px solid var(--border);
  border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.16); }
.gl-head { display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  border-bottom: 1px solid var(--border); font-size: 13px; }
.gl-low { color: var(--muted); font-size: 12px; margin-left: auto; }
.gl-verdict { font: 700 11.5px inherit; padding: 3px 9px; border-radius: 20px; }
.gl-verdict.ok { background: var(--ok-bg); color: var(--ok-text); }
.gl-verdict.warn { background: var(--warn-bg); color: var(--warn-text); }
.gl-verdict.bad { background: var(--err-bg); color: var(--err-text); }
.gl-thresh { font-weight: 500; opacity: .8; }
.gl-x { border: 0; background: none; font-size: 18px; line-height: 1; cursor: pointer;
  color: var(--muted); padding: 0 4px; }
.gl-body { overflow: auto; padding: 4px 12px 12px; }
.gl-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
.gl-tbl th, .gl-tbl td { padding: 5px 8px; border-bottom: 1px solid var(--border);
  text-align: left; white-space: nowrap; }
.gl-tbl th { font: 700 10px inherit; color: var(--muted); text-transform: uppercase;
  letter-spacing: .04em; position: sticky; top: 0; background: var(--white); }
.gl-tbl .num { text-align: right; font-variant-numeric: tabular-nums; }
.gl-fit { color: var(--muted); }
/* A row points at a pipe, so it behaves like something you can follow. */
.gl-row { cursor: pointer; }
.gl-row:hover td { background: var(--bg); }
.gl-tbl tr.bad td { background: var(--err-bg); color: var(--err-text); font-weight: 700; }
.gl-tbl tr.warn td { background: var(--warn-bg); color: var(--warn-text); }
.gl-pass { font-size: 12px; color: var(--ok-text); background: var(--ok-bg);
  border-radius: 7px; padding: 7px 10px; margin: 10px 0 0; }
.gl-advice { border-top: 1px solid var(--border); margin-top: 10px; padding-top: 10px; }
.gl-advice-h { font: 700 12px inherit; color: var(--err-text); margin: 0 0 4px; }
.gl-fixes { margin: 6px 0 0; padding: 0; list-style: none; font-size: 12px; }
.gl-fixes li { display: flex; align-items: center; gap: 10px; padding: 5px 0;
  border-bottom: 1px solid var(--border); }
.gl-fixes li:last-child { border-bottom: 0; }
.gl-fix-t { flex: 1; min-width: 0; line-height: 1.5; }

.gl-note { font-size: 11.5px; color: var(--muted); line-height: 1.55; margin: 8px 0 0; }

.gco-utils { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px;
  padding: 8px 0 2px; border-top: 1px solid var(--border); margin-top: 8px; }
.gco-utils-label { font: 700 10px inherit; color: var(--muted);
  text-transform: uppercase; letter-spacing: .04em; }
.gco-util { display: inline-flex; align-items: center; gap: 5px; font-size: 12px;
  cursor: pointer; }

.gco-foot { display: flex; align-items: center; gap: 9px; margin-top: 9px;
  padding-top: 9px; border-top: 1px solid var(--border); }
.gco-tot { flex: 1; font-weight: 700; }
/* The prompt sits above the list, where the eye already is after
   picking, rather than at the foot where the totals are. */
.gco-ask { display: flex; align-items: center; gap: 8px; margin-bottom: 9px;
  padding: 8px 10px; background: #eff6ff; border: 1px solid #bfdbfe;
  border-radius: 8px; }
.gco-ask strong { flex: 1; font-size: 12.5px; }
.gco-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 10px; }
.gco-fld { display: flex; flex-direction: column; gap: 2px; font-size: 11px; }
.gco-fld.wide { grid-column: 1 / -1; }
.gco-fld > span { font: 700 9.5px inherit; color: var(--muted);
  text-transform: uppercase; letter-spacing: .04em; }
.gco-fld input, .gco-fld select, .gco-fld textarea {
  font: 500 11.5px inherit; padding: 4px 7px;
  border: 1px solid var(--border); border-radius: 5px; width: 100%; }
.gis-step { position: absolute; left: 50%; transform: translateX(-50%);
  bottom: 18px; z-index: 40; display: flex; align-items: center; gap: 10px;
  background: var(--white); border: 1px solid var(--border); border-radius: 10px;
  padding: 7px 12px; box-shadow: 0 4px 18px rgba(0,0,0,.13); font-size: 12px;
  max-width: 92%; flex-wrap: wrap; }
.gsp-b { background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
  cursor: pointer; font: 700 13px inherit; padding: 2px 10px; }
.gsp-b:disabled { opacity: .4; cursor: not-allowed; }
.gsp-n { color: var(--muted); font-weight: 600; white-space: nowrap; }
.gsp-plot { color: #7c3aed; white-space: nowrap; }
.gsp-f { color: var(--muted); white-space: nowrap; }
.gsp-warn { color: #b45309; font-weight: 600; }
.gsp-bad { color: #b91c1c; font-weight: 600; }
.gsp-jump { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px;
  cursor: pointer; font: 600 11px inherit; padding: 3px 10px; color: #b91c1c; }
.gsp-x { background: none; border: none; cursor: pointer; font: 600 11.5px inherit;
  color: var(--accent); }
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
.gis-undo { position: relative; display: inline-flex; align-items: center; gap: 2px;
  margin-left: 6px; }
.gu-b, .gu-c { background: var(--white); border: 1px solid var(--border); cursor: pointer;
  font: 600 11.5px inherit; padding: 5px 10px; color: var(--text); }
.gu-b:first-child { border-radius: 7px 0 0 7px; }
.gu-c { border-radius: 0 7px 7px 0; padding: 5px 7px; }
.gu-b:disabled, .gu-c:disabled { opacity: .4; cursor: not-allowed; }
.gu-b:not(:disabled):hover, .gu-c:not(:disabled):hover { border-color: var(--accent);
  color: var(--accent); }
.gu-list { position: absolute; top: 100%; left: 0; margin-top: 4px; z-index: 40;
  background: var(--white); border: 1px solid var(--border); border-radius: 8px;
  padding: 5px; width: 300px; box-shadow: 0 10px 28px rgba(15,23,42,.18); }
.gu-head { margin: 3px 7px 5px; font: 700 10px inherit; text-transform: uppercase;
  letter-spacing: .05em; color: var(--muted); }
.gu-item { display: grid; gap: 1px; width: 100%; text-align: left; background: none;
  border: none; border-radius: 5px; padding: 5px 8px; cursor: pointer; font: inherit; }
.gu-item:hover { background: var(--accent-light); }
.gu-item > span:first-child { font-size: 12.5px; font-weight: 600; }
.gu-n { font-size: 10.5px; color: var(--muted); }
.gis-checked { position: absolute; right: 12px; top: 44px; z-index: 6; display: flex;
  align-items: center; gap: 10px; background: var(--white); border: 1px solid #fca5a5;
  color: #b91c1c; border-radius: 8px; padding: 6px 11px;
  font: 600 11.5px inherit; box-shadow: 0 4px 14px rgba(15,23,42,.12); }
.gis-checked button { background: none; border: none; cursor: pointer;
  font: 600 11px inherit; color: var(--accent); text-decoration: underline; }
.gis-suggest { position: absolute; left: 50%; transform: translateX(-50%); top: 12px;
  z-index: 7; display: flex; align-items: center; gap: 9px; background: var(--white);
  border: 1px solid var(--border); border-radius: 9px; padding: 7px 12px;
  box-shadow: 0 8px 26px rgba(15,23,42,.16); font: 600 11.5px inherit; }
.gsg-t { color: var(--text); }
.gsg-dot { width: 11px; height: 11px; border-radius: 50%; display: inline-block; }
.gsg-n, .gsg-w { font-weight: 500; font-size: 11px; }
.gsg-n { color: var(--muted); }
.gsg-w { color: #b45309; }
.gsg-go { background: var(--accent); border: none; color: #fff; border-radius: 6px;
  cursor: pointer; font: 700 11px inherit; padding: 4px 12px; }
.gsg-no { background: none; border: none; cursor: pointer; font: 600 11px inherit;
  color: var(--muted); text-decoration: underline; }
.gsg-go:disabled, .gsg-no:disabled { opacity: .5; cursor: not-allowed; }
/* Find, on the bar. The wrapper is what the results hang from, so the
   list follows the box wherever the bar wraps to. */
.gis-findbox { position: relative; display: inline-flex; align-items: center; }
.gis-find-in { width: 210px; border: 1px solid var(--border); border-radius: 7px;
  font: 500 12px inherit; padding: 6px 24px 6px 9px; color: var(--text);
  background: var(--white); }
.gis-find-in:focus { outline: none; border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light); }
.gf-x { position: absolute; right: 6px; background: none; border: none;
  cursor: pointer; font-size: 15px; color: var(--muted); line-height: 1; padding: 0 2px; }
/* Hangs under the box rather than sitting in it, so the bar keeps its
   height and the drawing is not covered until there is something to
   show. */
.gf-list { position: absolute; top: 100%; left: 0; margin-top: 4px; z-index: 40;
  width: 300px; max-height: 300px; overflow-y: auto; background: var(--white);
  border: 1px solid var(--border); border-radius: 9px; padding: 5px;
  box-shadow: 0 10px 30px rgba(15,23,42,.18); }
.gf-row { display: flex; align-items: baseline; gap: 8px; width: 100%; background: none;
  border: none; cursor: pointer; text-align: left; padding: 5px 8px; border-radius: 5px;
  font: 500 11.5px inherit; }
.gf-row:hover { background: var(--bg); }
.gf-l { flex: 1; }
.gf-w { color: var(--muted); font-size: 10.5px; }
.gf-none, .gf-more { margin: 6px 8px; font-size: 11px; color: var(--muted); }
.gis-locked { border-color: #94a3b8; color: #475569; }
.gis-hidden { position: absolute; left: 12px; top: 12px; z-index: 6; display: flex;
  align-items: center; gap: 8px; background: #fffbeb; border: 1px solid #fcd34d;
  color: #92400e; border-radius: 8px; padding: 6px 11px; cursor: pointer;
  font: 600 11.5px inherit; box-shadow: 0 4px 14px rgba(15,23,42,.12); }
.gis-hidden:hover { border-color: #d97706; }
/* Sits under the hidden-layers notice when both are showing. */
.gis-stale { top: 52px; }
.gis-hidden strong { text-decoration: underline; }
.gis-elec { position: absolute; right: 12px; top: 12px; z-index: 5; display: flex;
  align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; max-width: 45%; }
.ge-poc { background: #0f766e; color: #fff; border-radius: 20px; padding: 2px 10px;
  font: 700 10.5px inherit; }
.ge-c { background: var(--white); border: 1px solid var(--accent); color: var(--accent);
  border-radius: 20px; padding: 2px 9px; font: 700 10.5px inherit; display: inline-flex;
  align-items: center; gap: 5px; }
.ge-c em { font-style: normal; font-weight: 600; color: var(--muted); }
.gis-picker { position: absolute; z-index: 6; width: 290px; background: var(--white);
  border: 1px solid var(--border); border-radius: 8px; padding: 5px;
  box-shadow: 0 10px 28px rgba(15,23,42,.18); }
.gp-head { margin: 3px 7px 5px; font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .07em; color: var(--muted); }
.gp-item { display: grid; grid-template-columns: 12px 1fr; gap: 2px 8px; width: 100%;
  text-align: left; background: none; border: none; border-radius: 5px; padding: 5px 7px;
  cursor: pointer; font: inherit; color: var(--text); align-items: center; }
.gp-item:hover { background: var(--accent-light); }
/* The row hover, not the button's, so the whole entry lights up
   whichever half the pointer is over. */
.gp-row { display: flex; align-items: center; gap: 4px; border-radius: 5px; }
.gp-row:hover { background: var(--accent-light); }
.gp-row:hover .gp-item { background: none; }
.gp-row .gp-item { flex: 1; min-width: 0; }
.gp-edit { flex: none; background: none; border: 1px solid transparent; border-radius: 5px;
  cursor: pointer; font: 600 11px inherit; color: var(--muted); padding: 3px 9px; }
/* Kept quiet until the row is under the pointer: three Edit buttons
   competing with the names is a busier list than the one it replaced. */
.gp-row:hover .gp-edit { border-color: var(--border); color: var(--accent);
  background: var(--white); }
.gp-edit:hover { border-color: var(--accent); }
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
/* Sits with the menu buttons and reads as one of them, without being a
   menu: no chevron, and it opens on the way down rather than waiting to
   see whether a list is coming. */
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

/* Touched 2026-08-03 10:22 UTC to force a rebuild. */
