/* What a cable menu offers, and in what order.

   Three places ask this question — the mains editor, the service editor
   and Edit by kind — and each had its own copy of the answer. They
   agreed on the naming by accident and disagreed on everything else:
   one filtered by usage, one read the raw catalogue, none sorted. A
   rule written three times is a rule that will be corrected once.

   ── The name ──

   The cable TYPE plus the size, which is how the catalogue reads and
   how the drawing labels it. "95" alone is two different cables where a
   catalogue carries waveform and insulated both.

   ── The order ──

   Alphabetical on that name, with numbers compared as numbers so 95
   sorts before 185 rather than after it. The catalogue's own order is
   the order somebody entered the rows in, which put HV cores among the
   mains and 300 above 95.

   ── What is offered ──

   Usage decides the KIND: it is a fact of the type, so a size whose
   type says "service" is not offered for a main. A type saying nothing
   fits anywhere, which is how a catalogue with no usage set still
   works.

   Retired rows stay out — `Is_Active` on either the type or the size. A
   size already ON a drawing still resolves and labels by id; only the
   offering is filtered.

   And `requireRating`, where the caller asks for it: `Rating_Amps` is
   what the catalogue says the cable can carry, and a row without one is
   a name somebody typed and never finished. Choosing it sets a size the
   network cannot be checked against. It is an option rather than a rule
   because the two callers currently want different answers — see the
   note in BulkEditor. */

export function cableMenuName(cable, cableTypes = []) {
  const t = cableTypes.find((x) => x.Cable_Type_ID === cable?.Cable_Type_ID);
  return [t?.Cable_Type, cable?.Size_Label ?? cable?.Cable_Name]
    .filter(Boolean).join(" ") || String(cable?.Cable_Size_ID ?? "");
}

export function sortCablesByName(list = [], cableTypes = []) {
  /* A copy: sort() is in place, and these arrays come from the shared
     lookups where everything else reads them too. */
  return [...list].sort((a, b) => cableMenuName(a, cableTypes)
    .localeCompare(cableMenuName(b, cableTypes), undefined, {
      numeric: true, sensitivity: "base",
    }));
}

export function cableMenu(cableSizes = [], cableTypes = [], opts = {}) {
  const usage = String(opts.usage ?? "").trim().toLowerCase();
  const requireRating = !!opts.requireRating;
  /* ── High voltage is not a usage ──

     `Usage_Type` says mains or service. Both HV and LV mains are
     "Mains", so a menu filtered on usage alone offered 3c WAVE, earth,
     service and LSZH cable to somebody sizing a run at eleven
     kilovolts.

     The distinction is `Voltage_Rating_ID` on the cable type, and it is
     asked for by ID. An earlier version looked the rating's NAME up in
     a second table on the reasoning that ids are per-scheme; that table
     does not reach this screen, the lookup found nothing, and the
     filter quietly did nothing at all \u2014 which is how the list came back
     LONGER than before.

     One column, one comparison, no second table to be missing. */
  const voltageIds = Array.isArray(opts.voltageIds) && opts.voltageIds.length
    ? opts.voltageIds.map(Number)
    : null;

  const fits = cableSizes.filter((c) => {
    const t = cableTypes.find((x) => x.Cable_Type_ID === c.Cable_Type_ID);
    if (t && t.Is_Active === false) return false;
    if (c.Is_Active === false) return false;
    if (requireRating && (c.Rating_Amps == null || Number(c.Rating_Amps) <= 0)) {
      return false;
    }
    /* A type with no voltage recorded is not offered where one was
       asked for. An earth cable has none, and putting it on an HV list
       because nobody filled the column in is the same fault as offering
       LV in the first place. */
    if (voltageIds) {
      if (t?.Voltage_Rating_ID == null) return false;
      if (!voltageIds.includes(Number(t.Voltage_Rating_ID))) return false;
    }
    if (!usage) return true;
    const u = String(t?.Usage_Type ?? "").trim().toLowerCase();
    return !u || u === usage;
  });

  const sorted = sortCablesByName(fits, cableTypes);

  /* Never an empty menu. Where the narrowing leaves nothing the whole
     catalogue is offered, sorted, and `filtered` says which happened —
     somebody facing an empty dropdown cannot tell a filtered list from
     a broken one. */
  return sorted.length
    ? { list: sorted, filtered: true }
    : { list: sortCablesByName(cableSizes, cableTypes), filtered: false };
}
