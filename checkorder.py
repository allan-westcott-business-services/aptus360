#!/usr/bin/env python3
"""Use-before-declaration check for the GIS canvas.

The component is one long function, and a const declared part way down it
cannot be referenced above that point. A useEffect is the trap: its body
runs after render, but its dependency array is evaluated during it, so

    useEffect(() => { ... }, [projectId, loadHistory]);   # line 196
    ...
    const loadHistory = useCallback(...);                 # line 2045

throws "Cannot access 'loadHistory' before initialization" and takes the
whole page with it. Nothing in the build catches this: esbuild parses it
happily, because it is only wrong at runtime.

Run after any edit that adds or moves a declaration:

    python3 checkorder.py

Comments and string literals are stripped first, so a name mentioned in
prose does not read as a reference.
"""
import re, sys
path='src/features/gis/GISCanvasPage.jsx'
lines=open(path).read().split('\n')

# Strip comments and string literals so matches are real code references.
clean=[]; inblock=False
for ln in lines:
    l=ln
    if inblock:
        if '*/' in l: l=l.split('*/',1)[1]; inblock=False
        else: l=''
    while '/*' in l:
        pre,rest=l.split('/*',1)
        if '*/' in rest: l=pre+rest.split('*/',1)[1]
        else: l=pre; inblock=True; break
    l=re.sub(r'//.*$','',l)
    l=re.sub(r'"(\\.|[^"\\])*"','""',l)
    l=re.sub(r"'(\\.|[^'\\])*'","''",l)
    l=re.sub(r'`(\\.|[^`\\])*`','``',l)
    clean.append(l)

# Component-scope declarations: exactly two spaces of indent.
decls={}
for i,l in enumerate(clean):
    m=re.match(r'  (?:const|let)\s+(\[?[\w,\s\]]+?)\s*=', l)
    if not m: continue
    for name in re.findall(r'\w+', m.group(1)):
        if name and name not in decls: decls[name]=i

bad=[]
for name,dline in decls.items():
    if len(name)<3: continue
    pat=re.compile(r'\b'+re.escape(name)+r'\b')
    for i in range(dline):
        if pat.search(clean[i]):
            # a use inside a function body that runs later is fine; flag only
            # references evaluated during render: dep arrays and direct calls
            frag=clean[i].strip()
            if re.search(r'\}, \[[^\]]*\b'+re.escape(name)+r'\b', clean[i]) or \
               re.match(r'^(const|let|return|if|for|while)\b', frag) or \
               re.search(r'\b'+re.escape(name)+r'\s*\(', clean[i]):
                bad.append((name, dline+1, i+1, frag[:90]))
            break
if bad:
    print(f"{len(bad)} possible use-before-declaration:\n")
    for n,d,u,f in sorted(bad,key=lambda x:x[2]):
        print(f"  {n:<22} declared line {d:<6} referenced line {u:<6}")
        print(f"      {f}")
else:
    print("No component-scope use-before-declaration found.")
