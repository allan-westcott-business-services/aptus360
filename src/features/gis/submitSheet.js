/* The Submit sheet.

   The one-page summary a scheme is submitted on: every section of main
   with its cable, its customers, its phase current, its loop impedance
   and its volt drop, then the totals, the service, and the
   prospective short circuit current at the far end.

   Laid out to match `2210_050 Aptus New Vd Calc Sheet`'s SUBMIT
   worksheet exactly — same rows, same columns, same order, same
   headings — because that is the sheet a DNO reads and an assessor
   checks line against line. A summary that is right but arranged
   differently costs somebody an hour with two documents side by side.

   ── The arithmetic is the sheet's, term for term ──

   Transcribed from regulat.xls rather than rederived, so a figure here
   can be pointed at a cell there:

     load kVA (M) = customers × ADMD
                    + group diversity, where there are any customers
                    + block load
     phase amps (N) = load kVA × 1000 ÷ 3 ÷ phase volts
     loop Ω (O)   = length ÷ 1000 × the cable's Ω/km
     %VD (P)      = ( distributed × ADMD × distFactor
                      + terminal × ADMD
                      + block load
                      + group diversity where there are customers )
                    × base × 10⁻⁶ × length × correction

     correction   = 1 + 4.14 ÷ √customers, when unbalanced

   ── Two terms this app did not have ──

   `blockKva` and `groupKva`. The sheet adds a per-section block load
   (its column L) and a flat small-group diversity allowance (its B5,
   8 kVA) to every section carrying customers; voltDrop.js had neither,
   and on the Fox Covert scheme that made the app read 4.09% where the
   sheet reads 4.67% — under by 0.58 points, always in the direction
   that makes a design look further from the limit than it is.

   Both default to zero here and in legVoltDrop, so a scheme that sets
   neither gets exactly the numbers this app produced before. They are
   inputs rather than constants because they are scheme facts: the
   block load is whatever is being fed, and the diversity allowance is
   what the adopting DNO asks for.

   ── Phase current is stated in the sheet's convention ──

   kVA × 1000 ÷ 3 ÷ 240, a per-phase power over the 240 V PHASE
   voltage. The app elsewhere uses kVA × 1000 ÷ (√3 × V) with the LINE
   voltage, which is the same quantity written the other way: 3 × 240
   is 720 and √3 × 415.7 is 720. They agree when the substation is
   recorded at 415 V and differ by 3.9% when it is left at the 400 V
   default.

   Not silently reconciled. `phaseVoltageV` is what this sheet divides
   by, `lineVoltageV` is what the app holds, and `voltageMismatch` says
   when the two do not describe the same supply — because a current
   that quietly changed by 4% between two screens is worse than one
   that is wrong on both.

   Pure: rows and settings in, a laid-out sheet out. No React, no
   database, no drawing. */

import { legVoltDrop } from "./voltDrop.js";

/* The scheme-level figures the sheet reads from its own head.

   ADMD and the group diversity allowance are the two that change the
   answer most and are the two most often assumed. Both are stated.

   240 V, not 400: this is the PHASE voltage, the number the sheet's
   B6 holds and divides by. */
export const SUBMIT_DEFAULTS = {
  admdKva: 5.01,
  groupKva: 8,
  phaseVoltageV: 240,
  distFactor: 0.5,
  unbalanced: false,
  unbalConst: 4.14,
  /* What the network upstream of the point of connection has already
     spent. The sheet's M6 and M7, added to the totals and not to any
     section — a scheme fed from a substation starts at zero, one fed
     from somebody else's main does not. */
  startPct: 0,
  startOhms: 0,
  /* The limits printed beside the totals. Named per adopter because
     they differ: GTC allows 250 mΩ, ESP 280 mΩ on 315 A fuses. */
  maxLoopOhms: null,
  maxVoltDropPct: null,
};

/* The columns, in the sheet's order, with the two-line headings it
   uses. Exported so a renderer cannot quietly re-order them: the
   layout matching is the point of this module. */
