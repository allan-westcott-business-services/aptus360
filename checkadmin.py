#!/usr/bin/env python3
"""Every table written through adminCreate/adminUpdate/adminDelete must be
in the endpoint's allowlist.

A table missing from TABLES in netlify/functions/admin.js returns 404 on
every write. The screen shows an error only if it happens to surface one —
and where a save deletes rows before rewriting them, the visible symptom
is data quietly reverting, which reads as the save not working rather
than as a missing table.

    python3 checkadmin.py
"""
import re, glob, sys

allowed = set(re.findall(r'^\s+(\w+):\s*\{\s*pk:',
                         open('netlify/functions/admin.js').read(), re.M))

used = {}
for path in (glob.glob('src/**/*.jsx', recursive=True)
             + glob.glob('src/**/*.js', recursive=True)):
    src = open(path).read()
    for m in re.finditer(r'admin(?:List|Create|Update|Delete)\(\s*"(\w+)"', src):
        used.setdefault(m.group(1), set()).add(path)

bad = 0
for table in sorted(used):
    if table in allowed:
        continue
    print(f"  {table} is written but not in the allowlist")
    for f in sorted(used[table]):
        print(f"      {f}")
    bad += 1

print(f"All {len(used)} tables are allowed." if not bad else f"\n{bad} to add")
sys.exit(1 if bad else 0)
