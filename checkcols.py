"""Diff every column list in the API against the tables the SQL creates."""
import re, pathlib, sys

# ── columns each migration creates ──
schema = {}
for f in sorted(pathlib.Path("sqlout").glob("*.sql")):
    sql = f.read_text()
    for m in re.finditer(r'CREATE TABLE IF NOT EXISTS "(\w+)" \((.*?)\n\);', sql, re.S):
        table, body = m.group(1), m.group(2)
        cols = re.findall(r'^\s+"(\w+)"', body, re.M)
        schema.setdefault(table, set()).update(cols)
    for m in re.finditer(r'ALTER TABLE "(\w+)"\s+ADD COLUMN IF NOT EXISTS "(\w+)"', sql):
        schema.setdefault(m.group(1), set()).add(m.group(2))

# ── columns the API asks for ──
asks = []
for f in pathlib.Path("aptus360/netlify/functions").glob("*.js"):
    js = f.read_text()
    for m in re.finditer(r'const (\w+)_COLUMNS = \[(.*?)\]\.join', js, re.S):
        asks.append((f.name, m.group(1), set(re.findall(r'"(\w+)"', m.group(2)))))
    for m in re.finditer(r'\.from\("(\w+)"\)\s*\.select\("([^"`]+)"', js):
        cols = {c.strip() for c in m.group(2).split(",") if re.fullmatch(r'\w+', c.strip())}
        if cols:
            asks.append((f.name, m.group(1), cols))

CONST_TO_TABLE = {"PROJECT": "Project", "SCOPE": "Project_Scope", "PLOT": "Plot"}

bad = False
for fname, key, cols in asks:
    table = CONST_TO_TABLE.get(key, key)
    if table not in schema:
        continue
    phantom = cols - schema[table]
    if phantom:
        bad = True
        print(f"  {fname}  ->  {table}: {', '.join(sorted(phantom))}")

print("PHANTOM COLUMNS (asked for, never created):" if bad else "No phantom columns found.")
sys.exit(1 if bad else 0)
