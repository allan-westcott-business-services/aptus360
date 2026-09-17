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

import { useEffect, useState } from "react";
/* The app's own client, which carries the session token and turns an
   error body into a message. */
import { http } from "../../api/client.js";

const dateText = (d) => (d
  ? new Date(d).toLocaleDateString("en-GB",
    { day: "numeric", month: "short", year: "numeric" })
  : null);

export default function DeveloperPortal({ onSignOut, who }) {
  const [sites, setSites] = useState(null);
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

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
    if (!file) return;
    setBusy(true); setError(""); setNote("");
    try {
      const ask = await http.post(`/portal/upload?project=${open}`,
        { id: doc.Portal_Document_ID, fileName: file.name });
      if (!ask?.url) throw new Error("Could not start the upload.");

      const put = await fetch(ask.url, { method: "PUT", body: file });
      if (!put.ok) throw new Error(`The upload failed (${put.status}).`);

      await http.post(`/portal/uploaded?project=${open}`,
        { id: doc.Portal_Document_ID, path: ask.path, fileName: file.name });
      setNote(`${file.name} sent. Thank you.`);
      await refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function download(doc) {
    setError("");
    try {
      const r = await http.get(
        `/portal/download?project=${open}&id=${doc.Portal_Document_ID}`);
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
          <h1>Your sites</h1>
          {sites == null && <p className="pt-quiet">Loading&hellip;</p>}
          {sites?.length === 0 && (
            <p className="pt-quiet">
              No sites are linked to your account yet. Your Aptus contact can
              put that right.
            </p>
          )}
          <div className="pt-sites">
            {(sites || []).map((s) => (
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
            ))}
          </div>
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

              <h2>Progress</h2>
              <ol className="pt-steps">
                {detail.milestones.map((m) => (
                  <li key={m.key} className={m.achievedOn ? "done" : ""}>
                    <span className="pt-step-label">{m.label}</span>
                    <span className="pt-step-when">
                      {m.achievedOn
                        ? dateText(m.achievedOn)
                        : (m.dueOn ? `expected ${dateText(m.dueOn)}` : "to come")}
                    </span>
                    {/* "Applied for" is half an answer without the party
                        it was applied to, which is the thing a developer
                        chases. */}
                    {m.party && <span className="pt-step-party">{m.party}</span>}
                    {m.detail && <span className="pt-step-detail">{m.detail}</span>}
                  </li>
                ))}
              </ol>

              <h2>We have asked you for</h2>
              {detail.documents.filter((d) => d.Direction === "from_developer")
                .length === 0 && <p className="pt-quiet">Nothing at the moment.</p>}
              {detail.documents.filter((d) => d.Direction === "from_developer")
                .map((d) => (
                  <div key={d.Portal_Document_ID} className="pt-doc">
                    <div>
                      <strong>{d.Title}</strong>
                      {d.Detail && <div className="pt-quiet">{d.Detail}</div>}
                      {d.Due_On && (
                        <div className="pt-quiet">Needed by {dateText(d.Due_On)}</div>
                      )}
                      {d.Storage_Path && (
                        <div className="pt-ok">
                          Sent {dateText(d.Uploaded_At)} {"\u2014"} {d.File_Name}
                        </div>
                      )}
                    </div>
                    <div className="pt-doc-act">
                      <label className="btn accent">
                        {d.Storage_Path ? "Replace" : "Upload"}
                        <input type="file" hidden disabled={busy}
                          onChange={(e) => upload(d, e.target.files?.[0])} />
                      </label>
                    </div>
                  </div>
                ))}

              <h2>For you to review</h2>
              {detail.documents.filter((d) => d.Direction === "to_developer")
                .length === 0 && <p className="pt-quiet">Nothing at the moment.</p>}
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
                      <button className="btn" onClick={() => download(d)}>Download</button>
                      {d.Response_Needed && !d.Responded_At && (
                        <button className="btn accent" disabled={busy}
                          onClick={() => respond(d)}>
                          Mark as {d.Response_Needed}ed
                        </button>
                      )}
                    </div>
                  </div>
                ))}

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
.pt-doc { display: flex; align-items: flex-start; justify-content: space-between;
  gap: 14px; padding: 12px 0; border-top: 1px solid #e2e8f0; }
.pt-doc-act { display: flex; gap: 8px; flex-shrink: 0; }
.pt-ok { font-size: 12.5px; color: #15803d; }
`;
