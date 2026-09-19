/* The Submit sheet, against the workbook it is a copy of.

   A golden master. `2210_050 Aptus New Vd Calc Sheet - A0 - A6 -
   23_4_22.xlsx` — Fox Covert Ln Misterton, Aptus 2210.05, DNO
   4917937 — is a real scheme that was submitted and adopted, and its
   SUBMIT worksheet is the layout a DNO reads. Every figure below was
   read out of that file, not recomputed: the point of a golden master
   is that it is somebody else's answer.

   ── Why it is worth pinning ──

   The volt drop the app prints is what a designer sizes cable
   against and what an assessor checks. When this app and the sheet
   disagree, one of them is telling somebody a scheme passes when it
   does not — and the direction the app was wrong in was exactly that
   one: it read 4.09% where the sheet reads 4.67%, because it had
   neither the block load nor the small group diversity allowance.
   Nothing failed, nothing threw, and both numbers looked reasonable.

   ── What is deliberately NOT asserted ──

   The phase current. The sheet divides by 3 × 240 and the app by
   √3 × line volts, which are the same quantity written two ways —
   720 either way when the substation is recorded at 415 V, 3.9% apart
   when it is left at the 400 V default. Case 6 asserts they agree
   when told the same supply, and says so rather than picking one.

   The service load. The sheet uses a notional 2 × ADMD + diversity
   for every service; this app knows each plot's own kVA and prefers
   it. serviceVoltDrop records why. Case 5 checks the sheet's own
   convention, which is what a submission is judged on. */
import {
  submitSheet, submitRow, ampsPerPhase, SUBMIT_COLUMNS, SUBMIT_DEFAULTS,
} from "./src/features/gis/submitSheet.js";
import { legVoltDrop } from "./src/features/gis/voltDrop.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
/* Six decimal places. The sheet's own columns are shown to fewer, but
   the totals are sums of eight of them and a check that rounded first
   would pass a formula that was wrong in the fourth place. */
const near = (a, b, tol = 1e-6) =>
  a != null && b != null && Math.abs(Number(a) - Number(b)) <= tol;

/* The mains cable catalogue, from the workbook's `impedances` sheet:
   the %VD base in µV and the loop impedance in Ω/km. */
const CABLE = {
  "3c Wave300": { Volt_Drop_Base: 73, Loop_Impedance_Ohm: 0.291 },
  "3c Wave185": { Volt_Drop_Base: 105, Loop_Impedance_Ohm: 0.361 },
  "3c Wave95": { Volt_Drop_Base: 191, Loop_Impedance_Ohm: 0.687 },
};

/* The scheme, exactly as its regulat.xls rows 15 to 22 hold it. */
const SCHEME = [
  { section: "POC - O1", lengthM: 100, cableType: "3c Wave", csa: 300,
    cable: CABLE["3c Wave300"], distributed: 1, terminal: 47, blockKva: 20,
    included: true },
  { section: "O1 - O3", lengthM: 66, cableType: "3c Wave", csa: 300,
    cable: CABLE["3c Wave300"], distributed: 5, terminal: 38, blockKva: 20,
    included: true },
  { section: "O3 - O4", lengthM: 108, cableType: "3c Wave", csa: 185,
    cable: CABLE["3c Wave185"], distributed: 10, terminal: 8, blockKva: 20,
    included: false },
  { section: "O4 - O5", lengthM: 125, cableType: "3c Wave", csa: 185,
    cable: CABLE["3c Wave185"], distributed: 6, terminal: 1, blockKva: 20,
    included: false },
  { section: "O3 - O7", lengthM: 110, cableType: "3c Wave", csa: 185,
    cable: CABLE["3c Wave185"], distributed: 4, terminal: 16, blockKva: 0,
    included: true },
  { section: "O7 - O8", lengthM: 100, cableType: "3c Wave", csa: 95,
    cable: CABLE["3c Wave95"], distributed: 7, terminal: 1, blockKva: 0,
    included: false },
  { section: "O7 - O9", lengthM: 41, cableType: "3c Wave", csa: 95,
    cable: CABLE["3c Wave95"], distributed: 3, terminal: 5, blockKva: 0,
    included: true },
  { section: "O9 - O10", lengthM: 54, cableType: "3c Wave", csa: 95,
    cable: CABLE["3c Wave95"], distributed: 1, terminal: 1, blockKva: 0,
    included: true },
];

/* The service: 10 m of 35 CNE. Its impedance comes from the
   workbook's 'Transformer ELI's sheet (0.9785 Ω/km for 35mm) and NOT
   from the mains catalogue, and its %VD base from the service block
   at the foot of `impedances` (3094). Two different tables, which is
   why the service is passed in rather than looked up. */
const SERVICE = {
  lengthM: 10, cableType: "", csa: "35 CNE",
  ohmsPerKm: 0.9785, voltDropBase: 3094,
};

