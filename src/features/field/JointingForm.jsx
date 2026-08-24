import { useRef, useEffect, useState } from "react";
import {
  CHECKLIST, CINR, OUTCOMES, TESTS, JOB_FIELDS, DEFAULT_CUTOUT,
  PHOTO_KINDS, JOINT_TYPES, plotsOf, emptyPlot, breechesFor,
  routeUnknownFor, jointKey, jointPages, sizesFor,
} from "./jointingInstruction.js";

/* The jointing work instruction, laid out as the paper form is.

   ── Why it looks like this ──

   This is the document the business already uses, and a gang filling it
   in on a tablet should recognise the sheet they have filled in on
   paper for years. The order of the cards, the wording of the tasks,
   the yellow C/I/NR boxes and the green test boxes are all from that
   form. Where this differs from the paper it is because a screen can do
   something paper cannot — never because a different arrangement seemed
   tidier.

   ── Two pages ──

   Work Instruction, then Joint Location Sketches. Tabs rather than one
   long scroll: the sketches are worked on at the hole and the
   instruction at the van, and they are not filled in together.

   ── Yellow and green ──

   The paper form colours the boxes the operative fills in. Yellow is a
   C/I/NR judgement, green is a measured number. Everything uncoloured
   is the office's and is locked here — the gang can read it and cannot
   retype it, which is how a job number stops being transposed onto the
   one document carrying the test results.

   ── Breech joints stand on their own ──

   One block each, like the plots. A breech joint is a hole with a gang
   in it: its own specs, its own completion, its own sketch. Nested
   under a plot it read as a detail of that plot, and it is not — one
   joint commonly feeds several, so the same hole appeared three times
   and looked like three jobs. */

const setIn = (obj, key, patch) => ({
  ...(obj || {}),
  [key]: { ...((obj || {})[key] || {}), ...patch },
});

/* ── A sketch pad ──

   One per joint. Drawn with a finger on a tablet, which is why the
   strokes are captured from pointer events rather than mouse ones and
   why the canvas is backed at device pixel ratio: a line drawn on a
   retina screen and stored at CSS resolution comes back furry.

   The image is held as a data URL on the payload. It is the only thing
   on this form that cannot be retyped from memory, so it is written on
   every stroke end rather than on a save button somebody might not
   press. */
