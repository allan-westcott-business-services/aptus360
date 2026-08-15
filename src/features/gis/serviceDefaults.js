/* What a gas or water service is, unless somebody says otherwise.

   ── Why there is a floor at all ──

   Project_Scope already holds a default service size per project and
   utility, and where somebody has filled it in that is the answer. But
   it is a text box on the outline design, and a project where nobody
   filled it in drew every service with no size at all — which reads on
   the bill as "Water Service (pipe size not set)" against four hundred
   metres of perfectly ordinary 25mm.

   A service is not like a main. A main is sized by the load it carries,
   which is why the gas and water builds calculate it and why leaving it
   unset is honest when the calculation cannot run. A service is the
   same pipe on nearly every plot on nearly every site, and asking each
   project to say so again is asking for the answer to be missed.

   So this is the floor: what a service is when nothing more specific
   has been said.

   ── The order it is asked in ──

     the size on the feature      — what somebody drew it as
     Project_Scope                — what this project says services are
     here                         — what a service is

   A project that wants 32mm water sets it on the scope and this never
   comes up. Nothing here overrides anything.

   ── Not in the database, unlike the dig rates ──

   The rates went into tables because they are a company's own and are
   meant to move as jobs are recorded. This is not that. It is the size
   a service pipe is, which changes about as often as the pipe does —
   and a table for two values would be a screen, a migration and an
   allow-list entry to hold something nobody will edit twice.

   Where it does need to differ, Project_Scope is already the place, and
   it is per project rather than per company, which is the grain the
   difference actually has. */

export const SERVICE_SIZES = {
  water: "25mm",
  gas: "32mm",
};

/* The size a new service on this layer starts as, or nothing.

   Nothing for electric: it has a catalogue, and a cable is a reference
   to a row in it rather than a piece of text. Guessing one here would
   put an id-shaped hole where a cable should be. */
export function serviceSizeFor(layerKey) {
  return SERVICE_SIZES[layerKey] ?? null;
}
