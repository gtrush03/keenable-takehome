#!/usr/bin/env python3
"""Bundle the v2 site (main deck + client decks + memo) into dist/v2 for an unlisted deploy.
Copies only what is referenced; research docs are shipped as sanitized copies; private data is blocked; then lints.
Usage (from ~/Genie/scratch/keenable): python3 sites/bundle_v2.py
"""
import re, shutil, posixpath, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "sites" / "v2"
OUT = ROOT / "dist" / "v2"
BLOCK = ("data/li/", "targets_g5", "/g5/", "drafts/", "goals/", "candidacy", "chief", ".env", "li_network", "li_outreach",
         "memory-sweep", "review_", "audit_")
SKIP_DIRS = {"shots", "qa", "__pycache__", "media"}  # media/: the films stay local (team-lead, 1 Oct); web copies come later
REF = re.compile(r"""(?:href|src)\s*=\s*["']([^"'#?]+)|fetch\(\s*["'`]([^"'`?#]+)|url\(\s*["']?([^"')?#]+)|["'`]((?:\.\./)*(?:data|shared|assets|research|kit|galactica|dl|memo)/[A-Za-z0-9_./-]+\.[a-z0-9]{2,5})["'`]""")

# ---- research sanitizer (same rules as sites/appendix.py, plus the hiring section) ----
LANE = re.compile(r"\bG[1-9]\b|\blane\b|teammate|team-lead|subagent|~/Genie|scratch/keenable|\bopt[12]-(market|fintech)\b", re.I)
DROP = re.compile(r"G5 (targets )?lane|George's (own )?network|draft-only decision|nothing (here )?has been sent|outreach list|memory|/Users/|chief\.md|\.env|warm path|targets_g5|li_network|Iqram|ESCP", re.I)
SKIP_HEAD = re.compile(r"goal[- ]status|gate|acceptance|handoff|hiring|the role george|how to reproduce locally|first-meeting plan|draft note", re.I)

def sanitize_md(text):
    keep, skip = [], 0
    for line in text.splitlines():
        m = re.match(r"^(#+)\s+(.*)", line)
        if m:
            lvl = len(m.group(1))
            if skip and lvl <= skip:
                skip = 0
            if lvl > 1 and SKIP_HEAD.search(m.group(2)):
                skip = lvl
                continue
        if skip or DROP.search(line) or LANE.search(line):
            continue
        keep.append(line)
    t = "\n".join(keep)
    t = re.sub(r"\(research/parts/[^)]*\)", "", t)
    t = re.sub(r"research/parts/\S+", "internal notes", t)
    return t + "\n"

def scrub(t):
    """Label-only rewrites for shipped text. Never touches numbers."""
    t = re.sub(r"NEEDS KEY:?\s*([A-Z_]+(?:\s*(?:or|,)\s*[A-Z_]+)*)", "not run yet (needs a free-tier key)", t)
    t = t.replace("[NEEDS KEY]", "[not run yet]").replace("NEEDS KEY", "not run yet")
    t = re.sub(r"opt[12]-\w+ lane research/parts \(verified by that lane\)", "research notes (verified)", t)
    t = re.sub(r"\(verified by that lane\)", "(verified)", t)
    t = re.sub(r"\b(the )?(\w+-)?lanes?\b", "research", t)
    t = re.sub(r"/Users/[^\"'\s]*?/keenable/", "", t)
    t = t.replace("George's free-tier keys", "free-tier keys").replace("George's", "my")
    t = re.sub(r"Claude agent \(G\d\)", "an LLM labeller", t)
    t = re.sub(r"Claude \(agent [^)]*\)", "Claude", t)
    t = re.sub(r"`?research/candidacy\.md`?(\s*§[^()\n.;]*?)?(?=\s*[().,;:]|\s*$)", "private evaluation notes", t, flags=re.M)
    t = re.sub(r"\(?data/targets_g5\.json[^)\n]*\)?", "", t)
    t = re.sub(r"data/g9_parts/(\w+)\.json", lambda m: "research input: " + m.group(1).replace("_", " "), t)
    t = re.sub(r"\bG9 gate C \([^)]*\)", "channel study", t)
    t = re.sub(r"(?<![A-Za-z0-9_-])G[1-9](?![-.\dA-Za-z])", "this study", t)
    return t

def source_for(rel):
    """Map a site-root-relative path to its source file (or None if blocked/unknown)."""
    if any(b in rel for b in BLOCK):
        return "BLOCKED"
    head, _, rest = rel.partition("/")
    if head == "data":
        return ROOT / "data" / rest
    if head == "shared":
        return ROOT / "sites" / "shared" / rest
    if head == "assets":
        return ROOT / "assets" / "keenable" / rest
    if head == "kit":
        return ROOT / "kit" / rest
    if head == "galactica":
        return ROOT / "sites" / "galactica" / rest
    if head == "research":
        return ROOT / "research" / rest
    return SRC / rel

if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir(parents=True)

# 1. the site's own built files
queue = []
for p in SRC.rglob("*"):
    rel = p.relative_to(SRC)
    if not p.is_file() or rel.parts[0] in SKIP_DIRS or p.name.startswith("."):
        continue
    if p.suffix in (".py", ".mjs") or p.name in ("COMPONENTS.md", "index.template.html"):
        continue
    if rel.parts[0] == "player" and p.name in ("README.md", "demo.html"):
        continue  # higgs-ad's internal notes and test page stay local
    if "chapters" in rel.parts and p.suffix == ".html":
        continue
    dst = OUT / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, dst)
    if p.suffix in (".md", ".json"):
        dst.write_text(scrub(p.read_text(errors="ignore")))
    if p.suffix in (".html", ".css", ".js") or rel.as_posix() == "toc/brief-map.json":
        queue.append(rel.as_posix())  # brief-map.json: its proof hrefs become links on the #9 slides and in the TOC

