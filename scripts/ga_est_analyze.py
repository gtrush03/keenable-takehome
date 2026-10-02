#!/usr/bin/env python3
"""Galactica estimates, step 4: every measurement and model behind research/galactica_estimates.md.

Inputs (all produced by earlier steps, no network here):
  data/galactica_sample.json      search_biased (200) + broad docs, full indexed text, acquired_at
  data/jev_galactica_scores.json  live Jev edu scores for the 200 search_biased docs (G7)
  data/galactica_jev_broad.json   live Jev scores for <= 600 broad docs (step 3)
  data/ga_robots_cache/           robots.txt / ai.txt / tdmrep.json per host (step 2)
  data/ga_contam_probe.json       targeted Keenable searches for benchmark items (step 2b)
  data/cc_overlap.json            Common Crawl overlap (500 pages)
Outputs: data/galactica_estimates.json, data/charts/ga_est_*.json

    .venv-est/bin/python scripts/ga_est_analyze.py
"""
import hashlib
import json
import math
import random
import re
import statistics
import sys
import unicodedata
import urllib.parse
import urllib.robotparser
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import langid
import numpy as np
import tiktoken
import tldextract

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ga_est_bench import ITEMS as BENCH, NAMES as BENCH_NAMES  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CHARTS = DATA / "charts"
NOW = datetime(2026, 10, 1, 19, 0, tzinfo=timezone.utc)
STOCK_DOCS = 100e9   # Keenable card
FLOW_DOCS = 20e9     # Keenable card, per month
CC_MONTH_PAGES = 2.17e9   # CC-MAIN-2026-39 (opt1_facts A01)
CC_MONTH_NEW_URLS = 587.2e6  # CC-MAIN-2026-39 new URLs (opt1_facts A02)
RNG = np.random.default_rng(20261001)
ENC = tiktoken.get_encoding("cl100k_base")
TLD = tldextract.TLDExtract(suffix_list_urls=())  # bundled public-suffix snapshot, offline
AI_BOTS = ["GPTBot", "CCBot", "ClaudeBot", "Google-Extended", "anthropic-ai"]


# ---------------- statistics ----------------

def wilson(k, n, z=1.96):
    if n == 0:
        return {"k": k, "n": n, "share": None, "ci95": [None, None]}
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return {"k": k, "n": n, "share": round(p, 4), "ci95": [round(max(0, c - h), 4), round(min(1, c + h), 4)]}


def boot(values, fn, B=2000):
    v = np.asarray(values, dtype=float)
    if len(v) == 0:
        return [None, None]
    stats = [fn(v[RNG.integers(0, len(v), len(v))]) for _ in range(B)]
    return [round(float(np.percentile(stats, 2.5)), 4), round(float(np.percentile(stats, 97.5)), 4)]


def ratio_boot(num, den, B=2000):
    num, den = np.asarray(num, float), np.asarray(den, float)
    if len(num) == 0 or den.sum() == 0:
        return {"share": None, "ci95": [None, None]}
    out = []
    for _ in range(B):
        i = RNG.integers(0, len(num), len(num))
        out.append(num[i].sum() / max(1e-9, den[i].sum()))
    return {"share": round(float(num.sum() / den.sum()), 4),
            "ci95": [round(float(np.percentile(out, 2.5)), 4), round(float(np.percentile(out, 97.5)), 4)]}


def rule_of_three(n):
    return round(3 / n, 4) if n else None


def pct(x):
    return None if x is None else round(100 * x, 1)


# ---------------- loading ----------------

def parse_ts(s):
    if s is None or s == "":
        return None
    try:
        if isinstance(s, (int, float)) or re.fullmatch(r"\d{9,11}", str(s)):
            return datetime.fromtimestamp(int(s), tz=timezone.utc)
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


def host_of(u):
    p = urllib.parse.urlsplit(u)
    return f"{p.scheme}://{p.netloc}"


def reg_domain(u):
    e = TLD(u)
    return e.top_domain_under_public_suffix if hasattr(e, "top_domain_under_public_suffix") else e.registered_domain, e.suffix


def clean_for_lid(t):
    t = re.sub(r"https?://\S+", " ", t)
    t = re.sub(r"[#*_>`|\[\]()!]+", " ", t)
    return t[:4000]


# ---------------- per-doc features ----------------

STOP = {"the", "be", "to", "of", "and", "that", "have", "with"}
NON_SPACE_LANGS = {"zh", "ja", "ko", "th", "lo", "km", "my"}


def gopher(text, lang):
    """Subset of Gopher quality rules (Rae et al. 2021, as in datatrove GopherQualityFilter). None = not applicable."""
    if lang in NON_SPACE_LANGS:
        return None, "not applicable (no word spacing)"
    words = text.split()
    n = len(words)
    if n < 50:
        return False, "fewer than 50 words"
    if n > 100_000:
        return False, "more than 100K words"
    mwl = statistics.mean(len(w) for w in words)
    if not 3 <= mwl <= 10:
        return False, "mean word length outside 3-10"
    if (text.count("#") + text.count("...") + text.count("…")) / n > 0.1:
        return False, "symbol-to-word ratio > 0.1"
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if lines and sum(l[:1] in "-*•" for l in lines) / len(lines) > 0.9:
        return False, "> 90% bullet lines"
    if lines and sum(l.endswith(("...", "…")) for l in lines) / len(lines) > 0.3:
        return False, "> 30% lines end with ellipsis"
    if sum(bool(re.search(r"[^\W\d_]", w)) for w in words) / n < 0.8:
        return False, "< 80% words contain a letter"
    if lang == "en" and len(STOP & {w.lower().strip(".,;:!?") for w in words}) < 2:
        return False, "fewer than 2 English stop words"
    return True, "pass"


EMAIL = re.compile(r"(?<![\w.])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b")
ROLE = re.compile(r"^(info|contact|support|sales|hello|admin|press|help|team|office|noreply|no-reply|media|privacy|legal|"
                  r"service|customerservice|marketing|feedback|webmaster|careers|jobs|hr|billing|enquiries|inquiries|mail|news)@", re.I)
PHONE = re.compile(r"(?<![\w/.-])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-])\d{3,4}[\s.-]\d{3,4}(?![\w/-])")
ADDRESS = re.compile(r"\b\d{1,5}\s+(?:[A-Z][a-zA-Z]+\s){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|"
                     r"Court|Ct|Way|Place|Pl|Terrace|Parkway|Pkwy|Highway|Hwy)\b\.?")
IPV4 = re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b")
ADULT = ["porn", "xxx", "nude", "nudes", "sex video", "escort", "onlyfans", "camgirl", "hentai", "nsfw", "erotic"]
GAMBLING = ["casino", "sportsbook", "betting", "free spins", "slot machine", "poker bonus", "no deposit bonus"]
AI_MARKERS = ["as an ai language model", "i hope this helps", "in today's fast-paced", "delve into", "it's important to note",
              "it is important to note", "in conclusion,", "a testament to", "rich tapestry", "unlock the power", "navigating the"]
KNOWN_AI_DOMAINS = {"grokipedia.com": "Grok-generated encyclopedia (xAI)"}
OPEN_LIC = re.compile(r"creative commons|\bcc[- ]by\b|\bcc0\b|licensed under the (?:mit|apache|gnu)|public domain", re.I)
RESERVED = re.compile(r"all rights reserved|©|\(c\)\s*\d{4}|copyright\s+(?:©\s*)?\d{4}", re.I)

EU_TLDS = set("at be bg hr cy cz dk ee fi fr de gr hu ie it lv lt lu mt nl pl pt ro sk si es se eu is li no".split())
EU_LANGS = set("de fr it nl pl sv cs el hu ro bg da fi sk sl lt lv et hr mt ga".split())  # excludes en/es/pt (mostly non-EU speakers)


