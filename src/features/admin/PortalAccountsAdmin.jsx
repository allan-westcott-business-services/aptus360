/* Who from outside Aptus can sign in.

   Creating an account is two things at once — a Supabase
   authentication user and a record saying who they are to us — so the
   New form posts to `portal-accounts`, which does both and undoes the
   first if the second fails. Everything else on this screen is
   ordinary editing of the record: a name, a branch, switching somebody
   off when they leave.

   ── Switching off, not deleting ──

   Deactivating is offered and deleting is not. An account that has
   uploaded documents and responded to things is part of the history of
   a site, and removing the row would leave those actions attributed to
   nobody. Is_Active false stops them signing in, which is what people
   actually mean when they say "remove their access".

   The authentication user stays too, which is worth knowing: they can
   still sign in to Supabase, they simply get nothing from us. Deleting
   the auth user is a Supabase dashboard job, deliberately — it is not
   a button anybody should press by accident from here. */

import { useEffect, useMemo, useState } from "react";
import { adminList, adminUpdate } from "../../api/admin.js";
import { http } from "../../api/client.js";

const AUDIENCES = [
  ["developer", "Client developer"],
  ["dno", "DNO / GT / WU"],
  ["idno", "IDNO / IGT / IWU"],
];

export default function PortalAccountsAdmin() {
  const [rows, setRows] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [branches, setBranches] = useState([]);
  /* Sites, for the narrowest scope. Loaded whole and narrowed below:
     the list is small enough to hold, and filtering here means the
     choice offered is always consistent with the organisation and
     branch already chosen. */
  const [sites, setSites] = useState([]);
  /* Said out loud rather than swallowed: a list that failed to load
     looks exactly like a list with nothing in it, and the two want
     completely different things done about them. */
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [adding, setAdding] = useState(false);

  const [draft, setDraft] = useState({
    email: "", fullName: "", audience: "developer",
    organisationId: "", branchId: "", projectId: "", password: "",
  });

  const load = () => adminList("Portal_Access")
    .then(({ rows: r = [] }) => setRows(r))
    .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    /* Organisations, their branches and the sites those branches run,
       from the portal's own endpoint.

       NOT the generic admin one: its allow-list does not carry
       Organisation, Organisation_Branch or Project, so asking it gives
       an error this screen would swallow and show as an empty
       dropdown. An empty dropdown reads as "there are no branches",
       which is a different and much more confusing thing than "that
       request was refused". */
    http.get("/portal-orgs")
      .then((res) => {
        const list = res?.organisations || [];
        setOrgs(list.map(({ branches: _b, ...o }) => o));
        setBranches(list.flatMap((o) => o.branches || []));
        setSites(res?.sites || []);
        setLoadError("");
      })
      .catch((e) => setLoadError(e.message));
  }, []);

  const orgName = (id) => orgs.find((o) => String(o.Organisation_ID) === String(id))?.Name
    ?? (id == null ? "\u2014" : `#${id}`);
  const branchName = (id) => branches
    .find((b) => String(b.Organisation_Branch_ID) === String(id))
    ?.Branch_Name ?? (id == null ? "Whole organisation" : `#${id}`);

  const branchesFor = useMemo(() => branches.filter((b) =>
    String(b.Organisation_ID) === String(draft.organisationId)), [branches, draft]);

  /* The sites this contact could be pinned to: the ones their branch
     runs, or their organisation's across every branch where no branch
     is chosen. Read through Project_Developer, which is the record of
     who is on a scheme — the same source portal.js uses to decide what
     an account may see, so the list offered here and the list they get
     cannot disagree. */
  const projectsFor = useMemo(() => {
    const wanted = draft.branchId
      ? new Set([String(draft.branchId)])
      : new Set(branchesFor.map((b) => String(b.Organisation_Branch_ID)));
    if (!wanted.size) return [];
    return sites.filter((p) => wanted.has(String(p.Organisation_Branch_ID)));
  }, [sites, branchesFor, draft.branchId]);

  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  async function create() {
    setBusy(true); setError(""); setStatus("");
    try {
      const r = await http.post("/portal-accounts", {
        email: draft.email.trim(),
        fullName: draft.fullName.trim() || null,
        audience: draft.audience,
        organisationId: draft.organisationId || null,
        branchId: draft.branchId || null,
        projectId: draft.projectId || null,
        /* Blank means invite, which is the default for a reason: a
           password we choose is a password that lives in an email
           thread. */
        password: draft.password || null,
      });
      setStatus(r.message || "Account created.");
      setAdding(false);
      setDraft({ email: "", fullName: "", audience: "developer",
        organisationId: "", branchId: "", projectId: "", password: "" });
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function toggle(row) {
    setBusy(true); setError("");
    try {
      await adminUpdate("Portal_Access", row.Portal_Access_ID,
        { Is_Active: row.Is_Active === false });
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="admin-pane">
      <h2>Portal Accounts</h2>
      <p className="hint">
        Client developers and network owners who can sign in. Creating one
        makes their sign-in account and links it to their organisation in a
        single step. Staff do not need a row here.
      </p>

      {error && <div className="banner error">{error}</div>}
      {loadError && (
        <div className="banner error">
          Organisations and sites could not be loaded: {loadError}. The
          dropdowns below will be empty until that is fixed — which is not
          the same as there being none.
        </div>
      )}
      {status && <div className="banner ok">{status}</div>}

      {!adding ? (
        <button className="btn accent" onClick={() => setAdding(true)}>
          New account
        </button>
      ) : (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 8,
          padding: "12px 14px", margin: "10px 0" }}>
          <div className="gs-grid">
            <div className="fld">
              <label htmlFor="pa-email">Email</label>
              <input id="pa-email" type="email" value={draft.email}
                onChange={set("email")} placeholder="jane@developer.co.uk" />
            </div>
            <div className="fld">
              <label htmlFor="pa-name">Full name</label>
              <input id="pa-name" value={draft.fullName} onChange={set("fullName")} />
            </div>
            <div className="fld">
              <label htmlFor="pa-aud">Kind of account</label>
              <select id="pa-aud" value={draft.audience} onChange={set("audience")}>
                {AUDIENCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="pa-org">Organisation</label>
              <select id="pa-org" value={draft.organisationId}
                onChange={(e) => setDraft((d) => ({ ...d,
                  organisationId: e.target.value, branchId: "", projectId: "" }))}>
                <option value="">Choose{"\u2026"}</option>
                {orgs.map((o) => (
                  <option key={o.Organisation_ID} value={o.Organisation_ID}>{o.Name}</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="pa-branch">Branch</label>
              <select id="pa-branch" value={draft.branchId}
                onChange={(e) => setDraft((d) => ({ ...d,
                  /* A site chosen under one branch is not a site of
                     another. */
                  branchId: e.target.value, projectId: "" }))}
                disabled={!draft.organisationId}>
                <option value="">Whole organisation</option>
                {branchesFor.map((b) => (
                  <option key={b.Organisation_Branch_ID} value={b.Organisation_Branch_ID}>
                    {b.Branch_Dropdown || b.Branch_Name}
                  </option>
                ))}
              </select>
            </div>
            {/* ── The third scope: one site ──

                Organisation, branch, project — widest to narrowest, in
                that order, because that is how somebody decides: who
                are they with, which office, and is this person here for
                the whole of it or for one job.

                Naming a site is a CEILING. The organisation above still
                says who the contact is; it stops being what they may
                see. That is said in the hint below rather than left to
                be discovered, because the alternative reading — that
                the two add up — is a plausible one and would show a
                site manager the whole group's work. */}
            <div className="fld">
              <label htmlFor="pa-project">Site</label>
              <select id="pa-project" value={draft.projectId ?? ""}
                onChange={set("projectId")}
                disabled={!draft.organisationId && !draft.branchId}>
                <option value="">
                  {draft.branchId ? "Every site in the branch"
                    : "Every site in the organisation"}
                </option>
                {projectsFor.map((p) => (
                  <option key={p.Project_ID} value={p.Project_ID}>
                    {p.Project_Name || p.Site_Name || `Project ${p.Project_ID}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="pa-pass">Password (optional)</label>
              <input id="pa-pass" value={draft.password} onChange={set("password")}
                placeholder="Leave blank to send an invitation" />
            </div>
          </div>

          {/* Said where the decision is made, not in a manual. */}
          <p className="hint">
            Leave the password blank and they get an emailed invitation and
            choose their own, which is the safer way round. Set one only when
            you are on the phone to them.
            {" "}A branch matters where a developer has more than one office:
            they will see that branch&rsquo;s sites only.
            {" "}Naming a site narrows it again, to that one site {"\u2014"} the
            organisation then says who they are rather than what they see.
          </p>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn accent" disabled={busy} onClick={create}>
              {busy ? "Creating\u2026" : "Create account"}
            </button>
            <button className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12,
        fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#475569" }}>
            <th>Email</th><th>Name</th><th>Kind</th><th>Organisation</th>
            <th>Branch</th><th>Active</th><th />
          </tr>
        </thead>
        <tbody>
          {rows.filter((r) => r.Audience !== "staff").map((r) => (
            <tr key={r.Portal_Access_ID} style={{ borderTop: "1px solid #e2e8f0",
              opacity: r.Is_Active === false ? 0.5 : 1 }}>
              <td>{r.Email}</td>
              <td>{r.Full_Name || "\u2014"}</td>
              <td>{r.Audience}</td>
              <td>{orgName(r.Organisation_ID)}</td>
              <td>{branchName(r.Branch_ID)}</td>
              <td>{r.Is_Active === false ? "No" : "Yes"}</td>
              <td>
                <button className="btn ghost" disabled={busy}
                  onClick={() => toggle(r)}>
                  {r.Is_Active === false ? "Switch on" : "Switch off"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.filter((r) => r.Audience !== "staff").length === 0 && (
        <p className="hint">No portal accounts yet.</p>
      )}

      <p className="hint" style={{ marginTop: 16 }}>
        Switching an account off stops them signing in to the portal and keeps
        their history {"\u2014"} the documents they sent and the things they approved
        stay attributed to them. Their Supabase sign-in itself is removed from
        the Supabase dashboard, deliberately not from here.
      </p>
    </div>
  );
}
