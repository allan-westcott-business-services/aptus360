import { useState, useEffect, useRef, useCallback } from "react";
import {
  startInstruction, saveInstruction, submitInstruction,
} from "../../api/field.js";
import {
  CHECKLIST, MARKS, OUTCOMES, TESTS, JOB_FIELDS,
  isJointingJob, plotsOf, emptyPlot, missingFrom,
} from "./jointingInstruction.js";

/* The work instruction, filled in on site.

   ── Saved as it goes ──

   Not on submit. A work instruction is written across a day: some at
   the start, the photographs as work happens, the declaration at the
   end. A form that only exists between opening and submitting loses a
   morning when the tablet sleeps or the van moves out of signal — and
   what happens then is somebody fills it in on paper and types it up
   at home.

   So every field writes a draft, debounced so a sentence is one request
   rather than forty. The draft is the submission, earlier: nothing is
   copied when it is sent.

   ── What it says when the signal goes ──

   Plainly, and without losing anything. The typing stays in the box —
   React holds it — and the line under the buttons says it has not been
   saved. Somebody who can see that can decide to wait; somebody shown
   nothing assumes it went.

   ── The sections ──

   Deliberately few for now. The old Work Instruction form has more, and
   they are worth bringing across as they are — but the plumbing is
   where the risk is, and a form that saves reliably with four sections
   is worth more than one that loses ten. */

/* One place, so a field added here is a field the draft holds and the
   office reads. Type decides the control and nothing else. */
const SECTIONS = [
  {
    key: "arrival",
    title: "On arrival",
    fields: [
      { key: "arrived_at", label: "Time on site", type: "time" },
      { key: "access", label: "Access as expected?", type: "yesno" },
      { key: "access_note", label: "If not, what was different", type: "text" },
    ],
  },
  {
    key: "ground",
    title: "The ground",
    fields: [
      { key: "surface", label: "Surface dug", type: "choice",
        options: ["Verge", "Footway", "Carriageway", "Unmade", "Agricultural"] },
      { key: "services_found", label: "Other services found?", type: "yesno" },
      { key: "services_note", label: "What, and where", type: "text" },
    ],
  },
  {
    key: "work",
    title: "The work",
    fields: [
      { key: "length_dug", label: "Length dug (m)", type: "number" },
      { key: "laid", label: "What was laid", type: "text" },
      { key: "backfilled", label: "Backfilled and made good?", type: "yesno" },
      { key: "notes", label: "Anything else the office should know", type: "text" },
    ],
  },
];

/* Everything that has to be answered before it can be sent.

   The declaration only, because that is the one the server insists on
   too. A longer list guessed at here is a list somebody types anything
   into at five o'clock to get home, and then the record says something
   untrue rather than nothing. */
const REQUIRED = ["declaration"];