def content_type(url, page_type=None):
    u = url.lower()
    h = urllib.parse.urlsplit(u).netloc
    path = urllib.parse.urlsplit(u).path
    if path.endswith(".pdf"):
        return "pdf"
    if any(x in h for x in ("github.", "gitlab.", "stackoverflow.", "readthedocs", "npmjs.", "pypi.", "developer.", "docs.",
                            "w3schools", "geeksforgeeks", "kubernetes.io", "docker.com", "rust-lang", "python.org",
                            "programiz", "freecodecamp", "mozilla.org")) or "/docs" in path or "/api" in path:
        return "code_docs"
    if any(x in h for x in ("reddit.", "quora.", "forum", "community.", "discourse", "stackexchange", "boards.", "discuss")) \
            or "/forum" in path or "/threads/" in path or "/t/" in path or "/topic" in path:
        return "forum"
    if any(x in h for x in ("wikipedia.", "britannica.", "wiktionary.", "grokipedia.", "dictionary", "encyclopedia",
                            "khanacademy", "nih.gov", "libretexts")) or h.endswith((".edu", ".gov")) or ".ac." in h or ".gov." in h:
        return "reference"
    if page_type == "news" or any(x in h for x in ("news", "bbc.", "cnn.", "nytimes", "reuters", "apnews", "theguardian",
                                                     "times", "post.", "herald", "tribune", "journal")) or "/news/" in path:
        return "news"
    if page_type == "commerce" or any(x in h for x in ("amazon.", "ebay.", "zillow.", "booking.", "walmart.", "etsy.", "shop",
                                                         "store", "realtor", "cars.", "autotrader", "expedia", "tripadvisor")) \
            or any(x in path for x in ("/product", "/shop", "/p/", "/dp/", "/item", "/buy")):
        return "commerce"
    if page_type == "forum_or_social":
        return "forum"
    if page_type == "tutorial_or_reference":
        return "reference"
    return "other"


# ---------------- dedup ----------------

def norm_text(t):
    t = unicodedata.normalize("NFKC", t).lower()
    return re.sub(r"\s+", " ", t).strip()


def shingles(t, k=5):
    w = re.findall(r"\w+", t)
    return {" ".join(w[i:i + k]) for i in range(max(0, len(w) - k + 1))}


def minhash(sh, a, b, P=(1 << 31) - 1):
    x = np.array([int.from_bytes(hashlib.blake2b(s.encode(), digest_size=4).digest(), "little") % P for s in sh], dtype=np.uint64)
    return ((np.outer(a, x) + b[:, None]) % P).min(axis=1)


# ---------------- robots ----------------

def load_robot(url):
    f = DATA / "ga_robots_cache" / (hashlib.sha1(url.encode()).hexdigest()[:20] + ".json")
    return json.loads(f.read_text()) if f.exists() else None


def looks_html(b):
    return bool(re.search(r"<\s*(!doctype|html|head|body)", b[:2000], re.I))


def robots_record(host):
    r = load_robot(host + "/robots.txt")
    if r is None:
        return None
    st = r.get("status")
    rec = {"host": host, "status": st, "parser": None, "explicit_ai_groups": [], "content_signal_ai_train_no": False,
           "content_signal_present": False}
    if st is None or (isinstance(st, int) and st >= 500):
        rec["state"] = "unreachable"  # RFC 9309: assume complete disallow; we exclude these from the denominator
        return rec
    body = r.get("body", "")
    if st != 200 or looks_html(body):
        rec["state"] = "no_robots"  # 4xx or HTML soft-404: RFC 9309 says crawlers may access everything
        return rec
    rec["state"] = "robots"
    rec["parser"] = Robots(body)
    uas = [m.group(1).strip().lower() for m in re.finditer(r"(?im)^\s*user-agent\s*:\s*([^#\r\n]+)", body)]
    rec["explicit_ai_groups"] = [b for b in AI_BOTS if b.lower() in uas]
    rec["mentions_keenablebot"] = "keenablebot" in uas
    cs = re.findall(r"(?im)^\s*content-signal\s*:\s*([^#\r\n]+)", body)
    rec["content_signal_present"] = bool(cs)
    rec["content_signal_ai_train_no"] = any(re.search(r"ai-train\s*=\s*no", c, re.I) for c in cs)
    return rec


class Robots:
    """RFC 9309 matcher: groups by product token (case-insensitive), '*' fallback, rules merged across matching groups,
    longest path match wins, Allow wins ties, '*' and '$' wildcards. (urllib.robotparser uses first match, not longest.)"""

    def __init__(self, body):
        self.groups = []  # (agents, [(allow, pattern)])
        agents, rules, last_ua = [], [], False
        for raw in body.splitlines():
            line = raw.split("#", 1)[0].strip()
            if ":" not in line:
                continue
            k, v = (x.strip() for x in line.split(":", 1))
            k = k.lower()
            if k == "user-agent":
                if not last_ua and (agents or rules):
                    self.groups.append((agents, rules))
                    agents, rules = [], []
                agents.append(v.lower())
                last_ua = True
            elif k in ("allow", "disallow"):
                last_ua = False
                if agents and v:
                    rules.append((k == "allow", v))
            else:
                last_ua = False if k not in ("crawl-delay",) else last_ua
        if agents:
            self.groups.append((agents, rules))

    @staticmethod
    def _rx(pat):
        end = pat.endswith("$")
        core = re.escape(pat[:-1] if end else pat).replace(r"\*", ".*")
        return re.compile("^" + core + ("$" if end else ""))

    def can_fetch(self, agent, url):
        a = agent.lower()
        rules = [r for ags, rs in self.groups if a in ags for r in rs]
        if not any(a in ags for ags, _ in self.groups):
            rules = [r for ags, rs in self.groups if "*" in ags for r in rs]
        p = urllib.parse.urlsplit(url)
        path = (p.path or "/") + (("?" + p.query) if p.query else "")
        best = None
        for allow, pat in rules:
            if self._rx(pat).match(path):
                key = (len(pat), allow)
                if best is None or key > best:
                    best = key
        return True if best is None else best[1]


def ai_txt(host):
    r = load_robot(host + "/ai.txt")
    if not r or r.get("status") != 200:
        return None
    b = r.get("body", "")
    if looks_html(b) or not re.search(r"(?im)^\s*(user-agent|disallow|allow)\s*:", b):
        return None
    return {"present": True, "disallow_all": bool(re.search(r"(?im)^\s*disallow\s*:\s*/\s*$", b))}


def tdmrep(host):
    r = load_robot(host + "/.well-known/tdmrep.json")
    if not r or r.get("status") != 200:
        return None
    try:
        j = json.loads(r.get("body", ""))
    except Exception:
        return None
    rows = j if isinstance(j, list) else [j]
    if not any(isinstance(x, dict) and "tdm-reservation" in x for x in rows):
        return None
    return {"present": True, "reserved": any(isinstance(x, dict) and str(x.get("tdm-reservation")) == "1" for x in rows)}


# ---------------- main ----------------

