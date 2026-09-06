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
     "Mains", so a menu filtered on usage alone offered 3c WAVE 95, 185
     and 300 to somebody sizing an HV cable \u2014 LV mains cable for a run
     at eleven kilovolts, which is not a mistake the catalogue should
     make possible.

     The catalogue already carries the answer: `Voltage_Rating_ID` on
     the cable type, LV, HV, HV+ and EHV since the seed. Asked for by
     the NAME of the rating rather than its id, because ids are
     per-scheme and the names are what somebody chose in Admin.

     `voltages` is a list, so "not LV" can be asked for as one question:
     an HV run may legitimately be offered HV, HV+ or EHV cable. */
  const voltages = (opts.voltages ?? null)
    && (opts.voltages || []).map((v) => String(v).trim().toLowerCase());

  /* ── Filtered only where the ratings are actually known ──

     The names live in `Voltage_Rating`, which reaches the client with
     the rest of the lookups. Where that list is absent \u2014 an older
     server, a screen that does not load it \u2014 every type would fail the
     test and the dropdown would come up EMPTY, which is a worse answer
     than an unfiltered one: an empty list looks like a catalogue with
     nothing in it and gives no way to carry on.

     So no ratings means no filtering, and `filtered` below still
     reports honestly what happened. */
  const ratings = opts.voltageRatings || [];
  const ratingsKnown = ratings.length > 0;

  const fits = cableSizes.filter((c) => {
    const t = cableTypes.find((x) => x.Cable_Type_ID === c.Cable_Type_ID);
    if (t && t.Is_Active === false) return false;
    if (c.Is_Active === false) return false;
    if (requireRating && (c.Rating_Amps == null || Number(c.Rating_Amps) <= 0)) {
      return false;
    }
    if (voltages && ratingsKnown) {
      const vr = ratings
        .find((x) => Number(x.Voltage_Rating_ID) === Number(t?.Voltage_Rating_ID));
      const name = String(vr?.Voltage_Rating ?? "").trim().toLowerCase();
      /* A type with no voltage recorded is not offered where a voltage
         was asked for. An earth cable has none, and putting it on an HV
         list because nobody filled the column in is the same fault as
         offering LV in the first place. */
      if (!name || !voltages.includes(name)) return false;
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
