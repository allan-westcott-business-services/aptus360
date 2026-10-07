/* What a length of trench will carry.

   ── Why a trench needs saying ──

   A dig is not always for everything. Water may run as a closed loop
   round a site where electric never would, so the length that closes
   the loop carries water and nothing else. Without a way to say so, a
   build walks that length like any other and lays a cable somebody
   would then have to find and remove.

   Four answers rather than one per utility, because electric is two
   different things in a trench: LV and HV are laid apart, and a length
   that will take one may not take the other.

   ── Silence means everything ──

   A trench with nothing set accepts all four. Every trench drawn before
   this existed says nothing, and reading that as "carries nothing"
   would empty every drawing in the system on the day it shipped. It
   also matches what somebody means by drawing a trench and not
   answering the question.

   So the flags are a restriction, not a permission: they matter only
   once somebody has narrowed one. */

export const TRENCH_CARRIES = [
  { key: "Carries_LV", label: "LV cable", utility: "electric", voltage: "lv" },
  { key: "Carries_HV", label: "HV cable", utility: "electric", voltage: "hv" },
  { key: "Carries_Gas", label: "Gas", utility: "gas" },
  { key: "Carries_Water", label: "Water", utility: "water" },
];

/* Whether anything has been said about this trench at all. */
export const isRestricted = (trench) => TRENCH_CARRIES
  .some(({ key }) => trench?.Attributes?.[key] != null);

/* Whether this trench will take that utility.

   `voltage` is only asked of electric, and only where the caller knows
   it. A router that does not distinguish LV from HV gets the answer for
   either — refusing a cable because the caller could not say which kind
   it was would be a restriction nobody asked for. */
export function carries(trench, utility, voltage = null) {
  if (!isRestricted(trench)) return true;

  const a = trench?.Attributes ?? {};
  const on = (key) => a[key] === true;

  if (utility === "electric") {
    if (voltage === "lv") return on("Carries_LV");
    if (voltage === "hv") return on("Carries_HV");
    return on("Carries_LV") || on("Carries_HV");
  }
  if (utility === "gas") return on("Carries_Gas");
  if (utility === "water") return on("Carries_Water");

  /* A utility the list does not name \u2014 street lighting, telecoms \u2014 is
     not restricted by flags that say nothing about it. */
  return true;
}

/* The trenches a build may use, out of everything drawn. */
export const trenchesFor = (trenches = [], utility, voltage = null) =>
  trenches.filter((t) => carries(t, utility, voltage));

/* What a restricted trench says, for a drawing or a panel. Null where
   nothing has been narrowed, so nothing is written on the ordinary
   case. */
export function carriesLabel(trench) {
  if (!isRestricted(trench)) return null;
  const on = TRENCH_CARRIES.filter(({ key }) => trench?.Attributes?.[key] === true);
  if (!on.length) return "carries nothing";
  if (on.length === TRENCH_CARRIES.length) return null;
  return on.map((x) => x.label).join(", ");
}