export const SUBMIT_COLUMNS = [
  { key: "section", top: "", head: "Section", align: "left" },
  { key: "lengthM", top: "Cable Length", head: "metres", dp: 0 },
  { key: "cableType", top: "Cable", head: "TYPE", align: "left" },
  { key: "csa", top: "Cable", head: "cross section", sub: "mm2" },
  { key: "distributed", top: " Domestic   ", head: "Distributed", dp: 0 },
  { key: "terminal", top: "Customers", head: "Terminal", dp: 0 },
  { key: "domesticOnSection", top: "Total", head: "Domestic", sub: "on Section", dp: 0 },
  { key: "blockKva", top: "Block", head: "Load", sub: "kVA", dp: 0 },
  { key: "amps", top: "Phase", head: "Current", sub: "Amps", dp: 1 },
  { key: "ohms", top: "Loop", head: "Impedance", sub: "\u03a9", dp: 6 },
  { key: "pct", top: "Volt ", head: "Drop", sub: "%", dp: 6 },
];

/* One section of main, worked out the sheet's way.

   `included` is the sheet's tick box. An unticked section keeps its
   row — its length, cable and customers are still the design — but
   contributes nothing, and its volt drop shows blank rather than zero
   because the sheet's P column returns "" and a zero would read as a
   section that drops nothing. */
export function submitRow(row, settings = {}) {
  const s = { ...SUBMIT_DEFAULTS, ...settings };
  const distributed = Number(row.distributed) || 0;
  const terminal = Number(row.terminal) || 0;
  const customers = distributed + terminal;
  const blockKva = Number(row.blockKva) || 0;
  const lengthM = Number(row.lengthM) || 0;
  const included = row.included !== false;

  const base = {
    section: row.section ?? "",
    lengthM,
    cableType: row.cableType ?? "",
    csa: row.csa ?? "",
    distributed,
    terminal,
    domesticOnSection: customers,
    blockKva,
    included,
  };

  if (!included || !(lengthM > 0)) {
    return { ...base, loadKva: 0, amps: 0, ohms: 0, pct: null, missingSpec: false };
  }

  /* The group allowance lands only where there are customers to
     diversify. The sheet's IF(K=0,0,B5), and the reason a section
     carrying nothing but a block load does not pick up 8 kVA. */
  const groupKva = customers > 0 ? (Number(s.groupKva) || 0) : 0;
  const loadKva = customers * s.admdKva + groupKva + blockKva;

  /* Through legVoltDrop rather than beside it, so this sheet and the
     canvas cannot drift. The customer counts become kVA here because
     the app's calculation works in load, not in people. */
  const leg = legVoltDrop({
    cable: row.cable,
    lengthM,
    distributedKva: distributed * s.admdKva,
    terminalKva: terminal * s.admdKva,
    blockKva,
    groupKva,
    meterCount: customers,
    unbalanced: !!s.unbalanced,
    distFactor: s.distFactor,
    unbalConst: s.unbalConst,
    jointEquivM: s.jointEquivM ?? 0,
    jointCount: row.jointCount ?? 0,
  });

  return {
    ...base,
    loadKva,
    /* The sheet's own convention, stated in its own terms. */
    amps: ampsPerPhase(loadKva, s.phaseVoltageV),
    ohms: leg.ohms,
    pct: leg.pct,
    missingSpec: !!leg.missingSpec,
  };
}

/* kVA × 1000 ÷ 3 ÷ phase volts — the sheet's N column.

   Zero volts gives zero rather than infinity, the same way ampsOf
   does: a supply with no voltage recorded is a drawing that is not
   finished, and an infinite current says less than a zero. */
export function ampsPerPhase(kva, phaseVoltageV) {
  const v = Number(phaseVoltageV);
  if (!(v > 0)) return 0;
  return (Number(kva) || 0) * 1000 / 3 / v;
}

/* The whole sheet.

   `rows` are the sections in order; `service` is the single worst
   service tail, which the sheet gives a row of its own beneath them. */
