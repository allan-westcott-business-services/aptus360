/* Enquiries waiting for somebody here.

   A developer sends a sheet from the portal and it lands as
   `submitted`. Nothing becomes a project by itself, so this is where
   somebody reads it and says yes or no.

   ── Two panes, not two screens ──

   The list and the enquiry beside it, because deciding means reading:
   a queue that opens each one on its own page makes somebody lose
   their place every time they go back, and there is no reading
   involved in a list of names and dates.

   ── The answers are shown as they were answered ──

   Each answer carries the question AS IT WAS WORDED when it was asked,
   so an enquiry from March reads in March's terms however the sheet
   has changed since. Nothing here reaches for the live questions: that
   would show today's wording against last spring's answers.

   ── Accepting links a project; it does not make one ──

   Making a project needs a reference, a customer and a branch decided
   by rules this screen does not know. Inventing one is a worse mistake
   than asking somebody to pick the project they have made. The link is
   optional, so an enquiry can be accepted now and joined up after. */

import { useEffect, useMemo, useState } from "react";
import { http } from "../../api/client.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* dd-mmm-yy, as the portal reads them. */
const dateText = (d) => {
  if (!d) return "";
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return String(d);
  return `${String(t.getDate()).padStart(2, "0")}-${MONTHS[t.getMonth()]}`
    + `-${String(t.getFullYear()).slice(-2)}`;
};

const STATUS_WORDS = {
  submitted: "Waiting",
  draft: "Not sent",
  accepted: "Accepted",
  declined: "Declined",
};

