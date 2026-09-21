/* The enquiry sheet: what a developer is asked, and in what order.

   ── This screen edits a schema that already existed ──

   Enquiry_Form / Enquiry_Question / Enquiry_Option / Enquiry_Answer
   were built before this screen was, outside the migrations folder. I
   wrote a second set of tables for the same thing before finding them,
   which is why 0225 is a cleanup rather than a creation. The existing
   design is the one kept, and this screen is written to it:

     - a question belongs to the FORM, and its section is a text field
       on the question rather than a table of its own;
     - `Kind` is the answer type;
     - `Is_Live` marks the form in use;
     - an option can END the form as well as jump;
     - `Is_Active` retires a question or an option without deleting it,
       which matters because an old answer points at it.

   ── Branching ──

   A jump belongs to the ANSWER — "if they say Yes, go to question 5" —
   so it is set on the option, in the row where that answer is written.
   A question also has a `Next_Question_ID`, which is where it goes when
   the answer implies no jump of its own.

   Forward only, and the list of places to jump to says so by holding
   only what comes after. A form that can jump backwards can loop, and
   a loop in a form somebody is filling in is a trap with no way out —
   cheaper to make impossible here than to detect later. */

import { useEffect, useMemo, useState } from "react";
import { adminList, adminCreate, adminUpdate, adminDelete } from "../../api/admin.js";
import { moveQuestion, moveSection, moveToSection } from "./sheetOrder.js";

/* The `Kind` values, exactly as the database's own check constraint
   spells them:

     CHECK ("Kind" = ANY (ARRAY['text','long_text','date','number',
                                'file','choice_one','choice_many']))

   Written out here because I guessed three of them wrong first time —
   document, choice and multi, where the database says file, choice_one
   and choice_many — and a rejected value is not a visible failure in a
   dropdown: the save fails, the list springs back, and it reads as a
   control that does nothing.

   If a kind is ever added, it goes in the constraint and here, and the
   check beside this file compares the two. */
const TYPES = [
  ["text", "Short text"],
  ["long_text", "Long text"],
  ["number", "Number"],
  ["date", "Date"],
  ["file", "Document"],
  ["choice_one", "One choice"],
  ["choice_many", "Several choices"],
];

/* One sheet per audience, which is how the existing form table already
   describes itself. */
const AUDIENCES = ["", "developer", "dno", "idno"];

/* The kinds that have answers to list. */
const HAS_OPTIONS = (t) => t === "choice_one" || t === "choice_many";


/* ── This screen's own layout ──

   `gs-grid` was borrowed from the GIS Styles admin, and that CSS is
   injected by THAT component when it renders: with it unmounted the
   rules do not exist, so every control here stacked with no grid and
   no spacing. The same trap as the section dialogue earlier \u2014 a class
   defined inside another component's stylesheet is not a shared class.

   Room between things, deliberately. A sheet is edited by reading down
   it, and rows of controls with no air between them read as one
   run-on: which help text belongs to which question stops being
   obvious, which is the only thing this screen has to get right. */
