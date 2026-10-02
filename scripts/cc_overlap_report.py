"""Turn cc_cdx_cache lookups into data/cc_overlap.json and data/charts/opt1_cc_overlap.json."""
import json, math, statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CACHE = DATA / "cc_cdx_cache"


def wilson(k, n, z=1.96):
    if n == 0:
        return None
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return {"k": k, "n": n, "share": round(p, 4), "ci95": [round(max(0, c - h), 4), round(min(1, c + h), 4)]}


def parse_iso(s):
    return datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)


def ts(s):
    return datetime.strptime(s, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)


def main():
    sample = json.load(open(CACHE / "sample.json"))
    rows = sample["rows"]
    lr = json.load(open(CACHE / "lookup_results.json"))
    res = lr["crawls"]
    subsample = set(lr.get("any_crawl_subsample", []))
    allc = [c["id"] for c in json.load(open(CACHE / "collinfo.json"))]
    c2026 = [c for c in allc if c.startswith("CC-MAIN-2026")]
    latest = allc[0]
    checked_older = [c for c in allc if c in res and not c.startswith("CC-MAIN-2026")]

    for r in rows:
        caps = {}
        for c, ent in res.items():
            got = [x for k in r["keys"] for x in ent["hits"].get(k, [])]
            if got:
                caps[c] = got
        r["caps"] = caps
        r["in_latest"] = latest in caps
        r["in_latest_200"] = any(x["status"] == "200" for x in caps.get(latest, []))
        r["in_2026"] = any(c in caps for c in c2026)
        r["in_2026_200"] = any(x["status"] == "200" for c in c2026 for x in caps.get(c, []))
        r["in_any"] = bool(caps)
        r["in_any_200"] = any(x["status"] == "200" for v in caps.values() for x in v)
        # was the "any crawl" question fully answered for this URL? (every crawl checked for its keys)
        r["any_fully_checked"] = r["in_any"] or all(
            c in res and set(r["keys"]) <= set(res[c]["checked"]) for c in allc)
        r["matched_by"] = ("exact" if any(r["keys"][0] in res[c]["hits"] for c in caps) else
                           "no_query_fallback" if caps else None)
        all_ts = sorted(x["timestamp"] for v in caps.values() for x in v)
        r["cc_latest_capture"] = all_ts[-1] if all_ts else None
        r["cc_first_capture"] = all_ts[0] if all_ts else None

    def block(rs):
        n = len(rs)
        full = [r for r in rs if r["any_fully_checked"]]
        # every crawl back to 2008 was searched only for a seeded subsample of the URLs missing from 2026;
        # P(absent everywhere) = P(absent 2026) x P(absent from all older crawls | absent 2026)
        sub = [r for r in rs if r["url"] in subsample and r["any_fully_checked"]]
        p26 = wilson(sum(not r["in_2026"] for r in rs), n)
        cond = wilson(sum(not r["in_any"] for r in sub), len(sub))
        every = None
        if p26 and cond and all(c in res for c in allc):  # only once every listed crawl has been searched
            every = {"share": round(p26["share"] * cond["share"], 4),
                     "ci95": [round(p26["ci95"][0] * cond["ci95"][0], 4), round(p26["ci95"][1] * cond["ci95"][1], 4)],
                     "estimator": "P(absent 2026) x P(absent all older crawls | absent 2026); CI = product of the two "
                                  "Wilson bounds (conservative)",
                     "subsample_absent_from_2026_checked_in_every_crawl": cond,
                     "found_in_older_crawl_examples": [
                         {"url": r["url"], "first_cc_capture": r["cc_first_capture"],
                          "last_cc_capture": r["cc_latest_capture"]} for r in sub if r["in_any"]][:10]}
        out = {
            "n": n,
            "absent_from_latest_crawl": wilson(sum(not r["in_latest"] for r in rs), n),
            "absent_from_all_2026_crawls": p26,
            "absent_from_every_crawl": every,
            "status_200_only": {
                "absent_from_latest_crawl": wilson(sum(not r["in_latest_200"] for r in rs), n),
                "absent_from_all_2026_crawls": wilson(sum(not r["in_2026_200"] for r in rs), n),
            },
            "matched_by_query_fallback": sum(r["matched_by"] == "no_query_fallback" for r in rs),
        }
        # by Keenable acquired_at year, and month within 2026
        by = defaultdict(list)
        for r in rs:
            a = r.get("acquired_at")
            key = a[:4] if a and not a.startswith("2026") else (a[:7] if a else "unknown")
            by[key].append(r)
        out["by_acquired_at"] = {
            k: {"n": len(v),
                "absent_from_latest": wilson(sum(not r["in_latest"] for r in v), len(v)),
                "absent_from_2026": wilson(sum(not r["in_2026"] for r in v), len(v))}
            for k, v in sorted(by.items())}
        # freshness gap where CC has the page: Keenable acquired_at minus CC's newest capture
        gaps = []
        for r in rs:
            if r["cc_latest_capture"] and r.get("acquired_at"):
                gaps.append((parse_iso(r["acquired_at"]) - ts(r["cc_latest_capture"])).total_seconds() / 86400)
        if gaps:
            q = statistics.quantiles(gaps, n=4) if len(gaps) >= 4 else [min(gaps), statistics.median(gaps), max(gaps)]
            out["freshness_gap_days"] = {
                "n_pages_in_both": len(gaps),
                "median": round(statistics.median(gaps), 1),
                "p25": round(q[0], 1), "p75": round(q[-1], 1),
                "min": round(min(gaps), 1), "max": round(max(gaps), 1),
                "share_keenable_newer": wilson(sum(g > 0 for g in gaps), len(gaps)),
                "share_keenable_newer_by_30d_plus": wilson(sum(g >= 30 for g in gaps), len(gaps)),
                "histogram": {b: sum(lo <= g < hi for g in gaps) for b, lo, hi in [
                    ("CC newer", -1e9, 0), ("0-30d", 0, 30), ("30-90d", 30, 90), ("90-180d", 90, 180),
                    ("180-365d", 180, 365), ("1y+", 365, 1e9)]},
            }
        return out

    by_sample = {s: [r for r in rows if r["sample"] == s] for s in ("galactica", "fintech")}
    examples = [r for r in by_sample["galactica"] if not r["in_any"] and r["any_fully_checked"]]
    examples += [r for r in by_sample["fintech"] if not r["in_any"] and r["any_fully_checked"]]
    if len(examples) < 10:
        examples += [r for r in rows if not r["in_2026"] and r not in examples]
    xc = json.load(open(CACHE / "crosscheck.json")) if (CACHE / "crosscheck.json").exists() else []
    # pairs the CDX API answered before it went down are cached individually
    answered = {(x["crawl"], x["url"]) for x in xc if "agree_presence" in x}
    urlrow = {r["url"]: r for r in rows}
    for f in sorted((CACHE / "cdxapi").glob("*.json")):
        a = json.load(open(f))
        r = urlrow.get(a["url"])
        if r and (a["crawl"], a["url"]) not in answered:
            mine = len(res.get(a["crawl"], {}).get("hits", {}).get(r["keys"][0], []))
            xc.append({"url": a["url"], "crawl": a["crawl"], "index_files_captures": mine,
                       "cdx_api_captures": a["captures"], "agree_presence": (mine > 0) == (a["captures"] > 0)})
    mv = CACHE / "method_validation.json"
    method_validation = json.load(open(mv)) if mv.exists() else None

    out = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "question": "What share of pages Keenable serves are missing from Common Crawl?",
        "source": {
            "keenable_pages": "data/jev_galactica_pages.json (200 pages, Keenable search+fetch); "
                              "data/fintech_run.json (300 of 469 unique result URLs, seeded shuffle)",
            "keenable_acquired_at": "Keenable /v1/search/public responses cached in data/jev_cache and data/fintech_run.json",
            "common_crawl": "https://index.commoncrawl.org/collinfo.json ; index shards at "
                            "https://data.commoncrawl.org/cc-index/collections/<crawl>/indexes/ (cluster.idx + cdx-*.gz), "
                            "read " + sample["built_at"][:10] + "–" + datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        },
        "crawls": {"latest": latest, "y2026": c2026, "older_checked": len(checked_older),
                   "total_listed": len(allc)},
        "method_notes": [
            "URL -> SURT key (Internet Archive surt library, the canonicalisation CC's index uses: drops scheme, "
            "leading www, trailing slash, sorts query args, lowercases). Exact key first, fallback = same URL "
            "without query string.",
            "Present = at least one capture of that key in the crawl, any HTTP status; status_200_only counts only "
            "200 captures.",
            "Every crawl was checked for 2026; older crawls were checked newest-first only for URLs not yet seen.",
        ],
        "samples": {s: block(v) for s, v in by_sample.items()},
        "pooled": block(rows),
        "examples_keenable_has_cc_lacks": [
            {"url": r["url"], "sample": r["sample"], "keenable_acquired_at": r.get("acquired_at"),
             "absent_from": "every crawl (all listed crawls checked)" if r["any_fully_checked"] and not r["in_any"] else "all 2026 crawls (older crawls not checked for this URL)"} for r in examples[:10]],
        "cdx_api_crosscheck": {
            "pairs_attempted": len(xc), "pairs_answered": sum("agree_presence" in x for x in xc),
            "agree": sum(bool(x.get("agree_presence")) for x in xc),
            "cdx_api_errors": sum("error" in x for x in xc),
            "disagreements": [x for x in xc if x.get("agree_presence") is False],
            "method_validation": method_validation},
        "rows": [{k: r.get(k) for k in ("sample", "url", "acquired_at", "published_at", "in_latest", "in_2026",
                                         "in_any", "in_any_200", "any_fully_checked", "matched_by",
                                         "cc_first_capture", "cc_latest_capture")} | {"crawls_present": sorted(r["caps"])}
                 for r in rows],
    }
    (DATA / "cc_overlap.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))

    def bar(s, key):
        b = out["samples"][s][key]
        return {"share": b["share"], "ci95": b["ci95"], "k": b.get("k"), "n": b.get("n")} if b else None

    chart = {
        "title": "Keenable pages missing from Common Crawl",
        "type": "grouped_bar_ci",
        "label": f"Measured {out['generated_at'][:10]}, CC index files; Wilson 95% CI",
        "categories": ["absent from latest crawl (" + latest + ")", "absent from all 2026 crawls",
                       "absent from every crawl"],
        "series": [{"name": s, "n": out["samples"][s]["n"],
                    "values": [bar(s, "absent_from_latest_crawl"), bar(s, "absent_from_all_2026_crawls"),
                               bar(s, "absent_from_every_crawl")]} for s in ("galactica", "fintech")],
        # flat rows for simple bar renderers: value = percent absent from Common Crawl
        "data": [{"label": f"{s.capitalize()}: {lab}", "value": round(b["share"] * 100, 1),
                  "note": f"95% CI {b['ci95'][0]*100:.1f}-{b['ci95'][1]*100:.1f}%"
                          + (f", n={b['n']}" if b.get("n") else ", conditional estimate")}
                 for s in ("galactica", "fintech")
                 for lab, key in (("absent from latest crawl", "absent_from_latest_crawl"),
                                  ("absent from all 2026 crawls", "absent_from_all_2026_crawls"),
                                  ("absent from every crawl", "absent_from_every_crawl"))
                 for b in [out["samples"][s].get(key)] if b],
        "freshness_gap_days": {s: out["samples"][s].get("freshness_gap_days") for s in ("galactica", "fintech")},
        "source": "data/cc_overlap.json",
    }
    (DATA / "charts" / "opt1_cc_overlap.json").write_text(json.dumps(chart, indent=2))
    for s in ("galactica", "fintech"):
        b = out["samples"][s]
        print(s, b["n"], {k: (b[k]["share"], b[k]["ci95"], b[k]["n"]) for k in
                          ("absent_from_latest_crawl", "absent_from_all_2026_crawls", "absent_from_every_crawl") if b[k]})
        print("  gap", {k: v for k, v in (b.get("freshness_gap_days") or {}).items() if k != "histogram"})
    print("xcheck", out["cdx_api_crosscheck"])


if __name__ == "__main__":
    main()
