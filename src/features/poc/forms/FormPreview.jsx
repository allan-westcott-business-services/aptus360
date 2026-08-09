import { useRef, useState } from "react";
import { updatePoc } from "../../../api/poc.js";

/* The form, shown in the application rather than a popup window.

   ── Why not a popup ──

   The first version opened `window.open` and wrote the document into
   it. Where popups are blocked — which is the default in several
   browsers — the window never appears, and the only sign of it was a
   banner at the top of a long page the user had already scrolled past.
   The button looked broken. An iframe cannot be blocked.

   It also removes a whole mechanism: the popup had no session, so
   recording a submission meant posting a message back to the
   application and answering it. Here the submit button is React's, and
   it calls the API directly.

   ── Why still a document, not components ──

   The form is laid out to match printed artwork — fixed page boxes,
   exact rules and tints. Rendered as part of the application it would
   inherit its stylesheet, and a stray global rule would quietly move
   something on a form somebody then posts to a network operator. An
   iframe with `srcDoc` gives it a clean document of its own. */

export default function FormPreview({ form, prepared, poc, projectId, onClose, onSubmitted }) {
  const frame = useRef(null);
  const [office, setOffice] = useState(
    form.offices ? Object.keys(form.offices)[0] : null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [status, setStatus] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const to = office && form.offices ? form.offices[office].email : prepared.submit.to;

  function print() {
    const w = frame.current?.contentWindow;
    if (!w) return;
    /* Focus first: without it Safari prints the application rather than
       the frame, which is a wrong answer that looks like a right one. */
    w.focus();
    w.print();
  }

  async function submit() {
    setBusy(true);
    setStatus("Opening your email\u2026");
    const { subject, body } = prepared.submit;
    window.location.href = `mailto:${encodeURIComponent(to)}`
      + `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      const today = new Date().toISOString().slice(0, 10);
      await updatePoc(projectId, poc.POC_Application_ID, { Submitted_Date: today });
      onSubmitted?.(poc.POC_Application_ID, today);
      setSent(true);
      setStatus("Recorded in Aptus360 as submitted.");
    } catch (e) {
      /* Said plainly rather than swallowed: the email is open either
         way, and somebody who thinks it was recorded will not go and
         set the date themselves. */
      setStatus(`Email opened, but the submission was not recorded (${e.message}). `
        + "Set the submitted date on the application yourself.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fp" role="dialog" aria-label={`${form.title} application form`}>
      <style>{CSS}</style>

      <div className="fp-bar">
        <span className="fp-title">{form.title}</span>
        {prepared.ref && <span className="fp-ref">{prepared.ref}</span>}
        <span className="fp-sp" />
        <span className="fp-hint">Fields are editable &mdash; fill in anything missing, then print.</span>
        <button className="btn sm" onClick={print}>Print / Save as PDF</button>
        <button className="btn edit sm" disabled={sent}
          onClick={() => setShowSubmit((v) => !v)}>
          {sent ? "Submitted" : `Submit to ${form.type}`}
        </button>
        <button className="btn sm" onClick={onClose}>Close</button>
      </div>

      {showSubmit && !sent && (
        <div className="fp-submit">
          <h3>Submit to {form.title}</h3>
          <p>
            Email cannot attach the form for you. Save it first with
            <strong> Print / Save as PDF</strong>, then attach that PDF &mdash;
            along with your site plans &mdash; to the message that opens.
          </p>
          {form.offices && (
            <label className="fp-office">
              Regional office
              <select value={office} onChange={(e) => setOffice(e.target.value)}>
                {Object.keys(form.offices).map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </label>
          )}
          <p>Goes to <code>{to}</code>. The application will be recorded as submitted.</p>
          <div className="fp-act">
            <button className="btn edit sm" disabled={busy} onClick={submit}>
              Open email
            </button>
            <button className="btn sm" onClick={() => setShowSubmit(false)}>Cancel</button>
          </div>
        </div>
      )}

      {status && <p className={sent ? "fp-status ok" : "fp-status"}>{status}</p>}

      <div className="fp-body">
        <iframe ref={frame} title={`${form.title} application form`}
          srcDoc={prepared.html} />
      </div>
    </div>
  );
}

const CSS = `
.fp { position: fixed; inset: 0; z-index: 200; background: #e5e7eb;
  display: flex; flex-direction: column; }
.fp-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 16px; background: #1f2937; color: #fff; font-size: 13px; }
.fp-title { font-weight: 700; }
.fp-ref { opacity: .75; font-size: 12px; }
.fp-sp { flex: 1; }
.fp-hint { opacity: .75; font-size: 12px; }
.fp-bar .btn { background: rgba(255,255,255,.14); color: #fff; border-color: transparent; }
.fp-bar .btn:hover:not(:disabled) { background: rgba(255,255,255,.24); }
.fp-bar .btn.edit { background: #059669; }
.fp-submit { background: #ecfdf5; border-bottom: 1px solid #a7f3d0; padding: 14px 18px;
  color: #064e3b; font-size: 13px; }
.fp-submit h3 { margin: 0 0 5px; font-size: 14px; }
.fp-submit p { margin: 0 0 6px; max-width: 80ch; }
.fp-submit code { background: rgba(0,0,0,.06); padding: 1px 5px; border-radius: 4px; }
.fp-office { display: inline-flex; align-items: center; gap: 8px; margin: 4px 0 8px;
  font-weight: 600; }
.fp-office select { font: 500 12.5px inherit; padding: 5px 9px; border-radius: 6px;
  border: 1px solid #a7f3d0; }
.fp-act { display: flex; gap: 8px; margin-top: 6px; }
.fp-status { margin: 0; padding: 9px 18px; background: #fef3c7; color: #78350f;
  font-size: 12.5px; }
.fp-status.ok { background: #d1fae5; color: #065f46; }
.fp-body { flex: 1; min-height: 0; overflow: auto; }
.fp-body iframe { width: 100%; height: 100%; border: 0; background: #e5e7eb; }
`;
