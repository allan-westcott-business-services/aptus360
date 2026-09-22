/* The front door.

   Four audiences sign in at the same place and want four different
   things, so the first question is which of them is knocking:

     Aptus staff and contractors   the app as it has always been
     Client developer              their own sites and documents
     DNO                           electric DNOs, gas transporters,
                                   water undertakers
     IDNO                          IDNOs, iGTs, NAVs

   ── The square is a signpost, not a permission ──

   Choosing one here does not grant anything. The account decides what
   somebody sees: a staff account that picks "Client Developer" still
   gets the staff app, and a developer account that picks "Aptus Staff"
   still gets their portal. The choice is remembered only so that the
   sign-in screen can say who it is expecting and, afterwards, so a
   developer whose account is not set up yet can be told what is wrong
   rather than shown an empty page.

   That separation matters: a landing page that granted access would
   make the front door the security boundary, which is exactly the
   thing nobody should be able to walk around by editing a URL. */

import { areaVars } from "../../lib/colour.js";

export const AUDIENCES = [
  {
    id: "staff",
    label: "Aptus Staff & Contractors",
    blurb: "The full application.",
    colour: "#2563eb",
  },
  {
    id: "developer",
    label: "Client Developer",
    blurb: "Track your sites, send us what we have asked for, and review what we send you.",
    colour: "#16a34a",
  },
  {
    id: "dno",
    label: "DNO",
    blurb: "Electricity distribution, gas transportation and water undertaking.",
    colour: "#ea580c",
  },
  {
    id: "idno",
    label: "IDNO",
    blurb: "Independent networks: IDNOs, iGTs and NAVs.",
    colour: "#7c3aed",
  },
];

export default function AudienceLanding({ onChoose }) {
  return (
    <div className="home">
      <style>{CSS}</style>

      <header className="home-head">
        <img className="home-logo" src="/aptus360-logo.png"
          alt="Aptus360 — End-to-End MU Management" />
        <h1>Welcome</h1>
        <p>Tell us who you are, and we will take you to the right place.</p>
      </header>

      <div className="home-grid">
        {AUDIENCES.map((a) => (
          <button key={a.id} type="button" className="area-sq"
            style={areaVars(a.colour)}
            onClick={() => onChoose(a.id)}>
            <span className="area-name">{a.label}</span>
            <span className="area-blurb">{a.blurb}</span>
          </button>
        ))}
      </div>

      <p className="home-foot">
        You will be asked to sign in. If you do not have an account, speak to
        your Aptus contact.
      </p>
    </div>
  );
}

const CSS = `
/* The section landing page's styling, kept the same on purpose.

   These are the two pages somebody sees before they are anywhere: one
   asks who you are, the other asks what you came to do. Styled apart
   they read as two different products; styled the same they read as
   one door with two questions behind it.

   Copied rather than shared, and worth being honest about why: the
   original keeps its CSS inside its own component, and lifting it into
   a shared stylesheet is a bigger change than this warranted. If a
   third page ever wants the same squares, that is the moment to move
   it \u2014 two copies is a coincidence, three is a pattern.

   Narrower than the rest of the app: FOUR audiences in a two-by-two
   square, so the whole choice is one shape the eye takes in at once
   rather than a row to read along. */
.home { max-width: 560px; margin: 0 auto; padding: 20px 4px 40px; }

.home-head { text-align: center; margin-bottom: 22px; }
.home-logo {
  width: 150px; height: auto; display: block; margin: 0 auto 14px;
}
.home-head h1 {
  margin: 0 0 4px; font-size: 21px; font-weight: 700; letter-spacing: -0.015em;
}
.home-head p { margin: 0; font-size: 12.5px; color: var(--muted); }

/* Two across, not auto-fit: four audiences laid in a row would stretch
   the choice across the screen and leave the page bottom-heavy. Fixed
   at two so it is a square in every window wide enough for one. */
.home-grid {
  display: grid; gap: 14px;
  grid-template-columns: repeat(2, 1fr);
}

/* The square. The outline is the identity of the audience, so it is
   2px and in full colour rather than a hairline that would read as a
   generic card border. */
.area-sq {
  position: relative; aspect-ratio: 1; min-height: 110px;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 6px;
  text-align: center;
  padding: 14px;
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
  font-size: 15.5px; font-weight: 700; line-height: 1.3;
  letter-spacing: -0.01em; text-wrap: balance;
}
/* The blurb the section page does not have. Kept quiet: it is there
   for somebody unsure which of the four they are, and silent for
   everybody else. */
.area-blurb {
  font-size: 12px; line-height: 1.35; color: var(--muted);
  text-wrap: balance;
}

.home-foot { margin-top: 26px; text-align: center; color: var(--muted);
  font-size: 12.5px; }

@media (max-width: 560px) {
  .home-grid { grid-template-columns: 1fr; }
  /* A full-width square is a very tall box on a phone, so the height of
     its text is enough there. */
  .area-sq { aspect-ratio: auto; min-height: 0; padding: 20px 18px; }
}

@media (prefers-reduced-motion: reduce) {
  .area-sq { transition: none; }
  .area-sq:hover { transform: none; }
}
`;
