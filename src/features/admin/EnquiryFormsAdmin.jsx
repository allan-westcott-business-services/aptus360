/* The enquiry sheet: what a developer is asked, and in what order.

   One sheet per utility, each a VERSION. Editing a question edits the
   version somebody is filling in today; an enquiry already submitted
   keeps the version it answered, which is why 0225 versions forms
   rather than editing in place.

   ── What this screen is for ──

   Somebody who knows what to ask, changing what is asked, without a
   deploy. So it is arranged the way the sheet reads — sections, then
   questions inside them — rather than as three tables to join up in
   your head.

   ── Branching ──

   A jump belongs to the ANSWER: "if they say Yes, go to question 5".
   So the jump is set on the option, in the row where that answer is
   written, rather than in a rules table somewhere else on the page.

   Forward only, and the list of places to jump to says so by
   containing only what comes after. A form that can jump backwards can
   loop, and a loop in a form somebody is filling in is a trap with no
   way out — cheaper to make impossible here than to detect later. */

import { useEffect, useMemo, useState } from "react";
import { adminList, adminCreate, adminUpdate, adminDelete } from "../../api/admin.js";

const TYPES = [
  ["text", "Short text"],
  ["long_text", "Long text"],
  ["number", "Number"],
  ["date", "Date"],
  ["document", "Document"],
  ["choice", "One choice"],
  ["multi", "Several choices"],
];

const UTILITIES = ["", "electric", "gas", "water", "multi"];

const HAS_OPTIONS = (t) => t === "choice" || t === "multi";

