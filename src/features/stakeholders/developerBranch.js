/* What a developer's branch is called.

   A project developer names a branch in one of two tables.
   Organisation_Branch is where a developer goes now; Branch_ID points
   at the older Customer_Branch, and every developer recorded before
   0198 uses it. A project uses one or the other, never both — that is a
   constraint on the table rather than a convention.

   Three screens resolve this name: the Details tab, the Stakeholders
   tab and the Plots tab's developer column. All three read
   `lookups.branches` and nothing else, so a developer on an
   organisation branch showed as an em dash — the row was there, its
   plots were counted, and the thing it was called was blank.

   Written once here rather than fixed in three places, because three
   copies of "which table is this branch in" is the same fault as two
   copies of any other rule: they agree until one is edited. */

/* What a branch is called, on screen.

   `Branch_Dropdown` is the name to use: it already reads "Anwyl Homes
   (Lancashire)" — the organisation and the branch, composed once in the
   database so every screen says it the same way.

   Three screens prefixed the organisation's name in front of it and
   produced "Anwyl Homes — Anwyl Homes (Lancashire)". The reasoning was
   that two developers with an office in the same town would otherwise
   read as the same word twice, which is true of `Branch_Name` — plain
   "Lancashire" — and not of the dropdown form, which carries the
   company already.

   So the prefix is used only where the dropdown form is missing and the
   bare branch name is all there is. That is the case it was written for
   and the only one where it adds anything. */
export function branchLabelOf(b, orgName = null) {
  if (!b) return null;
  if (b.Branch_Dropdown) return b.Branch_Dropdown;
  const name = b.Branch_Name || null;
  if (!name) return null;
  return orgName ? `${orgName} (${name})` : name;
}

const label = (b) => branchLabelOf(b);

/* The name, or null where the branch cannot be found.

   Null rather than a dash, so the caller decides how to show nothing —
   a table cell wants an em dash and a confirm dialog wants a sentence.
   Both were writing their own dash anyway. */
export function developerBranchName(dev, lookups = {}) {
  if (!dev) return null;

  if (dev.Organisation_Branch_ID != null) {
    const b = (lookups.orgBranches || [])
      .find((x) => Number(x.Organisation_Branch_ID) === Number(dev.Organisation_Branch_ID));
    if (!b) return null;
    /* The organisation's name only where the branch has no dropdown
       form of its own — see branchLabelOf. With one, it is already in
       there. */
    const org = (lookups.developerBranches || [])
      .find((x) => Number(x.Organisation_Branch_ID) === Number(b.Organisation_Branch_ID))
      ?.Organisation_Name;
    return branchLabelOf(b, org);
  }

  if (dev.Branch_ID != null) {
    return label((lookups.branches || [])
      .find((x) => Number(x.Branch_ID) === Number(dev.Branch_ID)));
  }

  return null;
}

/* Which branch a developer names, as a single value the UI can hold in
   one piece of state and compare.

   Prefixed by table, because the two are separate sequences and a bare
   number cannot say which one it came from — writing an
   Organisation_Branch_ID into Branch_ID points at whatever
   Customer_Branch shares that number, silently and at the wrong
   company. The project form carried this prefix inline until the old
   table stopped being offered; developers still need it, because rows
   made before 0198 are on the old side. */
export const branchChoiceOf = (dev) => {
  if (dev?.Organisation_Branch_ID != null) return `o${dev.Organisation_Branch_ID}`;
  if (dev?.Branch_ID != null) return `c${dev.Branch_ID}`;
  return "";
};

/* And back again, into the columns a save writes.

   Both are always returned, one of them null. Writing only the one that
   was chosen would leave the other holding whatever it held before —
   which on an edit is the previous branch, in the other table, and the
   check constraint then refuses the update. A refusal is the good case;
   without the constraint it would be a developer naming two branches. */
export function branchColumnsFor(choice) {
  const s = String(choice ?? "");
  const id = /^[co]\d+$/.test(s) ? Number(s.slice(1)) : null;
  if (id == null) return { Branch_ID: null, Organisation_Branch_ID: null };
  return s.startsWith("o")
    ? { Branch_ID: null, Organisation_Branch_ID: id }
    : { Branch_ID: id, Organisation_Branch_ID: null };
}
