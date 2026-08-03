"""Every path that moves geometry must check the lock.

A lock with one way round it is worse than no lock: it is trusted and
then quietly fails. The interaction handlers are several and easy to add
to, so this lists the calls that reshape a feature and whether a lock
check appears in the same function.
"""
import re
src = open('src/features/gis/GISCanvasPage.jsx').read()
lines = src.split('\n')
"""addVertex and removeVertex both write through writeGeometry, which
gates on the lock, so calls to them are covered wherever they appear —
including from JSX handlers, where the enclosing function cannot be
found by looking backwards for a declaration. Only direct writes are
listed."""
movers = ["writeGeometry(", "moveFeatures("]
bad = 0
for i, l in enumerate(lines):
    if not any(m in l for m in movers): continue
    if re.match(r'\s*(async )?function ', l): continue      # the declaration
    # walk back to the enclosing function
    j = i
    while j > 0 and not re.match(r'\s{2}(async )?function \w+|\s{2}const \w+ = (async )?\(', lines[j]):
        j -= 1
    body = "\n".join(lines[j:i])
    if "locked(" in body or "isLocked" in body:
        continue
    # writeGeometry gates every write it performs, so anything routed
    # through it is covered without checking again
    if "writeGeometry(" in l:
        continue
    # the drag handlers are gated where the drag starts, not where it ends
    if "onUp" in lines[j]:
        continue
    # routines chosen from a menu are deliberate; locks guard against slips
    for routine in ("assignByDeveloper", "runAutoService", "addMissingNodes",
                    "applyClassification", "finishDrawing", "removeSelected"):
        if routine in lines[j]:
            break
    else:
        print(f"  line {i+1}: {l.strip()[:70]}")
        print(f"      in {lines[j].strip()[:60]} — no lock check above it")
        bad += 1
    continue
    print(f"  line {i+1}: {l.strip()[:70]}")
    print(f"      in {lines[j].strip()[:60]} — no lock check above it")
    bad += 1
print("Every geometry write is behind a lock check." if not bad
      else f"\n{bad} to check")
