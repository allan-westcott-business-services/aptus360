/* Two sizes on every utility line, and which one is in force.

   ── Why two ──

   A build works out what each length ought to be from the load it
   carries. A designer overrides it, because the drawing does not know
   everything: a road crossing, a duct already in the ground, an
   operator who insists on a minimum.

   Held in one field, those two facts destroy each other. Rebuilding the
   network overwrote every override without saying so, and an override
   made the build's own answer unrecoverable — so nobody could see what
   the system had said, or what had been changed and why.

   Held apart, both survive. The build writes the system size and never
   touches the manual one; a designer writes the manual size and never
   touches the system one. The toggle says which is read.

   ── The toggle is a view, not a state of the drawing ──

   Switching to system sizes does not discard the overrides, and
   switching back does not recalculate anything. It changes which of two
   recorded facts is being looked at — so the levels check can be run
   both ways and the difference read off, which is the question somebody
   is actually asking when they override a size.

   ── The keys ──

   The existing key stays as the system size, so nothing has to be
   migrated: every size the build has ever written is already in it, and
   reading it as the system's answer is what it always was. */

export const SIZE_KEYS = {
  electric: { system: "Cable_Size_ID", manual: "Manual_Cable_Size_ID" },
  gas: { system: "Gas_Pipe_Size_ID", manual: "Manual_Gas_Pipe_Size_ID" },
  water: { system: "Water_Pipe_Size_ID", manual: "Manual_Water_Pipe_Size_ID" },
};

export const SIZE_MODES = ["system", "manual"];

export const keysFor = (utility) => SIZE_KEYS[utility] ?? null;

/* The size in force on a feature, for a given mode.

   Manual mode falls back to the system size where nothing has been
   overridden. That is what a reader means by "the sizes": the ones that
   would be built, which is the override where there is one and the
   calculated size everywhere else — not a drawing full of blanks on
   every length nobody has touched.

   System mode does not fall back the other way. The system's answer is
   the system's answer, and a length it could not size has no system
   size; showing the override there would be answering a different
   question. */
export function sizeIdFor(feature, utility, mode = "system") {
  const keys = keysFor(utility);
  if (!keys) return null;
  const attrs = feature?.Attributes ?? {};
  const manual = attrs[keys.manual];
  const system = attrs[keys.system];
  if (mode === "manual") return manual ?? system ?? null;
  return system ?? null;
}

/* Whether this length has been overridden, whatever mode is showing.
   Worth marking on the drawing: a size somebody chose is a decision,
   and a decision that looks identical to a calculation is one nobody
   revisits. */
export const isOverridden = (feature, utility) => {
  const keys = keysFor(utility);
  return !!(keys && feature?.Attributes?.[keys.manual] != null);
};

/* Which utility a line belongs to, for the keys above. */
export const utilityOf = (feature) => {
  const k = feature?.Layer_Key;
  return SIZE_KEYS[k] ? k : null;
};
