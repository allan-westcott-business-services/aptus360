"""Any fixed-position modal rendered inside the clipped canvas wrapper.

.gis-canvas-wrap is overflow: hidden, so a .fe-backdrop rendered inside
it is clipped to the canvas box and never appears. The failure is silent:
the component mounts, the state is right, nothing is drawn.
"""
import re
src = open('src/features/gis/GISCanvasPage.jsx').read()
lines = src.split('\n')

# where the wrapper opens and closes, by indentation of its own line
open_i = next(i for i, l in enumerate(lines) if 'gis-canvas-wrap' in l and '<div' in l)
indent = len(lines[open_i]) - len(lines[open_i].lstrip())
close_i = next((i for i in range(open_i + 1, len(lines))
                if lines[i].strip() == '</div>'
                and len(lines[i]) - len(lines[i].lstrip()) == indent), len(lines))

MODALS = ["SchematicModal", "BomModal", "BulkDelete", "CircuitReport", "FeatureEditor"]
bad = 0
for name in MODALS:
    for i, l in enumerate(lines):
        if f'<{name}' not in l:
            continue
        where = "INSIDE the clipped wrapper" if open_i < i < close_i else "ok"
        if where != "ok":
            print(f"  {name} at line {i+1}: {where}")
            bad += 1
print("No modal is rendered inside the clipped canvas wrapper."
      if not bad else f"\n{bad} to move")