const SETTINGS = {
  admdKva: 5.01, groupKva: 8, phaseVoltageV: 240,
  startPct: 0.01, startOhms: 0.02,
};

/* Column L of SUBMIT, per section. Blank where the sheet returns "". */
const SHEET = {
  "POC - O1": { ohms: 0.0291, pct: 1.9416175, amps: 372.88888888888886, kva: 268.48 },
  "O1 - O3": { ohms: 0.019206, pct: 1.11250029, amps: 338.09722222222223, kva: 243.42999999999998 },
  "O3 - O4": { ohms: 0, pct: null, amps: 0, kva: 0 },
  "O4 - O5": { ohms: 0, pct: null, amps: 0, kva: 0 },
  "O3 - O7": { ohms: 0.03971, pct: 1.1339789999999996, amps: 150.27777777777777, kva: 108.19999999999999 },
  "O7 - O8": { ohms: 0, pct: null, amps: 0, kva: 0 },
  "O7 - O9": { ohms: 0.028167000000000005, pct: 0.3176645149999999, amps: 66.77777777777777, kva: 48.08 },
  "O9 - O10": { ohms: 0.037098000000000006, pct: 0.16002170999999998, amps: 25.02777777777778, kva: 18.02 },
};

const sheet = submitSheet({ rows: SCHEME, service: SERVICE, settings: SETTINGS,
  scheme: { title: "Fox Covert Ln Misterton", aptusRef: "2210.05", dnoRef: "4917937" } });

// 1. Every section, against its own row of the sheet.
{
  for (const row of sheet.rows) {
    const want = SHEET[row.section];
    if (!want) { fail(`no expected figures for ${row.section}`); continue; }

    if (!near(row.ohms, want.ohms)) {
      fail(`${row.section}: loop impedance ${row.ohms} where the sheet says `
        + `${want.ohms}`);
    }
    if (want.pct == null) {
      /* An unticked section. Blank, not zero — the sheet's P column
         returns "" and a zero reads as a section that drops nothing,
         which is a different statement about the design. */
      if (row.pct !== null) {
        fail(`${row.section} is not in the calculation, so its volt drop must `
          + "be blank rather than zero \u2014 a zero reads as a section that "
          + "drops nothing");
      }
    } else if (!near(row.pct, want.pct)) {
      fail(`${row.section}: volt drop ${row.pct} where the sheet says ${want.pct}`);
    }
    if (!near(row.amps, want.amps, 1e-6)) {
      fail(`${row.section}: phase current ${row.amps} where the sheet says `
        + `${want.amps}`);
    }
    if (!near(row.loadKva, want.kva, 1e-9)) {
      fail(`${row.section}: load ${row.loadKva} kVA where the sheet says ${want.kva}`);
    }
  }
}

// 2. The service row.
{
  const svc = sheet.service;
  if (!svc) fail("the sheet has no service row");
  else {
    if (!near(svc.ohms, 0.009785)) {
      fail(`service impedance ${svc.ohms} where the sheet says 0.009785 \u2014 the `
        + "service reads a different table from the mains, and reading the "
        + "mains catalogue for it is the likeliest way to get this wrong");
    }
    if (!near(svc.pct, 0.5575388)) {
      fail(`service volt drop ${svc.pct} where the sheet says 0.5575388`);
    }
    if (!near(svc.loadKva, 18.02)) {
      fail(`service load ${svc.loadKva} kVA where the sheet's notional service `
        + "is 2 \u00d7 ADMD + diversity = 18.02");
    }
  }
}

// 3. The totals, and the four figures beneath the table.
{
  if (!near(sheet.totals.ohms, 0.163066)) {
    fail(`total loop impedance ${sheet.totals.ohms} where SUBMIT!K28 says 0.163066`);
  }
  if (!near(sheet.totals.pct, 5.2233218149999985)) {
    fail(`total volt drop ${sheet.totals.pct} where SUBMIT!L28 says 5.2233218`);
  }
  /* The POC's own share is added to the totals and to no section —
     a scheme fed from somebody else's main does not start at zero,
     and one fed from a substation does. */
  if (!near(sheet.loopImpedance, 0.18306599999999998)) {
    fail(`loop impedance including the POC ${sheet.loopImpedance} where `
      + "SUBMIT!E30 says 0.183066");
  }
  if (!near(sheet.voltDrop, 5.233321814999998)) {
    fail(`volt drop including the POC ${sheet.voltDrop} where SUBMIT!E32 says `
      + "5.2333218");
  }
  if (!near(sheet.shortCircuitAmps, 1311.002589230114, 1e-6)) {
    fail(`prospective short circuit current ${sheet.shortCircuitAmps} where `
      + "SUBMIT!E34 says 1311.0026");
  }
}