export default function EnquiriesAdmin() {
  const [rows, setRows] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [note, setNote] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const r = await http.get("/enquiries/list");
      setRows(r?.enquiries || []);
      setError("");
    } catch (e) { setError(e.message); setRows([]); }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (openId == null) { setDetail(null); return undefined; }
    let live = true;
    setDetail(null);
    setNote("");
    setProjectId("");
    http.get(`/enquiries/one?id=${openId}`)
      .then((r) => { if (live) setDetail(r); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [openId]);

  const waiting = useMemo(
    () => (rows || []).filter((r) => r.Status === "submitted").length,
    [rows],
  );

  async function decide(decision) {
    setBusy(true);
    try {
      await http.post("/enquiries/decide", {
        id: openId,
        decision,
        note: note || null,
        projectId: decision === "accepted" && projectId ? projectId : null,
      });
      await load();
      /* Straight back to the queue: the enquiry just decided is no
         longer the thing in hand, and leaving it open invites somebody
         to press the other button. */
      setOpenId(null);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const e = detail?.enquiry;
  const decided = e && (e.Status === "accepted" || e.Status === "declined");

  return (
    <div className="admin-pane">
      <style>{CSS}</style>
      <h2>Enquiries</h2>
      <p className="hint">
        Sheets developers have sent in. Nothing becomes a project by itself:
        read one and accept or decline it.
        {waiting > 0 && <strong> {waiting} waiting.</strong>}
      </p>

      {error && <div className="banner error eq-error">{error}</div>}

      <div className="eq-split">
        <div className="eq-list">
          {rows == null && <p className="hint">Loading&hellip;</p>}
          {rows?.length === 0 && (
            <p className="hint">
              Nothing has been sent in yet. A developer sees the enquiry sheet
              in the portal once one is published for their audience.
            </p>
          )}
          {(rows || []).map((r) => (
            <button key={r.Enquiry_Submission_ID}
              className={`eq-row${openId === r.Enquiry_Submission_ID ? " on" : ""}`}
              onClick={() => setOpenId(r.Enquiry_Submission_ID)}>
              <span className="eq-who">
                {r.organisationName || "Unknown company"}
                {r.branchName ? ` (${r.branchName})` : ""}
              </span>
              <span className="eq-when">
                {dateText(r.Submitted_At)} {"\u00b7"} {r.Submitted_By || "\u2014"}
              </span>
              <span className={`eq-tag eq-${r.Status}`}>
                {STATUS_WORDS[r.Status] || r.Status}
              </span>
            </button>
          ))}
        </div>

        <div className="eq-detail">
          {openId == null ? (
            <p className="hint">Pick an enquiry to read it.</p>
          ) : !detail ? (
            <p className="hint">Loading&hellip;</p>
          ) : (
            <>
              <div className="eq-head">
                <div>
                  <h3>
                    {e.organisationName
                      || rows?.find((r) => r.Enquiry_Submission_ID === openId)
                        ?.organisationName
                      || "Enquiry"}
                  </h3>
                  <p className="hint">
                    Sent {dateText(e.Submitted_At)} by {e.Submitted_By || "\u2014"}
                  </p>
                </div>
                <span className={`eq-tag eq-${e.Status}`}>
                  {STATUS_WORDS[e.Status] || e.Status}
                </span>
              </div>

              {/* The questions as they were asked, with what was said. */}
              <div className="eq-answers">
                {detail.answers.length === 0 && (
                  <p className="hint">
                    This enquiry has no answers recorded against it.
                  </p>
                )}
                {detail.answers.map((a) => (
                  <div key={a.Enquiry_Answer_ID} className="eq-answer">
                    <span className="eq-q">{a.Question_Text}</span>
                    <span className="eq-a">
                      {a.Answer_Text || <em className="hint">Not answered</em>}
                    </span>
                  </div>
                ))}
              </div>

              {decided ? (
                /* Said plainly rather than by a coloured tag alone: who
                   decided and why is what somebody comes back for
                   months later, usually because the developer has
                   asked. */
                <p className="hint eq-decided">
                  {STATUS_WORDS[e.Status]} on {dateText(e.Decided_At)}
                  {e.Decided_By ? ` by ${e.Decided_By}` : ""}
                  {e.Decision_Note ? ` \u2014 ${e.Decision_Note}` : ""}
                  {e.Project_ID ? ` \u00b7 project #${e.Project_ID}` : ""}
                </p>
              ) : (
                <div className="eq-decide">
                  <div className="fld">
                    <label htmlFor="eq-note">Note</label>
                    <input id="eq-note" value={note}
                      onChange={(ev) => setNote(ev.target.value)}
                      placeholder="Why, especially if declining" />
                  </div>
                  <div className="fld">
                    <label htmlFor="eq-project">Project number (optional)</label>
                    <input id="eq-project" value={projectId}
                      onChange={(ev) => setProjectId(ev.target.value)}
                      placeholder="Link a project you have already made" />
                  </div>
                  <div className="eq-buttons">
                    <button className="btn accent" disabled={busy}
                      onClick={() => decide("accepted")}>Accept</button>
                    <button className="btn ghost" disabled={busy}
                      onClick={() => decide("declined")}>Decline</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* This screen's own stylesheet. Not borrowed from another admin page:
   those live inside their own components and do not exist unless that
   component is on screen. */
const CSS = `
.eq-error { position: sticky; top: 8px; z-index: 5; }
.eq-split { display: grid; grid-template-columns: minmax(240px, 340px) 1fr;
  gap: 18px; align-items: start; margin-top: 14px; }
@media (max-width: 860px) { .eq-split { grid-template-columns: 1fr; } }

.eq-list { display: grid; gap: 8px; }
.eq-row { display: grid; gap: 3px; text-align: left; padding: 10px 12px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--white);
  cursor: pointer; font-family: inherit; color: var(--text); }
.eq-row.on { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(79,70,229,.12); }
.eq-who { font-weight: 700; font-size: 13.5px; }
.eq-when { font-size: 11.5px; color: var(--muted); }

.eq-tag { justify-self: start; font-size: 10.5px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .04em; padding: 2px 8px;
  border-radius: 999px; background: #e2e8f0; color: #334155; }
.eq-submitted { background: #fef3c7; color: #92400e; }
.eq-accepted { background: #dcfce7; color: #166534; }
.eq-declined { background: #fee2e2; color: #991b1b; }

.eq-detail { border: 1px solid var(--border); border-radius: 10px;
  padding: 16px 18px; background: var(--white); min-height: 160px; }
.eq-head { display: flex; justify-content: space-between; align-items: flex-start;
  gap: 12px; margin-bottom: 14px; }
.eq-head h3 { margin: 0; font-size: 16px; }

.eq-answers { display: grid; gap: 14px; margin-bottom: 18px; }
.eq-answer { display: grid; gap: 3px; padding-bottom: 12px;
  border-bottom: 1px dashed var(--border); }
.eq-q { font-size: 12px; color: var(--muted); }
.eq-a { font-size: 14px; font-weight: 600; }

.eq-decide { display: grid; gap: 12px; }
.eq-decide .fld { display: flex; flex-direction: column; gap: 5px; }
.eq-decide label { font: 700 10.5px inherit; color: var(--muted);
  text-transform: uppercase; letter-spacing: .04em; }
.eq-buttons { display: flex; gap: 10px; }
.eq-decided { border-top: 1px solid var(--border); padding-top: 12px; }
`;
