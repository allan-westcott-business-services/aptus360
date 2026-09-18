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
/* The app's own client, which carries the session token and turns an
   error body into a message. */
import { http } from "../../api/client.js";

const dateText = (d) => (d
  ? new Date(d).toLocaleDateString("en-GB",
    { day: "numeric", month: "short", year: "numeric" })
  : null);

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

export default function DeveloperPortal({ onSignOut, who }) {
  const [sites, setSites] = useState(null);

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
            <p className="pt-who">{who.organisationName}</p>
          )}
          <h1>Your sites</h1>

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
.pt-note { margin-top: 24px; }
.pt-who { margin: 0 0 2px; font-size: 13px; font-weight: 700;
  color: var(--muted); letter-spacing: .01em; }

/* A grid rather than a flex row: the cards are the same width whatever
   is in them, so a 3 and a 147 do not make two different shapes. */
.pt-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px; margin: 14px 0 4px; max-width: 640px; }
.pt-metric { background: var(--white); border: 1px solid var(--border);
  border-radius: 12px; padding: 14px 16px; display: flex;
  flex-direction: column; gap: 2px; }
.pt-metric-n { font-size: 26px; font-weight: 700; line-height: 1.1; }
.pt-metric-l { font-size: 12px; color: var(--muted); }

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
