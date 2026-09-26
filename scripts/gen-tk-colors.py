"""Generate python/tkinter/tk_colors.json from Tk's xlib/xcolors.c.

The JSON maps every color spelling Tk accepts (lower-cased) to [r, g, b].
It is the single source of truth for color names in both engines and the
renderer. Tk's rules (see colorcmp/XParseColor in xcolors.c):
  * matching is case-insensitive;
  * a space may appear only before a letter that is upper-case in the table
    ("alice blue" ok, "burly wood" rejected);
  * numbered variants 1..n follow the base name ("AntiqueWhite3");
  * gray/grey additionally accept 0..100, computed as (n*255+50)//100 with
    two table deviations (230 and 128 are decremented).

Run: python3 scripts/gen-tk-colors.py
"""
import itertools
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
src = (ROOT / "data/tk/xcolors.c").read_text()

az = [int(x) for x in re.search(r"az\[\] = \{([^}]*)\}", src).group(1).replace("\n", " ").split(",")]
body = src[src.index("static const elem xColors[] = {"):]
entries = re.findall(r"\{((?:'[^']'|0x[0-9A-Fa-f]{2}|0)(?:\s*,\s*(?:'[^']'|0x[0-9A-Fa-f]{2}|0))*)\}", body)

def parse_entry(text):
    out = []
    for tok in re.findall(r"'[^']'|0x[0-9A-Fa-f]{2}|0", text):
        out.append(ord(tok[1]) if tok.startswith("'") else int(tok, 16) if tok.startswith("0x") else 0)
    return out

rows = [parse_entry(e) for e in entries]
rows = [r for r in rows if len(r) == 32]
assert len(rows) == az[-1], (len(rows), az[-1])

first_char = []
for i in range(len(az) - 1):
    first_char += [chr(ord("a") + i)] * (az[i + 1] - az[i])

colors = {}

def name_part(row):
    # name bytes end at the first NUL or where the rgb triplets begin
    area = 31 - 3 * (row[31] + 1)
    out = []
    for b in row[:area]:
        if b == 0:
            break
        out.append(b)
    return out

def spellings(name):
    # optional single space before each upper-case letter (not the first char)
    idx = [i for i, ch in enumerate(name) if ch.isupper() and i > 0]
    for mask in itertools.product([False, True], repeat=len(idx)):
        s = []
        for i, ch in enumerate(name):
            if i in idx and mask[idx.index(i)]:
                s.append(" ")
            s.append(ch)
        yield "".join(s).lower()

for fc, row in zip(first_char, rows):
    if row[0] == 0xFF:  # placeholder rows keep the az[] index aligned
        continue
    # the name part ends at the first NUL
    nvar = row[31]
    name = fc + bytes(name_part(row)).decode()
    def rgb(num):
        q = 28 - num * 3
        return [row[q], row[q + 1], row[q + 2]]
    for sp in spellings(name):
        colors[sp] = rgb(0)
        for n in range(1, nvar + 1):
            colors[f"{sp}{n}"] = rgb(n)
        if name in ("gray", "grey") and nvar == 8:
            for n in range(0, 101):
                if n <= nvar and n != 0:
                    continue
                v = (n * 255 + 50) // 100
                if v in (230, 128):
                    v -= 1
                colors[f"{sp}{n}"] = [v, v, v]


# Faithful port of Tk's colorcmp + binary search, used to drop any candidate
# spelling above that Tk itself would reject (e.g. "gray0" edge cases).
def colorcmp(spec, pname):
    spec = spec.encode() + b"\0\0"
    pname = bytes(pname) + b"\0"
    si = pi = 0
    notequal = 0
    num = 0
    while True:
        d = pname[pi]; pi += 1
        sp = spec[si] == 0x20
        if sp:
            si += 1
        if 0x41 <= d <= 0x5A:
            d += 32
        elif sp:
            notequal = 1
        c = spec[si]; si += 1
        if 0x41 <= c <= 0x5A:
            c += 32
        elif 0x31 <= c <= 0x39:
            if d == 0x30:
                d += 10
            elif not d:
                num = c - 0x30
                while True:
                    c = spec[si]; si += 1
                    if not (0x30 <= c <= 0x39):
                        break
                    num = num * 10 + c - 0x30
        r = c - d
        if r or not d:
            break
    if not r and notequal:
        r = 1
    return r, num

def tk_parse(spec):
    r = (ord(spec[0]) - 0x41) & 0xDF
    if r >= len(az) - 1:
        return None
    size = az[r + 1] - az[r]
    pi = (az[r + 1] + az[r]) >> 1
    def name_of(i):
        return name_part(rows[i])
    rc, num = colorcmp(spec[1:], name_of(pi))
    while rc != 0:
        if rc < 0:
            size >>= 1
            pi -= (size + 1) >> 1
        else:
            size -= 1
            size >>= 1
            pi += (size + 2) >> 1
        if not size:
            return None
        rc, num = colorcmp(spec[1:], name_of(pi))
    row = rows[pi]
    if num > row[31]:
        if row[31] != 8 or num > 100:
            return None
        v = (num * 255 + 50) // 100
        if v in (230, 128):
            v -= 1
        return [v, v, v]
    q = 28 - num * 3
    return [row[q], row[q + 1], row[q + 2]]

checked = {}
for k, v in colors.items():
    got = tk_parse(k)
    if got is not None:
        assert got == v, (k, got, v)
        checked[k] = v
print(f"{len(colors) - len(checked)} candidate spellings rejected by Tk's own matcher")
colors = checked

out = ROOT / "python/tkinter/tk_colors.json"
out.write_text(json.dumps(dict(sorted(colors.items())), separators=(",", ":")) + "\n")
print(f"wrote {len(colors)} color spellings to {out.relative_to(ROOT)}")
