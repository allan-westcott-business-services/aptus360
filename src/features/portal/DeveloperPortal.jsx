/* What a client developer sees.

   Two questions, and nothing else on the screen:

     Where has my site got to?   the milestones, with dates
     What is waiting on me?      documents to send, and documents to
                                 review, sign or approve

   Everything is scoped by the endpoint from the signed-in account, not
   from anything this page asks for. A site id typed into the address
   bar buys nothing: the endpoint checks it against the caller's own
   list before it reads a row.

   ── Every milestone, not only the ones reached ──

   A list of what has happened cannot tell a developer what is still to
   come, which is most of what they want to know. So the whole sequence
   is shown, with dates against the ones achieved and nothing against
   the rest. */

import { useEffect, useMemo, useState } from "react";
import { sheetOf, nextFrom, pathOf, missingAnswers } from "./enquiryFlow.js";
/* The app's own client, which carries the session token and turns an
   error body into a message. */
import { http } from "../../api/client.js";

/* Dates read dd-mmm-yy: 18-Sep-26.

   Unambiguous on a page read by people in several countries, which
   "18/09/26" is not, and short enough to sit in a line of text or a
   table cell. Two digits for the day so a column of them lines up.

   One function, used everywhere a date is shown in the portal \u2014 a
   second format somewhere would be read as a different KIND of date by
   anybody scanning the page. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dateText = (d) => {
  if (!d) return null;
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return String(d);
  const day = String(t.getDate()).padStart(2, "0");
  /* From a list, not from the locale: en-GB's "short" month gives
     "Sept" for September \u2014 four letters where every other month has
     three, which breaks the alignment the format exists for. */
  const month = MONTHS[t.getMonth()];
  const year = String(t.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
};

/* One line of the progress tree, and its children under it.

   The dot carries the state and the words carry the fact, so the two
   cannot disagree: nothing here decides a colour, it is told one by
   the server, which computes a parent's from its children. A parent
   claiming to be done over an outstanding child would be the page
   lying about itself.

   Grey means nothing records this yet — not "no", which is what red
   means. The difference matters on a line like "invoice paid": red
   would put somebody on the phone about something we cannot see. */
function Node({ n, depth = 0, onUpload, onDownload, busy }) {
  return (
    <li className="pt-node" style={{ marginLeft: depth ? 18 : 0 }}>
      <div className="pt-line">
        <span className={`pt-dot pt-${n.status}`} aria-hidden="true" />
        <span className="pt-label">{n.label}</span>
        {n.date && <span className="pt-when">{"\u2013"} {dateText(n.date)}</span>}
        {n.note && <span className="pt-note-inline">{n.note}</span>}

        {/* The action belongs ON the line that needs it, not in a list
            somewhere else: a request to upload something is read and
            acted on in the same breath. */}
        {n.document?.direction === "from_developer" && (
          <label className="pt-mini">
            {n.document.uploaded ? "Replace" : "Upload"}
            <input type="file" hidden disabled={busy}
              onChange={(e) => onUpload(n.document, e.target.files?.[0])} />
          </label>
        )}
        {n.document?.direction === "to_developer" && (
          <button className="pt-mini" onClick={() => onDownload(n.document)}>
            Download
          </button>
        )}
      </div>

      {n.children?.length > 0 && (
        <ul className="pt-kids">
          {n.children.map((c, i) => (
            <Node key={`${c.label}-${i}`} n={c} depth={depth + 1}
              onUpload={onUpload} onDownload={onDownload} busy={busy} />
          ))}
        </ul>
      )}
    </li>
  );
}

/* The control a question is answered with.

   One place, keyed on the Kind the database stores. */