export default function EnquiryFormsAdmin() {
  const [forms, setForms] = useState([]);
  const [formId, setFormId] = useState("");
  const [sections, setSections] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [options, setOptions] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [f, s, q, o] = await Promise.all([
        adminList("Enquiry_Form"), adminList("Enquiry_Section"),
        adminList("Enquiry_Question"), adminList("Enquiry_Option"),
      ]);
      setForms(f.rows || []);
      setSections(s.rows || []);
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
      setFormId(String((forms.find((f) => f.Is_Current) || forms[0]).Enquiry_Form_ID));
    }
  }, [forms, formId]);

  const form = forms.find((f) => String(f.Enquiry_Form_ID) === String(formId));

  /* The sheet, in the order it reads. Everything below works from this
     one arrangement, so what the editor shows and what a developer
     would see cannot come apart. */
  const sheet = useMemo(() => {
    const mine = sections
      .filter((s) => String(s.Enquiry_Form_ID) === String(formId))
      .sort((a, b) => (a.Sort_Order ?? 0) - (b.Sort_Order ?? 0));
    return mine.map((s) => ({
      ...s,
      questions: questions
        .filter((q) => String(q.Enquiry_Section_ID) === String(s.Enquiry_Section_ID))
        .sort((a, b) => (a.Sort_Order ?? 0) - (b.Sort_Order ?? 0))
        .map((q) => ({
          ...q,
          options: options
            .filter((o) => String(o.Enquiry_Question_ID) === String(q.Enquiry_Question_ID))
            .sort((a, b) => (a.Sort_Order ?? 0) - (b.Sort_Order ?? 0)),
        })),
    }));
  }, [sections, questions, options, formId]);

  /* Every question in reading order, for the jump lists. A jump may
     only go FORWARD, so each list holds what comes after that question
     and nothing else \u2014 which makes a loop unrepresentable rather than
     detectable. */
  const inOrder = useMemo(
    () => sheet.flatMap((s) => s.questions.map((q) => ({ ...q, section: s }))),
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
      Form_Name: "New enquiry sheet", Version: 1, Is_Current: false,
    });
    const id = created?.row?.Enquiry_Form_ID ?? created?.Enquiry_Form_ID;
    if (id) setFormId(String(id));
  });

  const publish = () => run(async () => {
    /* One current sheet per utility. The others of that utility are
       stood down first, so "which sheet does a developer get" has one
       answer rather than the newest row winning by accident. */
    const sameUtility = forms.filter((f) =>
      (f.Utility || "") === (form?.Utility || "")
      && String(f.Enquiry_Form_ID) !== String(formId) && f.Is_Current);
    for (const f of sameUtility) {
      await adminUpdate("Enquiry_Form", f.Enquiry_Form_ID, { Is_Current: false });
    }
    await adminUpdate("Enquiry_Form", formId, { Is_Current: true });
  });

  const newVersion = () => run(async () => {
    /* A copy, not an edit. The live sheet keeps answering enquiries
       while the next one is written, and an enquiry already submitted
       keeps the wording it was answered against. */
    const created = await adminCreate("Enquiry_Form", {
      Form_Name: form?.Form_Name ?? "Enquiry sheet",
      Utility: form?.Utility ?? null,
      Version: (Number(form?.Version) || 1) + 1,
      Is_Current: false,
    });
    const newId = created?.row?.Enquiry_Form_ID ?? created?.Enquiry_Form_ID;
    if (!newId) throw new Error("The new version was not created.");

    /* Sections, then questions, then options \u2014 and the jumps LAST,
       because a jump points at a question that has to exist first. The
       map from old id to new is what makes the copied jumps point
       inside the copy rather than back at the original. */
    const qMap = new Map();
    const sMap = new Map();
    for (const s of sheet) {
      const cs = await adminCreate("Enquiry_Section", {
        Enquiry_Form_ID: newId, Title: s.Title, Blurb: s.Blurb,
        Sort_Order: s.Sort_Order,
      });
      const sid = cs?.row?.Enquiry_Section_ID ?? cs?.Enquiry_Section_ID;
      sMap.set(String(s.Enquiry_Section_ID), sid);
      for (const q of s.questions) {
        const cq = await adminCreate("Enquiry_Question", {
          Enquiry_Section_ID: sid, Question: q.Question, Help_Text: q.Help_Text,
          Answer_Type: q.Answer_Type, Is_Required: q.Is_Required,
          Sort_Order: q.Sort_Order,
        });
        qMap.set(String(q.Enquiry_Question_ID),
          cq?.row?.Enquiry_Question_ID ?? cq?.Enquiry_Question_ID);
      }
    }
    for (const s of sheet) {
      for (const q of s.questions) {
        for (const o of q.options) {
          await adminCreate("Enquiry_Option", {
            Enquiry_Question_ID: qMap.get(String(q.Enquiry_Question_ID)),
            Label: o.Label, Sort_Order: o.Sort_Order,
            Next_Question_ID: o.Next_Question_ID
              ? qMap.get(String(o.Next_Question_ID)) ?? null : null,
            Next_Section_ID: o.Next_Section_ID
              ? sMap.get(String(o.Next_Section_ID)) ?? null : null,
          });
        }
      }
    }
    setFormId(String(newId));
  });

  const addSection = () => run(() => adminCreate("Enquiry_Section", {
    Enquiry_Form_ID: formId, Title: "New section",
    Sort_Order: (sheet.length + 1) * 10,
  }));

  const addQuestion = (s) => run(() => adminCreate("Enquiry_Question", {
    Enquiry_Section_ID: s.Enquiry_Section_ID, Question: "New question",
    Answer_Type: "text", Is_Required: false,
    Sort_Order: (s.questions.length + 1) * 10,
  }));

  const addOption = (q) => run(() => adminCreate("Enquiry_Option", {
    Enquiry_Question_ID: q.Enquiry_Question_ID, Label: "New answer",
    Sort_Order: (q.options.length + 1) * 10,
  }));

  const saveQ = (q, patch) =>
    run(() => adminUpdate("Enquiry_Question", q.Enquiry_Question_ID, patch));
  const saveO = (o, patch) =>
    run(() => adminUpdate("Enquiry_Option", o.Enquiry_Option_ID, patch));
  const saveS = (s, patch) =>
    run(() => adminUpdate("Enquiry_Section", s.Enquiry_Section_ID, patch));

  return (
    <div className="admin-pane">
      <h2>Enquiry Sheets</h2>
      <p className="hint">
        What a developer is asked when they start an enquiry. One sheet per
        utility, each a version: editing changes what people are asked from
        now on, while an enquiry already submitted keeps the wording it was
        answered against.
      </p>

      {error && <div className="banner error">{error}</div>}

      <div className="gs-grid">
        <div className="fld">
          <label htmlFor="ef-form">Sheet</label>
          <select id="ef-form" value={formId} onChange={(e) => setFormId(e.target.value)}>
            {forms.map((f) => (
              <option key={f.Enquiry_Form_ID} value={f.Enquiry_Form_ID}>
                {f.Form_Name} {f.Utility ? `\u00b7 ${f.Utility}` : ""} {"\u00b7"} v{f.Version}
                {f.Is_Current ? " (live)" : ""}
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
              <label htmlFor="ef-util">Utility</label>
              <select id="ef-util" value={form.Utility || ""}
                onChange={(e) => run(() => adminUpdate("Enquiry_Form",
                  formId, { Utility: e.target.value || null }))}>
                {UTILITIES.map((u) => (
                  <option key={u} value={u}>{u || "Any"}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, margin: "10px 0 16px", flexWrap: "wrap" }}>
        <button className="btn ghost" disabled={busy} onClick={addForm}>New sheet</button>
        {form && !form.Is_Current && (
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
          {sheet.map((s) => (
            <div key={s.Enquiry_Section_ID}
              style={{ border: "1px solid #e2e8f0", borderRadius: 10,
                padding: "12px 14px", marginBottom: 14 }}>
              <div className="gs-grid">
                <div className="fld">
                  <label htmlFor={`sec-${s.Enquiry_Section_ID}`}>Section</label>
                  <input id={`sec-${s.Enquiry_Section_ID}`} defaultValue={s.Title || ""}
                    onBlur={(e) => e.target.value !== s.Title
                      && saveS(s, { Title: e.target.value })} />
                </div>
                <div className="fld">
                  <label htmlFor={`secb-${s.Enquiry_Section_ID}`}>Blurb</label>
                  <input id={`secb-${s.Enquiry_Section_ID}`} defaultValue={s.Blurb || ""}
                    onBlur={(e) => e.target.value !== (s.Blurb || "")
                      && saveS(s, { Blurb: e.target.value || null })} />
                </div>
                <div className="fld">
                  <label htmlFor={`seco-${s.Enquiry_Section_ID}`}>Order</label>
                  <input id={`seco-${s.Enquiry_Section_ID}`} defaultValue={s.Sort_Order ?? 0}
                    onBlur={(e) => saveS(s, { Sort_Order: Number(e.target.value) || 0 })} />
                </div>
              </div>

              {s.questions.map((q) => (
                <div key={q.Enquiry_Question_ID}
                  style={{ borderTop: "1px solid #f1f5f9", paddingTop: 10, marginTop: 10 }}>
                  <div className="gs-grid">
                    <div className="fld" style={{ gridColumn: "span 2" }}>
                      <label htmlFor={`q-${q.Enquiry_Question_ID}`}>Question</label>
                      <input id={`q-${q.Enquiry_Question_ID}`} defaultValue={q.Question || ""}
                        onBlur={(e) => e.target.value !== q.Question
                          && saveQ(q, { Question: e.target.value })} />
                    </div>
                    <div className="fld">
                      <label htmlFor={`qt-${q.Enquiry_Question_ID}`}>Answer</label>
                      <select id={`qt-${q.Enquiry_Question_ID}`} value={q.Answer_Type}
                        onChange={(e) => saveQ(q, { Answer_Type: e.target.value })}>
                        {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </div>
                    <div className="fld">
                      <label htmlFor={`qo-${q.Enquiry_Question_ID}`}>Order</label>
                      <input id={`qo-${q.Enquiry_Question_ID}`} defaultValue={q.Sort_Order ?? 0}
                        onBlur={(e) => saveQ(q, { Sort_Order: Number(e.target.value) || 0 })} />
                    </div>
                  </div>

                  <label className="fe-check">
                    <input type="checkbox" checked={!!q.Is_Required}
                      onChange={(e) => saveQ(q, { Is_Required: e.target.checked })} />
                    Must be answered
                  </label>

                  {HAS_OPTIONS(q.Answer_Type) && (
                    <div style={{ marginTop: 8 }}>
                      {q.options.map((o) => (
                        <div key={o.Enquiry_Option_ID} className="gs-grid">
                          <div className="fld">
                            <label htmlFor={`o-${o.Enquiry_Option_ID}`}>Answer</label>
                            <input id={`o-${o.Enquiry_Option_ID}`} defaultValue={o.Label || ""}
                              onBlur={(e) => e.target.value !== o.Label
                                && saveO(o, { Label: e.target.value })} />
                          </div>
                          {/* Where this answer leads. Only questions that
                              come AFTER this one are offered, so a jump
                              cannot loop back. */}
                          <div className="fld">
                            <label htmlFor={`oj-${o.Enquiry_Option_ID}`}>Then go to</label>
                            <select id={`oj-${o.Enquiry_Option_ID}`}
                              value={o.Next_Question_ID ?? ""}
                              onChange={(e) => saveO(o, {
                                Next_Question_ID: e.target.value || null,
                              })}>
                              <option value="">The next question</option>
                              {laterThan(q.Enquiry_Question_ID).map((n) => (
                                <option key={n.Enquiry_Question_ID}
                                  value={n.Enquiry_Question_ID}>
                                  {n.section.Title}: {n.Question}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="fld">
                            <label htmlFor={`od-${o.Enquiry_Option_ID}`}>&nbsp;</label>
                            <button className="btn ghost" id={`od-${o.Enquiry_Option_ID}`}
                              disabled={busy}
                              onClick={() => run(() => adminDelete("Enquiry_Option",
                                o.Enquiry_Option_ID))}>Remove</button>
                          </div>
                        </div>
                      ))}
                      <button className="btn ghost" disabled={busy}
                        onClick={() => addOption(q)}>Add an answer</button>
                    </div>
                  )}

                  <button className="btn ghost" style={{ marginTop: 6 }} disabled={busy}
                    onClick={() => run(() => adminDelete("Enquiry_Question",
                      q.Enquiry_Question_ID))}>Remove question</button>
                </div>
              ))}

              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button className="btn ghost" disabled={busy}
                  onClick={() => addQuestion(s)}>Add a question</button>
                <button className="btn ghost" disabled={busy}
                  onClick={() => run(() => adminDelete("Enquiry_Section",
                    s.Enquiry_Section_ID))}>Remove section</button>
              </div>
            </div>
          ))}

          <button className="btn accent" disabled={busy} onClick={addSection}>
            Add a section
          </button>
        </>
      )}
    </div>
  );
}
