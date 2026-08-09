import { AREAS, firstViewOf } from "../../lib/navigation.js";
import { areaVars } from "../../lib/colour.js";

/* The landing page: one square per area of the business.

   It exists because the sidebar had grown to eleven sections and about
   seventy items, nearly all of which are irrelevant to whoever is
   looking at it. Choosing an area here scopes the menu to that area, so
   the planner sees eight operations screens rather than seventy.

   Each square carries its section's name and nothing else. It listed
   the screens behind it and a count of how many were live, which made
   the page useful as a migration board while most sections were empty;
   now that they are mostly built, that detail is noise in front of a
   choice between eight things. The colour and the name are enough to
   pick by. */



export default function HomePage({ onOpen }) {
  return (
    <div className="home">
      <style>{CSS}</style>

      <header className="home-head">
        <img className="home-logo" src="/aptus360-logo.png"
          alt="Aptus360 — End-to-End MU Management" />
        <h1>Choose a section</h1>
        <p>Each section opens with only its own screens in the menu.</p>
      </header>

      <div className="home-grid">
        {AREAS.map((area) => (
            <button
              key={area.id}
              type="button"
              className="area-sq"
              /* The colour is per area and comes from data, so it cannot
                 live in the stylesheet. Everything else does. */
              style={areaVars(area.colour)}
              onClick={() => onOpen(firstViewOf(area))}
            >
              <span className="area-name">{area.label}</span>
            </button>
          ))}
      </div>
    </div>
  );
}

const CSS = `
.home { max-width: 1180px; margin: 0 auto; padding: 26px 4px 56px; }

.home-head { text-align: center; margin-bottom: 30px; }
.home-logo {
  width: 190px; height: auto; display: block; margin: 0 auto 20px;
}
.home-head h1 {
  margin: 0 0 5px; font-size: 25px; font-weight: 700; letter-spacing: -0.015em;
}
.home-head p { margin: 0; font-size: 13.5px; color: var(--muted); }

.home-grid {
  display: grid; gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(232px, 1fr));
}

/* The square. The outline is the identity of the area, so it is 2px and
   in full colour rather than a hairline that would read as a generic
   card border. */
.area-sq {
  position: relative; aspect-ratio: 1; min-height: 150px;
  display: flex; align-items: center; justify-content: center;
  text-align: center;
  padding: 18px;
  background: var(--white);
  border: 2px solid var(--sq);
  border-radius: 14px;
  font-family: inherit; color: var(--text); cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: transform .16s ease, box-shadow .16s ease, background-color .16s ease;
}
.area-sq:hover {
  background: var(--sq-wash);
  transform: translateY(-3px);
  box-shadow: 0 10px 22px var(--sq-glow);
}
.area-sq:active { transform: translateY(-1px); }
.area-sq:focus-visible {
  outline: 3px solid var(--sq-ring);
  outline-offset: 3px;
}

.area-name {
  font-size: 18px; font-weight: 700; line-height: 1.3;
  letter-spacing: -0.01em; text-wrap: balance;
}

@media (max-width: 560px) {
  .home-grid { grid-template-columns: 1fr; }
  /* A full-width square is a very tall box on a phone, so one row of
     name-height is enough there. */
  .area-sq { aspect-ratio: auto; min-height: 0; padding: 22px 18px; }
}

@media (prefers-reduced-motion: reduce) {
  .area-sq { transition: none; }
  .area-sq:hover { transform: none; }
}
`;
