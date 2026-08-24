import { useRef, useEffect, useState } from "react";
import {
  CHECKLIST, CINR, OUTCOMES, TESTS, JOB_FIELDS, DEFAULT_CUTOUT,
  PHOTO_KINDS, plotsOf, emptyPlot, breechJointsOf, breechesFor,
  routeUnknownFor, jointLabel, jointKey, plotKey, sketchTargets,
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

export default function JointingForm({ job, payload, set, setPlot, locked }) {
  const [page, setPage] = useState("wi");

  const plots = plotsOf(job?.plots);
  const joints = breechJointsOf(job);
  const targets = sketchTargets(job);

  const jobDetail = payload?.job || {};
  const setJob = (k, v) => set("job", { ...jobDetail, [k]: v });

  const setMark = (i, v) =>
    set("checklist", { ...(payload?.checklist || {}), [i]: v });

  const setJoint = (j, patch) =>
    set("breech", setIn(payload?.breech, jointKey(j), patch));

  const setSketch = (key, patch) =>
    set("sketches", setIn(payload?.sketches, key, patch));

  const addPhoto = (key, kind, file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const was = payload?.sketches?.[key]?.photos || {};
      setSketch(key, {
        photos: { ...was, [kind]: [...(was[kind] || []), String(r.result)] },
      });
    };
    r.readAsDataURL(file);
  };
  const removePhoto = (key, kind, i) => {
    const was = payload?.sketches?.[key]?.photos || {};
    setSketch(key, {
      photos: { ...was, [kind]: (was[kind] || []).filter((_, n) => n !== i) },
    });
  };

  /* Dead Jointed clears and locks that plot's ELI, Polarity and
     Voltage. The joint is made and the service is not live, so there is
     nothing to measure — and a number left in those boxes from before
     the outcome changed would read as a reading taken on a dead
     service. */
  const setOutcome = (p, v) => {
    if (v === "Dead Jointed") {
      setPlot(p, "outcome", v);
      for (const k of ["eli", "polarity", "voltage"]) setPlot(p, k, "");
      return;
    }
    setPlot(p, "outcome", v);
  };

  const cinr = (value, onPick, label) => (
    <select className="jf-cinr" value={value || ""} disabled={locked === "all"}
      aria-label={label} onChange={(e) => onPick(e.target.value)}>
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
          <button className="jf-tab" role="tab" type="button"
            aria-selected={page === "wi"} onClick={() => setPage("wi")}>
            1 &middot; Work Instruction
          </button>
          <button className="jf-tab" role="tab" type="button"
            aria-selected={page === "sketch"} onClick={() => setPage("sketch")}>
            2 &middot; Joint Location Sketch
            <span className="jf-tab-n">{targets.length}</span>
          </button>
        </div>
      </header>

      {/* ───────────── PAGE 1 — WORK INSTRUCTION ───────────── */}
      {page === "wi" && (
        <div className="jf-sheet">
          <div className="jf-sheet-head">
            <h1>Aptus Utilities &mdash; Work Instruction</h1>
            <p>{job?.task || "Jointing"} &mdash; Service Connection</p>
          </div>

          {/* Job details. Read-only on the tablet: every one of these is
              on the call-off already. */}
          <div className="jf-card">
            <div className="jf-card-title">Job Details</div>
            <div className="jf-grid">
              {JOB_FIELDS.map((f) => (
                <div className="jf-field" key={f.key}>
                  <label htmlFor={`jf-${f.key}`}>{f.label}</label>
                  {f.wide ? (
                    <div className="jf-two">
                      <input id={`jf-${f.key}`} type={f.type || "text"}
                        className="jf-locked" readOnly
                        value={jobDetail[f.key] ?? ""} />
                      <input className="jf-locked" readOnly
                        placeholder={f.wide.placeholder}
                        value={jobDetail[f.wide.key] ?? ""} />
                    </div>
                  ) : (
                    <input id={`jf-${f.key}`} type={f.type || "text"}
                      className="jf-locked" readOnly
                      value={jobDetail[f.key] ?? ""} />
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

          <div className="jf-card">
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

          {/* ── Plots ── */}
          <div className="jf-card">
            <div className="jf-card-title">
              Plots &mdash; Cut Out Termination &amp; Test Results
              <span className="jf-pill">{plots.length}</span>
            </div>

            {!plots.length && (
              <p className="jf-hint">
                No plots on this booking. If that is wrong, ring the office
                before starting &mdash; the test results have nowhere to go.
              </p>
            )}

            {plots.map((p) => {
              const a = payload?.plots?.[p] ?? emptyPlot();
              const dead = a.outcome === "Dead Jointed";
              return (
                <div className="jf-block" key={p}>
                  <div className="jf-block-top">
                    <div className="jf-cell jf-narrow">
                      <label>Plot</label>
                      <input className="jf-locked" readOnly value={p} />
                    </div>
                    <div className="jf-cell">
                      <label htmlFor={`jf-cot-${p}`}>Cut Out Termination</label>
                      <input id={`jf-cot-${p}`} className="jf-locked" readOnly
                        value={a.cutout || DEFAULT_CUTOUT} />
                    </div>
                    <div className="jf-cell jf-outcome-cell">
                      <label htmlFor={`jf-out-${p}`}>Outcome</label>
                      <select id={`jf-out-${p}`} className="jf-outcome"
                        data-val={a.outcome || ""} value={a.outcome || ""}
                        onChange={(e) => setOutcome(p, e.target.value)}>
                        <option value="">&mdash; Outcome &mdash;</option>
                        {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="jf-tests">
                    {TESTS.map((t) => {
                      /* Cleared and locked on a dead joint — nothing to
                         measure on a service that is not live. */
                      const off = dead && ["eli", "polarity", "voltage"].includes(t.key);
                      return (
                        <div className="jf-cell" key={t.key}>
                          <label htmlFor={`jf-${t.key}-${p}`}>{t.label}</label>
                          {t.type === "choice" ? (
                            <select id={`jf-${t.key}-${p}`} className="jf-numsel"
                              value={a[t.key] || ""} disabled={off}
                              onChange={(e) => setPlot(p, t.key, e.target.value)}>
                              <option value="">&mdash;</option>
                              {t.options.filter(Boolean).map((o) => (
                                <option key={o} value={o}>{o}</option>
                              ))}
                            </select>
                          ) : (
                            <input id={`jf-${t.key}-${p}`} className="jf-num"
                              type="number" step="any" inputMode="decimal"
                              value={a[t.key] ?? ""} disabled={off}
                              onChange={(e) => setPlot(p, t.key, e.target.value)} />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* What the drawing said was on the way back to this
                      plot, for reference. The joints themselves are
                      answered in their own blocks below — this is here
                      so a gang at plot 22 can see which of them belong
                      to its route without cross-referencing. */}
                  {breechesFor(job, p).length > 0 && (
                    <p className="jf-onroute">
                      On the way back:{" "}
                      {breechesFor(job, p).map((j) => jointLabel(j)).join(" \u00b7 ")}
                    </p>
                  )}
                  {routeUnknownFor(job, p) && (
                    <p className="jf-warn">
                      The route back from this plot could not be traced when this
                      call-off was raised. Check before you start.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Breech joints, one block each ── */}
          <div className="jf-card">
            <div className="jf-card-title">
              Service Breech Joints
              <span className="jf-pill">{joints.length}</span>
            </div>

            {!joints.length && (
              <p className="jf-hint">
                No breech joints booked on this visit.
              </p>
            )}

            {joints.map((j) => {
              const k = jointKey(j);
              const a = payload?.breech?.[k] || {};
              return (
                <div className="jf-block jf-breech" key={k}>
                  <div className="jf-block-head">
                    <span className="jf-block-name">{jointLabel(j)}</span>
                    {j.plots?.length > 0 && (
                      <span className="jf-serves">
                        serves plot{j.plots.length === 1 ? "" : "s"} {j.plots.join(", ")}
                      </span>
                    )}
                  </div>
                  <div className="jf-breech-row">
                    <div className="jf-cell">
                      <label htmlFor={`jf-from-${k}`}>From spec</label>
                      <input id={`jf-from-${k}`} className="jf-locked" readOnly
                        value={a.from ?? ""} />
                    </div>
                    <div className="jf-cell">
                      <label htmlFor={`jf-to-${k}`}>To spec</label>
                      <input id={`jf-to-${k}`} className="jf-locked" readOnly
                        value={a.to ?? ""} />
                    </div>
                    <div className="jf-cell jf-narrow">
                      <label htmlFor={`jf-done-${k}`}>Completion</label>
                      {cinr(a.done, (v) => setJoint(j, { done: v }),
                        `Completion for ${jointLabel(j)}`)}
                    </div>
                  </div>
                  {!j.node && (
                    <p className="jf-warn">
                      No span node recorded against this joint &mdash; the levels
                      may not have been taken. Check before you dig.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Sign-off ── */}
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
            <div className="jf-field jf-full">
              <label>Signature</label>
              <SketchPad value={payload?.signature || ""}
                onChange={(v) => set("signature", v)} />
            </div>
          </div>

          <div className="jf-actions">
            <button type="button" className="jf-btn"
              onClick={() => setPage("sketch")}>
              Next: Joint Location Sketch &rarr;
            </button>
          </div>
        </div>
      )}

      {/* ───────────── PAGE 2 — JOINT LOCATION SKETCHES ───────────── */}
      {page === "sketch" && (
        <div className="jf-sheet">
          <div className="jf-sheet-head">
            <h1>Joint Location Sketches</h1>
            <p>One for every joint &mdash; plots and breech joints alike</p>
          </div>

          {!targets.length && (
            <div className="jf-card jf-last">
              <p className="jf-hint">
                Nothing on this booking to sketch.
              </p>
            </div>
          )}

          {targets.map((t) => {
            const s = payload?.sketches?.[t.key] || {};
            return (
              <div className="jf-card" key={t.key}>
                <div className="jf-card-title">
                  {t.title}
                  <span className={`jf-pill ${t.kind === "breech" ? "jf-pill-b" : ""}`}>
                    {t.kind === "breech" ? "Breech joint" : "Plot"}
                  </span>
                  <span className="jf-sub">{t.subtitle}</span>
                </div>

                <Photos shot={s.photos}
                  onAdd={(kind, file) => addPhoto(t.key, kind, file)}
                  onRemove={(kind, i) => removePhoto(t.key, kind, i)} />

                <SketchPad value={s.image || ""}
                  onChange={(v) => setSketch(t.key, { image: v })} />

                <div className="jf-field jf-full" style={{ marginTop: 12 }}>
                  <label htmlFor={`jf-note-${t.key}`}>
                    Description &mdash; where the joint is, measured from what
                  </label>
                  <textarea id={`jf-note-${t.key}`} rows={2}
                    value={s.note ?? ""}
                    onChange={(e) => setSketch(t.key, { note: e.target.value })} />
                </div>
              </div>
            );
          })}

          <div className="jf-actions">
            <button type="button" className="jf-btn"
              onClick={() => setPage("wi")}>
              &larr; Back to Work Instruction
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Scoped to .jf. The field app has its own stylesheet and this sheet is
   a document rather than a screen — its own type, its own colours, and
   nothing it sets should reach the queue behind it. */
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

.jf-sheet{ max-width:1040px; margin:22px auto 60px; padding:0 16px; }
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

@media (max-width:820px){
  .jf-grid, .jf-signoff{ grid-template-columns:1fr; }
  .jf-block-top, .jf-breech-row{ grid-template-columns:1fr; }
  .jf-tests{ grid-template-columns:repeat(2,minmax(0,1fr)); }
  .jf-pcats{ grid-template-columns:1fr; }
}
`;
