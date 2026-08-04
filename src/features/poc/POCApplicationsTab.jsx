import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { getLookups } from "../../api/lookups.js";
import { listPoc, createPoc, updatePoc, deletePoc } from "../../api/poc.js";
import { listPlots } from "../../api/plots.js";
import { contingencyFor, contingencyNote } from "./contingency.js";
import {
  parseIds, serialiseIds, claimedElsewhere, nrsClaimedElsewhere,
  plotChoices, toggleChoice, pruneChoices, selectionState, NONE,
  rangeBetween, rangeNote, selectAll,
} from "./interimPlots.js";
import { listNrs } from "../../api/nrs.js";
import { getProject } from "../../api/projects.js";
import { utilityById, UTILITIES, RESIDENTIAL_UTILITIES } from "../../lib/utilities.js";
import { useTableLayout } from "../../lib/useTableLayout.js";
import FilterCell, { blankFilter, rowPasses, FILTER_CSS } from "../../components/FilterCell.jsx";
import OptionsPanel from "./OptionsPanel.jsx";
import EntityNotes from "../../components/EntityNotes.jsx";

/* POC applications, following the original app.

   The important behaviour is the fan-out: selecting three operators
   creates three applications, not one. They quote separately and move at
   different speeds, so each needs its own status, reference and dates. */



const POC_FIELD_LABELS = {
  POC_Status_ID: "Status", POC_Type_ID: "Type", IDNO_ID: "IDNO", DNO_ID: "DNO",
  Utility_ID: "Utility", Application_Date: "Application date",
  Expected_Rx_Date: "Expected response", Submitted_Date: "Submitted",
  Received_Date: "Received", Requested_kVA: "Requested kVA", Plot_Count: "Plot count",
  Contingency_Load: "Contingency load", Quote_Reference: "Quote ref",
  Estimated_Cost: "Estimated cost", Applicant_Person_ID: "Applicant", Notes: "Notes",
};

const COLS = [
  { key: "utility",  label: "Utility",   width: 150, type: "multi", raw: (r) => r.Utility_ID },
  { key: "operator", label: "Operator",  width: 170, type: "multi", raw: (r) => (r.DNO_ID ? `d${r.DNO_ID}` : `i${r.IDNO_ID}`) },
  { key: "type",     label: "Type",      width: 104, type: "multi", raw: (r) => r.POC_Type_ID },
  { key: "status",   label: "Status",    width: 136, type: "multi", raw: (r) => r.POC_Status_ID },
  { key: "applied",  label: "Applied",   width: 122, type: "date",  raw: (r) => r.Application_Date },
  { key: "expected", label: "Expected",  width: 122, type: "date",  raw: (r) => r.Expected_Rx_Date },
  { key: "kva",      label: "kVA",       width: 88,  type: "num",   align: "right", raw: (r) => r.Requested_kVA ?? null },
  { key: "plots",    label: "Plots",     width: 78,  type: "num",   align: "right", raw: (r) => r.Plot_Count ?? null },
  { key: "quoteref", label: "Quote ref", width: 140, type: "text",  raw: (r) => r.Quote_Reference || "" },
  { key: "cost",     label: "Est. cost", width: 112, type: "num",   align: "right", raw: (r) => r.Estimated_Cost ?? null },
  { key: "act",      label: "",          width: 78,  type: "none",  align: "center", raw: () => "" },
];

const fmt = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "\u2014");
const money = (n) => (n == null || n === "" ? "\u2014" : `£${Number(n).toLocaleString()}`);