export default function WorkInstruction({ job, onDone, onCancel }) {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("idle");   // idle | saving | saved | failed
  const [sending, setSending] = useState(false);

  const assignmentId = job?.assignmentId;

  /* Which form this visit takes. Read off the phase the assignment is
     booked against — see isJointingJob — rather than off the call-off's
     work type, because a service call-off carries an energisation visit
     too and that is not a jointing visit. */
  const jointing = isJointingJob(job);
  const plots = jointing ? plotsOf(job?.plots) : [];

  /* One plot's answers, written under `plots` so the office reads a
     shape rather than a hundred flat keys. Merged rather than replaced,
     so filling in a test does not clear the outcome beside it. */
  const setPlot = (plot, key, value) => {
    const was = payload?.plots?.[plot] ?? emptyPlot();
    const next = { ...(payload?.plots || {}), [plot]: { ...was, [key]: value } };
    setPayload((p) => ({ ...(p || {}), plots: next }));
    queue({ plots: next });
  };

  const setMark = (i, mark) => {
    const was = payload?.checklist || {};
    /* Pressing the mark it already carries clears it. Blank means "not
       reached", which is a real answer, and without this there is no
       way back to it from a mis-tap. */
    const next = { ...was, [i]: was[i] === mark ? "" : mark };
    setPayload((p) => ({ ...(p || {}), checklist: next }));
    queue({ checklist: next });
  };
  const pending = useRef(null);
  const timer = useRef(null);

  /* Started on opening: the job says somebody is on site, and a draft
     exists to write into. Resumes where it was if one is already
     open. */
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await startInstruction(assignmentId);
        if (live) setPayload(r?.Payload ?? r?.payload ?? {});
      } catch (e) {
        if (live) setError(e.message);
      }
    })();
    return () => { live = false; };
  }, [assignmentId]);

  /* Debounced, so a sentence is one request rather than forty — and
     flushed on the way out, so the last thing typed is not the thing
     that is lost. */
  const queue = useCallback((patch) => {
    pending.current = { ...(pending.current || {}), ...patch };
    setSaving("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const send = pending.current;
      pending.current = null;
      try {
        await saveInstruction(assignmentId, send);
        setSaving("saved");
      } catch {
        /* Kept, so the next save carries it. Nothing typed is thrown
           away because a request failed. */
        pending.current = { ...send, ...(pending.current || {}) };
        setSaving("failed");
      }
    }, 800);
  }, [assignmentId]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const set = (key, value) => {
    setPayload((p) => ({ ...(p || {}), [key]: value }));
    queue({ [key]: value });
  };

  /* What is outstanding, asked of whichever form is on screen. The
     jointing one wants an outcome per plot as well as the declaration;
     the generic one wants the declaration only. */
  const missing = jointing
    ? missingFrom(payload || {}, plots)
    : REQUIRED.filter((k) => !payload?.[k]).map(() => "The declaration");

  async function send() {
    setSending(true);
    setError("");
    try {
      /* Whatever has not reached the server yet goes with it, so the
         last field typed is included even if its save is still
         waiting. */
      const rest = pending.current || {};
      pending.current = null;
      clearTimeout(timer.current);

      const r = await submitInstruction(assignmentId, { ...payload, ...rest });
      onDone?.(r);
    } catch (e) {
      setError(e.message);
      setSending(false);
    }
  }

  if (!payload && !error) return <p className="fq-note">Opening&hellip;</p>;

  return (
    <div className="wi">
      <style>{CSS}</style>

      <header className="wi-top">
        <div>
          <div className="wi-task">{job?.task ?? "Work instruction"}</div>
          <div className="wi-site">{job?.siteName}</div>
        </div>
        {/* Not "cancel". Leaving does not throw the draft away, and a
            button that says cancel next to a half-filled form reads as
            though it might. */}
        <button className="fq-btn ghost wi-back" onClick={onCancel}>
          Back to job
        </button>
      </header>

      {error && <div className="fq-error"><p>{error}</p></div>}

      {/* ── The jointing form ──

          Shown in place of the generic sections, not beside them: a
          jointing visit is a different job and a different record, and
          asking "length dug" against one is not a smaller version of
          this question but the wrong one. */}
      {jointing && (
        <>
          <section className="wi-sec">
            <h2>Job details</h2>
            {/* Read-only. Every one of these is on the call-off, and
                asking a gang to retype what the office holds is how a
                plot number gets transposed on the one document
                carrying the test results. */}
            <dl className="wi-job">
              {JOB_FIELDS.map((f) => (
                <div key={f.key}>
                  <dt>{f.label}</dt>
                  <dd>{job?.[f.key] || "\u2014"}</dd>
                </div>
              ))}
              <div>
                <dt>Plots</dt>
                <dd>{job?.plots || "\u2014"}</dd>
              </div>
            </dl>
          </section>

          <section className="wi-sec">
            <h2>Task checklist</h2>
            <p className="wi-hint">
              C complete &middot; I incomplete &middot; NR not required.
              Leave a task blank if you did not get to it.
            </p>
            {CHECKLIST.map((task, i) => (
              <div className="wi-chk" key={i}>
                <span className="wi-chk-task">{task}</span>
                <span className="wi-yn">
                  {MARKS.map((m) => (
                    <button key={m} type="button"
                      className={`wi-opt${payload?.checklist?.[i] === m ? " on" : ""}`}
                      aria-pressed={payload?.checklist?.[i] === m}
                      onClick={() => setMark(i, m)}>{m}</button>
                  ))}
                </span>
              </div>
            ))}
          </section>

          <section className="wi-sec">
            <h2>Plots</h2>
            {!plots.length && (
              <p className="wi-hint">
                No plots on this booking. Ring the office before starting
                &mdash; the test results have nowhere to go.
              </p>
            )}
            {plots.map((plot) => (
              <div className="wi-plot" key={plot}>
                <h3>Plot {plot}</h3>

                <div className="wi-fld">
                  <label htmlFor={`wi-cot-${plot}`}>Cut Out Termination</label>
                  <input id={`wi-cot-${plot}`} type="text"
                    value={payload?.plots?.[plot]?.cutout ?? ""}
                    onChange={(e) => setPlot(plot, "cutout", e.target.value)} />
                </div>

                <div className="wi-fld">
                  <label>Outcome</label>
                  <div className="wi-yn wrap">
                    {OUTCOMES.map((o) => (
                      <button key={o} type="button"
                        className={`wi-opt${payload?.plots?.[plot]?.outcome === o ? " on" : ""}`}
                        onClick={() => setPlot(plot, "outcome", o)}>{o}</button>
                    ))}
                  </div>
                </div>

                {TESTS.map((t) => (
                  <div className="wi-fld" key={t.key}>
                    <label htmlFor={`wi-${t.key}-${plot}`}>{t.label}</label>
                    {t.type === "choice" ? (
                      <div className="wi-yn wrap">
                        {t.options.filter(Boolean).map((v) => (
                          <button key={v} type="button"
                            className={`wi-opt${payload?.plots?.[plot]?.[t.key] === v ? " on" : ""}`}
                            onClick={() => setPlot(plot, t.key,
                              payload?.plots?.[plot]?.[t.key] === v ? "" : v)}>
                            {v}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input id={`wi-${t.key}-${plot}`} type="number"
                        inputMode="decimal"
                        value={payload?.plots?.[plot]?.[t.key] ?? ""}
                        onChange={(e) => setPlot(plot, t.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </section>

          <section className="wi-sec">
            <h2>Sign-off</h2>
            <div className="wi-fld">
              <label htmlFor="wi-completedby">Completed by</label>
              <input id="wi-completedby" type="text"
                value={payload?.completedBy ?? ""}
                onChange={(e) => set("completedBy", e.target.value)} />
            </div>
            {/* The drawn signature, the photographs and the joint
                location sketch all need a canvas and somewhere to put
                an image. That is one piece of work and it follows this
                one. The declaration below is the tap this form already
                uses; it is not a signature and does not pretend to
                be. */}
          </section>
        </>
      )}

      {!jointing && SECTIONS.map((s) => (
        <section className="wi-sec" key={s.key}>
          <h2>{s.title}</h2>
          {s.fields.map((f) => (
            <div className="wi-fld" key={f.key}>
              <label htmlFor={`wi-${f.key}`}>{f.label}</label>

              {f.type === "yesno" ? (
                <div className="wi-yn">
                  {["Yes", "No"].map((v) => (
                    <button key={v} type="button"
                      className={`wi-opt${payload?.[f.key] === v ? " on" : ""}`}
                      onClick={() => set(f.key, v)}>{v}</button>
                  ))}
                </div>
              ) : f.type === "choice" ? (
                <div className="wi-yn wrap">
                  {f.options.map((v) => (
                    <button key={v} type="button"
                      className={`wi-opt${payload?.[f.key] === v ? " on" : ""}`}
                      onClick={() => set(f.key, v)}>{v}</button>
                  ))}
                </div>
              ) : f.type === "text" ? (
                <textarea id={`wi-${f.key}`} rows={2}
                  value={payload?.[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)} />
              ) : (
                <input id={`wi-${f.key}`}
                  type={f.type === "number" ? "number" : f.type}
                  inputMode={f.type === "number" ? "decimal" : undefined}
                  value={payload?.[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)} />
              )}
            </div>
          ))}
        </section>
      ))}

      {/* The declaration, last and on its own.

          It is a statement about site conditions made by a named person,
          which is what the office is checking — so it is not one tick
          among nine in a section called "the work". */}
      <section className="wi-sec wi-dec">
        <h2>Declaration</h2>
        <p>
          I confirm the work above was carried out as described, and that
          the site was left safe.
        </p>
        <button type="button"
          className={`wi-opt big${payload?.declaration ? " on" : ""}`}
          onClick={() => set("declaration", payload?.declaration ? "" : "signed")}>
          {payload?.declaration ? "Signed" : "Tap to sign"}
        </button>
      </section>

      <div className="wi-foot">
        {/* What has and has not reached the office. Said plainly:
            somebody who can see the signal has gone can decide to wait,
            and somebody shown nothing assumes it went. */}
        <p className={`wi-saved s-${saving}`}>
          {saving === "failed"
            ? "Not saved \\u2014 no signal. Your typing is still here; it will "
              + "save when you are back in range."
            : saving === "saving" ? "Saving\\u2026"
              : saving === "saved" ? "Saved" : "Saved as you go"}
        </p>

        {!!missing.length && (
          <p className="wi-missing">Sign the declaration before sending.</p>
        )}

        <button className="fq-btn primary"
          disabled={sending || !!missing.length}
          onClick={send}>
          {sending ? "Sending\\u2026" : "Send to the office"}
        </button>
      </div>
    </div>
  );
}

const CSS = `
.wi { max-width: 560px; margin: 0 auto; padding: 0 14px 40px; }
.wi-top { display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px; padding: 16px 0 14px; }
.wi-task { font-size: 18px; font-weight: 600; }
.wi-site { font-size: 14px; color: #5a6b7b; }
.wi-back { width: auto; min-height: 40px; padding: 0 12px; }

/* ── The jointing form ──

   Sized for a tablet held in one hand on a road. Every target is at
   least 44px, and the plot rows are boxed rather than ruled: a gang
   scrolling through fifteen plots needs to see where one ends without
   counting fields.

   No colour carries meaning on its own. The record is read in daylight
   through a screen protector, so the marked state is a fill AND a
   border AND a weight, not a tint. */
.wi-job { display: grid; grid-template-columns: 1fr; gap: 8px; margin: 0; }
.wi-job dt { font: 600 11px inherit; text-transform: uppercase;
  letter-spacing: .04em; color: #64748b; margin: 0; }
.wi-job dd { margin: 2px 0 0; font-size: 15px; }

.wi-hint { font-size: 13px; color: #64748b; margin: 0 0 12px; line-height: 1.4; }

.wi-chk { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 0; border-bottom: 1px solid #eef1f5; }
.wi-chk:last-child { border-bottom: 0; }
.wi-chk-task { flex: 1 1 220px; font-size: 14px; line-height: 1.35; }

/* Boxed, and titled with the plot number, because the number is what
   somebody standing on a drive is matching against. */
.wi-plot { border: 1px solid #e6eaf0; border-radius: 10px; padding: 12px;
  margin-bottom: 12px; background: #fbfcfe; }
.wi-plot h3 { margin: 0 0 10px; font-size: 15px; font-weight: 700; }

.wi-sec { background: #fff; border: 1px solid #e6eaf0; border-radius: 12px;
  padding: 16px; margin-bottom: 12px; }
.wi-sec h2 { font-size: 15px; font-weight: 600; margin: 0 0 12px; }
.wi-fld { margin-bottom: 14px; }
.wi-fld:last-child { margin-bottom: 0; }
.wi-fld label { display: block; font-size: 14px; color: #5a6b7b; margin-bottom: 6px; }
.wi-fld input, .wi-fld textarea { width: 100%; font: inherit; font-size: 16px;
  padding: 10px 12px; border: 1px solid #d7dee6; border-radius: 10px;
  background: #fff; }

/* Buttons rather than a select: a dropdown on a tablet is a small
   target that hides its own options behind a tap. */
.wi-yn { display: flex; gap: 8px; }
.wi-yn.wrap { flex-wrap: wrap; }
.wi-opt { min-height: 48px; padding: 0 18px; font-size: 16px; border-radius: 10px;
  border: 1px solid #d7dee6; background: #fff; color: #1c2430; }
.wi-opt.on { border-color: #39467B; border-width: 2px; background: #eef1f8;
  font-weight: 600; }
.wi-opt.big { width: 100%; min-height: 56px; font-size: 17px; }

.wi-dec p { font-size: 15px; color: #5a6b7b; line-height: 1.6; margin: 0 0 14px; }

.wi-foot { margin-top: 18px; }
.wi-saved { font-size: 13px; color: #97a3b0; margin: 0 0 10px; }
.wi-saved.s-saved { color: #166534; }
/* Amber, not red: nothing has been lost, and a red line says it has. */
.wi-saved.s-failed { color: #7c4a03; background: #fef3e2; border: 1px solid #f2d675;
  border-radius: 8px; padding: 9px 11px; line-height: 1.6; }
.wi-missing { font-size: 13px; color: #7c4a03; margin: 0 0 10px; }
`;
