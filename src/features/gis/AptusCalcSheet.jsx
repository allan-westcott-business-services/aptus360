import { useState, useMemo } from "react";
import { useDragHandle } from "../../lib/useDragHandle.js";
import Banner from "../../components/Banner.jsx";
import { calcSheetRows, schemeFrom } from "./calcSheetRows.js";
import { submitSheet, SUBMIT_DEFAULTS } from "./submitSheet.js";

/* The Aptus Calc Sheet.

   The submission sheet, on the drawing. Laid out to match the SUBMIT
   worksheet of `2210_050 Aptus New Vd Calc Sheet` column for column
   and row for row, because that is the page a DNO reads and an
   assessor checks line against line — a summary that is right and
   arranged differently costs somebody an hour with two documents side
   by side.

   ── What it is for ──

   Everything on it except two columns is already on the drawing, and
   was already being worked out; what was missing was a page that put
   it in the shape a submission is made in. The two that are not are
   the block load and the tick box, and both are entered here and kept
   on the leg they belong to, so the sheet somebody opens next is the
   sheet that was submitted.

   ── Why it is a form and not a report ──

   A report is read. This is worked on: the block loads get typed in,
   sections get taken in and out of the calculation, and the ADMD and
   the diversity allowance are argued over with the adopting DNO. The
   figures underneath move as they are changed, which is the point —
   a printout that has to be regenerated to answer "what if the flats
   are 40 kVA" is not the tool anybody wants at that moment.

   ── One calculation ──

   The arithmetic is submitSheet.js, which is legVoltDrop underneath,
   which is what the canvas and the levels check use. This file
   arranges and edits; it does not compute. A page that worked its own
   volt drop out would be a second answer to the question the levels
   panel already answers, and the two would differ the first time
   either was touched. */