function renderAnswer(q, answers, setAnswers, onFile, busy) {
  const set = (v) => setAnswers((a) => ({ ...a, [q.Enquiry_Question_ID]: v }));
  const value = answers[q.Enquiry_Question_ID] ?? "";

  if (q.Kind === "long_text") {
    return <textarea id="pt-answer" rows={4} value={value}
      onChange={(e) => set(e.target.value)} />;
  }
  if (q.Kind === "number") {
    return <input id="pt-answer" type="number" value={value}
      onChange={(e) => set(e.target.value)} />;
  }
  if (q.Kind === "date") {
    return <input id="pt-answer" type="date" value={value}
      onChange={(e) => set(e.target.value)} />;
  }
  if (q.Kind === "file") {
    /* ── A document ──

       Sent as soon as it is chosen, rather than held until the sheet
       is: a browser cannot keep a file across a page that reloads,
       and an enquiry with five drawings on it would arrive as one
       request big enough to time out.

       So the file goes to storage now and the answer holds where it
       went. Until it lands there is nothing to show but its name,
       which is why the state carries both.

       Choosing again replaces it. A file question asks for a
       document, singular, the same way the portal's own document
       requests do. */
    return (
      <div className="pt-file">
        <label className="btn">
          {value?.fileName ? "Choose a different file" : "Choose a file"}
          <input type="file" hidden disabled={busy}
            onChange={(e) => onFile(q, e.target.files?.[0])} />
        </label>
        {value?.fileName && (
          <span className="pt-file-name">
            {value.path
              ? value.fileName
              : `${value.fileName} \u2014 sending\u2026`}
          </span>
        )}
        {!value?.fileName && (
          <span className="pt-quiet">No document chosen yet.</span>
        )}
      </div>
    );
  }
  if (q.Kind === "choice_one") {
    return (
      <div className="pt-choices">
        {q.options.map((o) => (
          <label key={o.Enquiry_Option_ID} className="pt-check">
            <input type="radio" name={`q${q.Enquiry_Question_ID}`}
              checked={String(value) === String(o.Enquiry_Option_ID)}
              onChange={() => set(o.Enquiry_Option_ID)} />
            {o.Label}
          </label>
        ))}
      </div>
    );
  }
  if (q.Kind === "choice_many") {
    const chosen = [].concat(value || []).map(String);
    return (
      <div className="pt-choices">
        {q.options.map((o) => (
          <label key={o.Enquiry_Option_ID} className="pt-check">
            <input type="checkbox"
              checked={chosen.includes(String(o.Enquiry_Option_ID))}
              onChange={(e) => set(e.target.checked
                ? [...chosen, String(o.Enquiry_Option_ID)]
                : chosen.filter((x) => x !== String(o.Enquiry_Option_ID)))} />
            {o.Label}
          </label>
        ))}
      </div>
    );
  }
  return <input id="pt-answer" value={value}
    onChange={(e) => set(e.target.value)} />;
}

