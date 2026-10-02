#!/usr/bin/env python3
"""Designed pages for the raw research and data files the site links to (George, 2 Oct: "every interaction has a page").
Runs on the BUILT site, after the rsync into cloud-site/public:   python3 sites/v2/tools/docpages.py <public_dir>
- Finds every same-origin <a href> to a *.md / *.json / *.jsonl file in *.html, in the *.js that inject links, and in
  toc/brief-map.json (its proof hrefs become TOC links). Links with a download attribute stay raw: they are downloads.
- For each target that exists, writes <dir>/<stem>-<ext>.html next to it (kit header, ‹ Back, title, "Download the raw file",
  the body, the kit footer) and points the link there, #fragment kept. Links inside the new pages are followed the same way.
  Named <stem>-<ext>.html, not <file>.html: Cloudflare's html_handling 307s /x.md.html to /x.md, which is the raw file.
- .md renders with python-markdown (tables, fenced_code, toc with GitHub-style ids); .json is pretty-printed (over ~300 KB:
  the top-level keys and the first 300 lines); .jsonl shows its first 200 lines. Raw files stay in place for download.
- Deterministic and idempotent (a second run changes nothing). Refuses to write anything if bundle_v2's LINT regex or
  BLOCK words hit a generated page.
"""
import ast, html, json, posixpath, re, sys
from pathlib import Path
import markdown

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else sys.exit(__doc__)
B2 = Path(__file__).resolve().parents[2] / "bundle_v2.py"
_ns = {"re": re}
for node in ast.parse(B2.read_text()).body:   # the privacy rules live in one place: bundle_v2.py
    if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name) and node.targets[0].id in ("LINT", "BLOCK"):
        exec(compile(ast.Module([node], []), str(B2), "exec"), _ns)
LINT, BLOCK = _ns["LINT"], _ns["BLOCK"]

EXTS = (".md", ".json", ".jsonl")
BIG = 300_000
A_TAG = re.compile(r"<a\b[^>]*>", re.I)
HREF = re.compile(r"""(\bhref\s*=\s*)(["'])([^"'<>]*?)\2""", re.I)
JSON_HREF = re.compile(r'("href"\s*:\s*")([^"]+)(")')
esc = lambda s: html.escape(s, quote=True)
MD_SCRUB = [(r"`?(?:research/)?review_[A-Za-z0-9_]+\.md`?", "internal review notes"),
            (r"`?(?:research/)?audit_[A-Za-z0-9_]+\.md(?::\d+)?`?", "internal audit notes")]
PATHS = re.compile(r"""\b(?:href|src)\s*=\s*["']([^"']*)["']""", re.I)

CSS = """.doc{padding:32px 0 64px;min-width:0}.doc-path{margin:0 0 12px;overflow-wrap:anywhere}
.doc-h1{margin:0 0 20px;overflow-wrap:anywhere}.doc-dl{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;margin:0 0 32px}
.doc-dl small{font-size:14px;line-height:18px;color:var(--k-muted)}.k-header .doc-back{grid-column:-2/-1;justify-self:end;margin-left:auto;white-space:nowrap}
.doc-body{font-size:16px;line-height:24px;overflow-wrap:anywhere;min-width:0}
.doc-body>p,.doc-body>ul,.doc-body>ol,.doc-body>blockquote,.doc-body>h2,.doc-body>h3,.doc-body>h4{max-width:72ch}
.doc-body h1,.doc-body h2,.doc-body h3,.doc-body h4{font-family:var(--k-head);font-weight:300;margin:40px 0 12px}
.doc-body h1{font-size:32px;line-height:36px}.doc-body h2{font-size:28px;line-height:32px}.doc-body h3{font-size:20px;line-height:26px}.doc-body h4{font-size:17px;line-height:22px}
.doc-body p,.doc-body li{margin:0 0 10px}.doc-body ul,.doc-body ol{padding-left:22px;margin:0 0 14px}.doc-body a{color:var(--k-blue)}
.doc-body code{font-family:var(--k-mono);font-size:.9em;background:var(--k-card);padding:1px 4px;border-radius:4px}
.doc-body pre,.doc-pre{font-family:var(--k-mono);font-size:13px;line-height:19px;background:var(--k-card);padding:16px;border-radius:var(--k-r-card);overflow-x:auto;max-width:100%;margin:0 0 16px}
.doc-pre{white-space:pre-wrap;overflow-wrap:anywhere}.doc-body pre code{background:none;padding:0}
.doc-tw{overflow-x:auto;max-width:100%;margin:0 0 16px}.doc-tw table{border-collapse:collapse;font-size:14px;line-height:20px;min-width:100%}
.doc-tw th,.doc-tw td{border-bottom:1px solid var(--k-rule);padding:6px 10px;text-align:left;vertical-align:top;overflow-wrap:normal}.doc-tw th{font-weight:400}
.doc-body blockquote{margin:0 0 14px;padding-left:16px;border-left:2px solid var(--k-rule);color:var(--k-muted)}.doc-body img{max-width:100%}
.doc-keys{font-size:14px;line-height:20px;color:var(--k-muted);margin:0 0 12px}
@media (max-width:700px){.doc-h1{font-size:32px;line-height:34px}.doc{padding-top:20px}}"""