export default function AptusCalcSheet({
  features = [], cableById = () => null, project = null,
  onSave = null, onClose = () => {}, busy = false,
}) {
  const drag = useDragHandle();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const walked = useMemo(
    () => calcSheetRows({ features, cableById }), [features, cableById]);
  const poc = useMemo(() => features.find((f) => f.Feature_Role === "poc"), [features]);
  const fromDrawing = useMemo(
    () => schemeFrom(walked.origin, poc), [walked.origin, poc]);

  /* ── The scheme's own figures ──

     Seeded from the drawing where the drawing knows them — the POC
     carries what the upstream network has already spent — and from
     the spreadsheet's own defaults where it does not. ADMD and the
     diversity allowance are not on the drawing anywhere: they are
     what the adopting DNO asks for, and they change the answer more
     than anything else on the page, so they are stated at the top
     rather than assumed underneath. */
  const [head, setHead] = useState({
    admdKva: SUBMIT_DEFAULTS.admdKva,
    groupKva: SUBMIT_DEFAULTS.groupKva,
    phaseVoltageV: fromDrawing.outputV || SUBMIT_DEFAULTS.phaseVoltageV,
    startPct: fromDrawing.startPct,
    startOhms: fromDrawing.startOhms,
    unbalanced: false,
  });

  /* ── Which route the sheet is totalling ──

     A volt drop is a figure TO somewhere, and the spreadsheet says
     which somewhere with its tick box: its ticked sections form one
     unbroken path from the point of connection, and the branches it
     leaves out are unticked. Totalling every leg on the drawing adds
     legs that sit in parallel and arrives at a figure that is the
     drop to no customer at all.

     So the sheet picks a route. The worst one to begin with — the
     highest volt drop of any path out of the origin, which is the one
     a submission is judged on — and any other from the dropdown,
     because a designer checking a particular spur wants that spur.

     The tick boxes stay editable underneath: an assessor may want a
     path the walk does not produce, and the warning below says when
     what is ticked is not a route. */
  const [routeTo, setRouteTo] = useState(null);

  /* Edits held here until they are saved, so a number half typed does
     not write a row to the database on every keystroke, and so
     Cancel means what it says. */
  const [edits, setEdits] = useState({});
  const edited = (id, key, fallback) =>
    (edits[id] && key in edits[id] ? edits[id][key] : fallback);
  const setEdit = (id, key, value) =>
    setEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), [key]: value } }));
  const dirty = Object.keys(edits).length > 0;

  /* The worst route, by the drop along it. Worked out with the
     scheme's own head figures, so changing the ADMD can change which
     route is worst — which it can, and quietly, when two are close. */
  const worst = useMemo(() => {
    let best = null;
    for (const rt of walked.routes || []) {
      const on = new Set(rt.featureIds);
      const only = submitSheet({
        rows: walked.rows.map((r) => ({ ...r, included: on.has(r.featureId) })),
        settings: head,
      });
      if (!best || only.voltDrop > best.pct) {
        best = { route: rt, pct: only.voltDrop };
      }
    }
    return best;
  }, [walked.routes, walked.rows, head]);

  const chosen = useMemo(() => {
    const want = routeTo ?? worst?.route?.to ?? null;
    return (walked.routes || []).find((r) => r.to === want) || null;
  }, [routeTo, worst, walked.routes]);

  const rows = useMemo(() => {
    const on = chosen ? new Set(chosen.featureIds) : null;
    return walked.rows.map((r) => ({
      ...r,
      blockKva: Number(edited(r.featureId, "blockKva", r.blockKva)) || 0,
      /* The route decides the tick unless somebody has moved that
         particular one by hand, which is why the edit is read first. */
      included: edits[r.featureId] && "included" in edits[r.featureId]
        ? !!edits[r.featureId].included
        : (on ? on.has(r.featureId) : r.included),
    }));
  }, [walked.rows, edits, chosen]);

  /* Is what is ticked actually a route? Each ticked section must
     start where the one before it ended, beginning at the origin. */
  const ticked = rows.filter((r) => r.included);
  const notARoute = useMemo(() => {
    if (!ticked.length) return false;
    const at = new Set([walked.routes?.[0]?.nodes?.[0] ?? ""]);
    const left = [...ticked];
    let moved = true;
    while (moved && left.length) {
      moved = false;
      for (let i = left.length - 1; i >= 0; i -= 1) {
        const [from, rest] = left[i].section.split(" - ");
        if (at.has(from)) {
          at.add(rest.split(" ")[0]);
          left.splice(i, 1);
          moved = true;
        }
      }
    }
    /* Anything unreached is a branch hanging off nothing; more than
       one leg leaving the same node is two routes at once. */
    if (left.length) return true;
    const froms = ticked.map((r) => r.section.split(" - ")[0]);
    return new Set(froms).size !== froms.length;
  }, [ticked, walked.routes]);

  const sheet = useMemo(() => submitSheet({
    rows,
    settings: head,
    scheme: {
      title: project?.Project_Name ?? "",
      aptusRef: project?.Project_Ref ?? "",
      dnoRef: project?.DNO_Ref ?? "",
    },
  }), [rows, head, project]);

  /* The service is not derived here. Every plot on the drawing has its
     own service with its own length and its own cable, and the
     spreadsheet's single "Services" row is a NOTIONAL worst one —
     10 m of 35 CNE at twice ADMD. Picking which real service to put
     in that row is a judgement (the longest? the worst-served? the
     one the DNO asked about), and this sheet does not make it
     silently. Until it is asked for, the row is absent and the totals
     say so. */

  async function save() {
    if (!onSave) return;
    setSaving(true);
    setError("");
    try {
      /* Only what changed, and as the two attributes they are. A whole
         Attributes object written back would carry every other field
         with it and overwrite whatever the build wrote while this
         panel was open. */
      await onSave(Object.entries(edits).map(([id, e]) => ({
        featureId: Number(id),
        ...( "blockKva" in e ? { Block_kVA: Number(e.blockKva) || 0 } : {}),
        ...( "included" in e ? { Calc_Exclude: e.included ? null : true } : {}),
      })));
      setEdits({});
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function csv() {
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [];
    lines.push(["Volt drop and loop impedance information"].map(esc).join(","));
    lines.push(["Project Title", sheet.scheme.title].map(esc).join(","));
    lines.push(["Aptus Ref.", sheet.scheme.aptusRef].map(esc).join(","));
    lines.push(["DNO/IDNO Ref", sheet.scheme.dnoRef].map(esc).join(","));
    lines.push(["kVA domestic A.D.M.D.", head.admdKva].map(esc).join(","));
    lines.push(["Substation Voltage", head.phaseVoltageV].map(esc).join(","));
    lines.push("");
    lines.push(["Section", "Cable Length metres", "Cable TYPE",
      "Cable cross section mm2", "Domestic Distributed", "Customers Terminal",
      "Total Domestic on Section", "Block Load kVA", "Phase Current Amps",
      "Loop Impedance", "Volt Drop %"].map(esc).join(","));
    for (const r of sheet.rows) {
      lines.push([r.section, r.lengthM, r.cableType, r.csa, r.distributed,
        r.terminal, r.domesticOnSection, r.blockKva,
        r.amps ? r.amps.toFixed(1) : 0,
        r.ohms ? r.ohms.toFixed(6) : 0,
        r.pct == null ? "" : r.pct.toFixed(6)].map(esc).join(","));
    }
    lines.push(["", "", "", "", "", "", "", "Total", "",
      sheet.totals.ohms.toFixed(6), sheet.totals.pct.toFixed(6)].map(esc).join(","));
    lines.push("");
    lines.push(["Loop impedance - Main plus Service",
      sheet.loopImpedance.toFixed(6), "\u03a9"].map(esc).join(","));
    lines.push(["Total volt drop on distributor & service",
      sheet.voltDrop.toFixed(6), "%"].map(esc).join(","));
    lines.push(["Prospective short circuit current",
      sheet.shortCircuitAmps == null ? "" : sheet.shortCircuitAmps.toFixed(1),
      "A"].map(esc).join(","));

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${sheet.scheme.aptusRef || "aptus"}-calc-sheet.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const n = (v, dp) => (v == null ? "" : Number(v).toFixed(dp));

  return (
    <div className="fe-backdrop" onClick={() => { if (!drag.justDragged()) onClose(); }}>
      <div className="acs" onClick={(e) => e.stopPropagation()} style={drag.panelStyle}
        role="dialog" aria-label="Aptus Calc Sheet">
        <style>{CSS}</style>

        <div className="acs-head" {...drag.handleProps}>
          <div>
            <h3>Aptus Calc Sheet</h3>
            <p className="acs-sub">
              Volt drop and loop impedance information &middot;{" "}
              {project?.Project_Name || `Project ${project?.Project_ID ?? ""}`}
            </p>
          </div>
          <button className="fe-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="acs-body">
          {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}

          {!walked.rows.length && (
            <p className="acs-empty">
              No mains to report. The sheet reads one row per leg of electric
              main, walked out from the point of connection, so it fills in
              once a circuit has been built.
            </p>
          )}

          {!!walked.unreached.length && (
            <Banner kind="warn">
              {`Not on the sheet: ${walked.unreached.join(", ")}. `}
              These legs have no path back to the point of connection, so
              nothing can say what they carry.
            </Banner>
          )}

          {!!rows.filter((r) => r.missingCable).length && (
            <Banner kind="warn">
              {`No cable set on ${rows.filter((r) => r.missingCable)
                .map((r) => r.legLabel || r.section).join(", ")}. `}
              A section with no cable contributes nothing to the totals, which
              makes them read better than the truth.
            </Banner>
          )}

          {!!walked.rows.length && (
            <>
              {/* ── The head of the sheet ──

                  The four figures every number below depends on. ADMD
                  and the diversity allowance are the two most often
                  assumed and the two that move the answer most, so
                  they are typed rather than buried. */}
              <div className="acs-head-grid">
                <label>
                  <span>kVA domestic A.D.M.D.</span>
                  <input type="number" step="0.01" value={head.admdKva}
                    onChange={(e) => setHead((p) => ({ ...p, admdKva: Number(e.target.value) }))} />
                </label>
                <label>
                  <span>Small group diversity kVA</span>
                  <input type="number" step="0.5" value={head.groupKva}
                    onChange={(e) => setHead((p) => ({ ...p, groupKva: Number(e.target.value) }))} />
                </label>
                <label>
                  <span>Substation voltage</span>
                  <input type="number" step="1" value={head.phaseVoltageV}
                    onChange={(e) => setHead((p) => ({ ...p, phaseVoltageV: Number(e.target.value) }))} />
                  {/* The spreadsheet's B6 is the PHASE voltage, 240,
                      and the current column divides by three times it.
                      The same field elsewhere in this app holds the
                      LINE voltage and defaults to 400 — the two are
                      3.9% apart and the difference lands on every
                      current here, so which one this is gets said
                      rather than assumed. */}
                  <em>Phase, not line &mdash; the sheet divides by 3 &times; this</em>
                </label>
                <label>
                  <span>% volt drop at the start point</span>
                  <input type="number" step="0.01" value={head.startPct}
                    onChange={(e) => setHead((p) => ({ ...p, startPct: Number(e.target.value) }))} />
                  <em>From the POC</em>
                </label>
                <label>
                  <span>Loop impedance at the start point</span>
                  <input type="number" step="0.001" value={head.startOhms}
                    onChange={(e) => setHead((p) => ({ ...p, startOhms: Number(e.target.value) }))} />
                  <em>From the POC</em>
                </label>
                <label className="acs-check">
                  <input type="checkbox" checked={head.unbalanced}
                    onChange={(e) => setHead((p) => ({ ...p, unbalanced: e.target.checked }))} />
                  <span>Unbalanced</span>
                  <em>Applies 1 + 4.14 &divide; &radic;customers to every section</em>
                </label>
              </div>

              <div className="acs-route">
                <label>
                  <span>Route</span>
                  <select value={chosen?.to ?? ""}
                    onChange={(e) => { setRouteTo(e.target.value); setEdits({}); }}>
                    {(walked.routes || []).map((r) => (
                      <option key={r.to} value={r.to}>
                        {r.nodes.join(" \u2192 ")}
                        {worst?.route?.to === r.to ? "  (worst)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="acs-route-n">
                  The totals are the drop along this route. Sections off it are
                  unticked and contribute nothing, which is what the
                  spreadsheet&rsquo;s tick box does.
                </p>
              </div>

              {notARoute && (
                <Banner kind="warn">
                  The ticked sections are not one unbroken route from the point
                  of connection, so the totals below are a sum of legs rather
                  than the drop to anywhere.
                </Banner>
              )}

              <table className="acs-table">
                <thead>
                  <tr className="acs-top">
                    <th />
                    <th>Cable Length</th>
                    <th>Cable</th>
                    <th>Cable</th>
                    <th>Domestic</th>
                    <th>Customers</th>
                    <th>Total</th>
                    <th>Block</th>
                    <th>Phase</th>
                    <th>Loop</th>
                    <th>Volt</th>
                  </tr>
                  <tr>
                    <th>Section</th>
                    <th>metres</th>
                    <th>TYPE</th>
                    <th>cross section<br /><span>mm2</span></th>
                    <th>Distributed</th>
                    <th>Terminal</th>
                    <th>Domestic<br /><span>on Section</span></th>
                    <th>Load<br /><span>kVA</span></th>
                    <th>Current<br /><span>Amps</span></th>
                    <th>Impedance<br /><span>&#937;</span></th>
                    <th>Drop<br /><span>%</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.map((r, i) => {
                    const src = rows[i];
                    return (
                      <tr key={src.featureId} className={r.included ? "" : "acs-out"}>
                        <td className="acs-sect">
                          {/* The tick box is the spreadsheet's column D.
                              A section taken out keeps its row — the
                              design is what is drawn, not only what is
                              counted, and a row that vanished would be
                              a section nobody could see had been left
                              out. */}
                          <label>
                            <input type="checkbox" checked={r.included}
                              onChange={(e) => setEdit(src.featureId, "included", e.target.checked)} />
                            {r.section}
                          </label>
                        </td>
                        <td>{n(r.lengthM, 2)}</td>
                        <td className="acs-txt">{r.cableType}</td>
                        <td>{r.csa}</td>
                        <td>{r.distributed}</td>
                        <td>{r.terminal}</td>
                        <td>{r.domesticOnSection}</td>
                        <td className="acs-in">
                          <input type="number" step="1" min="0" value={r.blockKva}
                            aria-label={`Block load on ${r.section}`}
                            onChange={(e) => setEdit(src.featureId, "blockKva", e.target.value)} />
                        </td>
                        <td>{r.included ? n(r.amps, 1) : ""}</td>
                        <td>{r.included ? n(r.ohms, 6) : ""}</td>
                        {/* Blank rather than zero on a section that is
                            out of the calculation: a zero reads as a
                            section that drops nothing, which is a
                            different statement about the design. */}
                        <td>{r.pct == null ? "" : n(r.pct, 6)}</td>
                      </tr>
                    );
                  })}
                  <tr className="acs-total">
                    <td colSpan={8}>Total</td>
                    <td />
                    <td>{n(sheet.totals.ohms, 6)}</td>
                    <td>{n(sheet.totals.pct, 6)}</td>
                  </tr>
                </tbody>
              </table>

              <dl className="acs-foot">
                <div>
                  <dt>Loop impedance &mdash; Main plus Service</dt>
                  <dd>{n(sheet.loopImpedance, 6)} &#937;</dd>
                </div>
                <div>
                  <dt>Total volt drop on distributor &amp; service</dt>
                  <dd>{n(sheet.voltDrop, 6)} %</dd>
                </div>
                <div>
                  <dt>Prospective short circuit current</dt>
                  <dd>{sheet.shortCircuitAmps == null ? "\u2014"
                    : `${n(sheet.shortCircuitAmps, 1)} A`}</dd>
                </div>
              </dl>

              <p className="acs-note">
                No service row yet. Every plot has its own service on the
                drawing; the sheet&rsquo;s single Services line is a notional
                worst one, and which real service stands for it is a
                judgement this sheet does not make on its own.
              </p>
            </>
          )}
        </div>

        <div className="acs-actions">
          <button className="btn" onClick={csv} disabled={!walked.rows.length}>
            Export CSV
          </button>
          <span className="acs-spacer" />
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn accent" onClick={save}
            disabled={!dirty || saving || busy}>
            {saving ? "Saving\u2026" : "Save block loads"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── The tokens this app actually defines ──

   `--white`, `--border`, `--muted`, `--text`. Not `--card` and
   `--line`, which this panel was first written against and which
   exist nowhere in styles.css: an undefined custom property falls
   back to nothing, so the background never painted and the sheet
   rendered as text floating over the drawing, every border with it.

   It looks like a z-index or a backdrop fault and is neither. The
   tell is that the text is all present and correctly laid out. */
const CSS = `
.acs { background: var(--white); border-radius: 12px; width: min(1180px, 96vw);
  max-height: 90vh; display: flex; flex-direction: column;
  box-shadow: 0 18px 48px rgba(15,23,42,.28); }
.acs-head { display: flex; align-items: flex-start; gap: 12px; padding: 16px 18px 12px;
  border-bottom: 1px solid var(--border); cursor: move; }
.acs-head h3 { margin: 0; font-size: 1.05rem; }
.acs-sub { margin: 3px 0 0; font-size: .82rem; color: var(--muted); }
.acs-body { padding: 14px 18px; overflow: auto; }
.acs-empty { color: var(--muted); font-size: .9rem; }
.acs-head-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px 14px; margin: 4px 0 16px; }
.acs-head-grid label { display: flex; flex-direction: column; gap: 3px; font-size: .78rem; }
.acs-head-grid label > span { color: var(--muted); }
.acs-head-grid em { font-style: normal; font-size: .72rem; color: var(--muted); }
.acs-head-grid.acs-check, .acs-check { flex-direction: row; align-items: center; gap: 6px; }
.acs-route { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap;
  margin: 0 0 12px; }
.acs-route label { display: flex; align-items: center; gap: 8px; font-size: .8rem; }
.acs-route label > span { color: var(--muted); }
.acs-route-n { margin: 0; font-size: .74rem; color: var(--muted); }
.acs-table { width: 100%; border-collapse: collapse; font-size: .8rem; }
.acs-table th, .acs-table td { padding: 5px 7px; border-bottom: 1px solid var(--border);
  text-align: right; white-space: nowrap; }
.acs-table th { font-weight: 600; font-size: .74rem; color: var(--muted);
  vertical-align: bottom; }
.acs-table th span { font-weight: 400; }
.acs-table tr.acs-top th { border-bottom: 0; padding-bottom: 0; }
.acs-table td.acs-sect, .acs-table th:first-child, .acs-table td.acs-txt { text-align: left; }
.acs-sect label { display: flex; align-items: center; gap: 7px; cursor: pointer; }
.acs-out td { color: var(--muted); }
.acs-in input { width: 68px; text-align: right; padding: 2px 5px; font-size: .8rem; }
.acs-total td { font-weight: 600; border-top: 2px solid var(--border); }
.acs-foot { margin: 16px 0 0; display: grid; gap: 6px; }
.acs-foot > div { display: flex; justify-content: space-between; gap: 18px;
  max-width: 520px; font-size: .84rem; }
.acs-foot dt { color: var(--muted); }
.acs-foot dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
.acs-note { margin: 14px 0 0; font-size: .76rem; color: var(--muted); max-width: 640px; }
.acs-actions { display: flex; align-items: center; gap: 8px; padding: 12px 18px;
  border-top: 1px solid var(--border); }
.acs-spacer { flex: 1; }
`;
