import { useState, useEffect, useCallback } from "react";
import { fieldQueue, abortReasons, abortJob } from "../../api/field.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import WorkInstruction from "./WorkInstruction.jsx";

/* The tablet screen: a team leader's work, in order.

   ── Today, and the rest behind a link ──

   The whole queue visible invites arguing with the order, and a lock
   icon on every one of seven rows makes the app's main message "no".
   One job with nothing else visible tells somebody nothing about their
   day — they cannot see that tomorrow is on a site they will drive past
   this afternoon, so they find out by driving there twice.

   So: today's run, and the rest one tap away. Enough to plan around,
   not enough to work from.

   ── What a waiting job shows ──

   Its task, its site name and its date. Not the address, the plots or
   the AP number — the endpoint withholds those, so a queue cannot be
   photographed and worked through in whatever order suits.

   ── Built for a tablet in a van ──

   Large targets, one column, no hover states, and nothing that needs a
   second hand. The office app is a different thing on a different
   screen and shares nothing with this but the login. */

const FINISHED = ["Submitted", "Complete", "Aborted"];

function Waiting({ job }) {
  return (
    <div className="fq-row">
      <div className="fq-n">{job.position}</div>
      <div className="fq-row-main">
        <div className="fq-row-task">{job.task ?? "Work"}</div>
        <div className="fq-row-sub">
          {[job.siteName, dateText(job.startDate)].filter(Boolean).join(" \u00b7 ")}
        </div>
      </div>
      {/* Said in words as well as drawn. A padlock alone reads as an
          error to somebody who has not been told the rule. */}
      <div className="fq-locked">Locked</div>
    </div>
  );
}

/* Dates as somebody says them. "2026-08-17" is a value, not a day. */
function dateText(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const same = (a, b) => a.toDateString() === b.toDateString();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (same(d, today)) return "Today";
  if (same(d, tomorrow)) return "Tomorrow";
  return d.toLocaleDateString("en-GB",
    { weekday: "short", day: "numeric", month: "short" });
}

