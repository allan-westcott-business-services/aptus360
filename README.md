# Non-residential supplies moved to Setup — 25 Aug 2026

Applies on top of `aptus360-link-to-circuit-20260825.zip`.

| File | Change |
|------|--------|
| `src/features/gis/GISCanvasPage.jsx` | Placement items moved from Trench to Setup, under Plots |
| `checknrs.mjs` | Eleven assertions — one new, on where the menu items live |

---

## Where they were, and why

They were in the **Trench** menu. That was my mistake: I anchored the
block on the "Span nodes and call-offs" group, which reads as electric
work but sits inside `<Menu id="trench">`.

They now sit in **Setup**, indented under **Plots**, above Drawing
Standard — which is the same job as placing plots: something that exists
on the project and needs putting on the drawing, with a list that
shrinks as each one is done.

## What else changed in the move

**Indented under Plots**, matching "Add missing meters", so it reads as
part of that group rather than a heading of its own.

**Clicking an armed supply again cancels it.** It was one-way before —
choosing one and changing your mind left the next click anywhere placing
it.

**Choosing one now clears the other placement modes** — `stopPlacing()`,
`setPlaceOpen(false)`, `setMeterCatchUp(null)`. Two modes armed at once
is a click that does whichever was checked first, which is what "Add
missing meters" already guards against.

**The active item is highlighted**, so it is obvious which supply the
canvas is waiting to place.

**When all are placed** it shows one disabled line reading "All placed"
rather than a bare group heading.

---

## Verification

`node checknrs.mjs` — eleven assertions. The new one checks the items
fall between `<Menu id="setup"` and `<Menu id="layers"`, and below the
Plots item, by source position.

Checked that way on purpose: the menus are one long block of JSX, and a
supply that drifts back into Trench still compiles, still works, and is
simply somewhere nobody looks. Neither a compile nor a behaviour test
would notice.

All other checks still pass.
