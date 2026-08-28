import { useDragHandle } from "../../lib/useDragHandle.js";

/* Trench connectivity.

   A trench drawn a metre short of the one it was meant to meet looks
   joined at any sensible zoom, and is invisible to anything that routes
   along the network — the feeder builder simply reports finding nothing.
   This answers the question directly: how many separate pieces is the
   network in, and which trenches are in the pieces that don't reach the
   origin.

   ── Substation or POC ──

   Every sentence here said "substation". Not every site has one: a
   connection to an existing network has no transformer and everything
   feeds back to the point of connection instead. On those drawings the
   panel named a thing that was not there, which reads as a missing
   substation rather than as a POC doing its job.

   So the word comes from the drawing. `originRole` says which was
   found, and `originWord` below turns it into the noun to use.

   Selecting a group puts its trenches on the canvas selection, so the
   next thing you do is drag an end onto the piece it should join rather
   than hunt for it. */

const m = (v) => `${(v ?? 0).toFixed(1)} m`;

export default function TrenchCheck({ result, onSelect, onClose }) {
  const drag = useDragHandle();

  const ok = result.originOnNetwork && result.orphans.length === 0;

  /* What the drawing actually has. "the origin" is the right idea and
     the wrong word to say to somebody: they placed a substation or a
     POC, and that is what they will look for. */
  const originWord = result.originRole === "poc" ? "POC" : "substation";

  return (
    <div className="fe-backdrop" onClick={() => { if (!drag.justDragged()) onClose(); }}>
      <div className="tc" onClick={(e) => e.stopPropagation()} style={drag.panelStyle}
        role="dialog" aria-label="Trench connectivity">
        <style>{CSS}</style>

        <div className="tc-head" {...drag.handleProps}>
          <div>
            <h3>Trench connectivity</h3>
            <p className="tc-sub">
              {result.total} separate piece{result.total === 1 ? "" : "s"} of network
              {result.orphans.length > 0
                && ` \u00B7 ${result.orphans.length} not reaching the ${originWord}`}
            </p>
          </div>
          <button className="fe-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="tc-body">
          {ok && (
            <>
              <p className="tc-ok">
                Every <strong>mains</strong> trench connects back to the {originWord}.
                Cables can route anywhere on the mains network.
              </p>
              {/* ── What this did not look at ──

                Service spurs are excluded on purpose: they hang off the
                mains by design, so counting them would report every
                plot as an orphan.

                But "every trench connects" read as an answer about the
                whole drawing, and it is not. A site whose mains are one
                piece and whose service spurs are adrift passed this
                check while the Circuit Report showed a column of
                dashes for those plots — and the all-clear here is what
                sent somebody looking somewhere else.

                So it says what it covered and names the check that
                covers the rest. */}
              <p className="tc-hint">
                Service spurs are not counted here &mdash; they hang off the mains by
                design. Use <strong>Check Services Reach the Mains</strong> for those.
              </p>
            </>
          )}

          {/* Neither a substation nor an electric POC. Both are named,
              because on a site connected to an existing network the POC
              is the one to place and a message asking for a substation
              sends somebody to draw the wrong thing. */}
          {!result.hasOrigin && (
            <p className="tc-warn">
              No substation or electric POC placed, so there is nothing to measure
              connectivity against. The pieces below are still the separate parts
              of the network.
            </p>
          )}

          {result.hasOrigin && !result.originOnNetwork && (
            <p className="tc-warn">
              The {originWord} isn&rsquo;t on the trench network &mdash; it sits too far
              from any trench. Nothing can route until it does, whatever else
              connects.
            </p>
          )}

          {result.groups.map((g, i) => (
            <section className={g.hasOrigin ? "tc-grp on" : "tc-grp"} key={g.id}>
              <div className="tc-gh">
                <strong>
                  {g.hasOrigin
                    ? `Connected to the ${originWord}`
                    : `Orphaned piece ${result.orphans.indexOf(g) + 1}`}
                </strong>
                <span className="tc-meta">
                  {g.features.length} trench{g.features.length === 1 ? "" : "es"}
                  {" \u00B7 "}{m(g.metres)}
                </span>
                <button className="tc-sel" onClick={() => onSelect?.(g.features.map((f) => f.id))}>
                  Select on plan
                </button>
              </div>

              {/* The connected piece is listed but collapsed to a summary:
                  it is the one nobody needs to go and find. */}
              {!g.hasOrigin && (
                <table className="dt tc-tbl">
                  <thead>
                    <tr className="head-row">
                      <th>Trench</th><th>Type</th><th className="num">Length</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.features.map((f) => (
                      <tr key={f.id}>
                        <td>{f.label}</td>
                        <td className="mono">{f.lineType ?? "\u2014"}</td>
                        <td className="num">{m(f.metres)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {i === 0 && g.hasOrigin && result.orphans.length > 0 && (
                <p className="tc-hint">
                  To join an orphan: select it below, then drag the end of one of its
                  trenches onto this piece. The end snaps and records the connection.
                </p>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.tc { background: var(--white); border-radius: 12px; width: min(560px, 94vw); max-height: 86vh;
  display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(15,23,42,.28); }
.tc-head { display: flex; align-items: flex-start; gap: 10px; padding: 15px 18px 12px;
  border-bottom: 1px solid var(--border); }
.tc-head > div { flex: 1; }
.tc-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.tc-sub { margin: 2px 0 0; font-size: 11.5px; color: var(--muted); }
.tc-body { padding: 12px 18px 18px; overflow-y: auto; flex: 1; }
.tc-ok { background: #ecfdf5; border: 1px solid #6ee7b7; color: #065f46; border-radius: 8px;
  padding: 10px 13px; font-size: 12.5px; font-weight: 600; margin: 0 0 12px; }
.tc-warn { background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; border-radius: 8px;
  padding: 10px 13px; font-size: 12.5px; margin: 0 0 12px; }
.tc-grp { border: 1px solid var(--border); border-radius: 9px; padding: 9px 11px; margin-bottom: 9px; }
.tc-grp.on { border-color: #6ee7b7; background: #f6fefb; }
.tc-gh { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.tc-gh strong { font-size: 12.5px; }
.tc-grp:not(.on) .tc-gh strong { color: #b45309; }
.tc-meta { font-size: 11.5px; color: var(--muted); flex: 1; }
.tc-sel { background: none; border: 1px solid var(--accent); color: var(--accent);
  border-radius: 6px; cursor: pointer; font: 600 11px inherit; padding: 3px 10px; }
.tc-sel:hover { background: var(--accent-light); }
.dt.tc-tbl { width: 100%; margin-top: 8px; }
.dt.tc-tbl td { padding: 4px 8px; }
.tc-hint { font-size: 11.5px; color: var(--muted); margin: 8px 0 0; }
`;
