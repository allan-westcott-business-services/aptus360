import { useState, useEffect } from "react";
import { useDragHandle } from "../../lib/useDragHandle.js";
import Banner from "../../components/Banner.jsx";
import { listProjects } from "../../api/projects.js";
import { listPlots } from "../../api/plots.js";
import { generateConnections, listConnections } from "../../api/connections.js";
import { UTILITIES } from "../../lib/utilities.js";
import { getLookups } from "../../api/lookups.js";

/* New Plot Connection Schedule, following the original's modal:
   project → programmed date → plots → utilities → save.

   Only Gas, Electric and Water are offered. Street lighting scopes don't
   connect a plot, so they'd never appear on a connection schedule. */
const SCHEDULABLE = [1, 2, 3];

const nat = (a, b) => {
  const re = /^(\d+)(.*)$/;
  const ma = re.exec(String(a)), mb = re.exec(String(b));
  if (ma && mb) { const d = Number(ma[1]) - Number(mb[1]); return d !== 0 ? d : ma[2].localeCompare(mb[2]); }
  return String(a).localeCompare(String(b), undefined, { numeric: true });
};

export default function NewScheduleModal({ onClose, onSaved }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [plots, setPlots] = useState([]);
  const [loadingPlots, setLoadingPlots] = useState(false);
  /* What is already scheduled, so a chip can say so before you pick it.
     Scheduling the same plot and utility twice is the mistake this form
     is most likely to make, and the only way to see it otherwise is to
     save and find out. */
  const [existing, setExisting] = useState({});   // plot id -> { utilityId: date }
  /* plot id -> Set of utility ids somebody else lays. Per utility,
     because that is what the flag is: Plot_Utility.Self_Lay_Provider. */
  const [selfLayBy, setSelfLayBy] = useState({});
  const [selected, setSelected] = useState([]);
  const [anchor, setAnchor] = useState(null);
  const [utils, setUtils] = useState([]);
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [lookups, setLookups] = useState(null);
  const [showOptional, setShowOptional] = useState(false);
  const [extra, setExtra] = useState({
    Pack_Status_ID: "", Visit_Outcome_ID: "", Connection_Date: "",
    Meter_Card_Submission_Date: "", Service_Card_Submission_Date: "",
    As_Laid_Date: "", Dead_Jointed_Date: "",
  });

  useEffect(() => { getLookups().then(setLookups).catch(() => {}); }, []);

  useEffect(() => {
    listProjects({ limit: 500 })
      .then((r) => setProjects(r.rows || []))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!projectId) { setPlots([]); setSelected([]); return; }
    setLoadingPlots(true);
    /* Aborted visits don't count: the work didn't happen, so the plot is
       free to be scheduled again. Is_Aborted is a flag on the outcome
       rather than a name match, so renaming an outcome can't quietly
       change which rows are ignored. */
    listConnections(projectId)
      .then((r) => {
        /* This endpoint returns { plots, connections }, not { rows } like
           most of the others. Reading the wrong key gives an empty map,
           which looks exactly like "nothing is scheduled" — so every chip
           reported itself free. */
        const rows = r.connections || [];
        const aborted = new Set((lookups?.visitOutcomes || [])
          .filter((v) => v.Is_Aborted).map((v) => v.Visit_Outcome_ID));
        const map = {};
        for (const c of rows) {
          /* A Plot_Utility row is not the same as a scheduled visit.
             Rows exist for plot-utility pairs that have never been
             programmed — they carry a meter number, an adopter, an as-laid
             date — and treating their mere existence as "scheduled" made
             every such plot unselectable.

             Scheduled means a date: programmed, or already connected.
             Anything else is an empty row waiting for this form. */
          if (!c.Programmed_Date && !c.Connection_Date) continue;
          /* An aborted visit didn't happen, so the plot is free again. */
          if (aborted.has(c.Visit_Outcome_ID)) continue;
          (map[c.Plot_ID] ||= {})[c.Utility_ID] = c.Programmed_Date || c.Connection_Date || null;
        }
        setExisting(map);

        /* Self-lay, per plot per utility, off the same rows.

           No second request: these are Plot_Utility rows and the flag
           is on them. It was read from Plot.Self_Lay_Provider, one
           boolean for the whole plot — so a plot self-lay for water
           alone could not be scheduled for its electric, which is ours
           to connect. */
        const slp = {};
        for (const c of rows) {
          if (c.Self_Lay_Provider) (slp[c.Plot_ID] ||= new Set()).add(Number(c.Utility_ID));
        }
        setSelfLayBy(slp);
      })
      /* Said out loud. A silent failure here is indistinguishable from a
         project with nothing scheduled, which is what hid this. */
      .catch((e) => { setExisting({}); setError(`Couldn't read existing connections: ${e.message}`); });

    listPlots(projectId)
      .then((r) => {
        setPlots((r.rows || []).sort((a, b) => nat(a.Plot_Number, b.Plot_Number)));
        setSelected([]);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingPlots(false));
  }, [projectId, lookups]);

  /* ── Which plots can be scheduled ──

     A self-lay connection is not ours to make. But it is per utility, so
     a plot is only out of reach when EVERY utility being scheduled is
     somebody else's — with electric and gas ticked, a plot whose water
     is self-lay is still perfectly schedulable.

     Before any utility is ticked there is nothing to judge against, so
     every plot is offered. The endpoint refuses the self-lay pairs
     whatever this says, and reports how many it left out. */
  const selfLayFor = (p, u) => !!selfLayBy[p.Plot_ID]?.has(Number(u));
  const eligible = (p) => !utils.length || utils.some((u) => !selfLayFor(p, u));
  const selfLay = plots.filter((p) => !eligible(p)).length;

  function clickPlot(p, e) {
    if (!eligible(p)) return;
    const id = p.Plot_ID;
    if (e.shiftKey && anchor != null) {
      const a = plots.findIndex((x) => x.Plot_ID === anchor);
      const b = plots.findIndex((x) => x.Plot_ID === id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelected((s) => [...new Set([...s, ...plots.slice(lo, hi + 1).filter(eligible).map((x) => x.Plot_ID)])]);
      }
      setAnchor(null);
      return;
    }
    setAnchor(id);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function save() {
    if (!projectId) return setError("Choose a project.");
    if (!date) return setError("Set a programmed date.");
    if (!selected.length) return setError("Select at least one plot.");
    if (!utils.length) return setError("Select at least one utility.");
    setSaving(true);
    try {
      const res = await generateConnections(projectId, selected, utils, date, extra);
      /* Created and updated are both scheduled.

         The message counted inserts alone, so once every plot-utility
         row existed it said "those connections already exist" after
         successfully booking a hundred visits. What somebody wants to
         know is how many are now in the diary, not which SQL verb did
         it. */
      const n = (res.created ?? 0) + (res.updated ?? 0);
      /* And the three reasons a pair was left out, each said only when
         it happened. A self-lay connection is not ours to make; one
         already booked is somebody else's decision to move. */
      const why = [
        res.self_lay ? `${res.self_lay} self-lay` : null,
        res.already_scheduled ? `${res.already_scheduled} already booked` : null,
      ].filter(Boolean).join(", ");

      onSaved && onSaved(
        n === 0
          ? `Nothing scheduled${why ? ` — ${why}` : ""}.`
          : `${n} connection${n === 1 ? "" : "s"} scheduled for `
            + `${date.split("-").reverse().join("/")}${why ? ` (${why} left out)` : ""}`
      );
      onClose();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  const willCreate = selected.length * utils.length;
  const setX = (k) => (v) => setExtra((e) => ({ ...e, [k]: v }));

  /* Type-to-filter rather than scrolling a list of hundreds. Matches on
     both reference and site name, because people remember either. */
  const q = search.trim().toLowerCase();
  const visibleProjects = q
    ? projects.filter((p) =>
        `${p.Project_Ref} ${p.Site_Name ?? ""}`.toLowerCase().includes(q))
    : projects;

  const chosen = projects.find((p) => String(p.Project_ID) === String(projectId));
  const regionName = chosen
    ? (lookups?.regions || []).find((r) => r.Region_ID === chosen.Region_ID)?.Region ?? "\u2014"
    : "";
  const electricOnly = utils.length === 1 && utils[0] === 1;

  const drag = useDragHandle();

  return (
    <div className="ns-backdrop" onClick={() => { if (!drag.justDragged()) onClose(); }}>
      <div className="ns-modal" onClick={(e) => e.stopPropagation()} style={drag.panelStyle}>
        <style>{CSS}</style>

        <div className="ns-head" {...drag.handleProps}>
          <h3>New plot connection schedule</h3>
          <button className="ns-x" onClick={onClose}>&#10005;</button>
        </div>

        <div className="ns-body">
          {error && <Banner kind="error" onClose={() => setError("")}>{error}</Banner>}

          <div className="ns-row">
            <div className="fld grow">
              <label>Project <span className="req">*</span></label>
              <input className="ns-search" value={search} placeholder="&#128269; Type to filter by ref or site&hellip;"
                onChange={(e) => setSearch(e.target.value)} />
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">
                  {q && visibleProjects.length === 0
                    ? "\u2014 No match \u2014"
                    : q
                      ? `\u2014 ${visibleProjects.length} match${visibleProjects.length === 1 ? "" : "es"} \u2014`
                      : "\u2014 Select a project \u2014"}
                </option>
                {visibleProjects.map((p) => (
                  <option key={p.Project_ID} value={p.Project_ID}>
                    {p.Project_Ref} &mdash; {p.Site_Name || "Unnamed site"}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld narrow">
              <label>Region</label>
              <input value={chosen ? regionName : ""} placeholder="(select project)" disabled />
            </div>
          </div>

          <div className="fld">
            <label>Programmed date <span className="req">*</span></label>
            <input className="ns-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <p className="hint">The date the connection work is scheduled to be carried out.</p>
          </div>

          <div className="fld">
            <label>Utilities to connect <span className="req">*</span></label>
            <div className="ns-utils">
              {UTILITIES.filter((u) => SCHEDULABLE.includes(u.id)).map((u) => (
                <label key={u.id} className={utils.includes(u.id) ? "ns-util on" : "ns-util"}>
                  <input type="checkbox" checked={utils.includes(u.id)}
                    onChange={() => setUtils((g) => {
                      const next = g.includes(u.id) ? g.filter((x) => x !== u.id) : [...g, u.id];
                      /* A plot picked under the old selection may now have
                         nothing left to give. Dropping it here keeps what
                         is highlighted and what would actually save in
                         step — the original does the same. */
                      setSelected((sel) => sel.filter((pid) => {
                        const takenIds = Object.keys(existing[pid] || {}).map(Number);
                        return next.length === 0
                          ? !SCHEDULABLE.every((x) => takenIds.includes(x))
                          : next.some((x) => !takenIds.includes(x));
                      }));
                      return next;
                    })} />
                  <span className="dot" style={{ background: u.colour }} />
                  {u.name}
                </label>
              ))}
            </div>
          </div>

          <div className="fld">
            <label>
              Plots to connect <span className="req">*</span>
              {plots.length > 0 && (
                <span className="ns-count">
                  {selected.length} of {plots.length - selfLay} selected
                </span>
              )}
            </label>
            <div className="ns-plots">
              {!projectId ? (
                <p className="ns-ph">Select a project first to load its plots.</p>
              ) : loadingPlots ? (
                <p className="ns-ph">Loading plots&hellip;</p>
              ) : plots.length === 0 ? (
                <p className="ns-ph">This project has no plots yet.</p>
              ) : (
                plots.map((p) => {
                  const on = selected.includes(p.Plot_ID);
                  const taken = existing[p.Plot_ID] || {};
                  const takenIds = Object.keys(taken).map(Number);
                  const allTaken = SCHEDULABLE.every((id) => takenIds.includes(id));

                  /* With nothing ticked, a plot is usable unless every
                     utility is already scheduled. With utilities ticked,
                     it needs at least one of them still free — offering a
                     plot that can only produce duplicates is the same as
                     offering nothing. */
                  const canAccept = utils.length === 0
                    ? !allTaken
                    : utils.some((id) => !takenIds.includes(id));
                  const off = !eligible(p) || !canAccept;

                  const lines = takenIds.map((id) => {
                    const u = UTILITIES.find((x) => x.id === id);
                    const d = taken[id];
                    return `${u?.name ?? `Utility ${id}`} \u2014 ${d
                      ? `scheduled ${String(d).slice(0, 10).split("-").reverse().join("/")}`
                      : "scheduled, no date"}`;
                  });
                  const title = !eligible(p) ? "Self-lay plot"
                    : lines.length === 0 ? "Nothing scheduled yet"
                    : `Already scheduled:\n${lines.join("\n")}`
                      + (allTaken ? "\n\nAll utilities scheduled." : "");

                  return (
                    <button key={p.Plot_ID} type="button"
                      className={["ns-plot", on ? "on" : "", off ? "off" : "",
                        allTaken ? "full" : ""].filter(Boolean).join(" ")}
                      disabled={off} title={title}
                      onClick={(e) => clickPlot(p, e)}>
                      {/* A dot per utility already scheduled, in a fixed
                          order so the strip reads the same on every chip. */}
                      {takenIds.length > 0 && (
                        <span className="ns-strip">
                          {SCHEDULABLE.filter((id) => takenIds.includes(id)).map((id) => {
                            const u = UTILITIES.find((x) => x.id === id);
                            return (
                              <span key={id} className="ns-sicon" title={`${u?.name} scheduled`}>
                                {u?.icon}
                              </span>
                            );
                          })}
                        </span>
                      )}
                      {p.Plot_Number}
                    </button>
                  );
                })
              )}
            </div>
            {plots.length > 0 && (
              <p className="hint">
                Click to toggle, shift-click for a range.
                {selfLay > 0 && ` ${selfLay} plot${selfLay === 1 ? " is" : "s are"} self-lay `
                  + `for ${utils.length === 1 ? "that utility" : "all of those utilities"}.`}
                {" "}
                <button className="ns-link" onClick={() => setSelected(plots.filter((p) => {
                  if (!eligible(p)) return false;
                  const takenIds = Object.keys(existing[p.Plot_ID] || {}).map(Number);
                  return utils.length === 0
                    ? !SCHEDULABLE.every((x) => takenIds.includes(x))
                    : utils.some((x) => !takenIds.includes(x));
                }).map((p) => p.Plot_ID))}>
                  Select all
                </button>
                {selected.length > 0 && (
                  <> &middot; <button className="ns-link" onClick={() => setSelected([])}>Clear</button></>
                )}
              </p>
            )}
          </div>

          <div className="ns-optional">
            <button className="ns-toggle" onClick={() => setShowOptional((o) => !o)}>
              {showOptional ? "\u25BE" : "\u25B8"} Optional pack &amp; visit fields
            </button>
            {showOptional && (
              <div className="ns-opt-body">
                <div className="fld">
                  <label>Status</label>
                  <select value={extra.Pack_Status_ID} onChange={(e) => setX("Pack_Status_ID")(e.target.value)}>
                    <option value="">&mdash; No status &mdash;</option>
                    {(lookups?.packStatuses || []).map((s2) => (
                      <option key={s2.Pack_Status_ID} value={s2.Pack_Status_ID}>{s2.Pack_Status}</option>
                    ))}
                  </select>
                  <p className="hint">
                    Auto-flips to <strong>Submitted</strong> when a service card submission date is entered.
                  </p>
                </div>

                <div className="ns-row">
                  <div className="fld grow">
                    <label>Visit outcome</label>
                    <select value={extra.Visit_Outcome_ID} onChange={(e) => setX("Visit_Outcome_ID")(e.target.value)}>
                      <option value="">&mdash; No outcome &mdash;</option>
                      {(lookups?.visitOutcomes || []).map((v) => (
                        <option key={v.Visit_Outcome_ID} value={v.Visit_Outcome_ID}>{v.Visit_Outcome}</option>
                      ))}
                    </select>
                  </div>
                  <div className="fld">
                    <label>Connection date</label>
                    <input className="ns-date" type="date" value={extra.Connection_Date}
                      onChange={(e) => setX("Connection_Date")(e.target.value)} />
                  </div>
                </div>

                <div className="ns-row">
                  <div className="fld">
                    <label>Meter card submitted</label>
                    <input className="ns-date" type="date" value={extra.Meter_Card_Submission_Date}
                      disabled={electricOnly}
                      onChange={(e) => setX("Meter_Card_Submission_Date")(e.target.value)} />
                    {electricOnly && <p className="hint">N/A for Electric.</p>}
                  </div>
                  <div className="fld">
                    <label>Service card submitted</label>
                    <input className="ns-date" type="date" value={extra.Service_Card_Submission_Date}
                      onChange={(e) => setX("Service_Card_Submission_Date")(e.target.value)} />
                  </div>
                </div>

                <div className="ns-row">
                  <div className="fld">
                    <label>As-laid date</label>
                    <input className="ns-date" type="date" value={extra.As_Laid_Date}
                      onChange={(e) => setX("As_Laid_Date")(e.target.value)} />
                  </div>
                  <div className="fld">
                    <label>Dead jointed date</label>
                    <input className="ns-date" type="date" value={extra.Dead_Jointed_Date}
                      onChange={(e) => setX("Dead_Jointed_Date")(e.target.value)} />
                    <p className="hint">Normally set from the work instruction.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="ns-foot">
          {willCreate > 0 && (
            <span className="ns-summary">
              {selected.length} plot{selected.length === 1 ? "" : "s"} &times; {utils.length} utilit{utils.length === 1 ? "y" : "ies"}
              {" = "}<strong>up to {willCreate} connection{willCreate === 1 ? "" : "s"}</strong>
            </span>
          )}
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn accent" disabled={saving} onClick={save}>
            {saving ? "Saving\u2026" : "Save schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.ns-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.45); z-index: 1000;
  display: flex; align-items: center; justify-content: center; padding: 24px; }
.ns-modal { background: var(--white); border-radius: 12px; width: 100%; max-width: 660px;
  max-height: 88vh; display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(0,0,0,.3); }
.ns-head { display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--border); }
.ns-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.ns-x { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 13px; }
.ns-body { padding: 18px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
.ns-count { float: right; font-weight: 700; color: var(--accent); text-transform: none; letter-spacing: 0; }
.ns-plots { border: 1.5px solid var(--border); border-radius: var(--radius); background: var(--bg);
  max-height: 170px; overflow-y: auto; padding: 8px; display: flex; flex-wrap: wrap; gap: 4px; }
.ns-ph { font-size: 12px; color: var(--muted); padding: 8px 2px; margin: 0; }
.ns-plot { min-width: 44px; padding: 5px 8px; border-radius: 5px; cursor: pointer;
  border: 1px solid var(--border); background: var(--white);
  font: 600 11.5px ui-monospace, Menlo, monospace; color: var(--text); }
.ns-plot:hover:not(:disabled) { border-color: var(--accent); }
.ns-plot.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.ns-strip { display: inline-flex; gap: 1px; margin-right: 4px; }
.ns-sicon { font-size: 9px; line-height: 1; opacity: .75; }
.ns-plot.on .ns-sicon { opacity: 1; }
/* Every utility already scheduled: nothing this form can add. Red rather
   than simply greyed, because it is worth noticing before you look for
   the plot and find it missing. */
.ns-plot.full { border-color: #ef4444; }
.ns-plot.off { background: #fef3c7; color: #92400e; border-color: #fde68a; cursor: not-allowed; }
.ns-link { background: none; border: none; color: var(--accent); font: 600 11px inherit;
  cursor: pointer; padding: 0; }
.ns-row { display: flex; gap: 12px; align-items: flex-start; }
.ns-row .fld { flex: none; }
.ns-row .fld.grow { flex: 1; min-width: 0; }
.ns-row .fld.narrow { width: 150px; }
.ns-search { margin-bottom: 6px; }
/* Date inputs sized to a date rather than stretched across the row */
/* Renamed from .dt, which is now the app-wide data-table spec in
   styles.css — these are date inputs, not a table. */
.ns-date { width: 158px; }
.ns-optional { border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px; }
.ns-toggle { background: none; border: none; cursor: pointer; font: 700 12px inherit;
  color: var(--accent); padding: 0; }
.ns-opt-body { display: flex; flex-direction: column; gap: 12px; margin-top: 12px;
  padding-top: 12px; border-top: 1px solid var(--border); }
.ns-utils { display: flex; flex-wrap: wrap; gap: 7px; }
.ns-util { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 400;
  text-transform: none; letter-spacing: 0; color: var(--text); background: var(--white);
  border: 1px solid var(--border); border-radius: 6px; padding: 8px 13px; margin: 0; cursor: pointer; }
.ns-util.on { border-color: var(--accent); background: var(--accent-light); color: var(--accent); font-weight: 600; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.ns-foot { display: flex; align-items: center; gap: 9px; padding: 14px 20px;
  border-top: 1px solid var(--border); }
.ns-summary { flex: 1; font-size: 11.5px; color: var(--muted); }
`;