# 1b. media for the cloud: the HLS copies (every file < 24 MB), posters and chapters.json; the big MP4s stay local (team-lead, 1 Oct 23:20Z)
MEDIA = SRC / "media"
for p in sorted(MEDIA.glob("hls/**/*")) + sorted(MEDIA.glob("*.jpg")) + [MEDIA / "chapters.json"]:
    if p.is_file() and not p.name.startswith("."):
        dst = OUT / p.relative_to(SRC); dst.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(p, dst)

# 2. follow references
seen, missing, blocked = set(), [], []
while queue:
    relfile = queue.pop()
    text = (OUT / relfile).read_text(errors="ignore")
    base = posixpath.dirname(relfile)
    if relfile.endswith(".js") and "/chapters/" in "/" + relfile:
        base = posixpath.dirname(posixpath.dirname(relfile))  # chapter scripts run in their page's folder
    if relfile.endswith(".js") and relfile.startswith("full/"):
        base = ""  # the frozen extended build (full.html + full/, ruling #7) runs its scripts from full.html's folder
    if relfile == "toc/brief-map.json":
        base = ""  # its hrefs are rendered into index.html, so they resolve from the deck's folder
    refs = []
    for m in REF.finditer(text):
        whole = next(g for g in m.groups() if g)
        if whole.startswith("data:") or "<svg" in whole or "%3Csvg" in whole or "${" in whole:
            continue  # "${…}": a template-literal expression, not a path
        refs += [r for r in whole.split() if "$" not in r and "{" not in r and "=" not in r]
    for ref in refs:
        if re.match(r"^(https?:|mailto:|data:|//|#|javascript:)", ref) or ref.endswith("/"):
            continue
        # "/v2/…" (link-preview tags): absolute on the deploy host, where the bundle root is /v2/
        target = posixpath.normpath(ref[4:] if ref.startswith("/v2/") else posixpath.join(base, ref))
        while target.startswith("../"):
            target = target[3:]  # above the deploy root resolves to root
        if target.startswith("media/"):
            continue  # films are not bundled
        if target in seen:
            continue
        seen.add(target)
        if (OUT / target).exists():
            continue
        src = source_for(target)
        if src == "BLOCKED":
            blocked.append(f"{relfile} -> {target}")
            continue
        if not src.exists() and relfile.endswith(".js"):
            alt = posixpath.normpath(ref).lstrip("./")  # scripts that resolve their strings from the site root (index-map/map.js: new URL(p, ROOT))
            if (OUT / alt).exists():
                continue
            if source_for(alt) not in ("BLOCKED", None) and Path(source_for(alt)).exists():
                target, src = alt, source_for(alt)  # ship it at its root path
        if not src.exists():
            stripped = re.sub(r"^client/[^/]+/", "", target)
            if stripped != target and (OUT / stripped).exists() or source_for(stripped) not in ("BLOCKED", None) and Path(source_for(stripped)).exists():
                continue  # loose text match of a path that the real ../../ link already resolves
            missing.append(f"{relfile} -> {target}")
            continue
        dst = OUT / target
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.suffix in (".json", ".md") and (target.startswith("data/") or target.startswith("research/") or target.startswith("memo/") or target.startswith("kit/")):
            raw = src.read_text(errors="ignore")
            if src.suffix == ".md" and target.startswith("research/"):
                if src.name == "g9_channel.md" and (ROOT / "sites/galactica/appendix/g9_channel.md").exists():
                    raw = (ROOT / "sites/galactica/appendix/g9_channel.md").read_text()
                raw = sanitize_md(raw)
            dst.write_text(scrub(raw))
        elif False:
            if src.name == "g9_channel.md" and (ROOT / "sites/galactica/appendix/g9_channel.md").exists():
                src = ROOT / "sites/galactica/appendix/g9_channel.md"  # already cleaned of network notes
            dst.write_text(sanitize_md(src.read_text()))
        else:
            shutil.copy2(src, dst)
        if dst.suffix in (".css", ".js", ".html"):
            queue.append(target)

(OUT / "robots.txt").write_text("User-agent: *\nDisallow: /\n")
(OUT / "vercel.json").write_text('{\n "cleanUrls": true,\n "headers": [{"source": "/(.*)", "headers": [{"key": "X-Robots-Tag", "value": "noindex"}]}]\n}\n')

# 3. privacy lint over everything that ships
# Public mirror: the private-name entries of this lint are omitted.
LINT = re.compile(r"(?<![A-Za-z0-9_-])(?-i:G[1-9])(?![-.\dA-Za-z])|(?-i:\blanes?\b)|teammate|team-lead|~/Genie|/Users/|scratch/keenable|George's|Iqram|ESCP|2nd-degree via|NEEDS KEY|apikey_|goal[- ]status|Claude agent|the role George|g-fence|candidacy\.md|targets_g5|g9_parts|gate C\b", re.I)
hits = []
for f in OUT.rglob("*"):
    if f.is_file() and f.suffix in (".html", ".js", ".json", ".md", ".css"):
        t = f.read_text(errors="ignore")
        for m in LINT.finditer(t):
            hits.append(f"{f.relative_to(OUT)}: …{t[max(0, m.start()-40):m.end()+40]!r}…")
files = [f for f in OUT.rglob("*") if f.is_file()]
print(f"v2: {len(files)} files, {sum(f.stat().st_size for f in files)/1e6:.1f} MB; missing={missing}; blocked={blocked}")
print(f"LINT v2: {len(hits)} hit(s)")
for h in hits[:40]:
    print("  ", h.replace("\\n", " ")[:220])
if hits or missing or blocked:
    sys.exit(1)
