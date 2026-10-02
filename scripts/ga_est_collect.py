#!/usr/bin/env python3
"""Galactica estimates, step 1: expand the 200-page sample to 600+ documents from Keenable's index.

Two labelled samples, both drawn through the keyless search API (so: a search-results sample, NOT a random draw
of the index):
  search_biased  the 200 pages of the G7 Jev proof (20 topical queries, education-heavy)
  broad          ~100 deliberately non-topical queries across 9 query types (navigational, long-tail, multilingual,
                 code, forums, news, reference, commerce, docs/misc), 10 results each

For every URL: search result (title, snippet, published_at, acquired_at) + Keenable's indexed copy via
/v1/fetch/public with max_chars=100000 (full text up to 100K chars; the index copy, never the origin).
Rate: <= 2 req/s (jevlib.Keenable). All responses cached in data/jev_cache.

    python3 scripts/ga_est_collect.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "jev"))
from jevlib import DATA, Keenable, now_iso, write_json  # noqa: E402
from galactica_edu import QUERIES as G7_QUERIES  # noqa: E402

FULL_CHARS = 100_000

BROAD = {
    "navigational": ["bbc news", "github", "wikipedia main page", "weather forecast", "imdb", "craigslist",
                     "spotify web player", "nytimes", "linkedin login", "irs.gov"],
    "long_tail": ["how to remove rust from cast iron skillet", "why does my cat knead blankets",
                  "best soil for tomato plants in pots", "fix squeaky door hinge", "symptoms of vitamin d deficiency",
                  "home office tax deduction self employed", "how long to boil an egg soft",
                  "replace bike chain without tool", "what time zone is arizona in",
                  "dream about teeth falling out meaning", "grandfather clock chimes wrong hour",
                  "can you freeze cooked rice"],
    "multilingual": ["recette de crêpes facile", "wie funktioniert eine wärmepumpe", "receta de paella valenciana",
                     "notizie di oggi italia", "como fazer pão caseiro", "東京 天気 週末", "北京 旅游 攻略",
                     "погода в москве на неделю", "भारत समाचार आज", "كيفية تعلم اللغة الانجليزية",
                     "nederlands nieuws vandaag", "przepis na pierogi ruskie", "türkiye son dakika haberleri",
                     "김치찌개 레시피", "tin tức việt nam hôm nay", "berita indonesia hari ini",
                     "svenska nyheter idag", "日本語 文法 て形", "ελληνικά νέα σήμερα", "česká republika zprávy"],
    "code": ["python list comprehension example", "rust borrow checker error E0502", "react useEffect cleanup function",
             "kubernetes pod crashloopbackoff", "sql left join vs inner join", "git rebase onto another branch",
             "numpy broadcasting operands could not be broadcast", "javascript fetch post json body",
             "segmentation fault c pointer", "dockerfile multi stage build"],
    "forums": ["forum engine misfire cylinder 3", "stackexchange how do i", "reddit ask anything",
               "home espresso machine forum", "fishing report forum this week", "quora why do people",
               "hacker news discussion", "anime season discussion thread", "woodworking forum joinery",
               "parenting forum toddler sleep"],
    "news": ["election results", "earthquake today", "central bank interest rate decision", "wildfire evacuation order",
             "company announces layoffs", "appeals court ruling", "city council meeting vote", "obituary",
             "press release announces partnership", "quarterly earnings beat estimates"],
    "reference": ["definition of entropy", "population of nigeria", "boiling point of ethanol",
                  "list of countries by gdp", "periodic table of elements", "marie curie biography",
                  "treaty of westphalia", "how many bones in the human body", "pythagorean theorem proof",
                  "mitochondria function"],
    "commerce": ["buy refurbished iphone", "hotel barcelona booking", "car insurance quote", "wireless earbuds review",
                 "mattress sale", "grain free dog food", "wedding dress", "waterproof hiking boots",
                 "house for sale 3 bedroom", "used toyota corolla price"],
    "docs_misc": ["user manual pdf", "terms of service", "privacy policy", "api documentation rate limit",
                  "release notes changelog", "passport renewal application form", "university course syllabus pdf",
                  "podcast episode transcript", "community events calendar", "annual report 2025 pdf"],
}


def main():
    kn = Keenable()
    plan = [("search_biased", "g7_topical", q) for q in G7_QUERIES]
    plan += [("broad", cat, q) for cat, qs in BROAD.items() for q in qs]
    seen, docs = set(), []
    for sample, cat, q in plan:
        res = kn.search(q, max_results=10)
        rs = res.get("results", []) or []
        print(f"  [{sample}/{cat}] {q!r}: {len(rs)}", file=sys.stderr)
        for rank, r in enumerate(rs):
            u = r.get("url")
            if not u or u in seen:
                continue
            seen.add(u)
            docs.append({"sample": sample, "query_type": cat, "query": q, "rank": rank + 1, "url": u,
                         "title": r.get("title", ""), "snippet": r.get("snippet", ""),
                         "published_at": r.get("published_at"), "acquired_at": r.get("acquired_at")})
    # The G7 sample used the first 200 unique URLs; keep exactly those as search_biased.
    sb = [d for d in docs if d["sample"] == "search_biased"][:200]
    br = [d for d in docs if d["sample"] == "broad"]
    docs = sb + br
    print(f"  {len(sb)} search_biased + {len(br)} broad URLs; fetching full text", file=sys.stderr)
    for i, d in enumerate(docs):
        f = kn.fetch(d["url"], max_chars=FULL_CHARS)
        d["text"] = f.get("content") or ""
        d["fetch_error"] = f.get("error")
        d["fetch_published_at"] = f.get("published_at")
        d["text_chars"] = len(d["text"])
        d["text_truncated_at_cap"] = len(d["text"]) >= FULL_CHARS - 10
        if i % 50 == 0:
            print(f"  fetched {i + 1}/{len(docs)} calls={kn.calls} rate={kn.rate_headers}", file=sys.stderr)
    meta = {"generated_at": now_iso(), "keenable_calls": kn.calls, "full_chars_cap": FULL_CHARS,
            "queries": {"search_biased": len(G7_QUERIES), "broad": sum(len(v) for v in BROAD.values())},
            "broad_query_types": {k: len(v) for k, v in BROAD.items()},
            "n_docs": len(docs), "n_with_text": sum(1 for d in docs if d["text"].strip()),
            "caveat": ("Search-results sample from Keenable's keyless /v1/search/public + /v1/fetch/public (indexed copy). "
                       "Not a random draw of the index: every doc ranked top-10 for some query, which favours "
                       "popular, well-linked, query-matching pages. 'broad' reduces topical bias; it does not remove "
                       "ranking bias.")}
    write_json(DATA / "galactica_sample.json", {"meta": meta, "queries": {"search_biased": G7_QUERIES, "broad": BROAD},
                                                "docs": docs})
    print(json.dumps(meta, indent=1), file=sys.stderr)


if __name__ == "__main__":
    main()