export default function DeveloperPortal({ onSignOut, who }) {
  const [sites, setSites] = useState(null);

  /* ── The enquiry sheet ──

     Fetched when somebody opens it, not with the page: most visits are
     to look at a site, and a sheet nobody asked for is a request
     nobody needed.

     `answers` is the filling-in, keyed by question id, and it is what
     enquiryFlow reads to decide which question comes next. Held here
     and sent once, rather than saved question by question: a
     half-submitted enquiry in the database is a thing somebody has to
     decide what to do with, and nobody asked for drafts. */
  const [enquiry, setEnquiry] = useState(null);
  const [answers, setAnswers] = useState({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);

  const sheet = useMemo(
    () => (enquiry?.form
      ? sheetOf(enquiry.questions, enquiry.options, enquiry.form.Enquiry_Form_ID)
      : []),
    [enquiry],
  );
  /* ── Which question is in front of somebody ──

     Held explicitly, rather than worked out from which questions have
     answers. The flow module can say where an answer LEADS, but not
     when somebody has finished giving it: read that way, the first
     letter typed into a text box counts as an answer and the form
     jumps to the next question mid-word.

     So the form advances when they say so. `here` is the question
     being answered; Next moves it on, following the jumps. */
  const [here, setHere] = useState(null);
  const [done, setDone] = useState(false);

  const current = useMemo(() => {
    if (done) return null;
    if (!sheet.length) return null;
    if (here == null) return sheet[0];
    return sheet.find((q) => String(q.Enquiry_Question_ID) === String(here))
      ?? sheet[0];
  }, [sheet, here, done]);

  /* What has been answered, up to but not including the question being
     answered now \u2014 so the trail above reads as a conversation and the
     current question is asked once. */
  const asked = useMemo(() => {
    const path = pathOf(sheet, answers);
    const i = current
      ? path.findIndex((q) => q.Enquiry_Question_ID === current.Enquiry_Question_ID)
      : -1;
    return i < 0 ? path : path.slice(0, i);
  }, [sheet, answers, current]);
  const missing = useMemo(() => missingAnswers(sheet, answers), [sheet, answers]);

  async function openEnquiry() {
    setError("");
    setSent(null);
    setAnswers({});
    try {
      const r = await http.get("/portal/enquiry-form");
      if (!r?.form) {
        setError("There is no enquiry sheet published yet. Your Aptus "
          + "contact can set one up.");
        return;
      }
      setEnquiry(r);
      setHere(null);
      setDone(false);
    } catch (e) { setError(e.message); }
  }

  /* Moving on. The answer decides where to, which is the whole point of
     the branching \u2014 and an answer that ends the sheet ends it here. */
  function nextQuestion() {
    if (!current) return;
    const step = nextFrom(current, answers);
    if (step === "end") { setDone(true); return; }
    if (step != null) { setHere(step); return; }
    const i = sheet.indexOf(current);
    const after = i >= 0 ? sheet[i + 1] : null;
    if (after) setHere(after.Enquiry_Question_ID); else setDone(true);
  }

  /* Back to the last question answered. Its answer is kept: somebody
     going back to check what they put should not have to type it
     again. */
  function backQuestion() {
    const prev = asked[asked.length - 1];
    setDone(false);
    if (prev) setHere(prev.Enquiry_Question_ID);
  }

  /* Whether the question in front of somebody may be left. A required
     question must have something in it; anything else may be skipped. */
  const answeredHere = current
    ? (() => {
      const a = answers[current.Enquiry_Question_ID];
      if (a == null || a === "") return false;
      if (Array.isArray(a) && !a.length) return false;
      /* A document counts once it has LANDED, not once it has been
         chosen. Moving on from a required question while the upload
         is still in flight would send an enquiry whose answer points
         at nothing. */
      if (current.Kind === "file") return !!a.path;
      return true;
    })()
    : true;

  /* ── Sending a document up ──

     The same two-step the portal's own document requests use: ask the
     server for a signed slot, PUT the file straight into storage, and
     keep the path it came back with. The file never passes through
     the function, which is what keeps a twenty-megabyte drawing from
     having to fit in a request body.

     The name is recorded before the upload starts so the question can
     say what is going up while it goes; the path arrives after, and
     is what makes the answer count as answered. */
  async function attachToAnswer(q, file) {
    if (!file) return;
    setBusy(true); setError("");
    setAnswers((a) => ({
      ...a, [q.Enquiry_Question_ID]: { fileName: file.name, path: null },
    }));
    try {
      const ask = await http.post("/portal/enquiry-upload",
        { fileName: file.name });
      if (!ask?.url) throw new Error("Could not start the upload.");

      const put = await fetch(ask.url, { method: "PUT", body: file });
      if (!put.ok) throw new Error(`The upload failed (${put.status}).`);

      setAnswers((a) => ({
        ...a, [q.Enquiry_Question_ID]: { fileName: file.name, path: ask.path },
      }));
    } catch (e) {
      /* Cleared, not left half done. An answer holding a name and no
         path would look attached and arrive empty. */
      setAnswers((a) => ({ ...a, [q.Enquiry_Question_ID]: null }));
      setError(e.message);
    } finally { setBusy(false); }
  }

  async function submitEnquiry() {
    setSending(true);
    try {
      /* Only what was ASKED is sent. A question the answers jumped over
         was not asked, and filing an empty answer against it would
         read later as though somebody had declined to answer. */
      const payload = asked
        .filter((q) => answers[q.Enquiry_Question_ID] != null)
        .map((q) => {
          const a = answers[q.Enquiry_Question_ID];
          const labels = (v) => q.options
            .filter((o) => [].concat(v).map(String)
              .includes(String(o.Enquiry_Option_ID)))
            .map((o) => o.Label).join(", ");
          return {
            questionId: q.Enquiry_Question_ID,
            questionText: q.Question,
            /* A choice is stored as its LABEL, because the answer has
               to read years from now beside the question it answered \u2014
               an option id would need the option to still exist and
               still be worded the same. */
            /* A date is stored as it reads \u2014 18-Sep-26 \u2014 because an
               answer is read beside its question by whoever picks the
               enquiry up, and 2026-09-18 in a sentence reads as a
               reference number. Unambiguous either way, which
               dd/mm/yy would not be. */
            answer: q.options?.length ? labels(a)
              : q.Kind === "date" ? dateText(a)
                /* A document's answer READS as its file name, so an
                   enquiry makes sense to whoever picks it up without
                   opening anything. Where the file actually is goes
                   beside it, and the server only keeps a path it
                   would have issued to this account. */
                : q.Kind === "file" ? (a?.fileName ?? null) : a,
            ...(q.Kind === "file" && a?.path
              ? { filePath: a.path, fileName: a.fileName } : {}),
          };
        });
      const r = await http.post("/portal/enquiry",
        { formId: enquiry.form.Enquiry_Form_ID, answers: payload });
      setSent(r?.enquiryId ?? true);
      setEnquiry(null);
    } catch (e) { setError(e.message); } finally { setSending(false); }
  }

  /* The sites under each branch they are attached to.

     Ordered by branch name so the list is stable between visits — a
     group of offices that reshuffled every load would be unreadable —
     and a site whose branch is not recorded is grouped under a plain
     heading rather than dropped. Dropping it would be the worst
     outcome: a scheme somebody can see, missing from the page, with
     nothing to say why. */

  /* One card, drawn the same whether the list is grouped by branch or
     flat. Two copies of this would be two things to keep in step, and
     the grouped path is the one nobody looks at until a group complains
     about it. */
  const siteCard = (s) => (

              <button key={s.Project_ID} className="pt-site"
                onClick={() => openSite(s.Project_ID)}>
                {/* A site is known by its NAME and its reference \u2014
                    Display_Ref is what is printed on everything we have
                    sent them, so it is what they will search for. */}
                <span className="pt-site-name">
                  {s.Site_Name || s.Display_Ref || `Site ${s.Project_ID}`}
                </span>
                <span className="pt-site-sub">
                  {[s.Display_Ref, s.Site_Address, s.Postcode]
                    .filter(Boolean).join(" \u00b7 ")}
                </span>
                <span className="pt-site-stage">
                  {s.latestMilestone
                    ? `${s.latestMilestone.Label} \u00b7 ${dateText(s.latestMilestone.Achieved_On)}`
                    : "Not started"}
                </span>
                {s.waitingOnYou > 0 && (
                  <span className="pt-flag">
                    {s.waitingOnYou} waiting on you
                  </span>
                )}
              </button>
  );

  const byBranch = useMemo(() => {
    const m = new Map();
    for (const s2 of sites || []) {
      const key = s2.branchName || "Other sites";
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(s2);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [sites]);
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [tab, setTab] = useState("pre");

  useEffect(() => {
    http.get("/portal/sites")
      .then((r) => setSites(r.sites || []))
      .catch((e) => { setError(e.message); setSites([]); });
  }, []);

  const openSite = async (id) => {
    setOpen(id); setDetail(null); setError("");
    try {
      setDetail(await http.get(`/portal/site?project=${id}`));
    } catch (e) { setError(e.message); }
  };

  const refresh = () => open != null && openSite(open);

  /* ── Sending us something we asked for ──

     Three steps, and the middle one does not touch our servers: ask
     the endpoint for a signed upload address, put the file there, then
     tell the endpoint it has landed. The file never passes through the
     application, which is what keeps a large layout drawing from
     timing out a function. */
  async function upload(doc, file) {
    /* The tree hands over `{ id }`; the review list hands over a row
       with Portal_Document_ID. One function, so both go the same way. */
    const id = doc.id ?? doc.Portal_Document_ID;
    if (!file) return;
    setBusy(true); setError(""); setNote("");
    try {
      const ask = await http.post(`/portal/upload?project=${open}`,
        { id, fileName: file.name });
      if (!ask?.url) throw new Error("Could not start the upload.");

      const put = await fetch(ask.url, { method: "PUT", body: file });
      if (!put.ok) throw new Error(`The upload failed (${put.status}).`);

      await http.post(`/portal/uploaded?project=${open}`,
        { id, path: ask.path, fileName: file.name });
      setNote(`${file.name} sent. Thank you.`);
      await refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function download(doc) {
    setError("");
    try {
      const r = await http.get(`/portal/download?project=${open}`
        + `&id=${doc.id ?? doc.Portal_Document_ID}`);
      if (!r?.url) throw new Error("That file is not available.");
      window.open(r.url, "_blank", "noopener");
    } catch (e) { setError(e.message); }
  }

  async function respond(doc) {
    setBusy(true); setError("");
    try {
      await http.post(`/portal/respond?project=${open}`,
        { id: doc.Portal_Document_ID });
      await refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="pt">
      <style>{CSS}</style>

      <header className="pt-head">
        <img className="pt-logo" src="/aptus360-logo.png" alt="Aptus360" />
        <div className="pt-who">
          {who?.name || who?.email}
          <button className="btn ghost" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}
      {note && <div className="banner ok">{note}</div>}

      {open == null ? (
        <>
          {/* ── Whose sites these are ──

              The developer's own name, above everything. A contact at a
              group with several offices needs the page to say the
              company and not only the branch; and a screenshot of a
              portal that names nobody is a screenshot nobody can
              identify afterwards.

              From `/portal/me`, which the app already has when it
              routes here, rather than from a second request. */}
          {who?.organisationName && (
            <p className="pt-org">
              {who.organisationName}
              {/* The office, in brackets after the company, where the
                  account belongs to one. An organisation-level contact
                  is at no single branch, so they see the company alone
                  rather than an office they are not at. */}
              {who.branchName ? ` (${who.branchName})` : ""}
            </p>
          )}
          {/* Smaller than the name above it: whose sites these are is
              the heading, and "Your sites" is the label on the list. It
              was the other way round, which made every developer's
              portal look the same at a glance. */}
          {/* ── Starting an enquiry ──

              At the top, beside the list, because it is the one thing
              somebody comes here to DO rather than to read. The sheet
              itself is built from questions kept in admin, so this
              button is the only part of it that lives in the portal.

              Disabled with a reason until that sheet exists, rather
              than hidden: a developer told "not yet" asks us when; a
              developer shown nothing assumes there is no way to
              enquire and telephones instead. */}
          <div className="pt-head-row">
            <h2 className="pt-sites-h">Your sites</h2>
            <button className="btn accent" onClick={openEnquiry}>
              New enquiry
            </button>
          </div>

          {/* ── The numbers, before the list ──

              One card for now. The row is a grid so a second and a
              third land beside it without this being touched, which is
              the point of building it as a row rather than a sentence.

              Counted from what was returned, not asked for separately:
              the answer is already here, and a second request could
              disagree with the list underneath it. */}
          {sites?.length > 0 && (
            <div className="pt-metrics">
              <div className="pt-metric">
                <span className="pt-metric-n">{sites.length}</span>
                <span className="pt-metric-l">
                  {sites.length === 1 ? "Project" : "Projects"}
                </span>
              </div>
            </div>
          )}
          {sent && (
            <p className="pt-quiet">
              Thank you {"\u2014"} your enquiry has been sent. Somebody here will
              look at it and come back to you.
            </p>
          )}

          {enquiry?.form && (
            /* ── The sheet, one question at a time ──

                One question rather than all of them, because the next
                question depends on this answer: showing the lot would
                mean showing questions somebody may never be asked, and
                then taking them away as they answer.

                What has been answered stays above it, so the form reads
                as a conversation somebody can look back over rather
                than a box that forgets. */
            <div className="fe-backdrop" onClick={() => setEnquiry(null)}>
              <div className="pt-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="pt-sheet-head">
                  <div>
                    <h3>{enquiry.form.Form_Name}</h3>
                    <p className="pt-quiet">New enquiry</p>
                  </div>
                  <button className="fe-x" onClick={() => setEnquiry(null)}
                    aria-label="Close">&times;</button>
                </div>

                <div className="pt-sheet-body">
                  {asked.filter((q) => q !== current).map((q) => (
                    <div key={q.Enquiry_Question_ID} className="pt-answered">
                      <span className="pt-answered-q">{q.Question}</span>
                      <span className="pt-answered-a">
                        {q.options?.length
                          ? q.options.filter((o) => [].concat(answers[q.Enquiry_Question_ID])
                            .map(String).includes(String(o.Enquiry_Option_ID)))
                            .map((o) => o.Label).join(", ")
                          : q.Kind === "date"
                            ? dateText(answers[q.Enquiry_Question_ID])
                            /* A file answer is an object, and String()
                               on one reads "[object Object]" in the
                               list of what has been answered. */
                            : q.Kind === "file"
                              ? (answers[q.Enquiry_Question_ID]?.fileName ?? "")
                              : String(answers[q.Enquiry_Question_ID] ?? "")}
                      </span>
                    </div>
                  ))}

                  {current ? (
                    <div className="pt-asking">
                      <label className="pt-q" htmlFor="pt-answer">
                        {current.Question}
                        {current.Is_Required && <span className="pt-req"> *</span>}
                      </label>
                      {current.Help_Text && (
                        <p className="pt-quiet">{current.Help_Text}</p>
                      )}
                      {renderAnswer(current, answers, setAnswers,
                        attachToAnswer, busy)}
                    </div>
                  ) : (
                    <p className="pt-quiet">
                      That is everything. Send it when you are ready.
                    </p>
                  )}
                </div>

                <div className="pt-sheet-foot">
                  {current ? (
                    <>
                      {/* On, when they say so \u2014 not when they start
                          typing. A required question has to have
                          something in it first; anything else may be
                          passed over. */}
                      <button className="btn accent" onClick={nextQuestion}
                        disabled={current.Is_Required && !answeredHere}>
                        Next question
                      </button>
                      {asked.length > 0 && (
                        <button className="btn ghost" onClick={backQuestion}>
                          Back
                        </button>
                      )}
                    </>
                  ) : (
                    /* Sendable only when everything ASKED that had to be
                       answered has been. A question jumped over is not
                       missing. */
                    <>
                      <button className="btn accent"
                        disabled={sending || missing.length > 0}
                        onClick={submitEnquiry}>
                        {sending ? "Sending\u2026" : "Send enquiry"}
                      </button>
                      <button className="btn ghost" onClick={backQuestion}>
                        Back
                      </button>
                    </>
                  )}
                  <button className="btn ghost" style={{ marginLeft: "auto" }}
                    onClick={() => setEnquiry(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {sites == null && <p className="pt-quiet">Loading&hellip;</p>}
          {sites?.length === 0 && (
            <p className="pt-quiet">
              No sites are linked to your account yet. Your Aptus contact can
              put that right.
            </p>
          )}
          {/* ── Grouped by branch, when there is more than one ──

              A contact for a whole group is attached to several
              offices, and one flat list of every scheme the group has
              running is not what they are looking at when they open
              this. Under a heading per branch it reads as their own
              organisation.

              One branch, or none recorded, and there are no headings:
              a single heading above a single list is furniture. A
              contact for one site sees one site, which needs no
              structure at all. */}
          {byBranch.length > 1 ? byBranch.map(([name, group]) => (
            <div key={name}>
              <h2 className="pt-branch">{name}</h2>
              <div className="pt-sites">
                {group.map((s) => siteCard(s))}
              </div>
            </div>
          )) : (
            <div className="pt-sites">
              {(sites || []).map((s) => siteCard(s))}
            </div>
          )}
        </>
      ) : (
        <>
          <button className="btn ghost" onClick={() => { setOpen(null); setDetail(null); }}>
            &larr; All sites
          </button>

          {!detail ? <p className="pt-quiet">Loading&hellip;</p> : (
            <>
              <h1>
                {detail.site?.Site_Name || detail.site?.Display_Ref
                  || `Site ${detail.site?.Project_ID}`}
              </h1>
              <p className="pt-quiet">
                {[detail.site?.Display_Ref, detail.site?.Site_Address,
                  detail.site?.Postcode].filter(Boolean).join(" \u00b7 ")}
              </p>

              <div className="pt-tabs">
                <button className={tab === "pre" ? "on" : ""}
                  onClick={() => setTab("pre")}>Pre Contract</button>
                <button className={tab === "build" ? "on" : ""}
                  onClick={() => setTab("build")}>Site Build</button>
              </div>

              {tab === "pre" && (
                <ul className="pt-tree">
                  {(detail.pre || []).map((n, i) => (
                    <Node key={`${n.label}-${i}`} n={n}
                      onUpload={(doc, file) => upload(doc, file)}
                      onDownload={(doc) => download(doc)} busy={busy} />
                  ))}
                </ul>
              )}

              {tab === "build" && (
                (detail.build || []).length ? (
                  <ul className="pt-tree">
                    {detail.build.map((n, i) => (
                      <Node key={`${n.label}-${i}`} n={n}
                        onUpload={(doc, file) => upload(doc, file)}
                        onDownload={(doc) => download(doc)} busy={busy} />
                    ))}
                  </ul>
                ) : (
                  <p className="pt-quiet">
                    Nothing is recorded for the build yet. This tab will fill in
                    once work starts on site.
                  </p>
                )
              )}

              {/* Anything we have SENT them lives under the tree rather
                  than in it: the tree is the progress of the site, and a
                  document to review is a task, not a stage. */}
              {detail.documents.filter((d) => d.Direction === "to_developer")
                .length > 0 && (
                <>
                  <h2>For you to review</h2>
                  {detail.documents.filter((d) => d.Direction === "to_developer")
                    .map((d) => (
                      <div key={d.Portal_Document_ID} className="pt-doc">
                        <div>
                          <strong>{d.Title}</strong>
                          {d.Detail && <div className="pt-quiet">{d.Detail}</div>}
                          {d.Response_Needed && (
                            <div className="pt-quiet">
                              Please {d.Response_Needed} this
                              {d.Due_On ? ` by ${dateText(d.Due_On)}` : ""}.
                            </div>
                          )}
                          {d.Responded_At && (
                            <div className="pt-ok">Done {dateText(d.Responded_At)}</div>
                          )}
                        </div>
                        <div className="pt-doc-act">
                          <button className="btn" onClick={() => download(d)}>
                            Download
                          </button>
                          {d.Response_Needed && !d.Responded_At && (
                            <button className="btn accent" disabled={busy}
                              onClick={() => respond(d)}>
                              Mark as {d.Response_Needed}ed
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                </>
              )}

              {/* Said once, at the bottom, because a developer acting on a
                  date needs to know where it came from. */}
              <p className="pt-quiet pt-note">
                Dates are updated by us as each stage completes. If something
                looks wrong, tell your Aptus contact rather than working to it.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

const CSS = `
.pt { max-width: 900px; margin: 0 auto; padding: 24px 20px 64px; }
.pt-head { display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 18px; }
.pt-logo { height: 34px; }
.pt-who { display: flex; align-items: center; gap: 10px; font-size: 13px;
  color: var(--muted); }
.pt h1 { font-size: 22px; margin: 10px 0 4px; }
.pt h2 { font-size: 15px; margin: 26px 0 8px; }
.pt-quiet { color: var(--muted); font-size: 13px; margin: 2px 0; }
/* A file question: the button and what has been chosen, on one line,
   so the name sits beside the control that set it. */
.pt-file { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pt-file-name { font-size: 13px; word-break: break-all; }
.pt-note { margin-top: 24px; }
/* The company and its office: the heading of the page. Bigger than
   the list's label below it, because it is the thing that identifies
   what somebody is looking at.

   Named .pt-org and NOT .pt-who, which already exists in this file for
   the signed-in person's name in the top bar. Reusing it put a 24px bold
   rule on that too, silently, because the later rule wins. A class
   name is a name: two things called the same thing are one thing as
   far as the stylesheet is concerned. */
.pt-org { margin: 0 0 2px; font-size: 24px; font-weight: 700;
  line-height: 1.2; letter-spacing: -0.015em; color: var(--text); }

/* And the list's own label, deliberately quieter. */
.pt-sites-h { margin: 6px 0 0; font-size: 14px; font-weight: 700;
  color: var(--muted); letter-spacing: .01em; }

/* A grid rather than a flex row: the cards are the same width whatever
   is in them, so a 3 and a 147 do not make two different shapes. */
.pt-head-row { display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap; }
.pt-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px; margin: 14px 0 4px; max-width: 640px; }
.pt-metric { background: var(--white); border: 1px solid var(--border);
  border-radius: 12px; padding: 14px 16px; display: flex;
  flex-direction: column; gap: 2px; }
.pt-metric-n { font-size: 26px; font-weight: 700; line-height: 1.1; }
.pt-metric-l { font-size: 12px; color: var(--muted); }

.pt-sheet { background: var(--white); border-radius: 12px; width: min(620px, 94vw);
  max-height: 88vh; display: flex; flex-direction: column;
  box-shadow: 0 24px 60px rgba(15,23,42,.28); overflow: hidden; }
.pt-sheet-head { display: flex; justify-content: space-between; align-items: flex-start;
  gap: 12px; padding: 14px 18px 12px; border-bottom: 1px solid var(--border); }
.pt-sheet-head h3 { margin: 0; font-size: 16px; }
.pt-sheet-body { overflow: auto; padding: 16px 18px; display: grid; gap: 16px; }
.pt-sheet-foot { display: flex; gap: 10px; padding: 12px 18px 16px;
  border-top: 1px solid var(--border); }
.pt-answered { display: grid; gap: 2px; padding-bottom: 10px;
  border-bottom: 1px dashed var(--border); }
.pt-answered-q { font-size: 12px; color: var(--muted); }
.pt-answered-a { font-size: 13.5px; font-weight: 600; }
.pt-asking { display: grid; gap: 8px; }
.pt-q { font-size: 15px; font-weight: 700; }
.pt-req { color: #dc2626; }
.pt-choices { display: grid; gap: 10px; }
/* The portal's own, rather than the feature editor's check class: that
   CSS is injected by THAT component, so here it was a label with no
   gap at all and the words sat against the button.

   No backticks in this comment — it lives inside a template literal,
   and a backtick here ends the stylesheet mid-rule. */
.pt-check { display: flex; align-items: center; gap: 10px; font-size: 14px;
  cursor: pointer; }
.pt-check input { width: 16px; height: 16px; margin: 0; flex: none;
  accent-color: var(--accent); }
.pt-sheet input[type="text"], .pt-sheet input:not([type]), .pt-sheet textarea,
.pt-sheet input[type="number"], .pt-sheet input[type="date"] { width: 100%; }
.pt-branch { margin: 22px 0 8px; font-size: 14px; font-weight: 700;
  color: var(--muted); letter-spacing: .01em; }
.pt-sites { display: grid; gap: 12px; margin-top: 14px;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.pt-site { display: flex; flex-direction: column; gap: 4px; text-align: left;
  padding: 14px; border: 1px solid #e2e8f0; border-radius: 12px;
  background: #fff; cursor: pointer; }
.pt-site:hover { box-shadow: 0 8px 22px rgba(15,23,42,.10); }
.pt-site-name { font-weight: 700; }
.pt-site-sub, .pt-site-stage { font-size: 12.5px; color: var(--muted); }
.pt-flag { align-self: flex-start; margin-top: 6px; font-size: 11.5px;
  padding: 2px 8px; border-radius: 999px; background: #fef3c7; color: #92400e; }
.pt-steps { list-style: none; padding: 0; margin: 8px 0 0;
  border-left: 2px solid #e2e8f0; }
.pt-steps li { position: relative; padding: 8px 0 8px 18px; }
.pt-steps li::before { content: ""; position: absolute; left: -7px; top: 14px;
  width: 12px; height: 12px; border-radius: 50%; background: #fff;
  border: 2px solid #cbd5e1; }
.pt-steps li.done::before { background: #16a34a; border-color: #16a34a; }
.pt-step-label { font-weight: 600; margin-right: 8px; }
.pt-step-when { font-size: 12.5px; color: var(--muted); }
.pt-step-party, .pt-step-detail { display: block; font-size: 12.5px;
  color: var(--muted); }
.pt-tabs { display: flex; gap: 10px; margin: 16px 0 14px; }
.pt-tabs button { padding: 8px 20px; border-radius: 999px; cursor: pointer;
  border: 1px solid #cbd5e1; background: #fff; font: inherit; }
.pt-tabs button.on { background: #1e3a5f; border-color: #1e3a5f; color: #fff; }
.pt-tree, .pt-kids { list-style: none; padding: 0; margin: 0; }
.pt-kids { margin-top: 2px; }
.pt-node { margin: 6px 0; }
.pt-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pt-dot { width: 13px; height: 13px; border-radius: 50%; flex: none; }
.pt-done { background: #22c55e; }
.pt-doing { background: #f59e0b; }
.pt-waiting { background: #ef4444; }
.pt-unknown { background: #cbd5e1; }
.pt-label { font-weight: 600; }
.pt-when, .pt-note-inline { color: var(--muted); font-size: 12.5px; }
.pt-mini { font-size: 12px; padding: 2px 12px; border-radius: 999px;
  border: 1px solid #cbd5e1; background: #fff; cursor: pointer; }
.pt-poc { border-top: 1px solid #e2e8f0; padding: 10px 0; }
.pt-opt { margin: 8px 0 8px 14px; padding-left: 10px;
  border-left: 2px solid #e2e8f0; }
.pt-quotes { margin: 4px 0 0; padding-left: 18px; font-size: 12.5px;
  color: var(--muted); }
.pt-chosen { margin-left: 6px; font-size: 11px; padding: 1px 7px;
  border-radius: 999px; background: #dcfce7; color: #166534; }
.pt-doc { display: flex; align-items: flex-start; justify-content: space-between;
  gap: 14px; padding: 12px 0; border-top: 1px solid #e2e8f0; }
.pt-doc-act { display: flex; gap: 8px; flex-shrink: 0; }
.pt-ok { font-size: 12.5px; color: #15803d; }
`;