export default function POCApplicationsTab({ projectId }) {
  const layout = useTableLayout("poc", COLS);
  const [lookups, setLookups] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState(blank());
  const [editingId, setEditingId] = useState(null);
  const [sort, setSort] = useState({ key: "utility", dir: "asc" });
  const [filters, setFilters] = useState({});
  const [openFilter, setOpenFilter] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [plots, setPlots] = useState([]);
  /* The project's non-residential supplies.

     Their load is summed rather than typed, so the figure on a POC
     application and the figure on the Non-Residential Supplies tab
     cannot drift apart — which they would the moment either changed
     after the other was entered. */
  const [nrs, setNrs] = useState([]);
  const [project, setProject] = useState(null);

  function blank() {
    return {
      Utility_ID: "", idno_ids: [], dno_id: "", POC_Type_ID: "", POC_Status_ID: "",
      Site_Name: "", Site_Address: "", Applicant_Company: "", Applicant_Company_Address: "",
      Non_Residential_kVA: "",
      Application_Date: "", Expected_Rx_Date: "", Applicant_Person_ID: "",
      Business_Address: "", Plot_Count: "", Requested_kVA: "", Contingency_Load: "",
      /* Which plots and supplies an interim application covers. Blank on
         every other type, and blank here rather than absent so the field
         exists before anything is chosen — a form whose shape changes
         when a value first appears is a form that loses edits. */
      Interim_Plot_IDs: "", Interim_NRS_IDs: "",
      Quote_Reference: "", Quote_Date: "", Valid_Until_Date: "",
      Connection_Type: "", Distance_m: "", Estimated_Cost: "", Notes: "",
    };
  }

  async function load() {
    try {
      const [lk, res, plotRes, proj, nrsRes] = await Promise.all([
        getLookups(), listPoc(projectId), listPlots(projectId), getProject(projectId),
        /* Failing softly: a project with no supplies endpoint reachable
           should still open its POC applications, with the
           non-residential figure reading zero rather than the tab
           refusing to load. */
        listNrs(projectId).catch(() => ({ rows: [] })),
      ]);
      setLookups(lk);
      setRows(res.rows || []);
      setPlots(plotRes.rows || []);
      setNrs(nrsRes.rows || []);
      setProject(proj);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  /* Site and plot figures come from the project, so the form opens filled
     in rather than asking for what's already known. */
  function openForm() {
    /* The resolved load, not the override column.

       KVA_Load is only filled in where somebody has typed a figure over
       the house type's — which is almost never — so summing it gave 0.0
       on a fully specified site. KVA_Resolved is what the database
       settled on: the entered figure where there is one, the house
       type's otherwise. */
    const base = plots.reduce(
      (sum, p) => sum + (Number(p.KVA_Resolved ?? p.KVA_Load) || 0), 0);
    const cont = contingencyFor(plots.length, lookups?.contingencyLevels || []);
    setF({
      ...blank(),
      Site_Name: project?.Site_Name ?? "",
      Site_Address: project?.Site_Address ?? "",
      Plot_Count: plots.length || "",
      Requested_kVA: base ? base.toFixed(1) : "",
      /* Worked out from the plot count rather than left blank. It is a
         table lookup, not a judgement, and asking someone to copy it
         across is asking them to get it wrong occasionally. */
      Contingency_Load: cont ? String(cont) : "",
      Applicant_Company: "Aptus Utilities",
      POC_Type_ID: lookups?.pocTypes?.[0]?.POC_Type_ID ?? "",
    });
    setShowForm(true);
  }
  const idnoName = (id) => (lookups?.idnos || []).find((x) => x.IDNO_ID === id)?.IDNO_Name ?? "\u2014";
  const dnoName = (id) => (lookups?.dnos || []).find((x) => x.DNO_ID === id)?.DNO_Name ?? "\u2014";
  const providerName = (r) => (r.DNO_ID ? dnoName(r.DNO_ID) : idnoName(r.IDNO_ID));
  const typeName = (id) => (lookups?.pocTypes || []).find((x) => x.POC_Type_ID === id)?.POC_Type ?? "\u2014";
  const statusName = (id) => (lookups?.pocStatuses || []).find((x) => x.POC_Status_ID === id)?.POC_Status ?? "\u2014";

  const grouped = useMemo(() => {
    const g = {};
    rows.filter((r) => rowPasses(r, COLS.filter((c) => c.type !== "none"), filters))
        .forEach((r) => (g[r.Utility_ID] = g[r.Utility_ID] || []).push(r));
    return g;
  }, [rows, filters]);

  async function save() {
    if (!f.Utility_ID) return setError("Choose a utility.");
    if (!f.idno_ids.length && !f.dno_id) return setError("Select at least one provider.");
    setSaving(true);
    try {
      /* Site details belong to the Project, not to each application —
         copying them here would only let them drift. Shown read-only above
         for context, then dropped before saving. */
      const { Site_Name, Site_Address, idno_ids, dno_id, ...rest } = f;

      /* The load figures are worked out, not typed, so they are written
         from the calculation rather than from the form state — which no
         longer holds them.

         Stored as well as computed because an application is a record of
         what was asked for on the day. Recomputing it later from plots
         that have since changed would quietly rewrite history, and a
         quotation is checked against the figure that was submitted. */
      const derived = isElectric ? {
        Requested_kVA: Number(requestedKva.toFixed(1)),
        Non_Residential_kVA: Number(nonResKva.toFixed(1)),
        Contingency_Load: Number(contKva.toFixed(1)),
        Plot_Count: isInterim ? Number(f.Plot_Count || 0) : plots.length,
      } : {
        /* Nothing to record on a gas or water application. Nulled rather
           than left as they were, so a utility changed after the figures
           were worked out does not carry an electric load with it. */
        Requested_kVA: null,
        Non_Residential_kVA: null,
        Contingency_Load: null,
        Plot_Count: plots.length,
      };
      if (editingId) {
        await updatePoc(projectId, editingId, {
          ...rest,
          ...derived,
          Utility_ID: Number(f.Utility_ID),
          POC_Status_ID: f.POC_Status_ID ? Number(f.POC_Status_ID) : null,
          POC_Type_ID: f.POC_Type_ID ? Number(f.POC_Type_ID) : null,
          IDNO_ID: idno_ids[0] ?? null,
          DNO_ID: dno_id ? Number(dno_id) : null,
        });
        setFlash("Application saved");
        setTimeout(() => setFlash(""), 2400);
        setEditingId(null);
        setF(blank());
        setShowForm(false);
        await load();
        return;
      }
      const res = await createPoc(projectId, {
        ...rest, ...derived, idno_ids, dno_id,
        Utility_ID: Number(f.Utility_ID),
        POC_Status_ID: f.POC_Status_ID ? Number(f.POC_Status_ID) : null,
        POC_Type_ID: f.POC_Type_ID ? Number(f.POC_Type_ID) : null,
        Applicant_Person_ID: f.Applicant_Person_ID ? Number(f.Applicant_Person_ID) : null,
      });
      const n = res.rows?.length ?? (f.idno_ids.length + (f.dno_id ? 1 : 0));
      setFlash(`${n} application${n === 1 ? "" : "s"} created \u2014 one per operator`);
      setTimeout(() => setFlash(""), 3000);
      setF(blank());
      setShowForm(false);
      await load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  /* Editing reuses the same form. The original did this too — one form,
     two modes — so the fields can't drift apart. Creating fans out across
     providers; editing updates the single row, which already represents
     one provider. */
  function editRow(row) {
    setEditingId(row.POC_Application_ID);
    setF({
      ...blank(),
      ...row,
      Site_Name: project?.Site_Name ?? "",
      Site_Address: project?.Site_Address ?? "",
      idno_ids: row.IDNO_ID ? [row.IDNO_ID] : [],
      dno_id: row.DNO_ID ? String(row.DNO_ID) : "",
    });
    setShowForm(true);
  }

  const submittedStatusId = () =>
    (lookups?.pocStatuses || []).find((s) => s.POC_Status === "Submitted")?.POC_Status_ID ?? null;

  async function submitApplication() {
    const sid = submittedStatusId();
    if (!sid) return setError('No "Submitted" status configured — add it in Admin.');
    setSaving(true);
    try {
      await updatePoc(projectId, editingId, { POC_Status_ID: sid });
      setFlash("Application submitted");
      setTimeout(() => setFlash(""), 2600);
      setShowForm(false);
      setEditingId(null);
      setF(blank());
      await load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function patch(row, key, value) {
    setRows((r) => r.map((x) => (x.POC_Application_ID === row.POC_Application_ID ? { ...x, [key]: value } : x)));
    try { await updatePoc(projectId, row.POC_Application_ID, { [key]: value }); }
    catch (e) { setError(e.message); await load(); }
  }

  async function remove(row) {
    if (!window.confirm(`Delete the ${providerName(row)} application?`)) return;
    try {
      await deletePoc(projectId, row.POC_Application_ID);
      setRows((r) => r.filter((x) => x.POC_Application_ID !== row.POC_Application_ID));
    } catch (e) { setError(e.message); }
  }

  /* Whether this application carries a load at all.

     By the utility's name rather than its id: the ids are a fixed list
     in one module and a column in the database, and matching on the name
     survives either being renumbered. Street lighting is electric in the
     ground but is not applied for by kVA on this form.

     Nothing chosen yet shows the fields, since electric is the ordinary
     case and a form that grows a section when you pick from a dropdown
     is more startling than one that loses it. */
  const isElectric = (() => {
    /* Nothing chosen shows nothing.

       An earlier version showed the load fields until a utility was
       picked, on the reasoning that electric is the ordinary case. That
       was the wrong way round: a blank form asking for a kVA figure
       before it knows what is being applied for is asking a question
       that may turn out not to apply, and four boxes that vanish when
       Gas is chosen look like a fault rather than a rule.

       Appearing when Electric is chosen reads as the form responding.
       Disappearing when Gas is chosen reads as the form losing
       something. */
    if (!f.Utility_ID) return false;
    const u = UTILITIES.find((x) => Number(x.id) === Number(f.Utility_ID));
    return u?.name === "Electric";
  })();

  /* An interim application covers a subset of the site.

     A temporary supply is applied for against the plots it actually
     serves, not the whole scheme — so its plot count is typed rather
     than counted, and its load comes from the plots chosen for it. */
  /* Through the existing typeName helper rather than a second lookup —
     the list rows and this form must agree about what a type is called. */
  const isInterim = typeName(Number(f.POC_Type_ID)) === "Interim";

  /* The plots this application is for.

     Everything on the project for an ordinary application; the chosen
     subset for an interim one. Held as a comma-separated list because
     that is how the original stores it and the two have to read the same
     column. */
  const interimSelected = parseIds(f.Interim_Plot_IDs);
  const interimIds = new Set(interimSelected);
  const appPlots = isInterim
    ? plots.filter((p) => interimIds.has(Number(p.Plot_ID)))
    : plots;

  /* Plots already spoken for by another interim application on this
     utility. Two applications claiming one plot asks the operator twice
     for the same supply. */
  const interimClaimed = isInterim
    ? claimedElsewhere(rows, {
      utilityId: f.Utility_ID,
      exceptId: editingId,
      typeName: (a2) => typeName(Number(a2.POC_Type_ID)),
    })
    : new Map();

  /* The cap: what was applied for on the form. */
  const interimTarget = Number(f.Plot_Count || 0) || 0;

  /* Dropping plots that are no longer allowed.

     The utility can change after plots are chosen, and another
     application can claim one in the meantime. Left alone they stay in
     the selection and are saved, so the application quietly covers plots
     it is not entitled to.

     Done as the inputs change rather than at save time: a selection that
     shrinks when you press Save is a surprise, where one that shrinks
     when you change the utility is a consequence. */
  useEffect(() => {
    if (!isInterim || !f.Utility_ID) return;
    const pr = pruneChoices(interimSelected, plots, { claimed: interimClaimed });
    if (!pr.dropped) return;
    set("Interim_Plot_IDs")(serialiseIds(pr.ids));
    setError(`${pr.dropped} plot(s) removed \u2014 no longer available on this utility.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInterim, f.Utility_ID, plots, rows, editingId]);

  /* Picking a run of plots by its ends.

     Off until asked for, and off again the moment a range completes: a
     range is a single act, and leaving the mode on invites a stray click
     to start another one nobody asked for. */
  const [rangeOn, setRangeOn] = useState(false);
  const [rangeAnchor, setRangeAnchor] = useState(null);

  const chooseInterimPlot = (id) => {
    if (rangeOn) {
      if (rangeAnchor == null) {
        /* The first click selects its plot as well as anchoring, so
           there is something on screen while waiting for the second. */
        setRangeAnchor(id);
        set("Interim_Plot_IDs")(serialiseIds(
          toggleChoice(interimSelected, id, {
            claimed: interimClaimed, target: interimTarget,
          }),
        ));
        return;
      }
      const r = rangeBetween(plots, rangeAnchor, id, {
        claimed: interimClaimed, selected: interimSelected, target: interimTarget,
      });
      set("Interim_Plot_IDs")(serialiseIds(r.ids));
      setRangeOn(false);
      setRangeAnchor(null);
      setError(r.refused
        ? `${r.added} added, ${r.refused} skipped \u2014 claimed elsewhere or past the ${interimTarget} applied for.`
        : "");
      return;
    }

    const next = toggleChoice(interimSelected, id, {
      claimed: interimClaimed, target: interimTarget,
    });
    set("Interim_Plot_IDs")(serialiseIds(next));
  };

  /* The resolved load, not the override column.

     KVA_Load is only filled in where somebody has typed a figure over
     the house type's — which is almost never — so summing it gave 0.0 on
     a fully specified site. KVA_Resolved is what the database settled
     on: the entered figure where there is one, the house type's
     otherwise. */
  const kvaOf = (p) => Number(p.KVA_Resolved ?? p.KVA_Load) || 0;
  const baseKva = appPlots.reduce((sum, p) => sum + kvaOf(p), 0);
  const missingKva = appPlots.filter((p) =>
    (p.KVA_Resolved ?? p.KVA_Load) == null).length;

  /* Contingency from the bands, and none at all for an interim
     application — there is no future growth to hold a margin for on a
     temporary supply. Read-only either way: it is a table lookup, and a
     figure that can be typed over a table is a figure that will
     eventually disagree with it. */
  const contKva = contingencyFor(
    isInterim ? appPlots.length : plots.length,
    lookups?.contingencyLevels || [],
    { interim: isInterim },
  );

  /* The supplies on this utility. A feeder pillar is applied for on the
     electric application, not the gas one. */
  const utilNrs = f.Utility_ID
    ? nrs.filter((n) => Number(n.Utility_ID) === Number(f.Utility_ID))
    : [];

  /* Supplies already on another application for this utility. */
  const nrsClaimed = nrsClaimedElsewhere(rows, {
    utilityId: f.Utility_ID, exceptId: editingId,
  });

  /* Which of them this application covers.

     Every supply on the utility by default, since that was the previous
     behaviour and is the ordinary case — a POC application usually asks
     for all of them. Ticking is for the exceptions.

     Stored in Interim_NRS_IDs, which is where the original application
     holds it. The name says interim and the field is no longer only for
     interim applications; keeping one column that both read is worth
     more than a better name on a second one that has to be kept in step
     with it. */
  const nrsTouched = f.Interim_NRS_IDs != null && f.Interim_NRS_IDs !== "";
  const nrsSelected = nrsTouched
    ? parseIds(f.Interim_NRS_IDs)
    : utilNrs.filter((n) => !nrsClaimed.has(Number(n.NRS_ID)))
      .map((n) => Number(n.NRS_ID));
  const nrsChosen = new Set(nrsSelected);

  const chooseNrs = (id) => {
    const next = toggleChoice(nrsSelected, id, { claimed: nrsClaimed });
    /* Written even when it empties, so "none of them" is a decision that
       sticks rather than falling back to the default of all. */
    set("Interim_NRS_IDs")(serialiseIds(next) || NONE);
  };

  /* Only the ticked ones count. */
  const nonResKva = utilNrs
    .filter((n) => nrsChosen.has(Number(n.NRS_ID)))
    .reduce((sum, n) => sum + (Number(n.Requested_kVA) || 0), 0);

  /* What is being asked of the operator: the residential load plus its
     contingency, plus the non-residential supplies. */
  const requestedKva = baseKva + contKva;
  const totalKva = requestedKva + nonResKva;

  const providerCount = f.idno_ids.length + (f.dno_id ? 1 : 0);
  const isSubmitted =
    !!f.POC_Status_ID &&
    (lookups?.pocStatuses || []).find((s) => s.POC_Status_ID === Number(f.POC_Status_ID))?.POC_Status === "Submitted";

  const providerOptions = [
    ...(lookups?.idnos || []).map((i) => ({ id: `i${i.IDNO_ID}`, label: `IDNO — ${i.IDNO_Name}` })),
    ...(lookups?.dnos || []).map((d) => ({ id: `d${d.DNO_ID}`, label: `DNO — ${d.DNO_Name}` })),
  ];
  const filterOptions = (key) => {
    if (key === "utility") return RESIDENTIAL_UTILITIES.map((u) => ({ id: u.id, label: u.name }));
    if (key === "operator") return providerOptions;
    if (key === "type") return (lookups?.pocTypes || []).map((t) => ({ id: t.POC_Type_ID, label: t.POC_Type }));
    if (key === "status") return (lookups?.pocStatuses || []).map((s) => ({ id: s.POC_Status_ID, label: s.POC_Status }));
    return [];
  };
  const filterCols = COLS.filter((c) => c.type !== "none");
  const sortRows = (list) => {
    const col = COLS.find((c) => c.key === sort.key);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (!col) return 0;
      const va = col.key === "operator" ? providerName(a) : col.raw(a);
      const vb = col.key === "operator" ? providerName(b) : col.raw(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
  };
  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  if (loading) return <div className="loading">Loading applications&hellip;</div>;

  const toggleIdno = (id) =>
    setF((p) => ({
      ...p,
      idno_ids: p.idno_ids.includes(id) ? p.idno_ids.filter((x) => x !== id) : [...p.idno_ids, id],
    }));

  return (
    <div>
      <style>{CSS}</style>

      <div className="tab-head">
        <div>
          <h3>POC applications <span className="count">{rows.length}</span></h3>
          <p className="tab-sub">
            Point of connection applications, one per network operator.
          </p>
        </div>
        <button className="btn accent"
          onClick={() => (showForm ? (setShowForm(false), setEditingId(null)) : openForm())}>
          {showForm ? "Cancel" : "+ New application"}
        </button>
      </div>

      {flash && <Banner kind="ok">{flash}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}

      {showForm && (
        <div className="poc-form">
          <p className="panel-label">{editingId ? "Edit POC application" : "New POC application"}</p>

          <div className="poc-grid">
            <div className="fld span2"><label>Site name</label>
              <input value={f.Site_Name} disabled />
              <p className="hint">From the project</p></div>
            <div className="fld span3"><label>Site address</label>
              <input value={f.Site_Address} disabled />
              <p className="hint">From the project</p></div>
            {/* Counted for an ordinary application, typed for an
                interim one.

                An interim supply covers a subset of the site — a first
                phase, a compound, a show home — so its plot count is a
                decision rather than a fact about the project. Every
                other type is applied for against the whole scheme, and
                letting that be typed invites it to drift away from the
                plots actually on the drawing. */}
            <div className="fld"><label># Plots</label>
              {isInterim ? (
                <input type="number" min="0" value={f.Plot_Count}
                  onChange={(e) => set("Plot_Count")(e.target.value)} />
              ) : (
                <input className="kva-total" value={plots.length || 0} disabled />
              )}
              <p className="hint">
                {isInterim
                  ? `${appPlots.length} of ${plots.length} chosen`
                    + (Number(f.Plot_Count || 0) && appPlots.length !== Number(f.Plot_Count)
                      ? " \u2014 does not match the count above" : "")
                  : "from the project"}
              </p></div>

            <div className="fld span2"><label>Applicant company</label>
              <input value={f.Applicant_Company} onChange={(e) => set("Applicant_Company")(e.target.value)} /></div>
            <div className="fld span4"><label>Applicant company address</label>
              <input value={f.Applicant_Company_Address}
                onChange={(e) => set("Applicant_Company_Address")(e.target.value)} /></div>

            <div className="fld span2"><label>Applicant representative</label>
              <select value={f.Applicant_Person_ID} onChange={(e) => set("Applicant_Person_ID")(e.target.value)}>
                <option value="">&mdash;</option>
                {(lookups.people || []).map((p) => (
                  <option key={p.Person_ID} value={p.Person_ID}>{p.Person_Name}</option>
                ))}
              </select></div>
            <div className="fld span2"><label>Application date</label>
              <input type="date" value={f.Application_Date} onChange={(e) => set("Application_Date")(e.target.value)} /></div>
            <div className="fld span2"><label>Expected response date</label>
              <input type="date" value={f.Expected_Rx_Date} onChange={(e) => set("Expected_Rx_Date")(e.target.value)} /></div>

            <div className="fld"><label>POC type</label>
              <select value={f.POC_Type_ID} onChange={(e) => set("POC_Type_ID")(e.target.value)}>
                {(lookups.pocTypes || []).map((t) => (
                  <option key={t.POC_Type_ID} value={t.POC_Type_ID}>{t.POC_Type}</option>
                ))}
              </select></div>
            <div className="fld"><label>Utility <span className="req">*</span></label>
              <select value={f.Utility_ID} onChange={(e) => set("Utility_ID")(e.target.value)}>
                <option value="">&mdash;</option>
                {RESIDENTIAL_UTILITIES.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select></div>
            {/* Load only means something on an electric application.

                A gas or water POC has no kVA, and four empty boxes on it
                are four things somebody has to decide are deliberately
                blank. Hidden rather than disabled: a disabled field still
                says the question was asked. */}
            {isElectric && (
              <>
                <div className="fld"><label>Requested kVA load</label>
                  {/* Worked out, not typed. Every part of it comes from
                      somewhere — the plots, the bands, the supplies —
                      and a box that can be typed over is a box that will
                      eventually disagree with all three. */}
                  <input className="kva-total" value={requestedKva.toFixed(1)} disabled />
                  <p className="hint">
                    {!appPlots.length
                      ? (isInterim
                        ? "no plots chosen for this interim application yet"
                        : "no plots on this project yet")
                      : `${missingKva ? `${missingKva} plot(s) missing data \u00b7 ` : ""}`
                        + `base ${baseKva.toFixed(1)}`
                        + `${contKva ? ` + contingency ${contKva.toFixed(1)}` : ""}`
                        + ` from ${appPlots.length} plot(s)`}
                  </p></div>

                <div className="fld"><label>Non-residential</label>
                  <input className="kva-total" value={nonResKva.toFixed(1)} disabled />
                  <p className="hint">
                    {!utilNrs.length
                      ? "no non-residential supplies on this utility"
                      : `${nrsSelected.length} of ${utilNrs.length} included`}
                  </p></div>

                <div className="fld"><label>Contingency load</label>
                  <input className="kva-total" value={contKva.toFixed(1)} disabled />
                  <p className="hint">
                    {isInterim
                      ? "interim applications carry no contingency"
                      : contingencyNote(plots.length, lookups?.contingencyLevels || [])}
                  </p></div>

                <div className="fld"><label>Total</label>
                  <input className="kva-total" value={totalKva.toFixed(1)} disabled />
                  <p className="hint">
                    {`${requestedKva.toFixed(1)} requested`
                      + ` + ${nonResKva.toFixed(1)} non-residential`}
                  </p></div>
              </>
            )}

            {/* Which supplies this application asks for.

                Every one on the utility by default — that is the
                ordinary case and was the previous behaviour — with
                ticking for the exceptions: a pillar being applied for
                separately, or one already quoted elsewhere.

                Each shows its own kVA, because the total above is
                otherwise a number with no working shown. */}
            {isElectric && utilNrs.length > 0 && (
              <div className="fld span6">
                <label>
                  Non-residential supplies
                  <span className="lbl-note">
                    {` \u2014 ${nrsSelected.length} of ${utilNrs.length} included,`
                      + ` ${nonResKva.toFixed(1)} kVA`}
                  </span>
                  {/* No range here: supplies are a handful with names
                      rather than a numbered run, so there is nothing for
                      a range to mean. */}
                  {utilNrs.length > 1 && (
                    <span className="rng-bar">
                      <button type="button" className="rng"
                        disabled={!nrsSelected.length}
                        onClick={() => set("Interim_NRS_IDs")(NONE)}>
                        Deselect all
                      </button>
                      <button type="button" className="rng"
                        onClick={() => {
                          const r = selectAll(utilNrs, {
                            claimed: nrsClaimed, key: "NRS_ID",
                          });
                          set("Interim_NRS_IDs")(serialiseIds(r.ids) || NONE);
                        }}>
                        Select all
                      </button>
                    </span>
                  )}
                </label>
                {/* Chips, as the plots are. A supply is identified by a
                    short reference, so the same grid works and the two
                    panels read as the same kind of question — which is
                    what they are.

                    The kVA rides on the chip rather than in a column:
                    the figure is the reason for ticking or not, and
                    hiding it in a tooltip means opening every one to
                    work out where the total comes from. */}
                <div className="ipl-grid">
                  {utilNrs.map((n) => {
                    const id = Number(n.NRS_ID);
                    const takenBy = nrsClaimed.get(id);
                    const on = nrsChosen.has(id);
                    const locked = !!takenBy && !on;
                    return (
                      <button key={id} type="button"
                        className={on ? "ipl nrs on" : (locked ? "ipl nrs off" : "ipl nrs")}
                        disabled={locked}
                        title={locked
                          ? `Already on ${takenBy}`
                          : (n.Description || n.Supply_Ref || `Supply ${id}`)}
                        onClick={() => chooseNrs(id)}>
                        <span className="ipl-l">
                          {n.Supply_Ref || n.Description || `Supply ${id}`}
                        </span>
                        <span className="ipl-k">
                          {Number(n.Requested_kVA || 0).toFixed(1)} kVA
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Which plots this interim application covers.

                Only for interim: every other type is applied for against
                the whole scheme and has nothing to choose.

                Chips rather than a list, because the question is "which
                of these" and a plot number is short — a hundred and
                thirty-nine rows of checkbox would be a scroll where a
                grid is a glance. */}
            {isInterim && (
              <div className="fld span6">
                <label>
                  Plots on this application
                  <span className="lbl-note">
                    {" \u2014 "}
                    {selectionState(interimSelected, interimTarget).note}
                  </span>
                  {/* Ticking sixty plots one at a time is sixty chances
                      to miss one. Two clicks says the same thing. */}
                  {plots.length > 1 && f.Utility_ID && (
                    <span className="rng-bar">
                      {/* Deselect first, because it is the one pressed by
                          mistake least often — putting the destructive
                          one at the far end of the row is how it gets
                          pressed instead of Select all. */}
                      <button type="button" className="rng"
                        disabled={!interimSelected.length}
                        onClick={() => {
                          set("Interim_Plot_IDs")(NONE);
                          setRangeOn(false);
                          setRangeAnchor(null);
                        }}>
                        Deselect all
                      </button>
                      <button type="button" className="rng"
                        onClick={() => {
                          const r = selectAll(plots, {
                            claimed: interimClaimed, target: interimTarget,
                          });
                          set("Interim_Plot_IDs")(serialiseIds(r.ids) || NONE);
                          setRangeOn(false);
                          setRangeAnchor(null);
                          setError(r.left || r.blocked
                            ? `${r.ids.length} selected`
                              + (r.left ? ` \u2014 ${r.left} more than the ${interimTarget} applied for` : "")
                              + (r.blocked ? ` \u2014 ${r.blocked} claimed elsewhere` : "")
                            : "");
                        }}>
                        Select all
                      </button>
                      <button type="button"
                        className={rangeOn ? "rng on" : "rng"}
                        onClick={() => {
                          setRangeOn(!rangeOn);
                          setRangeAnchor(null);
                        }}>
                        {rangeOn ? "Cancel range" : "Select range"}
                      </button>
                    </span>
                  )}
                </label>
                {rangeOn && (
                  <p className="hint rng-note">
                    {rangeNote(rangeAnchor, plots)}
                  </p>
                )}

                {!plots.length ? (
                  <p className="hint">No plots on this project yet.</p>
                ) : !f.Utility_ID ? (
                  <p className="hint">Choose a utility first &mdash; plots are claimed per utility.</p>
                ) : (
                  <>
                    <div className="ipl-grid">
                      {plotChoices(plots, interimSelected, {
                        claimed: interimClaimed,
                        /* The cap does not lock chips while a range is
                           being picked: the far end of a range is often
                           past the count, and the range trims itself
                           afterwards. A plot claimed elsewhere is still
                           off-limits — that one is not ours to take. */
                        target: rangeOn ? 0 : interimTarget,
                      }).map((c) => (
                        <button key={c.id} type="button"
                          className={[
                            "ipl",
                            c.chosen ? "on" : "",
                            c.locked ? "off" : "",
                            /* The anchor is marked distinctly from a
                               chosen plot: it is chosen, but it is also
                               the thing the next click measures from,
                               and that is worth seeing. */
                            rangeAnchor != null && Number(rangeAnchor) === c.id
                              ? "anchor" : "",
                          ].filter(Boolean).join(" ")}
                          disabled={c.locked}
                          title={rangeAnchor != null && Number(rangeAnchor) === c.id
                            ? "First of the range — click the last"
                            : (c.why || `Plot ${c.plot.Plot_Number ?? c.id}`)}
                          onClick={() => chooseInterimPlot(c.id)}>
                          {c.plot.Plot_Number ?? c.id}
                        </button>
                      ))}
                    </div>
                    <p className="hint">
                      {interimTarget
                        ? `Up to ${interimTarget}, from the # Plots box above.`
                        : "Set # Plots above to cap the selection."}
                      {interimClaimed.size > 0
                        && ` ${interimClaimed.size} plot(s) are on another interim application.`}
                    </p>
                  </>
                )}
              </div>
            )}

            <div className="fld span6">
              <label>
                Provider <span className="req">*</span>
                <span className="lbl-note"> apply to any number of IDNOs, and at most one DNO</span>
              </label>
              <div className="prov-cols">
                <div className="prov-col">
                  <div className="prov-head idno">
                    <span className="badge idno">IDNO</span>
                    <span>Independent operators</span>
                    <span className="prov-rule">choose any</span>
                  </div>
                  <div className="provider-list">
                    {(lookups.idnos || []).length === 0 ? (
                      <p className="prov-none">None configured &mdash; add them in Admin.</p>
                    ) : (lookups.idnos || []).map((i) => (
                      <label key={i.IDNO_ID} className={f.idno_ids.includes(i.IDNO_ID) ? "prov on" : "prov"}>
                        <input type="checkbox" checked={f.idno_ids.includes(i.IDNO_ID)}
                          onChange={() => toggleIdno(i.IDNO_ID)} />
                        {i.IDNO_Name}
                      </label>
                    ))}
                  </div>
                  {f.idno_ids.length > 0 && (
                    <button className="prov-clear" onClick={() => set("idno_ids")([])}>
                      Clear {f.idno_ids.length} selected
                    </button>
                  )}
                </div>

                <div className="prov-col">
                  <div className="prov-head dno">
                    <span className="badge dno">DNO</span>
                    <span>Incumbent operator</span>
                    <span className="prov-rule">choose one</span>
                  </div>
                  <div className="provider-list">
                    {(lookups.dnos || []).length === 0 ? (
                      <p className="prov-none">None configured &mdash; add them in Admin.</p>
                    ) : (lookups.dnos || []).map((d) => (
                      <label key={d.DNO_ID} className={String(f.dno_id) === String(d.DNO_ID) ? "prov on" : "prov"}>
                        <input type="radio" name="dno" checked={String(f.dno_id) === String(d.DNO_ID)}
                          onChange={() => set("dno_id")(String(d.DNO_ID))} />
                        {d.DNO_Name}
                      </label>
                    ))}
                  </div>
                  {f.dno_id && (
                    <button className="prov-clear" onClick={() => set("dno_id")("")}>Clear selection</button>
                  )}
                </div>
              </div>
              {providerCount > 1 && (
                <p className="hint">
                  Creates {providerCount} separate applications &mdash; each provider quotes
                  independently.
                </p>
              )}
            </div>

            <div className="fld span6"><label>Notes</label>
              <textarea rows={2} value={f.Notes} onChange={(e) => set("Notes")(e.target.value)} /></div>
          </div>

          <div className="poc-actions">
            <button className="btn accent" disabled={saving} onClick={save}>
              {saving ? "Saving\u2026" : editingId ? "Save changes"
                : providerCount > 1 ? `Save ${providerCount} applications` : "Save application"}
            </button>
            {editingId && !isSubmitted && (
              <button className="btn submit" disabled={saving} onClick={submitApplication}>
                Submit application
              </button>
            )}
            <button className="btn ghost"
              onClick={() => { setShowForm(false); setEditingId(null); setF(blank()); }}>
              Cancel
            </button>
            {editingId && isSubmitted && (
              <span className="submitted-note">
                Submitted {f.Submitted_Date ? `on ${fmt(f.Submitted_Date)}` : ""}
              </span>
            )}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No applications yet</p>
          <p>Apply to one or more network operators for a point of connection.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([utilId, list]) => {
          const u = utilityById(Number(utilId));
          return (
            <div className="poc-group" key={utilId}>
              <p className="poc-group-title">
                <span className="dot" style={{ background: u?.colour }} />
                {u?.name ?? "Utility"} <span className="count">{list.length}</span>
              </p>
              <div className="dt-wrap">
                <table className="dt">
                  <colgroup>{layout.visible.map((c) => <col key={c.key} style={{ width: layout.widths[c.key] }} />)}</colgroup>
                  <thead>
                    <tr className="head-row">
                      {layout.visible.map((c) => (
                        <th key={c.key} {...layout.reorderProps(c.key)}
                            onClick={() => c.type !== "none" && toggleSort(c.key)}>
                          {c.label}
                          {sort.key === c.key && <span className="arrow">{sort.dir === "asc" ? "\u25B2" : "\u25BC"}</span>}
                          <span className="resizer" draggable={false}
                        onDragStart={(e) => e.preventDefault()}
                        onMouseDown={(e) => layout.startResize(e, c.key)} />
                        </th>
                      ))}
                    </tr>
                    <tr className="filter-row" onClick={(e) => e.stopPropagation()}>
                      {layout.visible.map((c) => (
                        <th key={c.key}>
                          {c.type !== "none" && (
                            <FilterCell col={c} value={filters[c.key] ?? blankFilter(c.type)}
                              onChange={(v) => setFilters((x) => ({ ...x, [c.key]: v }))}
                              options={c.type === "multi" ? filterOptions(c.key) : null}
                              open={openFilter === c.key}
                              setOpen={(o) => setOpenFilter(o ? c.key : null)} />
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortRows(list).map((r) => (
                      <tr key={r.POC_Application_ID}>
                        {/* Per column, so a reordered header carries its
                            data with it. A fixed run of cells shears away
                            from its headings the moment one is moved. */}
                        {layout.visible.map((col) => (
                          <td key={col.key}
                            className={
                              col.key === "operator" ? "op-name"
                              : col.key === "quoteref" ? "mono"
                              : col.key === "act" ? "mid nowrap"
                              : col.align === "right" ? "num" : undefined}>

                            {col.key === "utility" ? u?.name

                            : col.key === "operator" ? (<>
                              <span className={`badge ${r.DNO_ID ? "dno" : "idno"}`}>
                                {r.DNO_ID ? "DNO" : "IDNO"}
                              </span>
                              {" "}{providerName(r)}
                            </>)

                            : col.key === "type" ? (
                              <span className="ptype">{typeName(r.POC_Type_ID)}</span>)

                            : col.key === "status" ? (
                              <select className="inline-sel" value={r.POC_Status_ID ?? ""}
                                onChange={(e) => patch(r, "POC_Status_ID", e.target.value ? Number(e.target.value) : null)}>
                                <option value="">&mdash;</option>
                                {(lookups.pocStatuses || []).map((x) => (
                                  <option key={x.POC_Status_ID} value={x.POC_Status_ID}>{x.POC_Status}</option>
                                ))}
                              </select>)

                            : col.key === "applied"  ? fmt(r.Application_Date)
                            : col.key === "expected" ? fmt(r.Expected_Rx_Date)
                            : col.key === "kva"      ? (r.Requested_kVA ?? "\u2014")
                            : col.key === "plots"    ? (r.Plot_Count ?? "\u2014")
                            : col.key === "quoteref" ? (r.Quote_Reference || "\u2014")
                            : col.key === "cost"     ? money(r.Estimated_Cost)

                            : col.key === "act" ? (<>
                              <button className="row-edit"
                                onClick={() => setExpanded(expanded === r.POC_Application_ID ? null : r.POC_Application_ID)}
                                title="Options and quotations">
                                {expanded === r.POC_Application_ID ? "\u25BE" : "\u25B8"} Options
                              </button>
                              <button className="row-edit" onClick={() => editRow(r)} title="Edit">Edit</button>
                              <button className="row-del" onClick={() => remove(r)} title="Delete">&#10005;</button>
                            </>)

                            : null}
                          </td>
                        ))}
                      </tr>
                    )).flatMap((row, i) => {
                      const r = sortRows(list)[i];
                      return expanded === r.POC_Application_ID
                        ? [row, (
                            <tr className="opt-row" key={`o${r.POC_Application_ID}`}>
                              <td colSpan={layout.visible.length}>
                                <OptionsPanel appId={r.POC_Application_ID} projectId={projectId}
                                  providerName={providerName(r)} onChanged={load} />
                                <div className="app-notes">
                                  <EntityNotes entityType="POC_Application"
                                    entityId={r.POC_Application_ID}
                                    labelFor={(f2) => POC_FIELD_LABELS[f2] || f2} />
                                </div>
                              </td>
                            </tr>
                          )]
                        : [row];
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

const CSS = FILTER_CSS + `
.rng-bar { float: right; display: inline-flex; gap: 5px; }
.rng { background: var(--white); border: 1px solid var(--border);
  border-radius: 5px; cursor: pointer; font: 600 10.5px inherit; padding: 2px 9px;
  color: var(--accent); }
.rng.on { background: #d97706; border-color: #d97706; color: #fff; }
.rng-note { color: #92400e; font-weight: 600; margin: 4px 0 6px; }
.ipl.anchor { border-color: #d97706; background: #fffbeb; color: #92400e; }

/* The plot chips. Sized so a plot number fits and a hundred of them
   still read as a block rather than a wall. */
.ipl-grid { display: flex; flex-wrap: wrap; gap: 4px; max-height: 220px;
  overflow-y: auto; padding: 6px; border: 1px solid var(--border);
  border-radius: 7px; background: var(--white); }
.ipl { min-width: 38px; padding: 4px 7px; border: 1.5px solid var(--border);
  border-radius: 5px; background: var(--white); cursor: pointer;
  font: 600 11.5px inherit; color: var(--text); }
.ipl:hover:not(:disabled) { border-color: var(--accent); }
.ipl.on { border-color: var(--accent); background: #eff6ff; color: var(--accent); }
/* Locked chips are dimmed rather than hidden: a plot missing from the
   grid altogether looks like a plot missing from the project. */
.ipl.off { border-color: #fecaca; background: #fef2f2; color: #b91c1c;
  cursor: not-allowed; opacity: .7; }

/* A supply chip carries a name and a figure, so it is wider than a plot
   number and stacks the two rather than sitting them side by side. */
.ipl.nrs { display: inline-flex; flex-direction: column; align-items: flex-start;
  gap: 1px; min-width: 92px; padding: 5px 9px; }
.ipl-l { font-weight: 600; }
.ipl-k { font-size: 10px; font-weight: 700; opacity: .75; }

.tab-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.tab-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.tab-head .count, .poc-group-title .count { font-size: 11px; font-weight: 700; background: var(--accent-light);
  color: var(--accent); border-radius: 20px; padding: 2px 8px; margin-left: 6px; vertical-align: middle; }
.tab-sub { margin: 3px 0 0; font-size: 12.5px; color: var(--muted); }
.poc-form { border: 1.5px solid var(--border); border-radius: 12px; background: #f8f9fb;
  padding: 18px; margin-bottom: 20px; }
.poc-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
.poc-grid .span2 { grid-column: span 2; }
.poc-grid .span3 { grid-column: span 3; }
.poc-grid .span4 { grid-column: span 4; }
.poc-grid .span6 { grid-column: span 6; }
.lbl-note { font-weight: 400; text-transform: none; letter-spacing: 0; font-size: 10.5px; color: var(--muted); }
.kva-total { font-weight: 700; color: var(--accent); background: var(--accent-light) !important; }
.prov-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.prov-col { display: flex; flex-direction: column; }
.prov-head { display: flex; align-items: center; gap: 8px; padding: 0 2px 6px;
  font-size: 11.5px; font-weight: 600; color: var(--text); }
.prov-rule { margin-left: auto; font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: var(--muted); }
.provider-list { border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--white); max-height: 220px; overflow-y: auto; }
.prov-none { margin: 0; padding: 18px; text-align: center; font-size: 12px; color: var(--muted); }
.prov-clear { align-self: flex-start; background: none; border: none; color: var(--accent);
  font: 600 11.5px inherit; cursor: pointer; padding: 6px 2px 0; }
.prov { display: flex; align-items: center; gap: 12px; padding: 9px 12px; margin: 0;
  font-size: 12.5px; font-weight: 500; text-transform: none; letter-spacing: 0;
  color: var(--text); cursor: pointer; border-bottom: 1px solid var(--border); }
.prov:last-child { border-bottom: none; }
.prov:nth-child(even) { background: #fafbfc; }
.prov:hover { background: var(--accent-light); }
.prov.on { background: var(--accent-light); font-weight: 600; }

/* Don't set width here — that's what was collapsing the checkbox to a
   sliver. Size comes from the global input rules; only scale it up. */
.prov input[type="checkbox"] { width: 18px; height: 18px; min-width: 18px; }
.prov input[type="radio"] { width: 18px; height: 18px; border-width: 2px; }
.badge { font-size: 9px; font-weight: 700; letter-spacing: .05em; border-radius: 4px;
  padding: 2px 6px; flex: none; }
.badge.idno { background: var(--accent); color: #fff; }
.badge.dno { background: #7c3aed; color: #fff; }
.clear-dno { background: none; border: none; color: var(--accent); font: 600 11.5px inherit;
  cursor: pointer; padding: 5px 0 0; }
.poc-actions { display: flex; gap: 8px; margin-top: 16px; }
.op-picker { display: flex; flex-wrap: wrap; gap: 6px; }
.op { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 400;
  text-transform: none; letter-spacing: 0; color: var(--text); background: var(--white);
  border: 1px solid var(--border); border-radius: 6px; padding: 6px 11px; margin: 0; cursor: pointer; }
.op.on { border-color: var(--accent); background: var(--accent-light); color: var(--accent); font-weight: 600; }
.poc-group { margin-bottom: 18px; }
.poc-group-title { display: flex; align-items: center; gap: 7px; margin: 0 0 6px;
  font-size: 12.5px; font-weight: 700; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.ptype { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  border-radius: 4px; padding: 2px 6px; background: var(--bg); border: 1px solid var(--border); color: var(--muted); }
.ptype.firm { background: var(--ok-bg); color: var(--ok-text); border-color: var(--ok-border); }
.ptype.interim { background: var(--warn-bg); color: var(--warn-text); border-color: var(--warn-border); }
.inline-sel { width: 100%; font-size: 12px; padding: 3px 5px; border-radius: 5px; }
.op-name { font-weight: 600; }
.dt .num { text-align: right; }
.dt .mid { text-align: center; }
.mono { font-family: ui-monospace, Menlo, monospace; }
.row-del { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 11px;
  padding: 2px 5px; border-radius: 4px; }
.row-del:hover { background: #fef2f2; color: #ef4444; }
.row-edit { background: none; border: none; cursor: pointer; color: var(--accent);
  font: 600 11.5px inherit; padding: 2px 6px; border-radius: 4px; }
.row-edit:hover { background: var(--accent-light); }
.nowrap { white-space: nowrap; }
.app-notes { padding: 0 16px 14px; }
.opt-row td { padding: 0 !important; background: var(--bg); }
.opt-row:hover { background: var(--bg) !important; }
.btn.submit { background: #059669; color: #fff; }
.btn.submit:hover { background: #047857; }
.submitted-note { align-self: center; font-size: 11.5px; color: var(--ok-text); font-weight: 600; }
.empty { text-align: center; padding: 48px 20px; border: 1px dashed var(--border);
  border-radius: var(--radius); background: var(--bg); }
.empty-title { margin: 0 0 4px; font-size: 14px; font-weight: 700; color: var(--text); }
.empty p { margin: 0; font-size: 12.5px; color: var(--muted); }
`;