def gh_slug(value, separator="-"):
    """GitHub-style heading ids, so the deck's #fragments into the docs land."""
    v = re.sub(r"[^\w\- ]", "", value.strip().lower(), flags=re.U)
    return v.replace(" ", separator)


def doc_name(rel):
    d, f = posixpath.split(rel)
    stem, ext = f.rsplit(".", 1)
    return posixpath.join(d, f"{stem}-{ext}.html")


def candidate(path):
    return bool(path) and "${" not in path and "?" not in path and not re.match(r"^([a-z][a-z0-9+.-]*:|//|#)", path, re.I) \
        and path.lower().endswith(EXTS)


def resolve(path, bases):
    cands = [path.lstrip("/")] if path.startswith("/") else [posixpath.normpath(posixpath.join(b, path)) for b in bases]
    for c in cands:
        while c.startswith("../"):
            c = c[3:]
        if any(b in c for b in BLOCK):
            return None
        if (ROOT / c).is_file():
            return c
    return None


def bases_for(rel):
    d = posixpath.dirname(rel)
    if rel.endswith(".js"):
        if "/chapters/" in "/" + rel:
            return [posixpath.dirname(d), d, ""]   # chapter scripts run in their page's folder
        return ["", d]                              # full/*.js and the shared scripts run from the site root
    if rel == "toc/brief-map.json":
        return [""]                                 # its hrefs resolve from the deck's folder
    return [d]


class Links:
    def __init__(self):
        self.targets, self.misses, self.count = set(), set(), 0

    def new_href(self, value, bases):
        path, _, frag = value.partition("#")
        if not candidate(path):
            return None
        tgt = resolve(path, bases)
        if not tgt:
            self.misses.add(path)
            return None
        self.targets.add(tgt)
        self.count += 1
        return path[: len(path) - len(posixpath.basename(path))] + posixpath.basename(doc_name(tgt)) + ("#" + frag if frag else "")

    def html(self, text, bases):
        def tag(m):
            t = m.group(0)
            if re.search(r"\sdownload(?=[\s=>/])", t, re.I):
                return t   # an explicit download stays a download
            def one(h):
                n = self.new_href(h.group(3), bases)
                return h.group(0) if n is None else h.group(1) + h.group(2) + n + h.group(2)
            return HREF.sub(one, t, count=1)
        return A_TAG.sub(tag, text)

    def json(self, text, bases):
        def one(h):
            n = self.new_href(h.group(2), bases)
            return h.group(0) if n is None else h.group(1) + n + h.group(3)
        return JSON_HREF.sub(one, text)


def render(rel, changed):
    """→ (title, body html, note) for one raw file (as it will ship, after this run's link rewrites)."""
    raw = changed.get(rel) or (ROOT / rel).read_text(errors="replace")
    name = posixpath.basename(rel)
    if rel.endswith(".md"):
        for pat, rep in MD_SCRUB:   # the prose may name internal notes; the page says what they are instead
            raw = re.sub(pat, rep, raw)
        m = re.search(r"^#\s+(.+?)\s*#*\s*$", raw, re.M)
        title = re.sub(r"[*_`]", "", m.group(1)).strip() if m else name
        body = raw[: m.start()] + raw[m.end():] if m else raw
        md = markdown.Markdown(extensions=["tables", "fenced_code", "toc"], extension_configs={"toc": {"slugify": gh_slug}})
        out = md.convert(body).replace("<table>", '<div class="doc-tw"><table>').replace("</table>", "</table></div>")
        return esc(title), out, ""
    if rel.endswith(".jsonl"):
        lines = raw.splitlines()
        shown = lines[:200]
        note = f"<small>The first {len(shown)} of {len(lines):,} lines.</small>" if len(lines) > 200 else f"<small>{len(lines):,} lines.</small>"
        return esc(name), f'<pre class="doc-pre">{esc(chr(10).join(shown))}</pre>', note
    try:
        obj = json.loads(raw)
        pretty = json.dumps(obj, indent=2, ensure_ascii=False)
    except ValueError:
        obj, pretty = None, raw
    lines = pretty.splitlines()
    keys = ""
    if len(raw.encode()) > BIG:
        if isinstance(obj, dict):
            keys = '<p class="doc-keys">Top-level keys: ' + ", ".join(f"<code>{esc(k)}</code>" for k in obj) + "</p>"
        elif isinstance(obj, list):
            keys = f'<p class="doc-keys">A list of {len(obj):,} items.</p>'
        note = f"<small>Large file: the first 300 of {len(lines):,} lines. The raw file has everything.</small>"
        lines = lines[:300]
    else:
        note = ""
    return esc(name), keys + f'<pre class="doc-pre">{esc(chr(10).join(lines))}</pre>', note


