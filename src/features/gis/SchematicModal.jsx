import { useMemo, useRef, useState, useCallback } from "react";
import { useDragHandle } from "../../lib/useDragHandle.js";
import { treeFromLegs, layoutTree, nodeFigures, edgeFigures } from "./schematic.js";

/* The levels check drawn as a network rather than listed as one.

   SVG rather than canvas: this is a document — something printed, sent
   to a DNO, marked up in a meeting — and a vector of it stays sharp at
   any size and can be opened by anything. A canvas would give a
   screenshot.

   Everything on it comes from the legs the table already holds, so a
   figure here and a figure there cannot disagree. */

const BOX_W = 116;
const BOX_H = 50;
const GAP_X = 30;
/* Room for the label between the boxes.

   The label is four lines at 11px, so its block is about 37px deep, and
   it hangs off the horizontal part of the elbow half way down the run.
   With a 132px gap the run between boxes was 82px and half of that is
   41 — so the last line landed within four pixels of the box below and
   read as sitting on it.

   170 leaves a clear margin above and below the block at every level.
   Worth the extra height: a diagram that has to be squinted at is not
   doing its job. */
const GAP_Y = 170;
const PAD = 34;

export default function SchematicModal({ trace, voltageV = 400, onClose }) {
  const drag = useDragHandle();
  const svgRef = useRef(null);

  /* Where each label has been moved to.

     Automatic placement puts a label beside its own elbow, which is
     right until two branches run close together and their labels
     collide. Rather than guess at a cleverer rule, let them be moved:
     the person reading it can see what overlaps and the machine cannot.

     Kept per edge and only for this panel — a schematic is drawn, read
     and downloaded in one sitting, and a layout remembered across a
     re-run would put labels where the network no longer is. Reset puts
     everything back. */
  const [moved, setMoved] = useState({});
  const dragging = useRef(null);

  const keyOf = (e) => `${e.from.label}\u0000${e.to.label}`;

  /* Dragging in SVG user units, not screen pixels: the diagram is
     scaled to fit, so a label dragged 40 screen pixels must move 40
     units at whatever scale is showing or it lags behind the pointer. */
  const toUser = useCallback((evt) => {
    const el = svgRef.current;
    if (!el) return { x: evt.clientX, y: evt.clientY };
    const box = el.getBoundingClientRect();
    const vb = el.viewBox.baseVal;
    const sx = vb.width / (box.width || 1);
    const sy = vb.height / (box.height || 1);
    return { x: (evt.clientX - box.left) * sx, y: (evt.clientY - box.top) * sy };
  }, []);

  const onLabelDown = (e) => (evt) => {
    evt.stopPropagation();
    evt.preventDefault();
    const at = toUser(evt);
    const now = moved[keyOf(e)] || { dx: 0, dy: 0 };
    dragging.current = { key: keyOf(e), startX: at.x, startY: at.y, from: now };
    evt.currentTarget.setPointerCapture?.(evt.pointerId);
  };

  const onLabelMove = (evt) => {
    const d = dragging.current;
    if (!d) return;
    const at = toUser(evt);
    setMoved((m) => ({
      ...m,
      [d.key]: { dx: d.from.dx + (at.x - d.startX), dy: d.from.dy + (at.y - d.startY) },
    }));
  };

  const onLabelUp = () => { dragging.current = null; };

  /* ── One circuit at a time ──

     A check covering several circuits puts all their legs in one list,
     and this drew the lot as one tree. `treeFromLegs` takes the first
     root it finds, so ONE circuit came out as a hierarchy and every
     other circuit's nodes \u2014 unreachable from that root \u2014 landed at a
     single depth: a straight line of boxes across the page.

     Reported as "circuit 2 looks fine and circuit 3 is a straight
     line", which is exactly what it was: circuit 2 held the root.

     A schematic is a drawing of ONE network. Where several were
     checked, one is shown and the others are offered. */
  const circuits = useMemo(() => {
    const names = [];
    for (const l of trace?.legs || []) {
      const n = l.circuitName ?? null;
      if (n != null && !names.includes(n)) names.push(n);
    }
    return names;
  }, [trace]);

  const [shown, setShown] = useState(null);
  const drawn = shown && circuits.includes(shown) ? shown : circuits[0] ?? null;

  const { nodes, edges, width, height } = useMemo(() => {
    const legs = (trace?.legs || [])
      .filter((l) => drawn == null || (l.circuitName ?? null) === drawn);
    /* The root has to belong to the circuit being drawn: `trace.from` is
       the check's origin, which on a multi-circuit check is one
       circuit's and not the others'. */
    const from = legs.some((l) => l.from === trace?.from) ? trace.from : null;
    const tree = treeFromLegs(legs, from);
    return layoutTree(tree, { boxW: BOX_W, boxH: BOX_H, gapX: GAP_X, gapY: GAP_Y });
  }, [trace, drawn]);

  /* Saved as SVG rather than an image: it is a drawing, and someone will
     want to put it in a report at a size nobody has anticipated. */
  function download() {
    const el = svgRef.current;
    if (!el) return;
    const xml = new XMLSerializer().serializeToString(el);
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`],
      { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Schematic ${trace?.circuitName ?? ""} ${new Date().toISOString().slice(0, 10)}.svg`
      .replace(/\s+/g, " ").trim();
    a.click();
    URL.revokeObjectURL(url);
  }

  const vbW = width + PAD * 2;
  const vbH = height + PAD * 2;

  return (
    <div className="fe-backdrop" onClick={() => { if (!drag.justDragged()) onClose(); }}>
      <div className="sch" onClick={(e) => e.stopPropagation()} style={drag.panelStyle}
        role="dialog" aria-label="Schematic">
        <style>{CSS}</style>

        <div className="sch-head" {...drag.handleProps}>
          <div>
            <h3>Schematic</h3>
            <p className="sch-sub">
              {drawn ?? trace?.circuitName} &middot; {nodes.length} node(s)
              {nodes.length ? ` \u00b7 from ${nodes[nodes.length - 1]?.label ?? trace?.from}` : ""}
            </p>
          </div>
          {/* Which circuit is drawn, where the check covered several.
              Offered rather than hidden: the others were being drawn on
              top of this one as a row of orphaned boxes, and silently
              dropping them would trade one wrong drawing for a missing
              one. */}
          {circuits.length > 1 && (
            <div className="sch-pick">
              {circuits.map((name) => (
                <button key={name}
                  className={`btn sm${name === drawn ? " accent" : " ghost"}`}
                  onClick={() => setShown(name)}>
                  {name}
                </button>
              ))}
            </div>
          )}
          {Object.keys(moved).length > 0 && (
            <button className="btn ghost" onClick={() => setMoved({})}>
              Reset labels
            </button>
          )}
          <button className="btn accent" onClick={download}>Download SVG</button>
          <button className="fe-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="sch-body">
          {!nodes.length ? (
            <p className="sch-none">Nothing to draw — run a levels check first.</p>
          ) : (
            /* Move and release are handled on the svg rather than on the
               label: a pointer that outruns a small target would
               otherwise drop the drag half way across. */
            <svg ref={svgRef} className="sch-svg"
              viewBox={`0 0 ${vbW} ${vbH}`} width={vbW} height={vbH}
              xmlns="http://www.w3.org/2000/svg"
              onPointerMove={onLabelMove}
              onPointerUp={onLabelUp}
              onPointerLeave={onLabelUp}>
              <rect x="0" y="0" width={vbW} height={vbH} fill="#fff" />

              {/* Lines first, so a box always sits over its own line
                  rather than being cut by the one below it. */}
              {edges.map((e, i) => {
                const f = edgeFigures(e.leg);
                const x1 = e.from.x + BOX_W / 2 + PAD;
                const y1 = e.from.y + BOX_H + PAD;
                const x2 = e.to.x + BOX_W / 2 + PAD;
                const y2 = e.to.y + PAD;
                /* Down, across, then down: an elbow rather than a
                   diagonal, so parallel branches stay parallel and the
                   label has a horizontal run to sit against. */
                const midY = y1 + (y2 - y1) / 2;
                const d = `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`;
                const over = e.leg?.vd?.overOhms || e.leg?.vd?.overPct;
                return (
                  <g key={i}>
                    <path d={d} fill="none"
                      stroke={over ? "#dc2626" : "#94a3b8"} strokeWidth={over ? 2 : 1.4} />
                    {f && (() => {
                      const mv = moved[keyOf(e)] || { dx: 0, dy: 0 };
                      const lx = x2 + 6 + mv.dx;
                      const ly = midY - 12 + mv.dy;
                      const shifted = mv.dx !== 0 || mv.dy !== 0;
                      return (
                        <g>
                          {/* A leader back to the run it describes.

                              Only once moved: a label beside its own
                              elbow needs no line, and a label dragged
                              clear of the clutter is useless if nobody
                              can tell which run it belongs to. */}
                          {shifted && (
                            <line x1={x2 + 4} y1={midY} x2={lx - 3} y2={ly + 12}
                              stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
                          )}
                          {/* Centred on the elbow rather than hung below
                              it, so the four lines sit evenly in the gap
                              instead of crowding the lower box. */}
                          <text className="sch-el" x={lx} y={ly}
                            onPointerDown={onLabelDown(e)}>
                            <tspan x={lx} dy="0">Length: {f.metres} m</tspan>
                            <tspan x={lx} dy="11">Cable: {f.cable ?? "not set"}</tspan>
                            <tspan x={lx} dy="11">Volt drop: {f.pct ?? "\u2014"} %</tspan>
                            <tspan x={lx} dy="11">Ohms: {f.ohms ?? "\u2014"}</tspan>
                          </text>
                        </g>
                      );
                    })()}
                  </g>
                );
              })}

              {nodes.map((n) => {
                const g = nodeFigures(n.leg, voltageV);
                return (
                  <g key={n.label}>
                    <rect x={n.x + PAD} y={n.y + PAD} width={BOX_W} height={BOX_H}
                      rx="7" fill="#fff"
                      stroke={g.over ? "#dc2626" : "#334155"} strokeWidth={g.over ? 2 : 1.3} />
                    <text className="sch-nl" x={n.x + PAD + BOX_W / 2} y={n.y + PAD + 18}>
                      {n.label}
                    </text>
                    <text className="sch-nv" x={n.x + PAD + BOX_W / 2} y={n.y + PAD + 32}>
                      {g.volts != null ? `${g.volts} V` : "\u2014"}
                    </text>
                    <text className="sch-np" x={n.x + PAD + BOX_W / 2} y={n.y + PAD + 43}>
                      {g.pct != null ? `${g.pct} %` : "source"}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.sch { background: var(--white); border-radius: 12px; width: min(1400px, 96vw);
  max-height: 92vh; display: flex; flex-direction: column;
  box-shadow: 0 24px 60px rgba(15,23,42,.28); }
.sch-head { display: flex; align-items: flex-start; gap: 12px; padding: 14px 18px 12px;
  border-bottom: 1px solid var(--border); }
.sch-head h3 { margin: 0; font-size: 16px; }
.sch-pick { display: flex; gap: 6px; flex-wrap: wrap; margin-right: 8px; }
.sch-sub { margin: 3px 0 0; font-size: 11.5px; color: var(--muted); }
.sch-head .btn { margin-left: auto; }
.sch-body { overflow: auto; padding: 14px; flex: 1; background: var(--bg); }
.sch-svg { display: block; background: #fff; }
.sch-none { color: var(--muted); font-size: 12.5px; margin: 30px; text-align: center; }
.sch-nl { font: 700 13px ui-monospace, Menlo, monospace; text-anchor: middle; fill: #0f172a; }
.sch-nv { font: 700 12px system-ui, sans-serif; text-anchor: middle; fill: #0f172a; }
.sch-np { font: 600 10px system-ui, sans-serif; text-anchor: middle; fill: #64748b; }
.sch-el { font: 400 9.5px system-ui, sans-serif; fill: #475569; cursor: move;
  user-select: none; }
.sch-el:hover { fill: #0f172a; }
`;

/* Touched 2026-08-03 10:22 UTC to force a rebuild. */
