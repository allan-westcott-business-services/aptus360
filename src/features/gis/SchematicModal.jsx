import { useMemo, useRef } from "react";
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

  const { nodes, edges, width, height } = useMemo(() => {
    const tree = treeFromLegs(trace?.legs || [], trace?.from);
    return layoutTree(tree, { boxW: BOX_W, boxH: BOX_H, gapX: GAP_X, gapY: GAP_Y });
  }, [trace]);

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
              {trace?.circuitName} &middot; {nodes.length} node(s) &middot; from {trace?.from}
            </p>
          </div>
          <button className="btn accent" onClick={download}>Download SVG</button>
          <button className="fe-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="sch-body">
          {!nodes.length ? (
            <p className="sch-none">Nothing to draw — run a levels check first.</p>
          ) : (
            <svg ref={svgRef} className="sch-svg"
              viewBox={`0 0 ${vbW} ${vbH}`} width={vbW} height={vbH}
              xmlns="http://www.w3.org/2000/svg">
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
                    {f && (
                      /* Centred on the elbow rather than hung below it,
                         so the four lines sit evenly in the gap instead
                         of crowding the lower box. */
                      <text className="sch-el" x={x2 + 6} y={midY - 12}>
                        <tspan x={x2 + 6} dy="0">Length: {f.metres} m</tspan>
                        <tspan x={x2 + 6} dy="11">Cable: {f.cable ?? "not set"}</tspan>
                        <tspan x={x2 + 6} dy="11">Volt drop: {f.pct ?? "\u2014"} %</tspan>
                        <tspan x={x2 + 6} dy="11">Ohms: {f.ohms ?? "\u2014"}</tspan>
                      </text>
                    )}
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
.sch-sub { margin: 3px 0 0; font-size: 11.5px; color: var(--muted); }
.sch-head .btn { margin-left: auto; }
.sch-body { overflow: auto; padding: 14px; flex: 1; background: var(--bg); }
.sch-svg { display: block; background: #fff; }
.sch-none { color: var(--muted); font-size: 12.5px; margin: 30px; text-align: center; }
.sch-nl { font: 700 13px ui-monospace, Menlo, monospace; text-anchor: middle; fill: #0f172a; }
.sch-nv { font: 700 12px system-ui, sans-serif; text-anchor: middle; fill: #0f172a; }
.sch-np { font: 600 10px system-ui, sans-serif; text-anchor: middle; fill: #64748b; }
.sch-el { font: 400 9.5px system-ui, sans-serif; fill: #475569; }
`;

/* Touched 2026-08-03 10:22 UTC to force a rebuild. */