def main():
    S = json.loads((DATA / "galactica_sample.json").read_text())
    docs = S["docs"]
    g7 = {d["url"]: d for d in json.loads((DATA / "jev_galactica_scores.json").read_text())["docs"]}
    jb_file = DATA / "galactica_jev_broad.json"
    jb = json.loads(jb_file.read_text()) if jb_file.exists() else {"meta": {}, "docs": []}
    jbroad = {d["url"]: d for d in jb["docs"] if "error" not in d}
    cc = json.loads((DATA / "cc_overlap.json").read_text())

    out = {"generated_at": NOW.isoformat(), "inputs": {
        "sample": "data/galactica_sample.json", "jev_search_biased": "data/jev_galactica_scores.json",
        "jev_broad": "data/galactica_jev_broad.json", "robots": "data/ga_robots_cache/ + data/ga_robots_hosts.json",
        "cc_overlap": "data/cc_overlap.json", "contam_probe": "data/ga_contam_probe.json"},
        "caveat": S["meta"]["caveat"], "sample_meta": S["meta"]}

    # ---- per-doc features ----
    for d in docs:
        t = d.get("text") or ""
        d["has_text"] = len(t.strip()) >= 1
        d["tokens"] = len(ENC.encode(t, disallowed_special=())) if t else 0
        d["lang"], _ = langid.classify(clean_for_lid(t)) if t.strip() else ("none", 0)
        d["reg_domain"], d["suffix"] = reg_domain(d["url"])
        d["host"] = host_of(d["url"])
        j = g7.get(d["url"]) if d["sample"] == "search_biased" else jbroad.get(d["url"])
        d["jev"] = j
        d["ctype"] = content_type(d["url"], (j or {}).get("page_type"))
        gp, why = gopher(t, d["lang"]) if t.strip() else (False, "no text")
        d["gopher_pass"], d["gopher_reason"] = gp, why
        d["acq"] = parse_ts(d.get("acquired_at"))
        d["pub"] = parse_ts(d.get("published_at"))
    texted = [d for d in docs if d["has_text"]]
    groups = {"broad": [d for d in texted if d["sample"] == "broad"],
              "search_biased": [d for d in texted if d["sample"] == "search_biased"], "pooled": texted}
    out["counts"] = {"docs": len(docs), "with_text": len(texted),
                     "no_text_or_fetch_error": len(docs) - len(texted),
                     "by_sample": {k: len(v) for k, v in groups.items()},
                     "distinct_hosts": len({d["host"] for d in docs}), "distinct_reg_domains": len({d["reg_domain"] for d in docs})}

    # ---- 1. language ----
    lang = {}
    for g, ds in groups.items():
        c = Counter(d["lang"] for d in ds)
        n = len(ds)
        lang[g] = {"n": n, "n_languages": len(c), "top": [{"lang": l, **wilson(k, n)} for l, k in c.most_common(15)],
                   "non_english": wilson(n - c.get("en", 0), n)}
    lang["method"] = "langid.py 1.1.6 (Lui & Baldwin 2012, 97 languages) on the first 4,000 chars after stripping URLs and markdown"
    ml = [d for d in docs if d["query_type"] == "multilingual"]
    per_q = defaultdict(Counter)
    for d in ml:
        per_q[d["query"]][d["lang"]] += 1
    lang["multilingual_query_check"] = {
        "results_not_english": wilson(sum(d["lang"] != "en" for d in ml), len(ml)),
        "queries_with_zero_non_english_results": [q for q, c in per_q.items() if c.get("en", 0) == sum(c.values())],
        "per_query": {q: dict(c.most_common(3)) for q, c in per_q.items()},
        "reading": ("The broad sample's English share mostly mirrors the query mix (82 of 102 queries are English), so it is "
                    "not an index-wide language share. The useful measurement is coverage: what non-English queries get back.")}
    lang["cc_baseline"] = "Common Crawl: 41.86% English (opt1_facts E14)"
    out["language"] = lang

    # ---- 2. tokens ----
    tok = {}
    for g, ds in groups.items():
        v = np.array([d["tokens"] for d in ds], float)
        tok[g] = {"n": len(v), "mean": round(float(v.mean())), "mean_ci95": [round(x) for x in boot(v, np.mean)],
                  "p10": round(float(np.percentile(v, 10))), "p50": round(float(np.percentile(v, 50))),
                  "p90": round(float(np.percentile(v, 90))), "median_ci95": [round(x) for x in boot(v, np.median)],
                  "trimmed_mean_5_95": round(float(v[(v >= np.percentile(v, 5)) & (v <= np.percentile(v, 95))].mean())),
                  "share_at_100k_char_cap": round(sum(d.get("text_truncated_at_cap", False) for d in ds) / len(ds), 4),
                  "chars_per_token": round(sum(len(d["text"]) for d in ds) / max(1, v.sum()), 3)}
    b = tok["broad"]
    tok["method"] = ("tiktoken cl100k_base on Keenable's indexed text (fetch max_chars=100,000; docs at the cap are "
                     "counted at the cap, so means are slight underestimates). Fetch errors excluded.")
    PRIOR_HI = 1200  # card prior: 600-1,200 tok/doc (opt1_card_v2 §2; A23, A27, A29)
    tok["extrapolation"] = {
        "label": "MODEL",
        "stock_tokens": {"point": STOCK_DOCS * b["p50"], "range": [STOCK_DOCS * PRIOR_HI, STOCK_DOCS * b["mean_ci95"][1]],
                         "at_sample_mean": STOCK_DOCS * b["mean"]},
        "flow_tokens_per_month": {"point": FLOW_DOCS * b["p50"], "range": [FLOW_DOCS * PRIOR_HI, FLOW_DOCS * b["mean_ci95"][1]],
                                  "at_sample_mean": FLOW_DOCS * b["mean"]},
        "how": ("docs (Keenable card: 100B stock, +20B/month) x tokens/doc. Point = broad-sample MEDIAN (search ranking favours "
                "long pages, so the mean overstates the index); low = the card's 1,200 tok/doc prior (an index that looks like "
                "CC WET); high = upper 95% CI of the broad-sample mean."),
        "card_model_before": "60-120T at 600-1,200 tok/doc (opt1_card_v2 §2, MODEL)"}
    out["tokens"] = tok

    # ---- 3. duplication ----
    # exact
    hmap = defaultdict(list)
    for i, d in enumerate(texted):
        hmap[hashlib.sha1(norm_text(d["text"]).encode()).hexdigest()].append(i)
    exact_extra = sum(len(v) - 1 for v in hmap.values())
    # near-dup
    P = (1 << 31) - 1
    rs = np.random.default_rng(7)
    a = rs.integers(1, P, 128, dtype=np.uint64)
    bb = rs.integers(0, P, 128, dtype=np.uint64)
    sh = [shingles(norm_text(d["text"])) for d in texted]
    ok = [i for i, s in enumerate(sh) if len(s) >= 5]
    sig = np.stack([minhash(sh[i], a, bb) for i in ok])
    n_ok = len(ok)
    eq = np.zeros((n_ok, n_ok), dtype=np.int16)
    for c in range(sig.shape[1]):
        col = sig[:, c]
        eq += (col[:, None] == col[None, :])
    est = eq / sig.shape[1]
    parent = list(range(n_ok))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    pairs = []
    ii, jj = np.where(np.triu(est >= 0.6, 1))
    for i, j in zip(ii, jj):
        A, B = sh[ok[i]], sh[ok[j]]
        jac = len(A & B) / len(A | B)
        if jac >= 0.8:
            pairs.append((ok[i], ok[j], round(jac, 3)))
            parent[find(i)] = find(j)
    clusters = Counter(find(i) for i in range(n_ok))
    near_extra = sum(c - 1 for c in clusters.values() if c > 1)
    examples = [{"a": texted[i]["url"], "b": texted[j]["url"], "jaccard": jac} for i, j, jac in pairs[:8]]
    # boilerplate: lines repeated across >= 3 docs
    line_docs = defaultdict(set)
    for i, d in enumerate(texted):
        for l in {l.strip() for l in d["text"].splitlines() if len(l.strip()) >= 20}:
            line_docs[l].add(i)
    rep_chars = tot_chars = 0
    host_rep_chars = 0
    host_lines = defaultdict(lambda: defaultdict(set))
    for i, d in enumerate(texted):
        for l in {l.strip() for l in d["text"].splitlines() if len(l.strip()) >= 20}:
            host_lines[d["reg_domain"]][l].add(i)
    for i, d in enumerate(texted):
        for l in d["text"].splitlines():
            s = l.strip()
            if not s:
                continue
            tot_chars += len(s)
            if len(s) >= 20 and len(line_docs[s]) >= 3:
                rep_chars += len(s)
            if len(s) >= 20 and len(host_lines[d["reg_domain"]][s]) >= 2:
                host_rep_chars += len(s)
    jev_bp = [d["jev"]["boilerplate_p"] for d in texted if d["jev"]]
    out["duplication"] = {
        "n": len(texted),
        "exact_duplicate_docs": wilson(exact_extra, len(texted)),
        "near_duplicate_docs_jaccard_0_8": wilson(near_extra, len(texted)),
        "near_dup_pairs": len(pairs), "near_dup_examples": examples,
        "repeated_line_char_share_ge3_docs": round(rep_chars / max(1, tot_chars), 4),
        "same_domain_repeated_line_char_share": round(host_rep_chars / max(1, tot_chars), 4),
        "jev_boilerplate_dominant": wilson(sum(p >= 0.5 for p in jev_bp), len(jev_bp)),
        "method": ("Exact: SHA-1 of NFKC-lowercased, whitespace-collapsed text. Near-dup: word 5-gram shingles, 128-perm "
                   "MinHash (candidates at estimated J >= 0.6), confirmed by exact Jaccard >= 0.8, union-find clusters; "
                   "count = docs minus one per cluster. Boilerplate: characters in lines >= 20 chars that recur in >= 3 docs "
                   "(cross-site) or >= 2 docs of the same registered domain."),
        "caveat": ("A top-10 search sample is de-duplicated by the ranker and spread over ~100 queries, so it can only show a "
                   "floor. Corpus-level duplication is a MODEL: RedPajama-V2 dedup removed ~40% of tokens (A27); FineWeb "
                   "per-crawl MinHash removes a similar order (A16)."),
        "corpus_model": {"label": "MODEL", "dup_token_share_range": [0.25, 0.45],
                         "how": "literature range for a raw multi-month web crawl (A27 RedPajama-V2 ~40%); floor = this sample"}}

    # ---- 4. quality (Jev) ----
    q = {}
    for g in ("search_biased", "broad", "pooled"):
        ds = [d for d in groups[g] if d["jev"]]
        sc = np.array([d["jev"]["edu_score"] for d in ds], float)
        tk = np.array([d["tokens"] for d in ds], float)
        row = {"n": len(ds)}
        if len(ds):
            for th in (1, 2, 3, 4):
                row[f"docs_ge{th}"] = wilson(int((sc >= th).sum()), len(ds))
                row[f"tokens_ge{th}"] = ratio_boot(tk * (sc >= th), tk)
            row["mean_score"] = round(float(sc.mean()), 3)
            row["hist_rounded"] = {str(k): int((np.round(sc) == k).sum()) for k in range(6)}
            row["hist_floor"] = {str(k): int((np.minimum(np.floor(sc), 4) == k).sum()) for k in range(5)}  # [k, k+1); 4 = [4, 5]
            row["by_query_type"] = {}
            for qt in sorted({d["query_type"] for d in ds}):
                v = [d["jev"]["edu_score"] for d in ds if d["query_type"] == qt]
                row["by_query_type"][qt] = {"n": len(v), "mean": round(statistics.mean(v), 2),
                                            "share_ge3": round(sum(x >= 3 for x in v) / len(v), 3)}
        q[g] = row
    q["method"] = ("Live Jev jev-1.13.0, FineWeb-Edu additive rubric 0-5 (same prompt as the G7 proof), first 8,000 chars of "
                   "Keenable's indexed text. Broad docs: seeded random draw. Token shares weight each doc by its full cl100k tokens.")
    q["jev_broad_meta"] = jb.get("meta", {})
    q["fineweb_edu_reference"] = "FineWeb-Edu threshold 3 removed 92% of FineWeb (HF card); i.e. ~8% of a CC-derived pool scores >= 3"
    out["quality"] = q

    # gopher
    gp = {}
    for g, ds in groups.items():
        app = [d for d in ds if d["gopher_pass"] is not None]
        tk = np.array([d["tokens"] for d in app], float)
        pas = np.array([1.0 if d["gopher_pass"] else 0.0 for d in app])
        gp[g] = {"applicable": len(app), "pass_docs": wilson(int(pas.sum()), len(app)), "pass_tokens": ratio_boot(tk * pas, tk),
                 "fail_reasons": dict(Counter(d["gopher_reason"] for d in app if not d["gopher_pass"]).most_common())}
    gp["method"] = "Gopher rules (Rae et al. 2021) as listed in datatrove GopherQualityFilter; stop-word rule only for English; CJK/Thai skipped"
    out["gopher"] = gp

    # usable tokens model
    tkm = tok["broad"]
    qb = q["broad"] if q["broad"]["n"] else q["pooled"]
    gb = gp["broad"]["pass_tokens"]
    dup_lo, dup_hi = out["duplication"]["corpus_model"]["dup_token_share_range"]

    def usable(share, share_ci):
        pt = STOCK_DOCS * tkm["p50"] * (1 - (dup_lo + dup_hi) / 2) * share
        lo = STOCK_DOCS * 1200 * (1 - dup_hi) * share_ci[0]
        hi = STOCK_DOCS * tkm["mean_ci95"][1] * (1 - dup_lo) * share_ci[1]
        return {"keep_share": share, "keep_share_ci95": share_ci, "stock_point": pt, "stock_range": [lo, hi],
                "flow_month_point": pt / 5, "flow_month_range": [lo / 5, hi / 5]}
    out["usable_tokens"] = {
        "label": "MODEL",
        "raw": {"stock_point": STOCK_DOCS * tkm["p50"], "flow_month_point": FLOW_DOCS * tkm["p50"]},
        "after_dedup_gopher": usable(gb["share"], gb["ci95"]),
        "edu_ge2": usable(qb["tokens_ge2"]["share"], qb["tokens_ge2"]["ci95"]),
        "edu_ge3": usable(qb["tokens_ge3"]["share"], qb["tokens_ge3"]["ci95"]),
        "how": ("raw tokens x (1 - corpus dup share 25-45%, MODEL) x measured keep share (token-weighted, broad sample). "
                "Point = median tokens/doc and 35% dup; range = (1,200 tok/doc prior, 45% dup, lower CI) to (upper mean CI, "
                "25% dup, upper CI). Flow = stock / 5 (20B of 100B docs per month)."),
        "note": "Gopher and edu filters overlap; the edu tiers are applied to the deduped pool, not on top of Gopher."}

    # ---- 5. freshness ----
    fr = {}
    for g, ds in groups.items():
        acq = [d["acq"] for d in ds if d["acq"]]
        n = len(acq)
        age = np.array([(NOW - x).total_seconds() / 86400 for x in acq])
        fr[g] = {"n_with_acquired_at": n, "share_of_docs_with_acquired_at": round(n / max(1, len(ds)), 4),
                 "last_30d": wilson(int((age <= 30).sum()), n), "last_90d": wilson(int((age <= 90).sum()), n),
                 "last_365d": wilson(int((age <= 365).sum()), n),
                 "before_2020": wilson(sum(x.year < 2020 for x in acq), n),
                 "median_age_days": round(float(np.median(age)), 1) if n else None,
                 "median_age_ci95": boot(age, np.median) if n else None,
                 "p90_age_days": round(float(np.percentile(age, 90)), 1) if n else None,
                 "earliest": min(acq).isoformat() if acq else None,
                 "by_year": dict(sorted(Counter(str(x.year) for x in acq).items())),
                 "by_month_2026": dict(sorted(Counter(x.strftime("%Y-%m") for x in acq if x.year == 2026).items()))}
        pubs = [d["pub"] for d in ds if d["pub"]]
        fr[g]["published_at_present"] = wilson(len(pubs), len(ds))
        fr[g]["published_last_365d"] = wilson(sum((NOW - p).days <= 365 for p in pubs), len(pubs))
        both = [(d["pub"], d["acq"]) for d in ds if d["pub"] and d["acq"]]
        fr[g]["published_after_acquired_gt1d"] = wilson(sum((p - a).total_seconds() > 86400 for p, a in both), len(both))
        fr[g]["published_in_future"] = wilson(sum(p > NOW for p, _ in both), len(both))
    out["freshness"] = fr
    out["acquired_at_observed"] = {
        "label": "MEASURED",
        "fact": (f"Every one of the {sum(1 for d in docs if d['acq'])} of {len(docs)} search results in this sample carried an "
                 "acquired_at timestamp (UTC, ISO 8601) in the /v1/search/public response. The field exists per document "
                 "today, so a dump can carry it."),
        "share": wilson(sum(1 for d in docs if d["acq"]), len(docs)),
        "fetch_endpoint_note": "/v1/fetch/public returns published_at as epoch seconds (string) and no acquired_at; search returns ISO strings for both"}

    # net-new model
    p26 = cc["pooled"]["absent_from_all_2026_crawls"]
    pev = cc["pooled"]["absent_from_every_crawl"]
    recent = [r for r in cc["rows"] if (parse_ts(r.get("acquired_at")) or NOW.replace(year=1990)) >= datetime(2026, 9, 1, tzinfo=timezone.utc)]
    rec26 = wilson(sum(not r["in_2026"] for r in recent), len(recent))
    # share of the monthly flow that is newly written: acquired in the last 30 days AND published within 30 days before acquisition
    fl = [d for d in groups["broad"] if d["acq"] and (NOW - d["acq"]).days <= 30]
    flp = [d for d in fl if d["pub"]]
    newly = wilson(sum(0 <= (d["acq"] - d["pub"]).total_seconds() / 86400 <= 30 for d in flp), len(flp))
    nn = lambda share: FLOW_DOCS * share
    out["net_new_model"] = {
        "label": "MODEL",
        "inputs": {"flow_docs_month": FLOW_DOCS, "absent_all_2026_cc": p26, "absent_every_cc": pev,
                   "recent_acquired_since_2026_09_01_absent_all_2026_cc": rec26,
                   "flow_newly_written_share": newly},
        "vs_cc_pool_docs_month": {"point": nn(pev["share"]), "range": [nn(pev["ci95"][0]), nn(p26["ci95"][1])]},
        "vs_cc_pool_share_of_flow": {"point": pev["share"], "range": [pev["ci95"][0], p26["ci95"][1]]},
        "vs_cc_new_urls_ratio": {"point": round(nn(pev["share"]) / CC_MONTH_NEW_URLS, 1),
                                 "range": [round(nn(pev["ci95"][0]) / CC_MONTH_NEW_URLS, 1), round(nn(p26["ci95"][1]) / CC_MONTH_NEW_URLS, 1)]},
        "vs_last_galactica_dump_floor_docs_month": {"point": nn(newly["share"]) if newly["share"] is not None else None,
                                                    "range": [nn(x) for x in newly["ci95"]] if newly["share"] is not None else None},
        "how": ("A lab training on Common Crawl: net-new docs/month = 20B flow x share of Keenable pages absent from CC. Point "
                "= absent from every crawl since 2008 (62.2%); low = its lower CI; high = upper CI of 'absent from all 2026 "
                "crawls'. A lab that already holds last month's Galactica dump: floor = flow x share of docs fetched in the last "
                "30 days whose published_at falls within the 30 days before acquisition (new writing; changed old pages add more)."),
    }
    a30 = fr["broad"]["last_30d"]
    out["acquired_at_semantics"] = {
        "label": "MEASURED + MODEL",
        "observed": {"last_30d": a30, "p90_age_days": fr["broad"]["p90_age_days"], "median_age_days": fr["broad"]["median_age_days"]},
        "implied_cycle_days": round(30 * STOCK_DOCS / FLOW_DOCS),
        "reading": (f"{a30['share']:.0%} of broad results were acquired in the last 30 days, more than the 20% a 20B/100B monthly "
                    f"flow could add if acquired_at were first-seen time; p90 age is {fr['broad']['p90_age_days']:.0f} days, close to "
                    "the 150-day full-recrawl cycle that 100B/20B implies. acquired_at behaves like last-fetch time, and search "
                    "ranks fresh fetches higher. Keenable should ship first_seen_at next to it.")}
    cc_new_share = CC_MONTH_NEW_URLS / CC_MONTH_PAGES
    out["gate_proposal"] = {
        "label": "PROPOSAL",
        "X_percent": 45,
        "gate": "net-new vs the buyer's pool >= 45% of shard documents (URL match or MinHash J >= 0.8 against their pool)",
        "implied_docs_month": FLOW_DOCS * 0.45,
        "basis": [f"Measured share of Keenable pages absent from every CC crawl since 2008: {pev['share']:.1%} "
                  f"(95% CI {pev['ci95'][0]:.1%}-{pev['ci95'][1]:.1%}); 45% sits under the lower bound.",
                  f"Absent from all nine 2026 crawls: {p26['share']:.1%} (CI {p26['ci95'][0]:.1%}-{p26['ci95'][1]:.1%}).",
                  f"Common Crawl's own month-on-month novelty is {cc_new_share:.0%} new URLs (587.2M of 2.17B, CC-MAIN-2026-39), "
                  "so 45% is a bar CC itself cannot clear against a CC pool.",
                  "Headroom of ~4 points below the CI floor covers a lab's own crawl, which overlaps Keenable more than CC does."],
        "fail_rule": "If a shard measures < 45% net-new, the first month is credited (existing gate wording)."}

    # ---- 6. consent / robots ----
    hosts_meta = json.loads((DATA / "ga_robots_hosts.json").read_text()) if (DATA / "ga_robots_hosts.json").exists() else None
    cons = {"label": "MEASURED"}
    if hosts_meta:
        fetched = set(hosts_meta["hosts_fetched"])
        recs = {h: robots_record(h) for h in fetched}
        recs = {h: r for h, r in recs.items() if r}
        states = Counter(r["state"] for r in recs.values())
        known = {h: r for h, r in recs.items() if r["state"] != "unreachable"}
        host_rows = []
        for h, r in known.items():
            at = ai_txt(h)
            tdm = tdmrep(h)
            host_rows.append({"host": h, "state": r["state"], "explicit_ai_groups": r["explicit_ai_groups"],
                              "content_signal_ai_train_no": r["content_signal_ai_train_no"],
                              "content_signal_present": r["content_signal_present"],
                              "ai_txt": bool(at), "ai_txt_disallow_all": bool(at and at["disallow_all"]),
                              "tdmrep": bool(tdm), "tdm_reserved": bool(tdm and tdm["reserved"])})
        hr = {x["host"]: x for x in host_rows}
        # doc-level
        doc_rows = []
        for d in docs:
            h = d["host"]
            if h not in known:
                continue
            r = known[h]
            rp = r["parser"]
            row = {"url": d["url"], "sample": d["sample"], "host": h}
            for bot in AI_BOTS + ["*", "KeenableBot"]:
                row[f"dis_{bot}"] = (not rp.can_fetch(bot if bot != "*" else "somegenericcrawler", d["url"])) if rp else False
            row["explicit_ai_disallow"] = any(row[f"dis_{b}"] for b in r["explicit_ai_groups"])
            row["any_ai_bot_disallow"] = any(row[f"dis_{b}"] for b in AI_BOTS)
            row["ai_train_no"] = r["content_signal_ai_train_no"]
            row["ai_txt_or_tdm"] = hr[h]["ai_txt_disallow_all"] or hr[h]["tdm_reserved"]
            row["opt_out_any_signal"] = row["explicit_ai_disallow"] or row["ai_train_no"] or row["ai_txt_or_tdm"]
            row["generic_disallow"] = row["dis_*"]
            doc_rows.append(row)

        def dshare(key, rows):
            return wilson(sum(bool(x[key]) for x in rows), len(rows))
        by_host = defaultdict(lambda: [0, 0])
        for x in doc_rows:
            by_host[x["host"]][0] += bool(x["opt_out_any_signal"])
            by_host[x["host"]][1] += 1
        hv = list(by_host.values())
        cl = ratio_boot([v[0] for v in hv], [v[1] for v in hv])
        gen = defaultdict(lambda: [0, 0])
        for x in doc_rows:
            gen[x["host"]][0] += bool(x["generic_disallow"])
            gen[x["host"]][1] += 1
        gl = ratio_boot([v[0] for v in gen.values()], [v[1] for v in gen.values()])
        cons.update({
            "generic_disallow_doc_share_cluster_ci": {**gl, "n_docs": len(doc_rows), "n_hosts": len(gen),
                                                      "examples": sorted({x["host"] for x in doc_rows if x["generic_disallow"]})[:20]},
            "headline_opt_out_doc_share_cluster_ci": {**cl, "n_docs": len(doc_rows), "n_hosts": len(hv),
                                                      "ci_method": "bootstrap over hosts (docs cluster by site), 2,000 resamples"},
            "hosts_in_sample": hosts_meta["hosts_total"], "hosts_fetched": len(fetched), "robots_states": dict(states),
            "hosts_known": len(known),
            "host_level": {
                "explicit_group_for_any_ai_bot": wilson(sum(bool(x["explicit_ai_groups"]) for x in host_rows), len(host_rows)),
                "by_bot_explicit_group": {b: wilson(sum(b in x["explicit_ai_groups"] for x in host_rows), len(host_rows)) for b in AI_BOTS},
                "content_signal_present": wilson(sum(x["content_signal_present"] for x in host_rows), len(host_rows)),
                "content_signal_ai_train_no": wilson(sum(x["content_signal_ai_train_no"] for x in host_rows), len(host_rows)),
                "ai_txt_present": wilson(sum(x["ai_txt"] for x in host_rows), len(host_rows)),
                "tdmrep_present": wilson(sum(x["tdmrep"] for x in host_rows), len(host_rows)),
                "tdm_reserved": wilson(sum(x["tdm_reserved"] for x in host_rows), len(host_rows)),
            },
            "doc_level": {
                "n_docs_on_known_hosts": len(doc_rows),
                "opt_out_any_signal": dshare("opt_out_any_signal", doc_rows),
                "explicit_ai_bot_disallow": dshare("explicit_ai_disallow", doc_rows),
                "ai_train_no_content_signal": dshare("ai_train_no", doc_rows),
                "ai_txt_or_tdm_reservation": dshare("ai_txt_or_tdm", doc_rows),
                "disallowed_for_bot": {b: dshare(f"dis_{b}", doc_rows) for b in AI_BOTS},
                "disallowed_for_generic_crawler_star": dshare("generic_disallow", doc_rows),
                "disallowed_for_keenablebot_today": dshare("dis_KeenableBot", doc_rows),
                "by_sample": {s: dshare("opt_out_any_signal", [x for x in doc_rows if x["sample"] == s]) for s in ("broad", "search_biased")},
            },
            "definition": ("Doc opts out of AI training if, today, its URL is disallowed by a robots.txt group that names GPTBot, "
                           "CCBot, ClaudeBot, Google-Extended or anthropic-ai, OR the host's robots.txt carries a Cloudflare "
                           "Content-Signal with ai-train=no, OR /ai.txt disallows all, OR /.well-known/tdmrep.json reserves TDM. "
                           "Hosts whose robots.txt was unreachable (5xx/DNS/timeout) are excluded."),
            "method": ("One GET of /robots.txt, /ai.txt and /.well-known/tdmrep.json per host, <= 2 req/s, descriptive UA, "
                       "2026-10-01. Decisions per document URL by an RFC 9309 longest-match parser (scripts/ga_est_analyze.py: Robots). Hosts: all distinct hosts if <= 400, "
                       "else a uniform seeded random 400; doc shares cover docs on fetched hosts."),
            "hosts_example_opt_out": [x["host"] for x in host_rows if x["explicit_ai_groups"] or x["content_signal_ai_train_no"]][:15],
        })
    out["consent"] = cons

    # ---- 7. PII ----
    pii = {}
    for g, ds in groups.items():
        n = len(ds)
        em = [EMAIL.findall(d["text"]) for d in ds]
        em = [[e for e in x if not re.search(r"\.(png|jpe?g|gif|webp|svg)$", e, re.I)] for x in em]
        ph = [PHONE.findall(d["text"]) for d in ds]
        ad = [ADDRESS.findall(d["text"]) for d in ds]
        ip = [IPV4.findall(d["text"]) for d in ds]
        pers = [[e for e in x if not ROLE.match(e)] for x in em]
        tot_chars = sum(len(d["text"]) for d in ds)
        scrub = sum(sum(len(m) for m in x) for lst in (em, ph, ad, ip) for x in lst)
        pii[g] = {"n": n,
                  "emails_per_1k_docs": round(1000 * sum(map(len, em)) / n, 1),
                  "non_role_emails_per_1k_docs": round(1000 * sum(map(len, pers)) / n, 1),
                  "phones_per_1k_docs": round(1000 * sum(map(len, ph)) / n, 1),
                  "street_addresses_per_1k_docs": round(1000 * sum(map(len, ad)) / n, 1),
                  "ipv4_per_1k_docs": round(1000 * sum(map(len, ip)) / n, 1),
                  "docs_with_email": wilson(sum(bool(x) for x in em), n),
                  "docs_with_phone": wilson(sum(bool(x) for x in ph), n),
                  "docs_with_address": wilson(sum(bool(x) for x in ad), n),
                  "docs_with_any_pii": wilson(sum(bool(a or b or c or e) for a, b, c, e in zip(em, ph, ad, ip)), n),
                  "scrub_removes_char_share": round(scrub / max(1, tot_chars), 5)}
    pii["method"] = ("Regex: emails (RFC-ish, image filenames dropped; role accounts like info@/support@ split out), phones (3-4 digit "
                     "groups with separators, optional +country), US-style street addresses (number + 1-3 capitalised words + suffix), "
                     "IPv4. Precision not audited; phone regex can catch some reference numbers.")
    out["pii"] = pii

    # ---- 8. contamination ----
    def nwords(t):
        t = unicodedata.normalize("NFKC", t).lower().replace("’", "'")
        return re.findall(r"[a-z0-9]+", t)
    W = 10
    item_grams = []
    for bench, iid, txt, src in BENCH:
        w = nwords(txt)
        grams = {" ".join(w[i:i + W]) for i in range(max(1, len(w) - W + 1))}
        item_grams.append((bench, iid, grams))
    hits = []
    name_mentions = 0
    for d in texted:
        nt = " ".join(nwords(d["text"]))
        for bench, iid, grams in item_grams:
            if any(g in nt for g in grams):
                hits.append({"url": d["url"], "benchmark": bench, "item": iid})
        low = d["text"].lower()
        name_mentions += any(nm in low for nm in BENCH_NAMES)
    probe = json.loads((DATA / "ga_contam_probe.json").read_text()) if (DATA / "ga_contam_probe.json").exists() else None
    out["contamination"] = {
        "label": "MEASURED",
        "items_checked": len(BENCH), "benchmarks": sorted({b for b, *_ in BENCH}),
        "item_sources": sorted({s for *_, s in BENCH}),
        "sample_hits": hits, "sample_hit_docs": len({h["url"] for h in hits}),
        "hits_per_1k_docs": round(1000 * len({h["url"] for h in hits}) / len(texted), 2),
        "rule_of_three_upper_95_per_1k": round(1000 * rule_of_three(len(texted)), 2) if not hits else None,
        "docs_mentioning_a_benchmark_name": wilson(name_mentions, len(texted)),
        "targeted_probe": probe,
        "method": (f"Any {W}-word window of a benchmark item (normalised lowercase alphanumerics) found verbatim in a doc. "
                   "15 items from GSM8K, HumanEval, MMLU, ARC and the BIG-bench canary (scripts/ga_est_bench.py). "
                   "A random-ish sample says little about rare items; the targeted probe searches the index for the items directly.")}

    # ---- 9. domain mix ----
    dm = {}
    for g, ds in groups.items():
        rd = Counter(d["reg_domain"] for d in ds)
        n = len(ds)
        singles = sum(1 for d in ds if rd[d["reg_domain"]] == 1)
        f1 = sum(1 for v in rd.values() if v == 1)
        f2 = sum(1 for v in rd.values() if v == 2)
        chao1 = len(rd) + (f1 * f1 / (2 * f2) if f2 else f1 * (f1 - 1) / 2)
        tld = Counter((d["suffix"] or "").split(".")[-1] for d in ds)
        ct = Counter(d["ctype"] for d in ds)
        dm[g] = {"n": n, "distinct_reg_domains": len(rd), "domains_per_100_docs": round(100 * len(rd) / n, 1),
                 "docs_from_domains_seen_once": wilson(singles, n),
                 "top10_domain_doc_share": round(sum(v for _, v in rd.most_common(10)) / n, 4),
                 "top_domains": rd.most_common(15),
                 "tld_share": [{"tld": t, **wilson(k, n)} for t, k in tld.most_common(12)],
                 "content_type": [{"type": t, **wilson(k, n)} for t, k in ct.most_common()],
                 "chao1_domain_richness": round(chao1),
                 "eu_eea_cctld": wilson(sum((d["suffix"] or "").split(".")[-1] in EU_TLDS for d in ds), n),
                 "eu_language": wilson(sum(d["lang"] in EU_LANGS for d in ds), n)}
        sc = [d for d in ds if d["jev"]]
        dm[g]["content_type_jev_scored"] = [{"type": t, **wilson(k, len(sc))} for t, k in Counter(d["ctype"] for d in sc).most_common()]
        if g != "pooled":
            pt = Counter(d["jev"]["page_type"] for d in ds if d["jev"])
            m = sum(pt.values())
            dm[g]["jev_page_type"] = [{"type": t, **wilson(k, m)} for t, k in pt.most_common()]
    dm["method"] = ("Registered domain via tldextract (bundled public-suffix list). Content type: URL rules (pdf, code/docs, forum, "
                    "reference, news, commerce) with the Jev page_type as tie-breaker where scored. Chao1 = richness of domains "
                    "reachable by this query mix, not of the index.")
    out["domains"] = dm

    # ---- 10. other unknowns: exclusions, AI-generated, error rates, NSFW, licence ----
    oth = {}
    for g, ds in groups.items():
        n = len(ds)
        low = [d["text"].lower() for d in ds]
        adult = sum(sum(low_.count(w) for w in ADULT) >= 3 or len({w for w in ADULT if w in low_}) >= 2 for low_ in low)
        gamb = sum(len({w for w in GAMBLING if w in low_}) >= 2 for low_ in low)
        mark = sum(any(m in low_ for m in AI_MARKERS) for low_ in low)
        known_ai = sum(d["reg_domain"] in KNOWN_AI_DOMAINS for d in ds)
        ai_floor = sum(d["reg_domain"] in KNOWN_AI_DOMAINS or any(m in l for m in AI_MARKERS) for d, l in zip(ds, low))
        mg = [d["jev"].get("machine_generated_p") for d in ds if d["jev"] and d["jev"].get("machine_generated_p") is not None]
        short = sum(len(d["text"].split()) < 50 for d in ds if d["lang"] not in NON_SPACE_LANGS)
        open_l = sum(bool(OPEN_LIC.search(d["text"])) for d in ds)
        resv = sum(bool(RESERVED.search(d["text"])) for d in ds)
        bp = [d["jev"]["boilerplate_p"] for d in ds if d["jev"]]
        defect = sum((len(d["text"].split()) < 50 and d["lang"] not in NON_SPACE_LANGS) or
                     (d["jev"] is not None and d["jev"]["boilerplate_p"] >= 0.5) for d in ds)
        oth[g] = {"n": n,
                  "adult_lexicon": wilson(adult, n), "adult_upper95_if_zero": rule_of_three(n) if adult == 0 else None,
                  "gambling_lexicon": wilson(gamb, n),
                  "ai_style_markers": wilson(mark, n), "known_ai_generated_domain": wilson(known_ai, n),
                  "ai_generated_floor_domain_or_markers": wilson(ai_floor, n),
                  "adult_confirmed_on_review": wilson(0, n), "adult_confirmed_upper95": rule_of_three(n),
                  "jev_machine_generated_ge_0_5": wilson(sum(p >= 0.5 for p in mg), len(mg)) if mg else None,
                  "jev_machine_generated_mean_p": round(statistics.mean(mg), 3) if mg else None,
                  "under_50_words": wilson(short, n),
                  "jev_boilerplate_dominant": wilson(sum(p >= 0.5 for p in bp), len(bp)) if bp else None,
                  "extraction_defect_any": wilson(defect, n),
                  "open_licence_signal": wilson(open_l, n), "rights_reserved_notice": wilson(resv, n),
                  "default_exclusion_drop": None}
        # what a default exclusion list (gambling + <50 words + boilerplate-dominant; confirmed adult = 0) would remove
        drop = sum((len({w for w in GAMBLING if w in l}) >= 2 or
                    (len(d["text"].split()) < 50 and d["lang"] not in NON_SPACE_LANGS) or
                    (d["jev"] is not None and d["jev"]["boilerplate_p"] >= 0.5)) for d, l in zip(ds, low))
        oth[g]["default_exclusion_drop"] = wilson(drop, n)
    oth["adult_review_note"] = ("All 11 lexicon-flagged docs were read by hand on 2026-10-01: Wikipedia articles (Wikipedia, "
                                "Craigslist, Roman Empire, Mitochondrion), an NIH paper, a Czech government report, a Craigslist "
                                "listing index and a celebrity-news index. None is explicit adult content, so confirmed adult = 0.")
    oth["fetch_failures"] = wilson(len(docs) - len(texted), len(docs))
    oth["method"] = ("Adult: >= 2 distinct or >= 3 total hits from an 11-term lexicon. Gambling: >= 2 distinct of 7 terms. AI style "
                     "markers: 11 stock LLM phrases. Known AI domain: grokipedia.com (Grok-generated). Jev machine_generated: Noul "
                     "question on broad docs, MODEL, not a validated detector. Licence: regex for Creative Commons / open licences vs "
                     "'all rights reserved' / © notices in extracted text. Default exclusion = gambling OR < 50 words OR "
                     "Jev boilerplate p >= 0.5 (adult left out: 0 confirmed on review).")
    out["other"] = oth
    out["cc_overlap_ref"] = {"absent_all_2026": p26, "absent_every_crawl": pev, "absent_latest": cc["pooled"]["absent_from_latest_crawl"]}

    ten_and_charts(out)
    write(out)
    print(json.dumps({k: out[k] for k in ("counts",)}, indent=1))


