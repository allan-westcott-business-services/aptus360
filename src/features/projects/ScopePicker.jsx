import Banner from "../../components/Banner.jsx";
import { UTILITIES, SCOPE_GROUPS, STREET_LIGHTING_IDS } from "../../lib/utilities.js";

/* Replaces both Contract_Phase and the child-tender split. The set of scopes
   selected here IS the project's scope — no phase slots, no cloned records.

   Budget and street-lighting behaviour are passed in rather than derived from
   a hardcoded Quote_Type_ID, because those IDs belong to the database. */
export default function ScopePicker({ selected, onToggle, isBudget, isStreetLightingOnly }) {
  if (isBudget) {
    return (
      <Banner kind="muted">
        Budget quotes don&rsquo;t carry designs. Scope is set when the project moves to a full quote.
      </Banner>
    );
  }

  return (
    <div className="scope-groups">
      {SCOPE_GROUPS.map((group) => (
        <div className="scope-group" key={group}>
          <p className="scope-group-title">{group}</p>
          <div className="scope-grid">
            {UTILITIES.filter((u) => u.group === group).map((u) => {
              const unavailable = isStreetLightingOnly && !STREET_LIGHTING_IDS.includes(u.id);
              const on = selected.includes(u.id);
              const cls = ["scope-chip", on ? "on" : "", unavailable ? "off" : ""]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  type="button"
                  key={u.id}
                  className={cls}
                  disabled={unavailable}
                  aria-pressed={on}
                  onClick={() => onToggle(u.id)}
                  style={on ? { borderColor: u.colour, boxShadow: `inset 0 0 0 1px ${u.colour}` } : undefined}
                >
                  <span className="scope-icon">{u.icon}</span>
                  <span className="scope-name">{u.name}</span>
                  <span className="scope-tick" style={{ color: u.colour }}>
                    {on ? "\u2713" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
