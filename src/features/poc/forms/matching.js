/* Which application form a POC needs.

   Each network operator wants its own form, and which one you need is
   decided by the operator on the application rather than by anything
   about the work. A registry rather than a chain of branches: adding a
   fifth operator is a row in FORMS (registry.js), not another `else if`
   buried somewhere.

   ── Matching is deliberately belt-and-braces ──

   Each matcher checks the id first, then falls back to matching the
   operator's name. Ids are exact but have to be filled in once somebody
   confirms them against this database; names are already there. Western
   Power became National Grid Electricity Distribution and the old name
   is still in plenty of records, so the NGED pattern catches both.

   ── One row per operator ──

   This app stores one POC row per operator, so a row carries a single
   DNO_ID and a single IDNO_ID rather than the comma-separated lists the
   original used. A row can still legitimately need two forms — a DNO
   for the connection and an IDNO adopting the network — so matching
   returns a list, not the first hit. */

/* Ids, once confirmed against the operator tables. Left null until then
   rather than guessed: a wrong id silently offers the wrong form, while
   a null one simply falls through to the name check below. */
export const OPERATOR_IDS = {
  ENW: null,
  NGED: null,
  NPG: null,
  MUA: null,
};

const nameOf = (list, idKey, nameKey, id) =>
  (list || []).find((x) => Number(x[idKey]) === Number(id))?.[nameKey] ?? "";

/* A DNO matcher: the id if known, else the operator's name. */
function dnoMatcher(key, pattern) {
  return (poc, lookups) => {
    const id = poc?.DNO_ID;
    if (id == null || id === "") return false;
    if (OPERATOR_IDS[key] != null && Number(id) === Number(OPERATOR_IDS[key])) return true;
    return pattern.test(nameOf(lookups?.dnos, "DNO_ID", "DNO_Name", id).trim());
  };
}

/* An IDNO matcher, for a form keyed on the adopting operator rather
   than the distributor. */
function idnoMatcher(key, pattern) {
  return (poc, lookups) => {
    const id = poc?.IDNO_ID;
    if (id == null || id === "") return false;
    if (OPERATOR_IDS[key] != null && Number(id) === Number(OPERATOR_IDS[key])) return true;
    return pattern.test(nameOf(lookups?.idnos, "IDNO_ID", "IDNO_Name", id).trim());
  };
}

export const isEnw = dnoMatcher("ENW", /electricity\s*north\s*west|^enwl?\b/i);

/* Western Power Distribution was renamed National Grid Electricity
   Distribution, and records under the old name are still everywhere. */
export const isNged = dnoMatcher("NGED", /national\s*grid|^nged\b|western\s*power/i);

export const isNpg = dnoMatcher("NPG", /northern\s*power\s*grid|^npg\b/i);

/* Keyed on the adopting IDNO, not the DNO. */
export const isMua = idnoMatcher("MUA", /^mua\b|\bmua\s*(group|electricity|networks)?\b/i);