def page(rel, title, body, note):
    up = "../" * rel.count("/")
    raw = posixpath.basename(rel)
    return f"""<!doctype html>
<!-- docpage: {esc(rel)} (generated by tools/docpages.py) -->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>{title} · Keenable take-home</title><link rel="icon" href="{up}brand/favicon-32.png"><link rel="stylesheet" href="{up}kit/keenable.css">
<style>{CSS}</style></head>
<body class="k"><div class="k-ground">
<div class="k-header-bar"><header class="k-header k-col"><a class="k-logo" href="{up}hub/" aria-label="Home"><img src="{up}kit/assets/keenable-wordmark-ink.svg" alt="Keenable"><small>take-home</small></a><a class="k-btn k-btn--soft doc-back" href="{up or './'}" data-back>‹ Back</a></header></div>
<main class="k-col doc"><p class="k-label doc-path">{esc(rel)}</p><h1 class="k-h1 doc-h1">{title}</h1>
<p class="doc-dl"><a class="k-btn k-btn--soft" href="{esc(raw)}" download>Download the raw file</a>{note}</p>
<article class="doc-body">{body}</article></main>
<footer class="k-footer"><div class="k-col"><p class="k-footer__legal">A take-home by George Trushevskiy for Keenable. Not an official Keenable site.</p></div></footer>
</div><script>document.querySelector("[data-back]").addEventListener("click", function (e) {{ if (history.length > 1 && document.referrer.indexOf(location.origin) === 0) {{ e.preventDefault(); history.back(); }} }});</script></body></html>
"""


def main():
    links = Links()
    changed = {}
    # 1. the site's own files: pages, link-injecting scripts, the TOC's proof map
    for p in sorted(list(ROOT.rglob("*.html")) + list(ROOT.rglob("*.js")) + [ROOT / "toc/brief-map.json"]):
        rel = p.relative_to(ROOT).as_posix()
        if not p.is_file() or rel.startswith("media/"):
            continue
        text = p.read_text(errors="ignore")
        if "<!-- docpage: " in text[:200]:
            m = re.search(r"<!-- docpage: (\S+) ", text[:200])
            if m and (ROOT / html.unescape(m.group(1))).is_file():
                links.targets.add(html.unescape(m.group(1)))   # an earlier run's page: regenerated below from its raw file
            continue
        new = links.json(text, bases_for(rel)) if rel.endswith(".json") else links.html(text, bases_for(rel))
        if new != text:
            changed[rel] = new
    # 2. one page per target; links inside the new pages are followed too
    pages, queue = {}, sorted(links.targets)
    while queue:
        rel = queue.pop(0)
        if rel in pages:
            continue
        before = set(links.targets)
        pages[rel] = page(rel, *(lambda t, b, n: (t, links.html(b, [posixpath.dirname(rel)]), n))(*render(rel, changed)))
        queue += sorted(links.targets - before - set(pages))
    out = {doc_name(rel): text for rel, text in pages.items()}
    # 3. privacy gate on everything generated, before anything is written
    # LINT: every page, every character. BLOCK (bundle_v2's private-path fragments): every href/src on every page, and the
    # whole text of the rendered markdown. JSON is shown verbatim and already ships raw, so a BLOCK word inside its data
    # (a news snippet's "chief", a key like "adult_review_note") is listed below, not edited.
    hits = [f"{name}: …{t[max(0, m.start() - 40):m.end() + 40]!r}…" for name, t in out.items() for m in LINT.finditer(t)]
    hits += [f"{name}: BLOCK word {b!r} in a link" for name, t in out.items() for u in PATHS.findall(t) for b in BLOCK if b in u]
    hits += [f"{name}: BLOCK word {b!r}" for name, t in out.items() if name.endswith("-md.html") for b in BLOCK if b in t]
    data_notes = sorted({f"{name} ({b!r})" for name, t in out.items() if not name.endswith("-md.html") for b in BLOCK if b in t})
    clash = [n for n in out if (ROOT / n).exists() and "<!-- docpage: " not in (ROOT / n).read_text(errors="ignore")[:200]]
    if hits or clash:
        print("docpages: NOT written.", f"{len(hits)} privacy hit(s); name clashes with real files: {clash}")
        for h in hits[:40]:
            print("  ", h.replace("\\n", " ")[:220])
        sys.exit(1)
    wrote = 0
    for name, text in sorted(list(out.items()) + list(changed.items())):
        f = ROOT / name
        if not f.exists() or f.read_text(errors="ignore") != text:
            f.write_text(text)
            wrote += 1
    kb = sum(len(t.encode()) for t in out.values()) / 1024
    print(f"docpages: {len(out)} pages, {kb:.0f} KB, {links.count} hrefs rewritten in {len(changed)} files; "
          f"{wrote} files written; LINT/BLOCK 0 hits")
    if data_notes:
        print("  BLOCK words inside JSON data shown verbatim (not links, not edited):", ", ".join(data_notes))
    if links.misses:
        print("  links to missing files (left as they are):", ", ".join(sorted(links.misses)))


if __name__ == "__main__":
    main()