// 4. The layout is the sheet's layout.
{
  /* The columns in the sheet's order. Asserted because matching the
     layout is the whole reason this module exists: a summary that is
     arithmetically right and arranged differently costs somebody an
     hour with two documents side by side. */
  const want = ["section", "lengthM", "cableType", "csa", "distributed",
    "terminal", "domesticOnSection", "blockKva", "amps", "ohms", "pct"];
  const got = SUBMIT_COLUMNS.map((c) => c.key);
  if (got.join(",") !== want.join(",")) {
    fail(`the columns are ${got.join(", ")} \u2014 SUBMIT reads ${want.join(", ")}`);
  }

  /* Unticked sections keep their rows. The design is what is drawn,
     not only what is counted, and a section that vanished from the
     page would be a section nobody could see had been left out. */
  if (sheet.rows.length !== SCHEME.length) {
    fail(`${sheet.rows.length} rows from ${SCHEME.length} sections \u2014 a section `
      + "left out of the calculation still belongs on the page");
  }
  if (!sheet.rows.some((r) => r.included === false)) {
    fail("nothing records which sections are in the calculation");
  }
}

// 5. The two terms that were missing, and that they stay optional.
{
  /* Off by default, so every caller that has not been told about a
     block load or a diversity allowance gets the numbers it got
     before. A default that changed every existing scheme's volt drop
     on the day it shipped would be this app rewriting submissions
     nobody asked it to revisit. */
  const bare = legVoltDrop({
    cable: CABLE["3c Wave300"], lengthM: 100,
    distributedKva: 1 * 5.01, terminalKva: 47 * 5.01, meterCount: 48,
  });
  if (!near(bare.pct, 1.7372175)) {
    fail(`a leg with neither term now reads ${bare.pct} \u2014 it read 1.7372175 `
      + "before they were added, and adding them by default would silently "
      + "change every scheme already submitted");
  }

  /* And both at full weight. Only the distributed domestic load is
     halved; a block load sits where it sits and the allowance is a
     lump. Halving either would look like a rounding difference and be
     a policy change. */
  const half = legVoltDrop({
    cable: CABLE["3c Wave300"], lengthM: 100, distributedKva: 0, terminalKva: 0,
    blockKva: 20, groupKva: 8, meterCount: 1,
  });
  if (!near(half.pct, 28 * 73e-6 * 100)) {
    fail("the block load and the diversity allowance are not carried at full "
      + "weight \u2014 only the distributed domestic load is halved");
  }

  /* The allowance lands only where there are customers. A section
     carrying nothing but a block load has no group to diversify. */
  const noCustomers = submitRow({
    section: "x", lengthM: 100, cable: CABLE["3c Wave300"],
    distributed: 0, terminal: 0, blockKva: 20,
  }, SETTINGS);
  if (!near(noCustomers.loadKva, 20)) {
    fail(`a section with no customers loads ${noCustomers.loadKva} kVA \u2014 the `
      + "group diversity allowance has nothing to diversify there");
  }
}

// 6. The two current conventions describe the same supply.
{
  /* 3 × 240 and √3 × 415.7 are both 720. Asserted rather than
     reconciled: a current that quietly changed by 4% between two
     screens is worse than one that is wrong on both. */
  const kva = 268.48;
  const sheetAmps = ampsPerPhase(kva, 240);
  const appAmps = kva * 1000 / (Math.sqrt(3) * 240 * Math.sqrt(3));
  if (!near(sheetAmps, appAmps, 1e-9)) {
    fail("the sheet's per-phase current and the app's line-voltage form do not "
      + "describe the same supply");
  }
  /* And the default the app ships with is NOT that supply, which is
     worth knowing rather than hiding: 400 V line against a 240 V
     phase is 3.9% apart. */
  const atFourHundred = kva * 1000 / (Math.sqrt(3) * 400);
  if (near(atFourHundred, sheetAmps, 1)) {
    fail("the 400 V default now agrees with the sheet, so the note about the "
      + "two conventions is out of date");
  }
}

// 7. Nothing is silently zero.
{
  const blind = submitSheet({
    rows: [{ section: "no cable", lengthM: 100, cable: null,
      distributed: 2, terminal: 2 }],
    settings: SETTINGS,
  });
  if (!blind.missingSpec.length) {
    fail("a section whose cable has no electrical figures is counted as "
      + "dropping nothing, which makes the total read better than the truth "
      + "for a reason nobody can see on the page");
  }

  /* With no POC impedance declared either — a scheme that has one has
     an impedance, however empty the table is. */
  const empty = submitSheet({ rows: [], settings: { ...SETTINGS, startOhms: 0 } });
  if (empty.shortCircuitAmps !== null) {
    fail("a scheme with no impedance yet prints a fault current, and an "
      + "infinite one reads as a number");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The Submit sheet matches the workbook, section by section and in total.");
process.exit(bad ? 1 : 0);
