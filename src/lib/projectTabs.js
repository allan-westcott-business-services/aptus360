/* The project page's tabs, and the two things that decide which show.

   Lifted out of ProjectDetail.jsx so the admin screen that configures
   visibility and the page that obeys it read one list. Two copies would
   drift, and the symptom — a tab you can tick but never see, or one you
   can see but never hide — reads as the setting not working.

   ── Two filters, doing different jobs ──

   Stage is a fact about the record: a tender has no call-offs, so the
   tab has nothing to show and is not offered. That lives here, in code.

   Section is a preference: Operations could show outline designs, it
   just doesn't want to. That lives in the Project_Tab_Visibility table
   (0138) and is editable under Admin, because it is housekeeping rather
   than a rule, and housekeeping should not need a deploy.

   The two combine by intersection, and section can only take away. A
   section asking for Call-offs on a tender project still doesn't get
   one, because there is nothing behind it. */

export const TABS = [
  { id: "details", label: "Details", stages: ["tender", "contract"] },
  { id: "stakeholder", label: "Stakeholders", stages: ["tender", "contract"] },
  { id: "plots", label: "Plots", stages: ["tender", "contract"] },
  { id: "nrs", label: "Non-Res Supplies", stages: ["tender", "contract"] },
  { id: "poc", label: "POC Applications", stages: ["tender"] },
  /* Tender stage only, and sits beside POC Applications because the
     legal work is what the application waits on — wayleaves, easements
     and land agreements are the usual reason a point of connection
     stalls. */
  { id: "legal", label: "Legal", stages: ["tender"] },
  { id: "designs", label: "Outline Designs", stages: ["tender"] },
  { id: "av", label: "Asset Value", stages: ["tender", "contract"] },
  { id: "contract-designs", label: "Detailed Designs", stages: ["contract"] },
  { id: "calloffs", label: "Call-offs", stages: ["contract"] },
  /* Invoices sits next to the designs it bills for, rather than at the
     far end after History and Comments. */
  { id: "invoices", label: "Invoices", stages: ["tender", "contract"] },
  { id: "history", label: "History", stages: ["tender", "contract"] },
  { id: "comments", label: "Comments", stages: ["tender", "contract"] },
];

export const STAGES = [
  { id: "tender", label: "Tender" },
  { id: "contract", label: "Contract" },
];

/* Always shown, whatever is stored.

   Hiding everything would otherwise leave a section able to open a
   project and find no tabs at all — a dead end reached by ticking
   boxes, with nothing on screen to say what happened or how to undo it.
   The admin screen shows this one as fixed for the same reason. */
export const PINNED_TAB = "details";

export const tabsForStage = (stage) => TABS.filter((t) => t.stages.includes(stage));

/* Which stages a section offers.

   Same rule as the tabs: a stage with no row is shown, so a section
   nobody has configured behaves as it always did.

   A section that has hidden every stage gets all of them back. Unlike
   the tabs there is no pinned stage to fall back on, and a project page
   with no stage has nothing to render at all — so the setting refuses
   to apply rather than producing a dead end. */
export function visibleStages(areaKey, rows) {
  if (!areaKey) return STAGES;
  const shown = STAGES.filter((sg) => {
    const row = (rows || []).find((r) =>
      r.Area_Key === areaKey && r.Stage_Key === sg.id);
    return !row || row.Is_Visible !== false;
  });
  return shown.length ? shown : STAGES;
}

/* The stage to actually show. Honours what was remembered for this
   project where the section allows it, and otherwise falls back to the
   section's first stage — somebody who last looked at a project in
   Tendering & Design must not land on a Tender view in Operations,
   where Tender does not exist. */
export function resolveStage(preferred, areaKey, rows) {
  const allowed = visibleStages(areaKey, rows);
  return allowed.some((sg) => sg.id === preferred) ? preferred : allowed[0].id;
}

/* Hidden means a row exists saying so. A tab with no row is shown, so a
   tab added by a later release turns up everywhere rather than nowhere,
   and a section nobody has configured behaves as it always did. */
export function isHidden(rows, areaKey, tabId) {
  if (tabId === PINNED_TAB) return false;
  const row = (rows || []).find((r) =>
    r.Area_Key === areaKey && r.Tab_Key === tabId);
  return !!row && row.Is_Visible === false;
}

/* The tabs to show: in this stage, and not hidden for this section.

   With no area — the page opened outside any section, which the shell
   does not currently do but might — the stage rule alone applies. */
export function visibleTabs(stage, areaKey, rows) {
  return tabsForStage(stage)
    .filter((t) => !areaKey || !isHidden(rows, areaKey, t.id));
}