export default function FieldApp() {
  const { session, signOut } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  /* The abort sheet: null when closed, otherwise the job being refused.

     A step of its own rather than a confirm dialog. An abort ends a job
     that cannot be returned to, and the reason is the whole point of
     recording it — a yes/no box would get a shrug and "other". */
  /* The work instruction, open over the queue.

     Over rather than beside: filling one in is the job, and the queue
     behind it is not something to read at the same time. */
  const [instruction, setInstruction] = useState(null);

  const [refusing, setRefusing] = useState(null);
  const [reasons, setReasons] = useState([]);
  const [chosen, setChosen] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fieldQueue());
      setError("");
      /* Fetched with the queue rather than when the sheet opens: the
         moment somebody needs this list is the moment they are standing
         somewhere with no signal. */
      if (!reasons.length) {
        try { setReasons((await abortReasons()).reasons ?? []); } catch { /* the
          sheet says so if it is empty */ }
      }
    } catch (e) {
      /* The endpoint's refusals are written to be read on site — not
         linked to anybody, not a team leader, leading two teams — so
         they are shown as they are rather than replaced with something
         general. */
      setError(e.message);
      setData(null);
    } finally { setLoading(false); }
  }, [reasons.length]);

  useEffect(() => { load(); }, [load]);

  const current = data?.current ?? null;
  const spans = data?.spans ?? [];
  const queue = data?.queue ?? [];

  /* Today's run: everything sharing the open job's start date. Not
     "dated today" — a queue that has slipped a day would then show
     nothing at all, which is the moment somebody most needs to see what
     is next. */
  const todays = current
    ? queue.filter((q) => !q.released
      && !FINISHED.includes(q.status)
      && q.startDate === current.startDate)
    : [];
  const later = queue.filter((q) => !q.released
    && !FINISHED.includes(q.status)
    && !todays.includes(q));

  return (
    <div className="fq">
      <style>{CSS}</style>

      <header className="fq-top">
        <div>
          <div className="fq-team">{data?.teamName ?? "Your work"}</div>
          <div className="fq-who">{data?.leader?.name ?? session?.user?.email}</div>
        </div>
        <button className="fq-out" onClick={() => signOut()}>Sign out</button>
      </header>

      {loading && <p className="fq-note">Loading your work&hellip;</p>}

      {!loading && error && (
        <div className="fq-error">
          <p>{error}</p>
          <button className="fq-btn ghost" onClick={load}>Try again</button>
        </div>
      )}

      {/* Filling one in. Over everything, because it is the work. */}
      {instruction && (
        <div className="fq-sheet">
          <WorkInstruction
            job={instruction}
            onCancel={() => { setInstruction(null); load(); }}
            onDone={() => { setInstruction(null); load(); }}
          />
        </div>
      )}

      {/* Refusing the job.

          Over the queue rather than beside it: this ends a job that
          cannot be returned to, and the screen should say so by being
          the only thing on it. */}
      {refusing && (
        <div className="fq-sheet">
          <div className="fq-sheet-box">
            <h2>Why can&rsquo;t this job be done?</h2>
            <p className="fq-sheet-sub">
              {refusing.task} at {refusing.siteName}. The office will need to
              book this again — you won&rsquo;t be able to come back to it.
            </p>

            {reasons.length ? (
              <div className="fq-reasons">
                {reasons.map((r) => (
                  <button
                    key={r.Reason_Code}
                    className={`fq-reason${chosen === r.Reason_Code ? " on" : ""}`}
                    onClick={() => { setChosen(r.Reason_Code); setSheetError(""); }}>
                    {r.Label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="fq-sheet-sub">
                The list of reasons didn&rsquo;t load. Ring the office and they
                can record it.
              </p>
            )}

            {/* Asked for always, required only where the reason says so.
                Somebody who wants to add a line should not have to pick
                the vague reason to get a box. */}
            <label className="fq-note-label" htmlFor="fq-note">
              What happened
              {reasons.find((r) => r.Reason_Code === chosen)?.Needs_Note
                ? "" : " (optional)"}
            </label>
            <textarea id="fq-note" rows={3} value={note}
              onChange={(e) => { setNote(e.target.value); setSheetError(""); }} />

            {sheetError && <p className="fq-sheet-error">{sheetError}</p>}

            <div className="fq-sheet-actions">
              <button className="fq-btn primary" disabled={saving}
                onClick={async () => {
                  if (!chosen) { setSheetError("Pick a reason first."); return; }
                  const r = reasons.find((x) => x.Reason_Code === chosen);
                  if (r?.Needs_Note && !note.trim()) {
                    setSheetError("Say briefly what happened.");
                    return;
                  }
                  setSaving(true);
                  try {
                    await abortJob({
                      assignmentId: refusing.assignmentId,
                      reasonCode: chosen,
                      note: note.trim() || null,
                    });
                    setRefusing(null);
                    /* Reloaded rather than patched: the next job is
                       released by the server, and guessing which one
                       would be a second opinion about the order. */
                    await load();
                  } catch (e) {
                    setSheetError(e.message);
                  } finally { setSaving(false); }
                }}>
                {saving ? "Saving\u2026" : "Confirm"}
              </button>
              <button className="fq-btn ghost" disabled={saving}
                onClick={() => setRefusing(null)}>Go back</button>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* A returned form, which is the only thing that interrupts
              the order. By the time one comes back the team is several
              jobs on, so it cannot wait at its place in the queue. */}
          {(data.corrections ?? []).map((c) => (
            <div className="fq-correction" key={c.submissionId}>
              <div className="fq-correction-head">The office sent a form back</div>
              <p>{c.note || "It needs correcting before it can be approved."}</p>
              <button className="fq-btn">Open the form</button>
            </div>
          ))}

          {current ? (
            <>
              <section className="fq-current">
                <div className="fq-current-top">
                  <span className="fq-now">Now</span>
                  <span className="fq-date">{dateText(current.startDate)}</span>
                </div>
                <h1 className="fq-task">{current.task ?? "Work"}</h1>
                <div className="fq-site">{current.siteName}</div>
                {current.siteAddress && (
                  <div className="fq-detail">{current.siteAddress}</div>
                )}
                {current.plots && (
                  <div className="fq-detail">Plots {current.plots}</div>
                )}
                <div className="fq-actions">
                  <button className="fq-btn primary"
                    onClick={() => setInstruction(current)}>
                    Start work instruction
                  </button>
                  {/* Not "Abort". Nobody arriving at a locked site thinks
                      of it as aborting; they think they cannot get on. */}
                  <button className="fq-btn ghost"
                    onClick={() => {
                      setRefusing(current);
                      setChosen(""); setNote(""); setSheetError("");
                    }}>Can&rsquo;t do this job</button>
                </div>
              </section>

              {/* ── What is being dug ──

                  One entry per span: where it starts and ends, the
                  plots it serves, how long it is, what is in it, and a
                  picture.

                  Reference, not record — so it sits on the job card and
                  stays there while the work instruction is filled in,
                  rather than being buried inside a form somebody has to
                  open to check where they are.

                  The picture is what a gang standing on a road actually
                  uses: "A18 to A16" names the run and does not say
                  which length of tarmac it is. */}
              {!!spans.length && (
                <section className="fq-spans">
                  <h2>What you are digging</h2>
                  {spans.map((sp) => (
                    <div className="fq-span" key={sp.spanId}>
                      <div className="fq-span-head">
                        <strong>{[sp.from, sp.to].filter(Boolean).join(" to ")
                          || "This section"}</strong>
                        {sp.lengthM != null && (
                          <span className="fq-span-m">{`${sp.lengthM} m`}</span>
                        )}
                      </div>

                      {sp.plots && (
                        <div className="fq-span-line">Plots {sp.plots}</div>
                      )}
                      {sp.contents && (
                        <div className="fq-span-line">{sp.contents}</div>
                      )}
                      {sp.offSite && (
                        <div className="fq-span-line">Off site</div>
                      )}

                      {sp.imageUrl ? (
                        /* Loaded lazily: a job with six spans is six
                           pictures, and the first is the one somebody
                           is looking at. */
                        <img className="fq-span-img" src={sp.imageUrl} loading="lazy"
                          alt={`Plan of ${[sp.from, sp.to].filter(Boolean).join(" to ")}`} />
                      ) : (
                        /* Said rather than left blank. A missing picture
                           is a call-off raised from the form, or a
                           capture that failed — and a gap with no
                           explanation reads as the app being broken. */
                        <p className="fq-span-none">No plan for this section.</p>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {!!todays.length && (
                <div className="fq-list">
                  {todays.map((j) => <Waiting job={j} key={j.assignmentId} />)}
                </div>
              )}

              {!!later.length && (
                showAll ? (
                  <div className="fq-list">
                    {later.map((j) => <Waiting job={j} key={j.assignmentId} />)}
                  </div>
                ) : (
                  <button className="fq-more" onClick={() => setShowAll(true)}>
                    {`${later.length} more after today`}
                  </button>
                )
              )}
            </>
          ) : (
            /* Nothing open. Three different situations, and only one of
               them means go home — so they are told apart rather than
               all reading "no work". */
            <section className="fq-empty">
              {data.awaitingReview > 0 ? (
                <>
                  <h1>All submitted</h1>
                  <p>
                    {`${data.awaitingReview} job${data.awaitingReview === 1 ? "" : "s"} `}
                    with the office. Nothing else is waiting for you.
                  </p>
                </>
              ) : (
                <>
                  <h1>No work assigned</h1>
                  <p>Nothing has been booked to your team. Check with the office.</p>
                </>
              )}
              <button className="fq-btn ghost" onClick={load}>Check again</button>
            </section>
          )}
        </>
      )}
    </div>
  );
}

const CSS = `
.fq { position: relative; min-height: 100vh; max-width: 560px; margin: 0 auto; padding: 0 14px 40px;
  font: 400 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #1c2430; }
.fq-top { display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 16px 0 14px; }
.fq-team { font-size: 18px; font-weight: 600; }
.fq-who { font-size: 14px; color: #5a6b7b; }
.fq-out { background: none; border: 1px solid #d7dee6; border-radius: 8px;
  padding: 8px 12px; font-size: 14px; color: #5a6b7b; }

.fq-note { color: #5a6b7b; padding: 24px 4px; }
.fq-error { background: #fee2e2; border-radius: 10px; padding: 16px; }
.fq-error p { margin: 0 0 12px; color: #991b1b; }

/* A returned form. Amber rather than red: it is work to redo, not
   something broken. */
.fq-correction { background: #fef3e2; border: 1px solid #f2d675;
  border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; }
.fq-correction-head { font-weight: 600; margin-bottom: 4px; }
.fq-correction p { margin: 0 0 12px; font-size: 15px; }

.fq-current { background: #fff; border: 2px solid #39467B; border-radius: 12px;
  padding: 18px 16px; }
.fq-current-top { display: flex; align-items: baseline;
  justify-content: space-between; }
.fq-now { font-size: 12px; font-weight: 600; letter-spacing: .07em;
  text-transform: uppercase; color: #39467B; }
.fq-date { font-size: 14px; color: #5a6b7b; }
.fq-task { font-size: 22px; font-weight: 600; margin: 8px 0 2px; }
.fq-site { font-size: 17px; color: #1c2430; }
.fq-detail { font-size: 15px; color: #5a6b7b; margin-top: 6px; }
.fq-actions { display: grid; gap: 10px; margin-top: 18px; }

/* Large enough to hit with a glove on, and full width so there is
   nothing to aim at. */
.fq-btn { width: 100%; min-height: 50px; border-radius: 10px; font-size: 16px;
  font-weight: 600; border: 1px solid #39467B; background: #fff; color: #39467B; }
.fq-btn.primary { background: #39467B; color: #fff; }
.fq-btn.ghost { border-color: #d7dee6; color: #5a6b7b; font-weight: 500;
  min-height: 44px; }

/* What is being dug, with a picture of each length. */
.fq-spans { margin-top: 18px; }
.fq-spans h2 { font-size: 15px; font-weight: 600; margin: 0 0 10px; }
.fq-span { background: #fff; border: 1px solid #e6eaf0; border-radius: 12px;
  padding: 14px; margin-bottom: 10px; }
.fq-span-head { display: flex; align-items: baseline; justify-content: space-between;
  gap: 10px; }
.fq-span-head strong { font-size: 16px; }
.fq-span-m { font-size: 14px; color: #5a6b7b; }
.fq-span-line { font-size: 14px; color: #5a6b7b; margin-top: 4px; }
/* Full width, and its own height: the picture is 640x420 and squashing
   it to a fixed box would put the trench off the frame. */
.fq-span-img { display: block; width: 100%; height: auto; margin-top: 10px;
  border: 1px solid #e6eaf0; border-radius: 8px; background: #fff; }
.fq-span-none { font-size: 13px; color: #97a3b0; margin: 10px 0 0; }

.fq-list { display: grid; gap: 8px; margin-top: 12px; }
.fq-row { display: flex; align-items: center; gap: 12px; background: #fff;
  border: 1px solid #e6eaf0; border-radius: 10px; padding: 12px 14px; }
.fq-n { font-size: 15px; color: #97a3b0; min-width: 16px; }
.fq-row-main { flex: 1; min-width: 0; }
.fq-row-task { font-size: 16px; color: #5a6b7b; }
.fq-row-sub { font-size: 14px; color: #97a3b0; }
.fq-locked { font-size: 13px; color: #97a3b0; }

.fq-more { width: 100%; margin-top: 12px; padding: 14px; border-radius: 10px;
  border: 1px dashed #d7dee6; background: none; color: #5a6b7b; font-size: 15px; }

.fq-empty { background: #fff; border: 1px solid #e6eaf0; border-radius: 12px;
  padding: 28px 20px; text-align: center; }
.fq-empty h1 { font-size: 20px; font-weight: 600; margin: 0 0 6px; }
.fq-empty p { color: #5a6b7b; margin: 0 0 18px; }

/* The abort sheet. Not a dialog over the queue — the queue is gone
   while this is up, because the decision it asks for is not a small
   one. */
.fq-sheet { position: absolute; inset: 0; background: #f2f4f7; z-index: 10;
  padding: 14px; overflow-y: auto; }
.fq-sheet-box { max-width: 560px; margin: 0 auto; background: #fff;
  border: 1px solid #e6eaf0; border-radius: 12px; padding: 18px 16px; }
.fq-sheet-box h2 { font-size: 19px; font-weight: 600; margin: 0 0 6px; }
.fq-sheet-sub { font-size: 15px; color: #5a6b7b; margin: 0 0 16px; }
.fq-reasons { display: grid; gap: 8px; margin-bottom: 18px; }
/* Full-width rows, not a dropdown. A select on a tablet is a small
   target that hides its own options behind a tap. */
.fq-reason { width: 100%; min-height: 50px; text-align: left; padding: 12px 14px;
  font-size: 16px; border: 1px solid #d7dee6; border-radius: 10px;
  background: #fff; color: #1c2430; }
.fq-reason.on { border-color: #39467B; border-width: 2px; background: #eef1f8;
  font-weight: 600; }
.fq-note-label { display: block; font-size: 14px; color: #5a6b7b;
  margin-bottom: 6px; }
#fq-note { width: 100%; font: inherit; font-size: 16px; padding: 10px 12px;
  border: 1px solid #d7dee6; border-radius: 10px; resize: vertical; }
.fq-sheet-error { color: #991b1b; font-size: 15px; margin: 12px 0 0; }
.fq-sheet-actions { display: grid; gap: 10px; margin-top: 18px; }
`;
