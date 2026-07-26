/* The six design scopes. Mirrors the Utility lookup table exactly —
   confirmed against the database, not inferred from application code. */
export const UTILITIES = [
  { id: 1, name: "Electric", icon: "\u26A1", colour: "#f59e0b", group: "Residential" },
  { id: 2, name: "Gas", icon: "\uD83D\uDD25", colour: "#10b981", group: "Residential" },
  { id: 3, name: "Water", icon: "\uD83D\uDCA7", colour: "#3b82f6", group: "Residential" },
  { id: 4, name: "Section 38 On Site", icon: "\uD83C\uDFE0", colour: "#7c3aed", group: "Street Lighting" },
  { id: 5, name: "Section 278 Off Site", icon: "\uD83D\uDEE3\uFE0F", colour: "#4f46e5", group: "Street Lighting" },
  { id: 6, name: "Private Street Lighting", icon: "\uD83D\uDD06", colour: "#a78bfa", group: "Street Lighting" },
];

export const SCOPE_GROUPS = ["Residential", "Street Lighting"];
export const STREET_LIGHTING_IDS = [4, 5, 6];

export const utilityById = (id) => UTILITIES.find((u) => u.id === +id);

/* Quote type helpers. Budget means no designs at all, which is the only
   behaviour Quote_Type still genuinely drives — see open item 3. */
export const QUOTE_TYPE = { FULL: 1, BUDGET: 2, STREET_LIGHTING: 3 };
export const isBudget = (id) => +id === QUOTE_TYPE.BUDGET;
export const isStreetLightingOnly = (id) => +id === QUOTE_TYPE.STREET_LIGHTING;
