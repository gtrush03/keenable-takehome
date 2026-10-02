#!/usr/bin/env python3
"""Build v2 pages from chapter partials.

Every directory under sites/v2 that holds an index.template.html is a page (the main site and client/<slug>/).
Its chapters/NN-name.html partials are concatenated in filename order into <!--CHAPTERS-->, and any
chapters/NN-name.css / NN-name.js next to them are linked at <!--CHAPTER_CSS--> / <!--CHAPTER_JS-->.
Output: index.html beside the template. Usage: python3 sites/v2/build.py   (no arguments, idempotent)
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def reorder(body: str, spec: str) -> str:
    """Reorder top-level <section class="slide"> blocks by id (order.txt: '## group' then ids) and set data-chapter to the group.
    Unlisted slides follow the slide they followed in the chapter files. Fails loudly on nesting or a missing id."""
    starts = [m.start() for m in re.finditer(r'<section class="slide', body)]
    secs, outside = [], body[:starts[0]] if starts else body
    for k, a in enumerate(starts):
        end = body.index("</section>", a) + len("</section>")
        if k + 1 < len(starts) and end > starts[k + 1]:
            raise SystemExit(f"order.txt: nested section near {body[a:a+80]}")
        secs.append(body[a:end])
        outside += body[end:starts[k + 1] if k + 1 < len(starts) else len(body)]
    if re.sub(r"<!--.*?-->|\s+", "", outside, flags=re.S):
        raise SystemExit("order.txt: content outside sections; refusing to reorder")
    sid = lambda s: re.search(r'id="([^"]+)"', s.split(">", 1)[0]).group(1)
    by_id = {sid(s): s for s in secs}
    group, plan = None, []
    for line in spec.splitlines():
        line = line.strip()
        if not line or (line.startswith("#") and not line.startswith("##")): continue
        if line.startswith("##"): group = line[2:].strip(); continue
        for i in line.split():
            if i not in by_id: raise SystemExit(f"order.txt: no slide with id {i}")
            plan.append((i, group))
    listed = {i for i, _ in plan}
    orig = [sid(s) for s in secs]
    follow = {}
    for k, i in enumerate(orig):
        if i in listed: continue
        prev = next((orig[j] for j in range(k - 1, -1, -1) if orig[j] in listed or orig[j] in follow), None)
        follow.setdefault(prev, []).append(i)
    out, placed = [], []
    def put(i, g):
        s = re.sub(r'data-chapter="[^"]*"', f'data-chapter="{g}"', by_id[i], count=1)
        out.append(s); placed.append(i)
        for j in follow.get(i, []): put(j, g)
    for j in follow.get(None, []): put(j, plan[0][1])
    for i, g in plan: put(i, g)
    assert sorted(placed) == sorted(orig), "order.txt: slide count changed"
    return "\n".join(out) + "\n"


def sections(spec: str) -> list:
    """The "## Name" headings of order-v3.txt as (key, label, ids): key = slug of the name before " · "."""
    out = []
    for l in spec.splitlines():
        l = l.strip()
        if l.startswith("## "):
            name = l[3:].strip()
            out.append((re.sub(r"[^a-z0-9]+", "-", name.split(" · ")[0].lower()).strip("-"), name, []))
        elif l and not l.startswith("#") and out:
            out[-1][2].append(l)
    return out


def spine(body: str, spec: str) -> str:
    """order-v3.txt (George ruling #5, cut by #16): the listed ids ARE the page, in that order, with data-chapter from their
    "## Section" heading (or their own chapter if there are none). Every other slide stays on disk and lives in the Extended
    version (full.html), so an in-page link to one becomes full.html#id. Nothing is deleted."""
    secs = [m.group(0) for m in re.finditer(r'<section class="slide.*?</section>', body, flags=re.S)]
    sid = lambda s: re.search(r'id="([^"]+)"', s.split(">", 1)[0]).group(1)
    by_id = {sid(s): s for s in secs}
    flow = [l.strip() for l in spec.splitlines() if l.strip() and not l.strip().startswith("#")]
    for i in flow:
        if i not in by_id: raise SystemExit(f"order-v3.txt: no slide with id {i}")
    sec = {i: k for k, _, ids in sections(spec) for i in ids}
    out = [re.sub(r'data-chapter="[^"]*"', f'data-chapter="{sec[i]}"', by_id[i], count=1) if i in sec else by_id[i] for i in flow]
    here = {x for s in out for x in re.findall(r'\bid="([^"]+)"', s)}
    out = [re.sub(r'href="#([^"]+)"', lambda m: m.group(0) if m.group(1) in here else f'href="full.html#{m.group(1)}"', s) for s in out]
    return "\n".join(out) + "\n"


def build(page: Path) -> str:
    tpl = (page / "index.template.html").read_text()
    chdir = page / "chapters"
    parts = sorted(chdir.glob("*.html")) if chdir.is_dir() else []
    body = "\n".join(f"<!-- ===== {p.name} ===== -->\n{p.read_text().strip()}\n" for p in parts)
    if (page / "order.txt").exists():
        body = reorder(body, (page / "order.txt").read_text())
    if (page / "order-v3.txt").exists():
        spec = (page / "order-v3.txt").read_text()
        body = spine(body, spec)
        if sections(spec):  # the top-bar path, TOC and counter read their chapter names from data-chapters
            names = ",".join(f"{k}:{n}" for k, n, _ in sections(spec))
            tpl = re.sub(r'data-chapters="[^"]*"', f'data-chapters="{names}"', tpl, count=1)
    css = "\n".join(f'<link rel="stylesheet" href="chapters/{p.name}">' for p in sorted(chdir.glob("*.css"))) if parts else ""
    js = "\n".join(f'<script src="chapters/{p.name}"></script>' for p in sorted(chdir.glob("*.js"))) if parts else ""
    for marker in ("<!--CHAPTERS-->", "<!--CHAPTER_CSS-->", "<!--CHAPTER_JS-->"):
        if marker not in tpl:
            raise SystemExit(f"{page / 'index.template.html'}: missing {marker}")
    out = tpl.replace("<!--CHAPTERS-->", body).replace("<!--CHAPTER_CSS-->", css).replace("<!--CHAPTER_JS-->", js)
    head, rest = out.split("\n", 1)  # keep <!doctype html> as the first line
    (page / "index.html").write_text(head + "\n<!-- GENERATED by sites/v2/build.py: edit index.template.html and chapters/, not this file -->\n" + rest)
    n = len(re.findall(r'<section class="slide', re.sub(r"<!--.*?-->", "", body, flags=re.S)))
    return f"{page.relative_to(ROOT.parent)}/index.html  ({len(parts)} partials, {n} slides)"


if __name__ == "__main__":
    for tpl in sorted(ROOT.rglob("index.template.html")):
        print("built", build(tpl.parent))