def ci_txt(w):
    return f"{100 * w['ci95'][0]:.1f}–{100 * w['ci95'][1]:.1f}%"


def ten_and_charts(out):
    b = "broad"
    lang, dm, oth, pii, cons = {**out["language"][b], "multilingual_query_check": out["language"]["multilingual_query_check"]}, out["domains"][b], out["other"][b], out["pii"][b], out["consent"]
    en = next(x for x in lang["top"] if x["lang"] == "en")
    opt = cons["headline_opt_out_doc_share_cluster_ci"]
    news = next(x for x in dm["jev_page_type"] if x["type"] == "news")
    ten = [
        {"q": "Q02", "unknown": "Sampling policy", "value": pct(dm["docs_from_domains_seen_once"]["share"]), "unit": "%",
         "says": "of docs come from a domain seen only once: a long-tail frontier", "ci": ci_txt(dm["docs_from_domains_seen_once"]),
         "n": dm["n"], "tag": "MEASURED"},
        {"q": "Q03", "unknown": "Language coverage", "value": pct(lang["multilingual_query_check"]["results_not_english"]["share"]),
         "unit": "%", "says": f"of results to 20 non-English queries are non-English; Spanish, Portuguese and Polish got none",
         "ci": ci_txt(lang["multilingual_query_check"]["results_not_english"]),
         "n": lang["multilingual_query_check"]["results_not_english"]["n"], "tag": "MEASURED"},
        {"q": "Q04", "unknown": "Exclusions", "value": pct(cons["generic_disallow_doc_share_cluster_ci"]["share"]), "unit": "%",
         "says": "of indexed docs sit at URLs today's robots.txt closes to unnamed crawlers",
         "ci": ci_txt(cons["generic_disallow_doc_share_cluster_ci"]), "n": cons["generic_disallow_doc_share_cluster_ci"]["n_docs"], "tag": "MEASURED"},
        {"q": "Q05", "unknown": "AI-generated share", "value": pct(oth["ai_generated_floor_domain_or_markers"]["share"]), "unit": "%",
         "prefix": "≥", "says": "floor: Grok-written pages plus stock LLM phrases", "ci": ci_txt(oth["ai_generated_floor_domain_or_markers"]),
         "n": oth["n"], "tag": "MEASURED floor"},
        {"q": "Q11", "unknown": "Error rates", "value": pct(oth["extraction_defect_any"]["share"]), "unit": "%",
         "says": "thin (< 50 words) or boilerplate-dominant pages", "ci": ci_txt(oth["extraction_defect_any"]), "n": oth["n"], "tag": "MEASURED"},
        {"q": "Q17", "unknown": "Toxicity and NSFW", "value": 0, "unit": "", "says": "explicit adult pages after hand review of 11 lexicon flags",
         "ci": f"95% upper bound {100 * out['other']['pooled']['adult_confirmed_upper95']:.2f}%", "n": out["other"]["pooled"]["n"], "tag": "MEASURED"},
        {"q": "Q18", "unknown": "PII", "value": pct(pii["docs_with_any_pii"]["share"]), "unit": "%",
         "says": f"of docs hold an email, phone, street address or IP; a scrub removes {100 * pii['scrub_removes_char_share']:.2f}% of text",
         "ci": ci_txt(pii["docs_with_any_pii"]), "n": pii["n"], "tag": "MEASURED"},
        {"q": "Q19–20", "unknown": "AI-training opt-out", "value": pct(opt["share"]), "unit": "%",
         "says": "of docs sit on sites that opt out of AI training today", "ci": ci_txt(opt), "n": opt["n_docs"], "tag": "MEASURED"},
        {"q": "Q21", "unknown": "Licence exposure", "value": pct(news["share"]), "unit": "%",
         "says": "news pages, the category in active copyright suits", "ci": ci_txt(news), "n": news["n"], "tag": "MEASURED"},
        {"q": "Q22", "unknown": "GDPR footprint", "value": pct(dm["eu_eea_cctld"]["share"]), "unit": "%",
         "says": "of docs on EU/EEA country domains (a floor for EU origin)", "ci": ci_txt(dm["eu_eea_cctld"]), "n": dm["n"], "tag": "MEASURED floor"},
    ]
    out["ten_unknowns"] = ten
    C = CHARTS
    src = "data/galactica_estimates.json"
    def wr(name, obj):
        (C / name).write_text(json.dumps({**obj, "source": src, "generated_at": out["generated_at"]}, indent=1, ensure_ascii=False))
    wr("ga_est_ten.json", {"title": "Ten formerly 'only Keenable' card items, estimated from a Keenable search sample", "data": ten,
                           "caveat": out["caveat"]})
    u = out["usable_tokens"]
    wr("ga_est_tokens.json", {"title": "Galactica stock in cl100k tokens (MODEL)", "unit": "tokens", "label": "MODEL", "data": [
        {"label": "Raw stock", "point": u["raw"]["stock_point"], "range": out["tokens"]["extrapolation"]["stock_tokens"]["range"]},
        {"label": "After dedup + Gopher", "point": u["after_dedup_gopher"]["stock_point"], "range": u["after_dedup_gopher"]["stock_range"]},
        {"label": "FineWeb-Edu score >= 2", "point": u["edu_ge2"]["stock_point"], "range": u["edu_ge2"]["stock_range"]},
        {"label": "FineWeb-Edu score >= 3", "point": u["edu_ge3"]["stock_point"], "range": u["edu_ge3"]["stock_range"], "hl": True}],
        "per_doc": out["tokens"]["broad"], "how": u["how"]})
    qb = out["quality"]["broad"]
    wr("ga_est_quality.json", {"title": "FineWeb-Edu-style score (live Jev), broad sample", "label": "MEASURED", "n": qb["n"],
                               "hist_rounded": qb["hist_rounded"], "hist_floor": qb["hist_floor"],
                               "hist_floor_note": "bins [0,1) [1,2) [2,3) [3,4) [4,5] of the expected score", "share_ge2": qb["docs_ge2"], "share_ge3": qb["docs_ge3"],
                               "tokens_ge3": qb["tokens_ge3"], "by_query_type": qb["by_query_type"],
                               "search_biased_share_ge3": out["quality"]["search_biased"]["docs_ge3"],
                               "reference": out["quality"]["fineweb_edu_reference"]})
    wr("ga_est_optout.json", {"title": "Share of sampled docs on sites that opt out of AI training today", "label": "MEASURED",
                              "headline": opt, "doc_level": cons["doc_level"], "host_level": cons["host_level"],
                              "definition": cons["definition"]})
    wr("ga_est_language.json", {"title": "Language mix (langid), broad sample", "label": "MEASURED", "data": lang["top"], "n": lang["n"]})
    wr("ga_est_freshness.json", {"title": "acquired_at age, broad sample", "label": "MEASURED", "data": out["freshness"][b],
                                 "semantics": out["acquired_at_semantics"], "net_new_model": out["net_new_model"],
                                 "gate_proposal": out["gate_proposal"]})
    wr("ga_est_domains.json", {"title": "Domain and content mix, broad sample", "label": "MEASURED", "data": dm})
    wr("ga_est_contamination.json", {"title": "Benchmark items in Keenable's index", "label": "MEASURED", "data": out["contamination"]})


def write(out):
    (DATA / "galactica_estimates.json").write_text(json.dumps(out, indent=1, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
