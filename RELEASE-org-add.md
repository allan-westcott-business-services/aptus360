# Adding an organisation

Two files:

- `src/features/admin/OrganisationsAdmin.jsx`
- `checkorgadd.mjs` (new)

No migration. Nothing to do after deploying.

`HANDOVER.md` is **not** in this release. The repo snapshot I am working
from is behind yours — it stops at "Add symbols for boundary point and end
of service trench", so its HANDOVER.md is missing the levels entries — and
shipping it would drop them. The entry below goes at the end of the built
section, in front of "What's built".

---

## The organisation you just added

Admin → Organisations had the `+ Add organisation` button under the list.
The list is every company we deal with, it scrolls inside its own panel,
and the button was under all of it — so adding one meant scrolling to the
foot of a few hundred rows first, every time. It is above the list now,
the first thing in the panel, ahead of the search box; the name form opens
in the same place rather than at the foot.

The button and the form are one control in two states, so both moved. The
wrapper takes the gap below it (`.oa-addtop`) instead of the button
carrying a `margin-top` that only made sense underneath something —
`.oa-new` is shared with "+ Add branch" in the detail panel, which still
sits under its list and still wants the top margin.

**And the organisation you add is the one you are looking at.** It already
called `setSelected` with the new id, and that was not enough on its own.
The list is filtered three ways, and two of those filters hide a company
that has only just been created: it holds no roles, so any setting of the
role dropdown other than "All roles" filters it out, and its name is
almost never what is in the search box. So the detail panel opened on the
new organisation while the list showed no highlighted row — the right
panel with nothing to explain it, which reads as the add having gone
nowhere. Both filters are cleared on create.

Two smaller things on the same path:

- **Editors are closed across the switch.** `branchFor` and `contactFor`
  hold ids belonging to the organisation that was selected a moment ago.
  A branch form left open and then saved would have filed that branch
  under the wrong company — the same class of fault as the two branch
  tables in `checkbranches.mjs`, and quiet in exactly the same way.

- **`loadList` hands its rows back** as well as storing them, so create
  can find the row it made if the endpoint ever answers without one.
  Reading `rows` straight after `setRows` would still see the old array.

`checkorgadd.mjs` reads the source for the ordering and the two cleared
filters, and then mounts the real panel against a fake network: it narrows
the list with a search term and a role — the state the fault needs —
adds a company, and asks whether its row is in the list, highlighted, with
the detail panel on it and "+ Add branch" within reach. Every one of those
assertions was confirmed against a reverted copy of the change.
