#!/usr/bin/env python3
"""Undefined identifiers that would throw at runtime.

esbuild parses a file that calls a function which does not exist: an
unknown name is assumed to be a global and only fails when the line
runs. So a search-and-replace whose anchor did not match — leaving the
call sites in and the helper out — passes every build check and breaks
the page on open.

That has happened three times on this project. This catches it.

Not a full scope analysis: it collects every name declared, imported,
destructured or taken as a parameter anywhere in the file, and flags
calls to anything else that is not a known global. Being file-wide
rather than scope-aware makes it miss shadowing errors, which is the
right trade — it must never cry wolf, or it will stop being run.

    python3 checkdefs.py
"""
import re, glob, sys

GLOBALS = {
    "console","window","document","Math","JSON","Object","Array","String","Number",
    "Boolean","Date","Promise","Set","Map","WeakMap","Error","RegExp","parseInt",
    "parseFloat","isNaN","isFinite","setTimeout","clearTimeout","setInterval",
    "clearInterval","fetch","URL","URLSearchParams","FormData","Blob","File",
    "FileReader","Image","Intl","localStorage","sessionStorage","navigator",
    "location","alert","confirm","prompt","structuredClone","queueMicrotask",
    "requestAnimationFrame","cancelAnimationFrame","ResizeObserver","IntersectionObserver",
    "AbortController","TextEncoder","TextDecoder","btoa","atob","crypto","performance",
    "Symbol","BigInt","Proxy","Reflect","globalThis","process","require","module",
    "exports","__dirname","if","for","while","switch","catch","return","typeof",
    "function","await","new","super","this","import","export","default","class",
    "String","encodeURIComponent","decodeURIComponent","Uint8Array","ArrayBuffer",
    "async","yield","delete","void","in","of","do","else","try","finally","throw",
}

def declared(src):
    names = set()
    names |= set(re.findall(r'\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)', src))
    # const [a, setA] = useState() — array destructuring, which is how
    # every setter in this codebase comes into being
    for m in re.finditer(r'(?:const|let|var)\s*\[([^\]]*)\]', src):
        names |= set(re.findall(r'[A-Za-z_$][\w$]*', m.group(1)))
    names |= set(re.findall(r'\bfunction\s+([A-Za-z_$][\w$]*)', src))
    names |= set(re.findall(r'\bclass\s+([A-Za-z_$][\w$]*)', src))
    # import { a, b as c } from "..."  /  import d from "..."
    for m in re.finditer(r'import\s+([^;]+?)\s+from', src, re.S):
        names |= set(re.findall(r'[A-Za-z_$][\w$]*', m.group(1)))
    # destructuring and parameters, taken loosely
    for m in re.finditer(r'(?:const|let|var)\s*\{([^}]*)\}', src):
        names |= set(re.findall(r'[A-Za-z_$][\w$]*', m.group(1)))
    for m in re.finditer(r'\(([^)]*)\)\s*=>', src):
        names |= set(re.findall(r'[A-Za-z_$][\w$]*', m.group(1)))
    for m in re.finditer(r'function\s*[\w$]*\s*\(([^)]*)\)', src):
        names |= set(re.findall(r'[A-Za-z_$][\w$]*', m.group(1)))
    return names

bad = 0
for path in sorted(glob.glob("src/**/*.jsx", recursive=True)
                   + glob.glob("src/**/*.js", recursive=True)
                   + glob.glob("netlify/**/*.js", recursive=True)):
    raw = open(path).read()
    known = declared(raw) | GLOBALS
    # Template literals hold the CSS: var(), rgba(), repeat(), minmax(),
    # calc(), translate() are functions to a stylesheet and identifiers
    # to nobody. Blanked rather than parsed.
    # Blanked, not removed: deleting a comment removes its newlines and
    # every line number after it is then wrong, which sends the reader to
    # the wrong place and makes the whole report untrustworthy.
    keep_lines = lambda m: "\n" * m.group(0).count("\n")
    src = re.sub(r'`(?:[^`\\]|\\.)*`', keep_lines, raw, flags=re.S)
    # Ordinary strings too. "services (cable / pipe)" is a label, not a
    # call, and the bracket in it is punctuation.
    src = re.sub(r'"(?:[^"\\\n]|\\.)*"', '""', src)
    src = re.sub(r"'(?:[^'\\\n]|\\.)*'", "''", src)
    # Comments hold prose, and prose holds "the (" often enough to matter.
    src = re.sub(r'/\*.*?\*/', keep_lines, src, flags=re.S)
    src = re.sub(r'//[^\n]*', '', src)
    # JSX text is prose, and prose is full of "(px)" and "(m)". Only code
    # can call a function, so everything between a > and a < is dropped.
    # Multi-line too: JSX prose wraps, and "Never larger than\n(px)"
    # is one text run across two lines. Bounded by the character class,
    # which cannot cross a tag or a brace, so it can only ever eat text.
    blank = lambda a, b: (lambda m: a + "\n" * m.group(0).count("\n") + b)
    for pat, a, b in ((r'>[^<>{}]*<', ">", "<"),
                      # Text after an expression: {n} line(s) — the run
                      # starts at a closing brace, not a tag.
                      (r'\}[^<>{}]*<', "}", "<"),
                      (r'>[^<>{}]*\{', ">", "{"),
                      (r'\}[^<>{}]*\{', "}", "{")):
        src = re.sub(pat, blank(a, b), src, flags=re.S)
    # Class methods are declarations, not calls.
    src = re.sub(r'\b(constructor|render|componentDidCatch|getDerivedStateFromError)\s*\(',
                 'X(', src)
    seen = set()
    for m in re.finditer(r'(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(', src):
        name = m.group(1)
        if name in known or name in seen or name[0].isupper():
            continue
        seen.add(name)
        line = src[:m.start()].count("\n") + 1
        print(f"  {path}:{line}  calls `{name}` which is never declared here")
        bad += 1

print("No undefined calls found." if not bad else f"\n{bad} to check")
sys.exit(1 if bad else 0)