const CSS = `
.ef-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 14px 16px; align-items: end; }
.ef-grid .fld { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.ef-grid .fld > label { font: 700 10.5px inherit; color: var(--muted);
  text-transform: uppercase; letter-spacing: .04em; }
.ef-grid input, .ef-grid select { width: 100%; }

/* A section: a card with room inside it, and clear space to the next. */
.ef-section { border: 1px solid var(--border); border-radius: 10px;
  padding: 16px 18px 18px; margin-bottom: 22px; background: var(--white); }
.ef-section-head { margin-bottom: 14px; }

/* ── Tabs, one per section ── */
.ef-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0 14px;
  border-bottom: 1px solid var(--border); padding-bottom: 8px; }
.ef-tab { border: 1px solid var(--border); background: var(--white); border-radius: 8px;
  padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; color: var(--text);
  display: inline-flex; align-items: center; gap: 8px; }
.ef-tab.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.ef-tab.dragging { opacity: .5; }
.ef-tab-n { font-size: 11px; opacity: .7; }
.ef-tab-end { border: 1px dashed var(--border); border-radius: 8px; padding: 6px 12px;
  font-size: 12px; color: var(--muted); }
/* ── Dragging a question ── */
.ef-handle { cursor: grab; user-select: none; color: var(--muted); font-size: 18px;
  line-height: 1; float: left; margin: 2px 10px 0 -4px; }
.ef-handle:active { cursor: grabbing; }
.ef-question.dragging { opacity: .45; }
.ef-question.over { box-shadow: inset 0 3px 0 var(--accent); }
.ef-drop-end { border: 1px dashed var(--border); border-radius: 8px; padding: 10px;
  text-align: center; font-size: 12px; color: var(--muted); margin-top: 10px; }
.ef-drop-end.over { border-color: var(--accent); color: var(--accent); }

/* A question inside a section. The rule above it is what separates one
   question from the next; the padding is what stops the rule reading as
   part of the question below it. */
.ef-question { border-top: 1px solid var(--border); padding-top: 16px;
  margin-top: 16px; }
.ef-question .fe-check { margin-top: 12px; }

/* The answers of a choice question, indented so they read as belonging
   to it rather than as more questions. */
.ef-options { margin: 12px 0 0 14px; padding-left: 14px;
  border-left: 2px solid var(--border); display: grid; gap: 12px; }

/* The error stays in view. A save rejected by the database is reported
   at the top of the pane, and somebody editing the twentieth question
   is nowhere near the top: the dropdown springs back, no message is
   visible, and it reads as a control that does nothing \u2014 which is
   exactly how a wrong value in TYPES was reported. */
.ef-error { position: sticky; top: 8px; z-index: 5; }

.ef-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
.ef-toolbar { display: flex; gap: 10px; flex-wrap: wrap; margin: 14px 0 22px; }
`;

