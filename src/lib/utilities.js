/* The six design scopes. Mirrors the Utility lookup table exactly —
   confirmed against the database, not inferred from application code. */
export const UTILITIES = [
  /* The variation selector is doing real work here.

     U+26A1 on its own has a text presentation in several fonts, so it
     renders as a flat outline rather than the yellow bolt — and next to
     the flame and the droplet, which are emoji-only codepoints and
     always coloured, it looks like a different kind of thing
     altogether. U+FE0F asks for the emoji form explicitly.

     Gas and water need no selector: their codepoints have no text
     form to fall back to. */
  { id: 1, name: "Electric", icon: "\u26A1\uFE0F", colour: "#f59e0b", group: "Residential" },
  { id: 2, name: "Gas", icon: "\uD83D\uDD25", colour: "#10b981", group: "Residential" },
  { id: 3, name: "Water", icon: "\uD83D\uDCA7", colour: "#3b82f6", group: "Residential" },
  { id: 4, name: "Section 38 On Site", icon: "\uD83C\uDFE0", colour: "#7c3aed", group: "Street Lighting" },
  { id: 5, name: "Section 278 Off Site", icon: "\uD83D\uDEE3\uFE0F", colour: "#4f46e5", group: "Street Lighting" },
  { id: 6, name: "Private Street Lighting", icon: "\uD83D\uDD06", colour: "#a78bfa", group: "Street Lighting" },
];

export const SCOPE_GROUPS = ["Residential", "Street Lighting"];
export const STREET_LIGHTING_IDS = [4, 5, 6];

/* The utilities a dwelling is actually connected to. Street lighting is
   laid on the same site but has no plot, no meter and no connection
   record — it's tracked separately, so it shouldn't appear anywhere
   those things are being filtered. Derived from the group rather than a
   second list of ids, so adding a utility only needs editing once. */
export const RESIDENTIAL_UTILITIES = UTILITIES.filter((u) => u.group === "Residential");
export const RESIDENTIAL_UTILITY_IDS = RESIDENTIAL_UTILITIES.map((u) => u.id);
export const isResidentialUtility = (id) => RESIDENTIAL_UTILITY_IDS.includes(+id);

export const utilityById = (id) => UTILITIES.find((u) => u.id === +id);

/* Quote type helpers. Budget means no designs at all, which is the only
   behaviour Quote_Type still genuinely drives — see open item 3. */
export const QUOTE_TYPE = { FULL: 1, BUDGET: 2, STREET_LIGHTING: 3 };
export const isBudget = (id) => +id === QUOTE_TYPE.BUDGET;
export const isStreetLightingOnly = (id) => +id === QUOTE_TYPE.STREET_LIGHTING;

/* Which of a project's utilities a non-residential supply takes.

   The supply names Utility_IDs; the project's utilities come from
   gis_project_utilities and carry layer_key and utility. Those are two
   different shapes of the same idea, and joining them was inline in the
   canvas until it went wrong there.

   ── Why by name ──

   The RPC is one of the migrations that were run and never committed,
   so what columns it returns cannot be read anywhere in this repo. The
   first version of this filtered on a Utility_ID it does not return,
   which meant every supply resolved to no utilities: placing one put a
   seed down and then stopped, with nothing on screen to say why.

   So the id is used where a row happens to carry one and the name is
   the fallback that works today. If the RPC is ever recovered and does
   return an id, this needs no change — it will simply take the better
   branch.

   Kept here rather than in the canvas so it can be tested without
   mounting anything, which is the only reason the fault above was
   invisible: there was nothing to run against it. */
export function utilitiesTakenBy(rec, projectUtilities = []) {
  const ids = (rec?.Utility_IDs || []).map(Number).filter(Number.isFinite);
  if (!ids.length) return [];
  const names = new Set(ids.map((id) => utilityById(id)?.name?.toLowerCase()).filter(Boolean));
  return projectUtilities.filter((u) => {
    const rowId = u.Utility_ID ?? u.utility_id;
    if (rowId != null) return ids.includes(Number(rowId));
    return names.has(String(u.utility ?? "").toLowerCase());
  });
}