export function submitSheet({
  rows = [], service = null, settings = {}, scheme = {},
} = {}) {
  const s = { ...SUBMIT_DEFAULTS, ...settings };
  const out = rows.map((r) => submitRow(r, s));

  const sum = (k) => out.reduce((t, r) => t + (Number(r[k]) || 0), 0);
  const mainsOhms = sum("ohms");
  const mainsPct = sum("pct");

  /* The service, worked out the sheet's way: one customer, terminal in
     full, no unbalanced correction and no joint allowance — see
     serviceVoltDrop, which records why each of those is deliberate.

     Its load is the sheet's (2 × ADMD + group), not a real plot's kVA,
     because this row is the NOTIONAL worst service the submission is
     judged on rather than a particular house. Where a real plot figure
     is wanted, pass `kva`. */
  const svc = service ? serviceRow(service, s) : null;

  /* Sections whose cable has no electrical figures against it. A
     cable that contributes nothing cannot be told from one that
     genuinely drops nothing, so it is named rather than counted as
     zero — the totals below would otherwise read better than the
     truth for a reason nobody can see on the page. */
  const missing = out.filter((r) => r.missingSpec).map((r) => r.section);

  const totalOhms = mainsOhms + (svc?.ohms ?? 0) + (Number(s.startOhms) || 0);
  const totalPct = mainsPct + (svc?.pct ?? 0) + (Number(s.startPct) || 0);

  return {
    scheme: {
      title: scheme.title ?? "",
      aptusRef: scheme.aptusRef ?? "",
      dnoRef: scheme.dnoRef ?? "",
      admdKva: s.admdKva,
      /* The sheet prints "Substation Voltage" and means the phase
         voltage it divides by. Printed as the sheet prints it. */
      substationVoltage: s.phaseVoltageV,
      startPct: Number(s.startPct) || 0,
      startOhms: Number(s.startOhms) || 0,
    },
    columns: SUBMIT_COLUMNS,
    rows: out,
    service: svc,
    totals: {
      /* The sheet's K28 and L28: the sections plus the service row,
         which is why the service is inside the total rather than
         beside it. */
      ohms: mainsOhms + (svc?.ohms ?? 0),
      pct: mainsPct + (svc?.pct ?? 0),
    },
    /* The four figures beneath the table, each the sheet's own line. */
    loopImpedance: totalOhms,
    voltDrop: totalPct,
    /* E34: substation volts ÷ total loop impedance. Guarded, because a
       scheme with no impedance yet would divide by zero and print an
       infinite fault current, which reads as a number. */
    shortCircuitAmps: totalOhms > 0
      ? (Number(s.phaseVoltageV) || 0) / totalOhms : null,
    limits: {
      maxLoopOhms: s.maxLoopOhms,
      maxVoltDropPct: s.maxVoltDropPct,
      loopOver: s.maxLoopOhms != null && totalOhms > Number(s.maxLoopOhms),
      pctOver: s.maxVoltDropPct != null && totalPct > Number(s.maxVoltDropPct),
    },
    missingSpec: missing,
  };
}

/* The service row.

   Its impedance comes from a different table in the workbook — the
   'Transformer ELI's sheet, per mm² — rather than from the mains
   cable catalogue, so it is passed in as ohmsPerKm rather than looked
   up here. */
function serviceRow(service, s) {
  const lengthM = Number(service.lengthM) || 0;
  const kva = service.kva != null
    ? Number(service.kva)
    : 2 * s.admdKva + (Number(s.groupKva) || 0);
  const base = Number(service.voltDropBase) || 0;
  const perKm = Number(service.ohmsPerKm) || 0;

  return {
    section: "Services",
    lengthM,
    cableType: service.cableType ?? "",
    csa: service.csa ?? "",
    distributed: 0,
    terminal: 1,
    domesticOnSection: 1,
    blockKva: 0,
    loadKva: kva,
    amps: ampsPerPhase(kva, s.phaseVoltageV),
    ohms: (lengthM / 1000) * perKm,
    pct: kva * (base * 1e-6) * lengthM,
    included: true,
    missingSpec: !base && !perKm,
  };
}