export default function EnquiryFormsAdmin() {
  const [forms, setForms] = useState([]);
  const [formId, setFormId] = useState("");
  const [questions, setQuestions] = useState([]);
  const [options, setOptions] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [f, q, o] = await Promise.all([
        adminList("Enquiry_Form"),
        adminList("Enquiry_Question"), adminList("Enquiry_Option"),
      ]);
      setForms(f.rows || []);
      setQuestions(q.rows || []);
      setOptions(o.rows || []);
      setError("");
    } catch (e) {
      /* Said, not swallowed: an empty screen and a refused request look
         identical, and only one of them is somebody's fault. */
      setError(e.message);
    }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!formId && forms.length) {
      setFormId(String((forms.find((f) => f.Is_Live) || forms[0]).Enquiry_Form_ID));
    }
  }, [forms, formId]);

  const form = forms.find((f) => String(f.Enquiry_Form_ID) === String(formId));

  /* The sheet, in the order it reads. Everything below works from this
     one arrangement, so what the editor shows and what a developer
     would see cannot come apart. */
  /* The sheet, in the order it reads.

     Questions belong to the FORM and carry their section as text, so
     the grouping is done here rather than read from a table. Order is
     Sort_Order throughout, and the sections appear in the order their
     first question does — which is what somebody means when they put a
     question in a section and move it up. */
  const sheet = useMemo(() => {
    const mine = questions
      .filter((q) => String(q.Enquiry_Form_ID) === String(formId))
      .filter((q) => q.Is_Active !== false)
      .sort((a, b) => (a.Sort_Order ?? 0) - (b.Sort_Order ?? 0))
      .map((q) => ({
        ...q,
        options: options
          .filter((o) => String(o.Enquiry_Question_ID) === String(q.Enquiry_Question_ID))
          .filter((o) => o.Is_Active !== false)
          .sort((a, b) => (a.Sort_Order ?? 0) - (b.Sort_Order ?? 0)),
      }));

    const groups = [];
    for (const q of mine) {
      const title = q.Section || "Questions";
      let g = groups.find((x) => x.title === title);
      if (!g) { g = { title, questions: [] }; groups.push(g); }
      g.questions.push(q);
    }
    return groups;
  }, [questions, options, formId]);

  /* Every question in reading order, for the jump lists. A jump may
     only go FORWARD, so each list holds what comes after that question
     and nothing else \u2014 which makes a loop unrepresentable rather than
     detectable. */
  const inOrder = useMemo(
    () => sheet.flatMap((g) => g.questions.map((q) => ({ ...q, group: g }))),
    [sheet],
  );
  const laterThan = (questionId) => {
    const i = inOrder.findIndex((q) =>
      String(q.Enquiry_Question_ID) === String(questionId));
    return i < 0 ? [] : inOrder.slice(i + 1);
  };

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); await load(); setError(""); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const addForm = () => run(async () => {
    const created = await adminCreate("Enquiry_Form", {
      Form_Name: "New enquiry sheet", Version: 1, Is_Live: false,
    });
    const id = created?.row?.Enquiry_Form_ID ?? created?.Enquiry_Form_ID;
    if (id) setFormId(String(id));
  });

  const publish = () => run(async () => {
    /* One current sheet per utility. The others of that utility are
       stood down first, so "which sheet does a developer get" has one
       answer rather than the newest row winning by accident. */
    const sameAudience = forms.filter((f) =>
      (f.Audience || "") === (form?.Audience || "")
      && String(f.Enquiry_Form_ID) !== String(formId) && f.Is_Live);
    for (const f of sameAudience) {
      await adminUpdate("Enquiry_Form", f.Enquiry_Form_ID, { Is_Live: false });
    }
    await adminUpdate("Enquiry_Form", formId, { Is_Live: true });
  });

  const newVersion = () => run(async () => {
    /* A copy, not an edit. The live sheet keeps answering enquiries
       while the next one is written.

       Note this design does not NEED versions to keep old answers
       readable — Enquiry_Answer snapshots Question_Text, so a
       submitted enquiry reads in its own words whatever happens here.
       A version is for working on a sheet without disturbing the one
       in use. */
    const created = await adminCreate("Enquiry_Form", {
      Form_Name: form?.Form_Name ?? "Enquiry sheet",
      Audience: form?.Audience ?? null,
      Version: (Number(form?.Version) || 1) + 1,
      Is_Live: false,
    });
    const newId = created?.row?.Enquiry_Form_ID ?? created?.Enquiry_Form_ID;
    if (!newId) throw new Error("The new version was not created.");

    /* Questions first, then options, then the jumps — a jump points at
       a question that has to exist. The map from old id to new is what
       keeps a copied jump inside the copy rather than pointing back at
       the sheet it came from. */
    const qMap = new Map();
    for (const g of sheet) {
      for (const q of g.questions) {
        const cq = await adminCreate("Enquiry_Question", {
          Enquiry_Form_ID: newId, Section: q.Section, Question: q.Question,
          Help_Text: q.Help_Text, Kind: q.Kind, Is_Required: q.Is_Required,
          Sort_Order: q.Sort_Order, Is_Active: true,
        });
        qMap.set(String(q.Enquiry_Question_ID),
          cq?.row?.Enquiry_Question_ID ?? cq?.Enquiry_Question_ID);
      }
    }
    for (const g of sheet) {
      for (const q of g.questions) {
        if (q.Next_Question_ID) {
          await adminUpdate("Enquiry_Question", qMap.get(String(q.Enquiry_Question_ID)),
            { Next_Question_ID: qMap.get(String(q.Next_Question_ID)) ?? null });
        }
        for (const o of q.options) {
          await adminCreate("Enquiry_Option", {
            Enquiry_Question_ID: qMap.get(String(q.Enquiry_Question_ID)),
            Label: o.Label, Sort_Order: o.Sort_Order, Is_Active: true,
            Ends_Form: o.Ends_Form ?? false,
            Next_Question_ID: o.Next_Question_ID
              ? qMap.get(String(o.Next_Question_ID)) ?? null : null,
          });
        }
      }
    }
    setFormId(String(newId));
  });

  /* A section is the text on a question, so adding one means adding a
     question that carries it. There is nothing to create on its own,
     and a section with no questions in it would have nowhere to live. */
  const addSection = () => run(async () => {
    await adminCreate("Enquiry_Question", {
      Enquiry_Form_ID: formId, Section: "New section",
      Question: "New question", Kind: "text", Is_Required: false,
      Is_Active: true, Sort_Order: (inOrder.length + 1) * 10,
    });
    /* Open the tab that was just made, or the new section is a tab
       at the end of the strip somebody has to notice. */
    setActiveTab("New section");
  });

  const addQuestion = (g) => run(() => adminCreate("Enquiry_Question", {
    Enquiry_Form_ID: formId, Section: g.title, Question: "New question",
    Kind: "text", Is_Required: false, Is_Active: true,
    Sort_Order: (inOrder.length + 1) * 10,
  }));

  const addOption = (q) => run(() => adminCreate("Enquiry_Option", {
    Enquiry_Question_ID: q.Enquiry_Question_ID, Label: "New answer",
    Sort_Order: (q.options.length + 1) * 10,
  }));

  const saveQ = (q, patch) =>
    run(() => adminUpdate("Enquiry_Question", q.Enquiry_Question_ID, patch));
  const saveO = (o, patch) =>
    run(() => adminUpdate("Enquiry_Option", o.Enquiry_Option_ID, patch));

  /* ── Which section is open, and what is being dragged ──

     `activeTitle` is the tab. It is a title rather than an index
     because a rename changes the title and the tab has to follow it,
     and because a section deleted from the middle must not leave the
     tab pointing at whatever slid into its place. */
  const [activeTitle, setActiveTab] = useState(null);
  const [dragQ, setDragQ] = useState(null);
  const [overQ, setOverQ] = useState(null);
  const [dragTab, setDragTab] = useState(null);

  const active = sheet.find((g) => g.title === activeTitle) ?? sheet[0] ?? null;

  /* Writes the numbers a reorder produced. Sequential rather than
     parallel, because the admin endpoint is one row at a time and
     forty parallel updates against one sheet is a way to find out
     how PostgREST queues. Only the changed rows come here. */
  const applyOrder = (writes) => run(async () => {
    for (const w of writes) {
      await adminUpdate("Enquiry_Question", w.id, { Sort_Order: w.Sort_Order });
    }
  });

  const reorderQuestion = (questionId, beforeId) => {
    const { writes } = moveQuestion(sheet, questionId, beforeId);
    if (writes.length) applyOrder(writes);
  };

  const reorderSection = (title, beforeTitle) => {
    const { writes } = moveSection(sheet, title, beforeTitle);
    if (writes.length) applyOrder(writes);
  };

  const moveQuestionTo = (q, title) => run(async () => {
    await adminUpdate("Enquiry_Question", q.Enquiry_Question_ID, { Section: title });
    const { writes } = moveToSection(sheet, q.Enquiry_Question_ID, title);
    for (const w of writes) {
      await adminUpdate("Enquiry_Question", w.id, { Sort_Order: w.Sort_Order });
    }
    setActiveTab(title);
  });

  /* Retired, not deleted, like a single question: answers somebody
     has already given point at these rows. */
  const deleteQuestion = (q) => {
    if (!window.confirm(`Delete "${q.Question || "this question"}"?`)) return;
    saveQ(q, { Is_Active: false });
  };

  const deleteSection = (g) => {
    const n = g.questions.length;
    if (!window.confirm(`Delete the section "${g.title}" and the ${n} question${n === 1 ? "" : "s"} in it?`)) return;
    run(async () => {
      for (const q of g.questions) {
        await adminUpdate("Enquiry_Question", q.Enquiry_Question_ID, { Is_Active: false });
      }
      setActiveTab(null);
    });
  };
  /* Renaming a section renames it on every question that carries it:
     the section IS the text, so there is nothing else to change. */
  const renameSection = (g, title) => run(async () => {
    for (const q of g.questions) {
      await adminUpdate("Enquiry_Question", q.Enquiry_Question_ID, { Section: title });
    }
    /* The tab is the name, so it moves with it. Without this the
       rename landed on no tab at all and the first section opened. */
    setActiveTab(title);
  });

  return (
    <div className="admin-pane">
      <style>{CSS}</style>
      <h2>Enquiry Sheets</h2>
      <p className="hint">
        What a developer is asked when they start an enquiry. One sheet per
        utility, each a version: editing changes what people are asked from
        now on, while an enquiry already submitted keeps the wording it was
        answered against.
      </p>

      {error && <div className="banner error ef-error">{error}</div>}

      <div className="ef-grid">
        <div className="fld">
          <label htmlFor="ef-form">Sheet</label>
          <select id="ef-form" value={formId} onChange={(e) => setFormId(e.target.value)}>
            {forms.map((f) => (
              <option key={f.Enquiry_Form_ID} value={f.Enquiry_Form_ID}>
                {f.Form_Name} {f.Audience ? `\u00b7 ${f.Audience}` : ""} {"\u00b7"} v{f.Version}
                {f.Is_Live ? " (live)" : ""}
              </option>
            ))}
          </select>
        </div>

        {form && (
          <>
            <div className="fld">
              <label htmlFor="ef-name">Name</label>
              <input id="ef-name" value={form.Form_Name || ""}
                onChange={(e) => run(() => adminUpdate("Enquiry_Form",
                  formId, { Form_Name: e.target.value }))} />
            </div>
            <div className="fld">
              <label htmlFor="ef-util">Audience</label>
              <select id="ef-util" value={form.Audience || ""}
                onChange={(e) => run(() => adminUpdate("Enquiry_Form",
                  formId, { Audience: e.target.value || null }))}>
                {AUDIENCES.map((u) => (
                  <option key={u} value={u}>{u || "Any"}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      <div className="ef-toolbar">
        <button className="btn ghost" disabled={busy} onClick={addForm}>New sheet</button>
        {form && !form.Is_Live && (
          <button className="btn accent" disabled={busy} onClick={publish}>
            Make this the live sheet
          </button>
        )}
        {form && (
          <button className="btn ghost" disabled={busy} onClick={newVersion}>
            Copy to a new version
          </button>
        )}
      </div>

      {!form ? (
        <p className="hint">No sheet yet. Make one to start.</p>
      ) : (
        <>
          {/* ── One tab per section ──

              A sheet of thirty questions in six sections was one long
              scroll, and the section somebody was working on was
              wherever they had scrolled to. Each section is a tab
              now; the tab reads the section's name and follows a
              rename, because the tab IS the name.

              Tabs drag to reorder the sections. Sections have no
              order of their own — they appear in the order their
              first question does — so a tab moved is every question
              renumbered so the walk comes out that way. */}
          <div className="ef-tabs" role="tablist">
            {sheet.map((g) => (
              <button key={g.title} type="button" role="tab"
                className={"ef-tab" + (g.title === activeTitle ? " on" : "")
                  + (dragTab === g.title ? " dragging" : "")}
                aria-selected={g.title === activeTitle}
                draggable={!busy}
                onClick={() => setActiveTab(g.title)}
                onDragStart={(e) => { setDragTab(g.title); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { if (dragTab) e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); if (dragTab && dragTab !== g.title) reorderSection(dragTab, g.title); setDragTab(null); }}
                onDragEnd={() => setDragTab(null)}>
                {g.title}
                <span className="ef-tab-n">{g.questions.length}</span>
              </button>
            ))}
            {/* A drop zone past the last tab, so a section can be
                dragged to the end and not only in front of another. */}
            {dragTab && (
              <span className="ef-tab-end"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); reorderSection(dragTab, null); setDragTab(null); }}>
                to end
              </span>
            )}
          </div>

          {active && (
            <div className="ef-section" key={active.title}>
              <div className="ef-grid">
                <div className="fld" style={{ gridColumn: "span 2" }}>
                  <label htmlFor={`sec-${active.title}`}>Section</label>
                  {/* Renaming renames every question that carries the
                      name, and the tab follows on the next render
                      because the tab is the name. `activeTitle` is
                      moved with it, or the rename would land you on
                      no tab at all. */}
                  <input id={`sec-${active.title}`} defaultValue={active.title}
                    onBlur={(e) => e.target.value && e.target.value !== active.title
                      && renameSection(active, e.target.value)} />
                </div>
                <div className="fld">
                  <label>&nbsp;</label>
                  {/* ── Deleting a section ──

                      A section is the text on its questions, so
                      deleting it is retiring every question in it —
                      retiring, not deleting, for the same reason a
                      single question is: answers somebody has already
                      given point at these rows. Confirmed with the
                      count, because "delete section" on a tab of
                      twelve questions is twelve things gone. */}
                  <button className="btn delete" disabled={busy}
                    onClick={() => deleteSection(active)}>
                    Delete section
                  </button>
                </div>
              </div>

              {active.questions.map((q) => (
                <div key={q.Enquiry_Question_ID}
                  className={"ef-question" + (dragQ === q.Enquiry_Question_ID ? " dragging" : "")
                    + (overQ === q.Enquiry_Question_ID ? " over" : "")}
                  onDragOver={(e) => { if (dragQ) { e.preventDefault(); setOverQ(q.Enquiry_Question_ID); } }}
                  onDragLeave={() => setOverQ((v) => (v === q.Enquiry_Question_ID ? null : v))}
                  onDrop={(e) => { e.preventDefault(); if (dragQ) reorderQuestion(dragQ, q.Enquiry_Question_ID); setDragQ(null); setOverQ(null); }}>
                  {/* ── The handle ──

                      Drag it to put the question where it goes. This
                      replaces the Order box, which asked somebody to
                      know what the neighbours were numbered and pick
                      something in between. The handle is the only
                      draggable part, so selecting text in the
                      question box does not start a drag. */}
                  <span className="ef-handle" title="Drag to reorder" draggable={!busy}
                    onDragStart={(e) => { setDragQ(q.Enquiry_Question_ID); e.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => { setDragQ(null); setOverQ(null); }}>
                    ⠇
                  </span>
                  <div className="ef-grid">
                    <div className="fld" style={{ gridColumn: "span 2" }}>
                      <label htmlFor={`q-${q.Enquiry_Question_ID}`}>Question</label>
                      <input id={`q-${q.Enquiry_Question_ID}`} defaultValue={q.Question || ""}
                        onBlur={(e) => e.target.value !== q.Question
                          && saveQ(q, { Question: e.target.value })} />
                    </div>
                    <div className="fld">
                      <label htmlFor={`qt-${q.Enquiry_Question_ID}`}>Answer</label>
                      <select id={`qt-${q.Enquiry_Question_ID}`} value={q.Kind || "text"}
                        onChange={(e) => saveQ(q, { Kind: e.target.value })}>
                        {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </div>
                    {/* Into another section, at its end. Dragging across
                        tabs would need both on screen; a list of the
                        sections is what somebody expects when the tabs
                        are the sections. */}
                    <div className="fld">
                      <label htmlFor={`qs-${q.Enquiry_Question_ID}`}>Move to</label>
                      <select id={`qs-${q.Enquiry_Question_ID}`} value={active.title}
                        onChange={(e) => e.target.value !== active.title
                          && moveQuestionTo(q, e.target.value)}>
                        {sheet.map((g) => (
                          <option key={g.title} value={g.title}>{g.title}</option>
                        ))}
                      </select>
                    </div>
                    <div className="fld" style={{ gridColumn: "span 2" }}>
                      <label htmlFor={`qh-${q.Enquiry_Question_ID}`}>Help text</label>
                      <input id={`qh-${q.Enquiry_Question_ID}`} defaultValue={q.Help_Text || ""}
                        onBlur={(e) => e.target.value !== (q.Help_Text || "")
                          && saveQ(q, { Help_Text: e.target.value || null })} />
                    </div>
                    {/* Where this QUESTION goes when the answer implies
                        no jump of its own. Later questions only. */}
                    <div className="fld">
                      <label htmlFor={`qn-${q.Enquiry_Question_ID}`}>Then go to</label>
                      <select id={`qn-${q.Enquiry_Question_ID}`}
                        value={q.Next_Question_ID ?? ""}
                        onChange={(e) => saveQ(q, {
                          Next_Question_ID: e.target.value || null })}>
                        <option value="">The next question</option>
                        {laterThan(q.Enquiry_Question_ID).map((n) => (
                          <option key={n.Enquiry_Question_ID} value={n.Enquiry_Question_ID}>
                            {n.group.title}: {n.Question}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <label className="fe-check">
                    <input type="checkbox" checked={!!q.Is_Required}
                      onChange={(e) => saveQ(q, { Is_Required: e.target.checked })} />
                    Must be answered
                  </label>

                  {HAS_OPTIONS(q.Kind) && (
                    <div className="ef-options">
                      {q.options.map((o) => (
                        <div key={o.Enquiry_Option_ID} className="ef-grid">
                          <div className="fld">
                            <label htmlFor={`o-${o.Enquiry_Option_ID}`}>Answer</label>
                            <input id={`o-${o.Enquiry_Option_ID}`} defaultValue={o.Label || ""}
                              onBlur={(e) => e.target.value !== o.Label
                                && saveO(o, { Label: e.target.value })} />
                          </div>
                          <div className="fld">
                            <label htmlFor={`oj-${o.Enquiry_Option_ID}`}>Then go to</label>
                            <select id={`oj-${o.Enquiry_Option_ID}`}
                              value={o.Ends_Form ? "end" : (o.Next_Question_ID ?? "")}
                              onChange={(e) => saveO(o, e.target.value === "end"
                                ? { Ends_Form: true, Next_Question_ID: null }
                                : { Ends_Form: false,
                                  Next_Question_ID: e.target.value || null })}>
                              <option value="">The next question</option>
                              {laterThan(q.Enquiry_Question_ID).map((n) => (
                                <option key={n.Enquiry_Question_ID}
                                  value={n.Enquiry_Question_ID}>
                                  {n.group.title}: {n.Question}
                                </option>
                              ))}
                              {/* An answer that finishes the sheet: "no,
                                  we have no site yet" ends it rather
                                  than walking somebody through thirty
                                  questions that cannot apply. */}
                              <option value="end">End the form</option>
                            </select>
                          </div>
                          <div className="fld">
                            <label htmlFor={`od-${o.Enquiry_Option_ID}`}>&nbsp;</label>
                            <button className="btn ghost" id={`od-${o.Enquiry_Option_ID}`}
                              disabled={busy}
                              onClick={() => run(() => adminUpdate("Enquiry_Option",
                                o.Enquiry_Option_ID, { Is_Active: false }))}>Remove</button>
                          </div>
                        </div>
                      ))}
                      <button className="btn ghost" disabled={busy}
                        onClick={() => addOption(q)}>Add an answer</button>
                    </div>
                  )}

                  {/* Retired, not deleted: an answer somebody has already
                      given points at this question. */}
                  <button className="btn delete sm" style={{ marginTop: 6 }} disabled={busy}
                    onClick={() => deleteQuestion(q)}>Delete question</button>
                </div>
              ))}

              {/* Past the last question, so one can be dragged to the
                  end and not only in front of another. */}
              {dragQ && (
                <div className={"ef-drop-end" + (overQ === "__end" ? " over" : "")}
                  onDragOver={(e) => { e.preventDefault(); setOverQ("__end"); }}
                  onDrop={(e) => { e.preventDefault(); reorderQuestion(dragQ, null); setDragQ(null); setOverQ(null); }}>
                  Drop here to put it last
                </div>
              )}

              <div className="ef-actions">
                <button className="btn ghost" disabled={busy}
                  onClick={() => addQuestion(active)}>Add a question</button>
              </div>
            </div>
          )}

          <button className="btn accent" disabled={busy} onClick={addSection}>
            Add a section
          </button>
        </>
      )}
    </div>
  );
}