function SketchPad({ value, onChange, disabled }) {
  const ref = useRef(null);
  const ctx = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const dirty = useRef(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const w = c.clientWidth || 600;
    const h = 260;
    c.width = w * ratio;
    c.height = h * ratio;
    /* Guarded. getContext returns null where the canvas backend is
       unavailable, and calling scale on that took the whole work
       instruction down with it — a gang would have got a blank screen
       instead of a form, over a drawing box.

       The rest of the sheet does not depend on the sketch, so a pad
       that cannot draw degrades to a pad that cannot draw. */
    const g = c.getContext("2d");
    if (!g) return;
    g.scale(ratio, ratio);
    g.lineWidth = 2.2;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#1d2733";
    ctx.current = g;

    /* Whatever was drawn before, put back. A tab change unmounts the
       canvas and a blank one on return would read as work lost. */
    if (value) {
      const img = new Image();
      img.onload = () => g.drawImage(img, 0, 0, w, h);
      img.src = value;
      dirty.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const at = (e) => {
    const r = ref.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e) => {
    if (disabled || !ctx.current) return;
    drawing.current = true;
    dirty.current = true;
    last.current = at(e);
    try { ref.current.setPointerCapture(e.pointerId); } catch { /* not fatal */ }
    e.preventDefault();
  };
  const move = (e) => {
    if (!drawing.current || disabled || !ctx.current) return;
    const p = at(e);
    const g = ctx.current;
    g.beginPath();
    g.moveTo(last.current.x, last.current.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    last.current = p;
    e.preventDefault();
  };
  /* Written on the way up, not on every move: a data URL per stroke is
     one save, a data URL per pixel is a request a second. */
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    try { onChange(ref.current.toDataURL("image/png")); }
    catch { /* No backend to read the pixels back from. */ }
  };

  const clear = () => {
    const c = ref.current;
    ctx.current?.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
    onChange("");
  };

  return (
    <div className="jf-sig-wrap">
      <canvas ref={ref} className="jf-sketch"
        onPointerDown={down} onPointerMove={move}
        onPointerUp={up} onPointerCancel={up} />
      {!disabled && (
        <button type="button" className="jf-btn jf-btn-sm jf-sig-clear"
          onClick={clear}>Clear</button>
      )}
    </div>
  );
}

/* Photographs, by purpose. Held as data URLs on the payload for the
   same reason the sketch is: the tablet is the only place they exist
   until the form is sent, and a photograph lost to a sleeping screen is
   a site visit repeated. */
function Photos({ shot, onAdd, onRemove }) {
  return (
    <div className="jf-photos">
      <div className="jf-photos-title">Photos &mdash; attach by purpose</div>
      <div className="jf-pcats">
        {PHOTO_KINDS.map((k) => (
          <div className="jf-pcat" key={k.key}>
            <label className="jf-photo-add">
              Add {k.label} Photo
              <input type="file" accept="image/*" capture="environment" hidden
                onChange={(e) => onAdd(k.key, e.target.files?.[0], e)} />
            </label>
            <div className="jf-thumbs">
              {(shot?.[k.key] || []).map((src, i) => (
                <span className="jf-thumb" key={i}>
                  <img src={src} alt={`${k.label} ${i + 1}`} />
                  <button type="button" onClick={() => onRemove(k.key, i)}
                    aria-label="Remove photo">&times;</button>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* The colours and stroke widths on the toolbar. */
const INK = ["#1d2733", "#c0392b", "#2563eb", "#0f766e"];
const SIZES = [1.5, 2.5, 4, 6];

/* What can be dropped onto a sketch.

   One component, not five: a dimension. The others on the office tool —
   building, cable, joint, bottle end — are the design, and the design
   is already underneath as the as-laid drawing. What a gang adds on
   site is the measurement back to something permanent, which is the one
   thing the drawing cannot know. */
const DIMENSION = { kind: "dim", label: "0.0 m" };

/* ── The sketch, over the design ──

   The backdrop is the as-laid electric drawing rendered when the
   call-off was raised — the map under it, faded, with the cable over
   the top. So a gang marks the joint against the run as laid rather
   than a blank rectangle, and the office reading it afterwards is
   looking at the same cable.

   ── Two layers, and why ──

   Freehand strokes and dropped items are held as data, not as pixels.
   That is what lets Undo remove the last thing rather than the last
   frame, Delete remove a selected item, and a dimension be dragged
   after it is dropped. A canvas that only keeps pixels can do none of
   those, and the toolbar would be four buttons that cannot work.

   The image handed out on change is that data rendered — so what the
   office receives is still a picture. */
function JointSketch({ backdrop, value, onChange }) {
  const wrap = useRef(null);
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const [bg, setBg] = useState(true);
  const [locked, setLocked] = useState(false);
  const [tool, setTool] = useState("draw");        // draw | select
  const [colour, setColour] = useState(INK[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [sel, setSel] = useState(null);

  /* The marks, as data. Parsed from what was saved, so leaving the page
     and coming back does not lose them. */
  const shapes = (() => {
    try { return value ? JSON.parse(value).shapes ?? [] : []; }
    catch { return []; }
  })();

  const commit = (next) => onChange(JSON.stringify({ v: 1, shapes: next }));

  const drawing = useRef(null);
  const drag = useRef(null);

  const at = (e) => {
    const r = wrap.current.getBoundingClientRect();
    /* Normalised 0–1, so a sketch drawn on a phone lands in the same
       place when the office opens it on a monitor. */
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const down = (e) => {
    if (locked) return;
    const p = at(e);
    if (tool === "select") {
      const hit = [...shapes].reverse().find((s) => nearShape(s, p));
      setSel(hit?.id ?? null);
      if (hit) drag.current = { id: hit.id, from: p };
      return;
    }
    drawing.current = { id: `s${Date.now()}`, kind: "ink", colour, size, pts: [p] };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const move = (e) => {
    if (locked) return;
    const p = at(e);
    if (drag.current) {
      const dx = p.x - drag.current.from.x;
      const dy = p.y - drag.current.from.y;
      drag.current.from = p;
      commit(shapes.map((s) => (s.id === drag.current.id ? shift(s, dx, dy) : s)));
      return;
    }
    if (!drawing.current) return;
    drawing.current.pts.push(p);
    commit([...shapes.filter((s) => s.id !== drawing.current.id), { ...drawing.current }]);
  };

  const up = () => {
    if (drawing.current) commit([...shapes.filter((s) => s.id !== drawing.current.id),
      { ...drawing.current }]);
    drawing.current = null;
    drag.current = null;
  };

  const drop = () => {
    const s = {
      id: `d${Date.now()}`, ...DIMENSION, colour, size,
      /* Dropped in the middle, then dragged. Anywhere else and it lands
         under a finger that is about to move it. */
      a: { x: 0.35, y: 0.5 }, b: { x: 0.65, y: 0.5 },
    };
    commit([...shapes, s]);
    setSel(s.id);
    setTool("select");
  };

  const addText = () => {
    const words = typeof prompt === "function" ? prompt("Label") : null;
    if (!words) return;
    const s = { id: `t${Date.now()}`, kind: "text", words, colour, size,
      a: { x: 0.5, y: 0.5 } };
    commit([...shapes, s]);
    setSel(s.id);
  };

  const undo = () => commit(shapes.slice(0, -1));
  const del = () => { commit(shapes.filter((s) => s.id !== sel)); setSel(null); };
  const clear = () => { commit([]); setSel(null); };

  const zoom = (by) => setView((v) => ({
    ...v, z: Math.min(6, Math.max(0.5, Math.round((v.z + by) * 100) / 100)),
  }));

  const panDown = (e) => {
    if (!locked && !e.shiftKey) return;
    drag.current = null;
    wrap.current._pan = { x: e.clientX - view.x, y: e.clientY - view.y };
  };
  const panMove = (e) => {
    const p = wrap.current?._pan;
    if (!p) return;
    setView((v) => ({ ...v, x: e.clientX - p.x, y: e.clientY - p.y }));
  };
  const panUp = () => { if (wrap.current) wrap.current._pan = null; };

  return (
    <div className="jf-sketchwrap">
      <div className="jf-sketchbar">
        <span className="jf-sketchbar-l">Background</span>
        <button type="button" className={`jf-chip${bg ? " on" : ""}`}
          onClick={() => setBg(true)} aria-pressed={bg}>Site plan</button>
        <button type="button" className={`jf-chip${bg ? "" : " on"}`}
          onClick={() => setBg(false)} aria-pressed={!bg}>None</button>
        <span className="jf-sketchbar-sp" />
        <button type="button" className="jf-chip" onClick={() => zoom(-0.25)}
          aria-label="Zoom out">&minus;</button>
        <span className="jf-zoomval">{Math.round(view.z * 100)}%</span>
        <button type="button" className="jf-chip" onClick={() => zoom(0.25)}
          aria-label="Zoom in">+</button>
        <button type="button" className="jf-chip"
          onClick={() => setView({ z: 1, x: 0, y: 0 })}>Reset view</button>
      </div>

      <div className="jf-sketchstage" ref={wrap}
        onPointerDown={(e) => { panDown(e); down(e); }}
        onPointerMove={(e) => { panMove(e); move(e); }}
        onPointerUp={() => { panUp(); up(); }}
        onPointerLeave={() => { panUp(); up(); }}>
        {bg && backdrop && (
          <img className="jf-sketchbg" src={backdrop} alt="As-laid electric drawing over the site plan"
            draggable={false}
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }} />
        )}
        {bg && !backdrop && (
          <p className="jf-nobg">
            No as-laid drawing was captured when this call-off was raised.
          </p>
        )}
        <svg className="jf-sketchink" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <marker id="jfArrow" viewBox="0 0 10 10" refX="5" refY="5"
              markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M 0 2 L 5 5 L 0 8 z" fill="currentColor" />
            </marker>
          </defs>
          {shapes.map((s) => (
            <Shape key={s.id} s={s} selected={s.id === sel} />
          ))}
        </svg>
      </div>

      {/* ── The toolbar ──

          Under the pane, and only what a gang uses: a line, a colour, a
          weight, a label, a dimension, and the four view controls. */}
      <div className="jf-tools">
        <div className="jf-toolrow">
          <span className="jf-toollabel">Tool</span>
          <button type="button" className={`jf-tool${tool === "draw" ? " on" : ""}`}
            onClick={() => setTool("draw")} aria-pressed={tool === "draw"}
            title="Draw a line">&#9585;&#9586;</button>
          <button type="button" className={`jf-tool${tool === "select" ? " on" : ""}`}
            onClick={() => setTool("select")} aria-pressed={tool === "select"}
            title="Select / move">&#10530;</button>

          <span className="jf-toollabel">Colour</span>
          {INK.map((c) => (
            <button key={c} type="button"
              className={`jf-swatch${c === colour ? " on" : ""}`}
              style={{ background: c }} onClick={() => setColour(c)}
              aria-label={`Colour ${c}`} aria-pressed={c === colour} />
          ))}

          <span className="jf-toollabel">Size</span>
          <input className="jf-sizer" type="range" min="0" max={SIZES.length - 1}
            value={SIZES.indexOf(size)} aria-label="Stroke size"
            onChange={(e) => setSize(SIZES[Number(e.target.value)])} />

          <button type="button" className="jf-btn jf-btn-sm jf-primary"
            onClick={addText}>+ Add Text</button>
        </div>

        <div className="jf-toolrow">
          <span className="jf-toollabel">Components</span>
          <button type="button" className="jf-tool wide" onClick={drop}
            title="Distance back to something permanent">
            &#8596; Dimension
          </button>

          <span className="jf-sketchbar-sp" />

          <button type="button" className={`jf-chip${locked ? " on" : ""}`}
            onClick={() => setLocked((v) => !v)} aria-pressed={locked}>
            {locked ? "View locked" : "Lock view"}
          </button>
          <button type="button" className="jf-chip" onClick={undo}
            disabled={!shapes.length}>Undo</button>
          <button type="button" className="jf-chip jf-danger-soft" onClick={del}
            disabled={!sel}>Delete</button>
          <button type="button" className="jf-chip jf-danger" onClick={clear}
            disabled={!shapes.length}>Clear All</button>
        </div>

        <p className="jf-hint jf-sketchtip">
          Draw with a finger. Tap <b>Dimension</b> to drop one in, then
          <b> Select / move</b> to drag it. <b>Lock view</b> to pan and zoom
          the plan without drawing on it.
        </p>
      </div>
    </div>
  );
}

/* One mark, drawn. Kept beside the data it draws so the two cannot
   drift — a shape this does not know how to draw is a shape that
   silently disappears from the sketch. */
function Shape({ s, selected }) {
  const w = s.size ?? 2.5;
  const stroke = { stroke: s.colour ?? "#1d2733", strokeWidth: w,
    fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };
  const sc = (p) => `${p.x * 100},${p.y * 100}`;

  if (s.kind === "ink") {
    return <polyline {...stroke} points={s.pts.map(sc).join(" ")}
      className={selected ? "sel" : undefined} />;
  }
  if (s.kind === "dim") {
    return (
      <g className={selected ? "sel" : undefined}>
        <line {...stroke} x1={s.a.x * 100} y1={s.a.y * 100}
          x2={s.b.x * 100} y2={s.b.y * 100} markerStart="url(#jfArrow)"
          markerEnd="url(#jfArrow)" />
        <text x={(s.a.x + s.b.x) * 50} y={(s.a.y + s.b.y) * 50 - 1.5}
          fill={s.colour} fontSize={w * 1.6} textAnchor="middle">{s.label}</text>
      </g>
    );
  }
  if (s.kind === "text") {
    return <text x={s.a.x * 100} y={s.a.y * 100} fill={s.colour}
      fontSize={w * 1.8} textAnchor="middle"
      className={selected ? "sel" : undefined}>{s.words}</text>;
  }
  return null;
}

/* Whether a tap landed on a mark. Generous, because a fingertip is
   wider than a 2px line and a Delete that needs a precise tap is a
   Delete nobody uses. */
function nearShape(s, p, tol = 0.04) {
  const close = (q) => q && Math.hypot(q.x - p.x, q.y - p.y) <= tol;
  if (s.kind === "ink") return (s.pts || []).some(close);
  if (s.kind === "dim") return close(s.a) || close(s.b)
    || close({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 });
  return close(s.a);
}

const shift = (s, dx, dy) => {
  const m = (q) => ({ x: q.x + dx, y: q.y + dy });
  if (s.kind === "ink") return { ...s, pts: s.pts.map(m) };
  if (s.kind === "dim") return { ...s, a: m(s.a), b: m(s.b) };
  return { ...s, a: m(s.a) };
};


export default function JointingForm({ job, payload, set, setPlot }) {
  /* ── The pages ──

     Site first, then a page for every joint, then the declaration. That
     is the order the work happens in: the sheet is picked up, the holes
     are worked through one at a time, and it is signed at the end.

     One joint per page rather than a stack, because the questions on
     each are the same and a page of repeated questions is a page where
     the answers go in the wrong row. */
  const joints = jointPages(job);
  const pages = [
    { id: "site", label: "Site", tag: "Details" },
    ...joints,
    { id: "sign", label: "Declaration", tag: "Sign-off" },
  ].map((p, i) => ({ ...p, key: p.key ?? p.id, n: i + 1 }));

  const [at, setAt] = useState(pages[0].key);
  const here = pages.find((p) => p.key === at) ?? pages[0];
  const idx = pages.indexOf(here);
  const go = (d) => setAt(pages[Math.max(0, Math.min(pages.length - 1, idx + d))].key);

  const jobDetail = payload?.job || {};
  const setJob = (k, v) => set("job", { ...jobDetail, [k]: v });
  const setMark = (i, v) => set("checklist", { ...(payload?.checklist || {}), [i]: v });

  /* One joint's answers, under its own key. Service joints and breech
     joints share the shape — everything but the test results is asked
     of both. */
  const ansOf = (k) => payload?.joints?.[k] || {};
  const setAns = (k, patch) => set("joints", {
    ...(payload?.joints || {}),
    [k]: { ...ansOf(k), ...patch },
  });

  const addPhoto = (k, kind, file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const was = ansOf(k).photos || {};
      setAns(k, { photos: { ...was, [kind]: [...(was[kind] || []), String(r.result)] } });
    };
    r.readAsDataURL(file);
  };
  const removePhoto = (k, kind, i) => {
    const was = ansOf(k).photos || {};
    setAns(k, { photos: { ...was, [kind]: (was[kind] || []).filter((_, n) => n !== i) } });
  };

  /* Dead Jointed clears and locks that plot's ELI, Polarity and
     Voltage. The joint is made and the service is not live, so there is
     nothing to measure — and a number left over from before the outcome
     changed would read as a reading taken on a dead service. */
  const setOutcome = (p, v) => {
    setPlot(p, "outcome", v);
    if (v === "Dead Jointed") for (const k of ["eli", "polarity", "voltage"]) setPlot(p, k, "");
  };

  /* Whether a page has been answered, for the dot on its tab. The strip
     doubles as the list of what is left, so a gang can see from the top
     whether a hole has been missed rather than opening every page. */
  const doneOf = (p) => {
    if (p.id === "site") return CHECKLIST.some((_, i) => payload?.checklist?.[i]);
    if (p.id === "sign") return !!payload?.signature;
    const a = ansOf(p.key);
    return p.tests ? !!payload?.plots?.[p.plot]?.outcome : !!a.done;
  };

  const cinr = (value, onPick, label) => (
    <select className="jf-cinr" value={value || ""} aria-label={label}
      onChange={(e) => onPick(e.target.value)}>
      {CINR.map((v) => <option key={v || "blank"} value={v}>{v || "\u2014"}</option>)}
    </select>
  );

  return (
    <div className="jf">
      <style>{CSS}</style>

      <header className="jf-topbar">
        <div className="jf-brand">
          Aptus Utilities
          <small>Work Instruction</small>
        </div>
        <div className="jf-tabs" role="tablist" aria-label="Form pages">
          {pages.map((p) => (
            <button key={p.key} type="button" role="tab" className="jf-tab"
              aria-selected={p.key === here.key} onClick={() => setAt(p.key)}>
              {p.label ?? p.title}
              {doneOf(p)
                ? <span className="jf-tick">&#10003;</span>
                : <span className="jf-dot" />}
            </button>
          ))}
        </div>
      </header>

      <div className="jf-sheet">
        <div className="jf-sheet-head">
          <h1>
            {here.id === "site" ? "Aptus Utilities \u2014 Work Instruction"
              : here.id === "sign" ? "Declaration"
                : here.title}
          </h1>
          <p>
            {here.id === "site" ? `${job?.task || "Jointing"} \u2014 Service Connection`
              : here.id === "sign" ? "Sign-off"
                : here.tag}
          </p>
        </div>

        {/* ───────── PAGE 1 — SITE ───────── */}
        {here.id === "site" && (
          <>
            <div className="jf-card">
              <div className="jf-card-title">Job Details</div>
              <div className="jf-grid">
                {JOB_FIELDS.map((f) => (
                  <div className="jf-field" key={f.key}>
                    <label htmlFor={`jf-${f.key}`}>{f.label}</label>
                    {f.wide ? (
                      <div className="jf-two">
                        <input id={`jf-${f.key}`} type={f.type || "text"}
                          className="jf-locked" readOnly value={jobDetail[f.key] ?? ""} />
                        <input className="jf-locked" readOnly
                          placeholder={f.wide.placeholder}
                          value={jobDetail[f.wide.key] ?? ""} />
                      </div>
                    ) : (
                      <input id={`jf-${f.key}`} type={f.type || "text"}
                        className="jf-locked" readOnly value={jobDetail[f.key] ?? ""} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="jf-note">
              <b>Carry out site safety checks &amp; complete risk assessment sheet.</b>
              {" "}Indicate in each box: <b>C</b> = Complete, <b>I</b> = Incomplete,
              {" "}<b>NR</b> = Not Required.
            </div>

            <div className="jf-card jf-last">
              <div className="jf-card-title">
                Task Checklist <span className="jf-pill">C / I / NR</span>
              </div>
              {CHECKLIST.map((t, i) => (
                <div className="jf-check-row" key={t}>
                  <div className="jf-task">{t}</div>
                  <div className="jf-cell">
                    {cinr(payload?.checklist?.[i], (v) => setMark(i, v), t)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ───────── PAGES 2..n — ONE PER JOINT ───────── */}
        {here.kind && (() => {
          const k = here.key;
          const a = ansOf(k);
          const gis = sizesFor(job, k);
          const plotAns = here.tests ? (payload?.plots?.[here.plot] ?? emptyPlot()) : null;
          const dead = plotAns?.outcome === "Dead Jointed";
          return (
            <>
              <div className="jf-card">
                <div className="jf-card-title">
                  {here.title}
                  <span className={`jf-pill ${here.kind === "breech" ? "jf-pill-b" : ""}`}>
                    {here.tag}
                  </span>
                </div>

                {/* The plot row and its readings — service joints only. A
                    breech joint is on the main and terminates nothing,
                    so there is nothing to test at it. */}
                {here.tests && (
                  <>
                    <div className="jf-block-top">
                      <div className="jf-cell jf-narrow">
                        <label>Plot</label>
                        <input className="jf-locked" readOnly value={here.plot} />
                      </div>
                      <div className="jf-cell">
                        <label htmlFor={`jf-cot-${here.plot}`}>Cut Out Termination</label>
                        <input id={`jf-cot-${here.plot}`} className="jf-locked" readOnly
                          value={plotAns.cutout || DEFAULT_CUTOUT} />
                      </div>
                      <div className="jf-cell">
                        <label htmlFor={`jf-out-${here.plot}`}>Outcome</label>
                        <select id={`jf-out-${here.plot}`} className="jf-outcome"
                          data-val={plotAns.outcome || ""} value={plotAns.outcome || ""}
                          onChange={(e) => setOutcome(here.plot, e.target.value)}>
                          <option value="">&mdash; Outcome &mdash;</option>
                          {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="jf-tests">
                      {TESTS.map((t) => {
                        const off = dead && ["eli", "polarity", "voltage"].includes(t.key);
                        return (
                          <div className="jf-cell" key={t.key}>
                            <label htmlFor={`jf-${t.key}-${here.plot}`}>{t.label}</label>
                            {t.type === "choice" ? (
                              <select id={`jf-${t.key}-${here.plot}`} className="jf-numsel"
                                value={plotAns[t.key] || ""} disabled={off}
                                onChange={(e) => setPlot(here.plot, t.key, e.target.value)}>
                                <option value="">&mdash;</option>
                                {t.options.filter(Boolean).map((o) => (
                                  <option key={o} value={o}>{o}</option>
                                ))}
                              </select>
                            ) : (
                              <input id={`jf-${t.key}-${here.plot}`} className="jf-num"
                                type="number" step="any" inputMode="decimal"
                                value={plotAns[t.key] ?? ""} disabled={off}
                                onChange={(e) => setPlot(here.plot, t.key, e.target.value)} />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {breechesFor(job, here.plot).length > 0 && (
                      <p className="jf-onroute">
                        On the way back to the main:{" "}
                        {breechesFor(job, here.plot)
                          .map((j) => (j.node ? `Node ${j.node}` : "a breech joint"))
                          .join(" \u00b7 ")} &mdash; each has its own page.
                      </p>
                    )}
                    {routeUnknownFor(job, here.plot) && (
                      <p className="jf-warn">
                        The route back from this plot could not be traced when this
                        call-off was raised. Check before you start.
                      </p>
                    )}
                  </>
                )}

                {/* Breech joints answer completion here instead. */}
                {!here.tests && (
                  <div className="jf-block-top jf-breechtop">
                    <div className="jf-cell">
                      <label>Location</label>
                      <input className="jf-locked" readOnly
                        value={here.joint?.node ? `Node ${here.joint.node}` : "Not recorded"} />
                    </div>
                    <div className="jf-cell">
                      <label htmlFor={`jf-done-${k}`}>Completion</label>
                      {cinr(a.done, (v) => setAns(k, { done: v }),
                        `Completion for ${here.title}`)}
                    </div>
                  </div>
                )}
              </div>

              {/* ── The cable, and what is in the hole ── */}
              <div className="jf-card">
                <div className="jf-card-title">
                  The Joint
                  {(gis.in || gis.out) && (
                    <span className="jf-pill">from the design</span>
                  )}
                </div>
                <div className="jf-jointrow">
                  <div className="jf-cell">
                    <label htmlFor={`jf-in-${k}`}>Cable size in</label>
                    {/* Read off the drawing: the LV feeder supplying this
                        plot. Locked where the design knows it, so the
                        sheet records what was designed rather than what
                        was remembered. Open where it does not, because a
                        blank a gang can fill is better than a guess. */}
                    <input id={`jf-in-${k}`}
                      className={gis.in ? "jf-locked" : ""} readOnly={!!gis.in}
                      value={gis.in ?? (a.sizeIn ?? "")}
                      placeholder={gis.in ? "" : "Not on the design"}
                      onChange={(e) => setAns(k, { sizeIn: e.target.value })} />
                  </div>
                  <div className="jf-cell">
                    <label htmlFor={`jf-type-${k}`}>Joint type</label>
                    <select id={`jf-type-${k}`} value={a.jointType || ""}
                      onChange={(e) => setAns(k, { jointType: e.target.value })}>
                      <option value="">&mdash; select &mdash;</option>
                      {JOINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="jf-cell">
                    <label htmlFor={`jf-outsz-${k}`}>Cable size out</label>
                    {/* The service running to the meter. */}
                    <input id={`jf-outsz-${k}`}
                      className={gis.out ? "jf-locked" : ""} readOnly={!!gis.out}
                      value={gis.out ?? (a.sizeOut ?? "")}
                      placeholder={gis.out ? "" : "Not on the design"}
                      onChange={(e) => setAns(k, { sizeOut: e.target.value })} />
                  </div>
                </div>
                <div className="jf-field jf-full" style={{ marginTop: 12 }}>
                  <label htmlFor={`jf-notes-${k}`}>Notes (optional)</label>
                  <textarea id={`jf-notes-${k}`} rows={2} value={a.notes ?? ""}
                    placeholder="Any context — access, depth, distance to property, etc."
                    onChange={(e) => setAns(k, { notes: e.target.value })} />
                </div>
              </div>

              {/* ── Photographs ── */}
              <div className="jf-card">
                <div className="jf-card-title">Photos</div>
                <Photos shot={a.photos}
                  onAdd={(kind, file) => addPhoto(k, kind, file)}
                  onRemove={(kind, i) => removePhoto(k, kind, i)} />
              </div>

              {/* ── The sketch, over the as-laid drawing ── */}
              <div className="jf-card jf-last">
                <div className="jf-card-title">Joint Location Sketch</div>
                <JointSketch backdrop={job?.asLaid}
                  value={a.sketch || ""}
                  onChange={(v) => setAns(k, { sketch: v })} />
                <div className="jf-field jf-full" style={{ marginTop: 12 }}>
                  <label htmlFor={`jf-desc-${k}`}>
                    Description &mdash; where the joint is, measured from what
                  </label>
                  <textarea id={`jf-desc-${k}`} rows={2} value={a.desc ?? ""}
                    onChange={(e) => setAns(k, { desc: e.target.value })} />
                </div>
              </div>
            </>
          );
        })()}

        {/* ───────── LAST PAGE — DECLARATION ───────── */}
        {here.id === "sign" && (
          <div className="jf-card jf-last">
            <div className="jf-card-title">Sign-off</div>
            <div className="jf-signoff">
              <div className="jf-field">
                <label>Issued By</label>
                <input className="jf-locked" readOnly value={jobDetail.issuedBy ?? ""} />
                <label style={{ marginTop: 8 }}>Date</label>
                <input className="jf-locked" readOnly type="date"
                  value={jobDetail.issuedDate ?? ""} />
              </div>
              <div className="jf-field">
                <label htmlFor="jf-completedby">Completed By</label>
                <input id="jf-completedby" value={jobDetail.completedBy ?? ""}
                  onChange={(e) => setJob("completedBy", e.target.value)} />
                <label htmlFor="jf-completeddate" style={{ marginTop: 8 }}>Date</label>
                <input id="jf-completeddate" type="date"
                  value={jobDetail.completedDate ?? ""}
                  onChange={(e) => setJob("completedDate", e.target.value)} />
              </div>
            </div>
            <div className="jf-field jf-full" style={{ marginTop: 14 }}>
              <label>Signature</label>
              <SketchPad value={payload?.signature || ""}
                onChange={(v) => set("signature", v)} />
            </div>
          </div>
        )}

        <div className="jf-actions">
          <button type="button" className="jf-btn" disabled={idx === 0}
            onClick={() => go(-1)}>&larr; Back</button>
          <span className="jf-pageof">Page {here.n} of {pages.length}</span>
          <button type="button" className="jf-btn" disabled={idx === pages.length - 1}
            onClick={() => go(1)}>Next &rarr;</button>
        </div>
      </div>
    </div>
  );
}


const CSS = `
.jf{ --ink:#1d2733; --ink-soft:#5a6b7b; --line:#dfe5ec; --line-strong:#c6d0db;
  --surface:#fff; --bg:#eef1f5; --accent:#0f766e; --accent-soft:#e6f2f0;
  --danger:#c0392b; --yellow-soft:#fef9c3; --yellow-line:#e5c200;
  --green-soft:#dcfce7; --green-line:#86c79b; --radius:14px; --radius-sm:10px;
  background:var(--bg); color:var(--ink); min-height:100%;
  font-family:"Archivo",system-ui,sans-serif; }
.jf *{ box-sizing:border-box; }

.jf-topbar{ position:sticky; top:0; z-index:20; background:var(--surface);
  border-bottom:1px solid var(--line); display:flex; align-items:center;
  gap:18px; padding:10px 18px; flex-wrap:wrap; }
.jf-brand{ font-weight:600; font-size:16px; }
.jf-brand small{ display:block; font-weight:500; font-size:11px;
  letter-spacing:.14em; text-transform:uppercase; color:var(--accent); }
.jf-tabs{ margin-left:auto; display:flex; gap:6px; }
.jf-tab{ border:1px solid var(--line); background:var(--surface); color:var(--ink-soft);
  font:600 13px inherit; padding:8px 14px; border-radius:999px; cursor:pointer;
  display:inline-flex; align-items:center; gap:7px; }
.jf-tab[aria-selected="true"]{ background:var(--accent); border-color:var(--accent); color:#fff; }
.jf-tab-n{ font-size:11px; font-weight:700; background:rgba(0,0,0,.18);
  border-radius:999px; padding:1px 7px; }

.jf-sheet{ max-width:1100px; margin:22px auto 60px; padding:0 16px; }
.jf-sheet-head{ background:var(--ink); color:#fff;
  border-radius:var(--radius) var(--radius) 0 0; padding:18px 22px; }
.jf-sheet-head h1{ margin:0; font-weight:600; font-size:20px; letter-spacing:.3px; }
.jf-sheet-head p{ margin:3px 0 0; font-size:12px; letter-spacing:.16em;
  text-transform:uppercase; color:#9fb4c4; }

.jf-card{ background:var(--surface); border:1px solid var(--line); border-top:0;
  padding:18px 20px; }
.jf-last, .jf-card:last-of-type{ border-radius:0 0 var(--radius) var(--radius); }
.jf-card-title{ font-weight:600; font-size:15px; margin:0 0 14px;
  display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.jf-pill{ font:600 11px inherit; letter-spacing:.1em; text-transform:uppercase;
  color:var(--accent); background:var(--accent-soft); padding:3px 9px; border-radius:999px; }
.jf-pill-b{ color:#1e40af; background:#e0e7ff; }
.jf-sub{ font-weight:500; font-size:12px; color:var(--ink-soft); margin-left:auto; }

.jf-grid{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 22px; }
.jf-field{ display:flex; flex-direction:column; gap:5px; }
.jf-full{ grid-column:1 / -1; }
.jf-field label, .jf-cell label{ font:600 11px inherit; letter-spacing:.08em;
  text-transform:uppercase; color:var(--ink-soft); }
.jf-field input, .jf-field select, .jf-field textarea,
.jf-cell input, .jf-cell select{
  font:500 14px inherit; color:var(--ink); background:#fff;
  border:1px solid var(--line-strong); border-radius:var(--radius-sm);
  padding:9px 11px; width:100%; }
.jf-field textarea{ resize:vertical; }
.jf-field input:focus, .jf-field textarea:focus, .jf-cell input:focus,
.jf-cell select:focus{ outline:none; border-color:var(--accent);
  box-shadow:0 0 0 3px var(--accent-soft); }
.jf-two{ display:grid; grid-template-columns:2fr 1fr; gap:10px; }
/* The office's fields. Readable, and plainly not for filling in. */
.jf-locked{ background:#f4f6f9 !important; color:var(--ink-soft) !important; }

.jf-note{ background:var(--accent-soft); border:1px solid #cfe6e2; border-top:0;
  color:#0b4f49; font-size:13px; line-height:1.45; padding:12px 20px; }

.jf-cell{ display:flex; flex-direction:column; gap:5px; min-width:0; }
.jf-cinr{ background:var(--yellow-soft); border:1px solid var(--yellow-line);
  border-radius:var(--radius-sm); padding:9px 11px; width:100%;
  font:700 14px inherit; text-align:center; color:var(--ink); }
.jf-num{ background:var(--green-soft) !important; border-color:var(--green-line) !important;
  text-align:center; }
.jf-numsel{ background:var(--green-soft) !important; border-color:var(--green-line) !important;
  font-weight:600; text-align:center; }
.jf-num:disabled, .jf-numsel:disabled{ background:#eef1f5 !important;
  border-color:var(--line) !important; color:#9aa7b4; }

/* Outstanding, at a glance. The page tabs double as the list of what is
   left, so a gang can see from the top whether a hole has been missed
   rather than opening every page to find out. */
.jf-dot{ width:7px; height:7px; border-radius:50%; background:#d97706; flex:none; }
.jf-tab[aria-selected="true"] .jf-dot{ background:#fcd34d; }
.jf-tick{ font-size:12px; color:var(--accent); font-weight:700; }
.jf-tab[aria-selected="true"] .jf-tick{ color:#fff; }

/* ── The joint page ── */
.jf-jointrow{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; align-items:end; }
.jf-breechtop{ grid-template-columns:1fr 170px; }
.jf-pageof{ margin:0 auto; font-size:12.5px; color:var(--ink-soft); font-weight:600; }

/* ── The sketch over the as-laid drawing ── */
.jf-sketchwrap{ border:1px solid var(--line-strong); border-radius:var(--radius-sm);
  overflow:hidden; background:#fff; }
.jf-sketchbar{ display:flex; align-items:center; gap:6px; flex-wrap:wrap;
  padding:8px 10px; border-bottom:1px solid var(--line); background:#f7f9fb; }
.jf-sketchbar-l{ font:600 10px inherit; letter-spacing:.08em;
  text-transform:uppercase; color:var(--ink-soft); margin-right:2px; }
.jf-sketchbar-sp{ flex:1; }
.jf-chip{ border:1px solid var(--line-strong); background:#fff; color:var(--ink);
  font:600 12px inherit; padding:5px 11px; border-radius:8px; cursor:pointer; }
.jf-chip.on{ background:var(--accent); border-color:var(--accent); color:#fff; }
.jf-zoomval{ font:600 12px inherit; color:var(--ink-soft); min-width:44px; text-align:center; }
/* The stage clips the plan; the pad sits over it at its own scale, so a
   mark stays where it was put rather than sliding when somebody zooms
   in to see better. */
/* Square. A joint sketch is a plan of a hole and the ground round it,
   and a letterbox forced everything into a strip — the dimensions back
   to the property ran off the top and bottom. Aspect-ratio rather than
   a fixed height so it stays square at every width. */
.jf-sketchstage{ position:relative; width:100%; aspect-ratio:1 / 1;
  overflow:hidden; background:#fbfcfd; }
/* Drawn at full strength. The as-laid render already fades the map to
   0.6 under the design, and a second fade here multiplied the two —
   0.62 of 0.6 is 0.37, which is why the map behind the cable was not
   visible. Fading belongs where the picture is made, once. */
.jf-sketchbg{ position:absolute; inset:0; width:100%; height:100%;
  object-fit:contain; transform-origin:center; pointer-events:none;
  user-select:none; }
/* The marks, over the plan. An SVG rather than a canvas so a stroke
   stays an object that can be selected, moved and undone. */
.jf-sketchink{ position:absolute; inset:0; width:100%; height:100%;
  touch-action:none; cursor:crosshair; }
.jf-sketchink .sel{ outline:none; filter:drop-shadow(0 0 2px var(--accent)); }

/* ── The toolbar ── */
.jf-tools{ border-top:1px solid var(--line); background:#f7f9fb; }
.jf-toolrow{ display:flex; align-items:center; gap:6px; flex-wrap:wrap;
  padding:8px 10px; }
.jf-toolrow + .jf-toolrow{ border-top:1px solid var(--line); }
.jf-toollabel{ font:600 10px inherit; letter-spacing:.08em;
  text-transform:uppercase; color:var(--ink-soft); margin:0 2px 0 6px; }
.jf-toolrow .jf-toollabel:first-child{ margin-left:0; }
.jf-tool{ border:1px solid var(--line-strong); background:#fff; color:var(--ink);
  font:600 15px inherit; min-width:40px; padding:6px 10px; border-radius:8px;
  cursor:pointer; line-height:1.1; }
.jf-tool.wide{ font-size:13px; }
.jf-tool.on{ background:var(--accent-soft); border-color:var(--accent); color:var(--accent); }
.jf-swatch{ width:26px; height:26px; border-radius:50%; cursor:pointer;
  border:2px solid transparent; padding:0; }
.jf-swatch.on{ border-color:var(--accent); box-shadow:0 0 0 2px #fff inset; }
.jf-sizer{ width:110px; accent-color:var(--accent); }
.jf-primary{ background:var(--accent); border-color:var(--accent); color:#fff; }
.jf-danger{ background:#c0392b; border-color:#c0392b; color:#fff; }
.jf-danger-soft{ background:#f7d9d5; border-color:#e7b7b0; color:#8c2f22; }
.jf-chip:disabled, .jf-tool:disabled{ opacity:.45; cursor:not-allowed; }
.jf-nobg{ position:absolute; inset:0; display:flex; align-items:center;
  justify-content:center; margin:0; padding:0 24px; text-align:center;
  font-size:13px; color:var(--ink-soft); }
.jf-sketchtip{ padding:8px 10px; border-top:1px solid var(--line); background:#f7f9fb; }

.jf-check-row{ display:grid; grid-template-columns:1fr 120px; gap:14px;
  align-items:center; padding:11px 0; border-top:1px solid var(--line); }
.jf-check-row:first-of-type{ border-top:0; }
.jf-task{ font-size:14px; }

.jf-block{ border:1px solid var(--line); border-radius:var(--radius-sm);
  padding:14px; margin-bottom:12px; background:#fcfdfe; }
.jf-block-top{ display:grid; grid-template-columns:110px 1fr 170px; gap:12px; align-items:end; }
.jf-block-head{ display:flex; align-items:baseline; gap:10px; margin-bottom:10px; flex-wrap:wrap; }
.jf-block-name{ font-weight:600; font-size:14px; }
.jf-serves{ font-size:12px; color:var(--ink-soft); }
.jf-breech{ background:#fbfcff; border-color:#d6e0f5; }
.jf-breech-row{ display:grid; grid-template-columns:1fr 1fr 170px; gap:12px; align-items:end; }
.jf-tests{ display:grid; grid-template-columns:repeat(5,minmax(0,1fr));
  gap:10px; margin-top:12px; }

.jf-outcome{ font-weight:600; }
.jf-outcome[data-val="Completed"]{ border-color:#9cc7b0; background:#eaf6ef; color:#1f7a47; }
.jf-outcome[data-val="Aborted"]{ border-color:#e3b1b1; background:#fbecec; color:#b23b3b; }
.jf-outcome[data-val="Dead Jointed"]{ border-color:#a9c2e0; background:#eaf1fb; color:#2b5a8f; }

.jf-onroute{ margin:12px 0 0; font-size:12px; color:var(--ink-soft); }
.jf-warn{ margin:10px 0 0; font-size:12.5px; color:#991b1b; font-weight:600; }
.jf-hint{ margin:0; font-size:13px; color:var(--ink-soft); }

.jf-signoff{ display:grid; grid-template-columns:1fr 1fr; gap:22px; }
.jf-sig-wrap{ position:relative; border:1px solid var(--line-strong);
  border-radius:var(--radius-sm); background:#fff; overflow:hidden; }
.jf-sketch{ display:block; width:100%; height:260px; touch-action:none; cursor:crosshair; }
.jf-sig-clear{ position:absolute; top:8px; right:8px; }

.jf-photos{ margin-bottom:12px; }
.jf-photos-title{ font:600 11px inherit; letter-spacing:.08em;
  text-transform:uppercase; color:var(--ink-soft); margin-bottom:8px; }
.jf-pcats{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
.jf-photo-add{ display:block; text-align:center; border:1px dashed var(--accent);
  color:var(--accent); background:transparent; border-radius:var(--radius-sm);
  padding:9px 10px; font:600 12px inherit; cursor:pointer; }
.jf-thumbs{ display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
.jf-thumb{ position:relative; width:56px; height:56px; }
.jf-thumb img{ width:100%; height:100%; object-fit:cover; border-radius:6px;
  border:1px solid var(--line-strong); }
.jf-thumb button{ position:absolute; top:-6px; right:-6px; width:20px; height:20px;
  border-radius:50%; border:1px solid var(--line-strong); background:#fff;
  color:var(--danger); font-size:13px; line-height:1; cursor:pointer; padding:0; }

.jf-btn{ font:600 13px inherit; border-radius:var(--radius-sm); padding:10px 16px;
  cursor:pointer; border:1px solid var(--line-strong); background:#fff; color:var(--ink); }
.jf-btn-sm{ padding:6px 11px; font-size:12px; }
.jf-actions{ display:flex; gap:10px; flex-wrap:wrap; margin-top:18px; }

/* A tablet held landscape is the working case and gets the full sheet.
   Portrait and phones fold, in that order — the test grid is the last
   thing to give up its row, because reading five results across is how
   the paper form is checked. */
@media (max-width:1000px){
  .jf-block-top{ grid-template-columns:100px 1fr 160px; }
}
@media (max-width:820px){
  .jf-grid, .jf-signoff{ grid-template-columns:1fr; }
  .jf-block-top, .jf-breech-row, .jf-jointrow,
  .jf-breechtop{ grid-template-columns:1fr; }
  .jf-tests{ grid-template-columns:repeat(3,minmax(0,1fr)); }
  .jf-pcats{ grid-template-columns:1fr; }
}
@media (max-width:560px){
  .jf-tests{ grid-template-columns:repeat(2,minmax(0,1fr)); }
  .jf-strip{ flex-wrap:nowrap; overflow-x:auto; padding-bottom:4px; }
}
`;
