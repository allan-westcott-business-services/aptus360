import { useMemo } from "react";
import { groupCategories, keysToAdd, keysToRemove } from "./bulkDelete.js";

/* Naming what to act on, instead of selecting it.

   Nobody rubber-bands four hundred service trenches. Both of the things
   done to a drawing wholesale — clearing it down and reclassifying it —
   start from the same sentence, "all the meters", so both start from the
   same list of categories with the same live counts beside them.

   It was written inside BulkDelete and is used by the bulk editor now.
   Copying it would have been the shorter change and the wrong one: two
   pickers over one category list drift, and the first thing to drift is
   the cascade below, which is subtle enough that a second copy would be
   subtly wrong rather than obviously so.

   Nothing here knows what happens next. It reports which keys are
   ticked; turning those into features is `idsForKeys`, and what to do
   with them is the panel's business. */
export default function CategoryPicker({
  categories, keys, onChange, disabled = false, multiColumn = false,
}) {
  const groups = useMemo(() => groupCategories(categories), [categories]);

  /* Ticking a whole utility ticks the kinds beneath it, so they can be
     unticked one at a time — "all the electric except the span nodes"
     without listing the rest by hand.

     Unticking a kind leaves the utility ticked. It covers more than its
     kinds do — an HV cable, a substation, a POC are all electric without
     being a mains, a service or a meter — so swapping it for its
     children would quietly drop them. idsForKeys subtracts the unticked
     kind instead. */
  const toggle = (k) => {
    if (keys.includes(k)) {
      const off = new Set(keysToRemove(categories, k));
      return onChange(keys.filter((x) => !off.has(x)));
    }
    return onChange([...new Set([...keys, ...keysToAdd(categories, k)])]);
  };

  /* Everything makes the rest meaningless, so ticking it clears them —
     leaving twelve boxes ticked under it suggests they still matter. */
  const pick = (k) => (k === "all"
    ? onChange(keys.includes("all") ? [] : ["all"])
    : toggle(k));
  const locked = keys.includes("all");

  return (
    <div className={multiColumn ? "cat-body multi" : "cat-body"}>
      {groups.map((g) => (
        <section key={g.label}>
          <p className="cat-group">{g.label}</p>
          {g.items.map((c) => (
            <label key={c.key}
              className={["cat-row", c.count ? "" : "empty",
                locked && c.key !== "all" ? "locked" : ""].filter(Boolean).join(" ")}>
              <input type="checkbox"
                checked={keys.includes(c.key)}
                /* Ticked, but not everything under it — shown as a dash
                   rather than a tick, because a full tick on a category
                   that is only partly selected says something untrue
                   about what is about to happen to it. */
                ref={(el) => {
                  if (!el) return;
                  const kids = categories.filter((x) =>
                    (x.parents || []).includes(c.key) && x.count);
                  el.indeterminate = keys.includes(c.key)
                    && kids.length > 0
                    && kids.some((x) => !keys.includes(x.key));
                }}
                /* Nothing there, nothing to tick. A checkbox that does
                   nothing is a question with no answer. */
                disabled={!c.count || disabled || (locked && c.key !== "all")}
                onChange={() => pick(c.key)} />
              <span className="cat-label">{c.label}</span>
              <em>{c.count}</em>
            </label>
          ))}
        </section>
      ))}
    </div>
  );
}
