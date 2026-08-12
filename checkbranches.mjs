/* A project's customer branch comes from one of two tables.

   Customer_Branch is the older one and what Project.Branch_ID points
   at. Organisation_Branch is where a branch goes when a customer is
   added under an Organisation, which is how they are entered now — so
   a developer added today had a branch the project form did not offer.

   The two are separate sequences. That is the whole reason this needs
   care: Organisation_Branch 12 and Customer_Branch 12 are different
   companies, and writing one id into the other's column points a
   project at somebody it has nothing to do with. */

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* The dropdown prefixes its values so a bare number cannot be
   mistaken for the wrong table, and the save undoes it. */
const decode = (choice) => {
  const c = String(choice ?? "");
  const isOrg = c.startsWith("o");
  const id = /^[co]\d+$/.test(c) ? Number(c.slice(1)) : null;
  return { Branch_ID: isOrg ? null : id, Organisation_Branch_ID: isOrg ? id : null };
};

// 1. The same number in each table goes to a different column.
{
  const cust = decode("c12");
  const org = decode("o12");
  if (cust.Branch_ID !== 12 || cust.Organisation_Branch_ID !== null) {
    fail("a customer branch was not saved as one");
  }
  if (org.Organisation_Branch_ID !== 12 || org.Branch_ID !== null) {
    fail("an organisation branch was not saved as one");
  }
}

// 2. Nothing chosen is nothing, not branch nought. Number("") is 0, and
//    0 is a perfectly valid-looking id to write into a foreign key.
for (const empty of ["", "o", "c", "x9", null, undefined]) {
  const r = decode(empty);
  if (r.Branch_ID !== null || r.Organisation_Branch_ID !== null) {
    fail(`"${empty}" produced ${JSON.stringify(r)} rather than nothing`);
  }
}

// 3. A project names one or the other, never both — which the database
//    enforces too, in 0154.
for (const choice of ["c12", "o12"]) {
  const r = decode(choice);
  if (r.Branch_ID != null && r.Organisation_Branch_ID != null) {
    fail(`${choice} set both branch columns`);
  }
}

// 4. Reading it back finds the right name in the right table.
{
  const branches = [{ Branch_ID: 12, Branch_Name: "Anwyl (North)" }];
  const orgBranches = [{ Organisation_Branch_ID: 12, Branch_Name: "Barratt (Mercia)" }];
  const nameFor = (project) => {
    if (project.Organisation_Branch_ID) {
      return orgBranches.find((x) =>
        x.Organisation_Branch_ID === project.Organisation_Branch_ID)?.Branch_Name ?? "";
    }
    if (!project.Branch_ID) return "";
    return branches.find((x) => x.Branch_ID === project.Branch_ID)?.Branch_Name ?? "";
  };
  if (nameFor({ Branch_ID: 12 }) !== "Anwyl (North)") {
    fail("a customer branch read back as the wrong company");
  }
  if (nameFor({ Organisation_Branch_ID: 12 }) !== "Barratt (Mercia)") {
    fail("an organisation branch read back as the wrong company");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Branch selection behaves (two tables, one project, no id collisions).");
process.exit(bad ? 1 : 0);
