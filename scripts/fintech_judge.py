"""Offline judge over data/fintech_run.json (no new API calls).

Verified-correct rule (stated before looking at results):
  a query passes if, in the top 10, EITHER an expected source domain appears (gold, from the run script)
  OR the expected fact pattern appears in a result title/snippet.
  Each fact is tagged 'fact' (a specific number/date/outcome) or 'topic' (on-topic terms only, weaker).
  Queries whose answer did not exist yet at run time are tagged 'n/a' and excluded from the rate.
Lookahead audit for the six point-in-time pairs: count results whose acquired_at/published_at is after the
cutoff and results whose text states the post-cutoff outcome, for normal search vs Time Machine (query_time).
Writes data/fintech_judged.json and data/charts/opt2_*.json.
"""
import json, re, os
from datetime import datetime, timezone

ROOT = os.path.join(os.path.dirname(__file__), "..")
run = json.load(open(os.path.join(ROOT, "data/fintech_run.json")))

# query text prefix -> (strength, regex)
FACTS = {
    "NVIDIA Q2 FY2026": ("fact", r"46\.7|41\.1"),  # Q2 FY26 revenue $46.7B, data center $41.1B
    "FOMC statement September 2026": ("topic", r"target range"),
    "Apple 10-K fiscal 2025": ("topic", r"risk factors"),
    "Tesla Q3 2026": ("n/a", None),  # Q3 ended 2026-09-30; deliveries report not out at run time
    "Berkshire Hathaway 13F": ("topic", r"13F"),
    "Microsoft Activision": ("fact", r"october 13,? 2023|13 october 2023|oct\.? 13|completed (its|the) acquisition|has completed"),
    "Silicon Valley Bank": ("fact", r"march 10,? 2023|receivership|fdic"),
    "Credit Suisse UBS": ("fact", r"3(\.0)? billion (swiss )?francs|chf ?3|\$3\.2 billion|march 19"),
    "FTX bankruptcy": ("fact", r"chapter 11|november 11,? 2022"),
    "Nvidia market capitalization": ("topic", r"market cap"),
    "Danske Bank": ("fact", r"200 billion|\$2(\.0)? billion|pleaded guilty|plead guilty"),
    "Changpeng Zhao": ("fact", r"four months|4 months|4-month|\$50 million|pleaded guilty"),
    "Wirecard Markus Braun": ("topic", r"braun"),
    "OFAC SDN": ("topic", r"sanction|designat"),
    "FinCEN enforcement": ("topic", r"civil money penalty|assess|enforcement"),
    "Trevor Milton": ("fact", r"pardon"),
    "Wirecard Betrug": ("topic", r"braun|urteil|prozess"),
    "Jho Low": ("fact", r"1mdb.*(warrant|fugitive)|(warrant|fugitive).*1mdb|\$4\.5 billion"),
    "FATF grey list": ("topic", r"increased monitoring|grey list|gray list"),
    "Sam Bankman-Fried sentenced": ("fact", r"25 years|25-year"),
    "Ramp Business Corporation": ("topic", r"new york"),
    "Middesk business": ("topic", r"\bapi\b"),
    "Delaware Division": ("topic", r"entity search|division of corporations"),
    "Joe's Pizza": ("fact", r"carmine"),
    "Klarna IPO": ("fact", r"\bF-1\b|\bKLAR\b|nyse"),
    "Chime Better Business": ("topic", r"complaint"),
    "SBA PPP": ("topic", r"ppp.*(search|lookup|database)|(search|lookup|database).*ppp"),
    "Big Lots": ("topic", r"clos"),
    "California Secretary of State": ("topic", r"bizfile|secretary of state"),
    "Companies House Revolut": ("fact", r"08804411|filing history"),
    "SOFR rate today": ("topic", r"sofr"),
    "ECB monetary policy": ("topic", r"deposit facility"),
    "spot bitcoin ETF": ("topic", r"inflow"),
    "US CPI August 2026": ("fact", r"august 2026|aug(ust)?\.? 2026"),
    "Robinhood Q3 2026": ("topic", r"third quarter|q3"),
    "Visa interchange": ("topic", r"interchange"),
    "Stripe Radar": ("topic", r"radar"),
    "CFPB Section 1071": ("topic", r"compliance date"),
    "Polymarket odds": ("topic", r"polymarket"),
    "10 year 2 year": ("topic", r"t10y2y|spread"),
}

# post-cutoff outcome language: should be absent from a point-in-time answer
OUTCOME = {
    "Microsoft Activision": (r"completed (its|the) acquisition|has completed|closed (its|the) acquisition|october 13,? 2023", "closed 2023-10-13"),
    "Silicon Valley Bank": (r"receivership|collapse[ds]?|bank failure|was closed|shut down", "FDIC closed SVB 2023-03-10"),
    "Credit Suisse UBS": (r"ubs (to )?(buy|buys|acquire|acquires|takeover|rescue)|emergency (rescue|takeover)|3(\.0)? billion (swiss )?francs|chf ?3", "UBS deal 2023-03-19"),
    "FTX bankruptcy": (r"chapter 11|filed for bankruptcy|bankruptcy filing", "Chapter 11 2022-11-11"),
    "Nvidia market capitalization": (r"\$?[1-9](\.\d+)? ?trillion", "first $1T close 2023-05-30"),
    "Sam Bankman-Fried sentenced": (r"25 years|25-year", "sentenced 2024-03-28"),
}

def key(q, table):
    return next((k for k in table if q.startswith(k)), None)

def text(r):
    return f"{r.get('title','')} {r.get('snippet','')}"

def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None

def pct(a, p):
    if not a: return None
    s = sorted(a); return s[min(len(s) - 1, int(p * len(s)))]

rows_out, lat = [], {"pro": [], "realtime": [], "pit": []}
for row in run["rows"]:
    k = key(row["q"], FACTS); strength, rx = FACTS[k]
    out = {"seg": row["seg"], "q": row["q"], "gold": row["gold"], "fact_strength": strength, "fact_regex": rx, "runs": []}
    for r in row["runs"]:
        if not r["ok"]: out["runs"].append({"kind": r["kind"], "mode": r["mode"], "ok": False}); continue
        lat["pit" if r["kind"] == "pit" else r["mode"]].append(r["ms"])
        res = r["results"]
        fact_rank = next((i + 1 for i, x in enumerate(res) if rx and re.search(rx, text(x), re.I)), 0)
        j = {"kind": r["kind"], "mode": r["mode"], "ms": r["ms"], "gold_rank": r["gold_rank"], "fact_rank": fact_rank,
             "verified": None if strength == "n/a" else bool(r["gold_rank"] or fact_rank),
             "verified_strict": None if strength == "n/a" else bool(r["gold_rank"] or (fact_rank and strength == "fact")),
             "top3": r["top3"], "newest_acquired_at": r.get("newest_acquired_at")}
        if row.get("pit"):
            cut = datetime.fromisoformat(row["pit"] + "T00:00:00+00:00")
            orx, event = OUTCOME[key(row["q"], OUTCOME)]
            j["cutoff"] = row["pit"]; j["event"] = event
            j["acquired_after_cutoff"] = sum(1 for x in res if ts(x.get("acquired_at")) and ts(x["acquired_at"]) > cut)
            j["published_after_cutoff"] = sum(1 for x in res if ts(x.get("published_at")) and ts(x["published_at"]) > cut)
            hits = [x for x in res if re.search(orx, text(x), re.I)]
            j["states_outcome"] = len(hits)
            j["outcome_examples"] = [{"host": x["host"], "title": x["title"][:120], "acquired_at": x.get("acquired_at"), "published_at": x.get("published_at")} for x in hits[:3]]
        out["runs"].append(j)
    rows_out.append(out)

def rate(mode, seg=None, strict=False):
    f = "verified_strict" if strict else "verified"
    v = [j[f] for r in rows_out if (seg is None or r["seg"] == seg) for j in r["runs"] if j.get("kind") == "now" and j.get("mode") == mode and j.get(f) is not None]
    return {"verified": sum(v), "judged": len(v), "rate": round(sum(v) / len(v), 3) if v else None}

summary = {
    "requests_total": sum(len(r["runs"]) for r in rows_out),
    "latency_ms": {m: {"n": len(a), "p50": pct(a, .5), "p95": pct(a, .95), "p99": pct(a, .99), "max": max(a)} for m, a in lat.items()},
    "verified": {m: {"on_topic": rate(m), "verified_strict": rate(m, strict=True), "by_segment_on_topic": {s: rate(m, s) for s in ["research", "aml", "kyb", "agents"]}, "by_segment_strict": {s: rate(m, s, True) for s in ["research", "aml", "kyb", "agents"]}, "gold_source_top10": sum(1 for r in rows_out for j in r["runs"] if j.get("kind") == "now" and j.get("mode") == m and j.get("gold_rank"))} for m in ["pro", "realtime"]},
    "lookahead": [],
}
for r in rows_out:
    pit = [j for j in r["runs"] if j.get("kind") == "pit"]
    if not pit: continue
    now = next(j for j in r["runs"] if j.get("kind") == "now" and j.get("mode") == "pro")
    p = pit[0]
    summary["lookahead"].append({"q": r["q"], "cutoff": p["cutoff"], "event": p["event"],
        "now": {k: now[k] for k in ["acquired_after_cutoff", "published_after_cutoff", "states_outcome"]},
        "time_machine": {k: p[k] for k in ["acquired_after_cutoff", "published_after_cutoff", "states_outcome"]},
        "now_examples": now["outcome_examples"], "time_machine_examples": p["outcome_examples"]})
tot = lambda side, k: sum(x[side][k] for x in summary["lookahead"])
summary["lookahead_totals"] = {side: {k: tot(side, k) for k in ["acquired_after_cutoff", "published_after_cutoff", "states_outcome"]} for side in ["now", "time_machine"]}
summary["lookahead_totals"]["results_per_side"] = 10 * len(summary["lookahead"])

json.dump({"source": "data/fintech_run.json", "ran_at": run["ran_at"], "judge_rule": __doc__.strip(), "summary": summary, "rows": rows_out},
          open(os.path.join(ROOT, "data/fintech_judged.json"), "w"), indent=1)

os.makedirs(os.path.join(ROOT, "data/charts"), exist_ok=True)
def chart(name, obj): json.dump(obj, open(os.path.join(ROOT, f"data/charts/{name}.json"), "w"), indent=1)
chart("opt2_latency", {"title": "Keenable keyless search latency, 40 fintech queries (client wall-clock ms)", "source": "data/fintech_run.json", "ran_at": run["ran_at"],
    "series": [{"name": m, **summary["latency_ms"][m]} for m in ["pro", "realtime", "pit"]]})
chart("opt2_verified", {"title": "Verified-correct in top 10 by segment (gold source OR expected fact)", "source": "data/fintech_judged.json",
    "rule": "strict = expected primary-source domain in top 10 OR a specific expected fact (number/date/outcome) in a top-10 title/snippet; on_topic adds topic-term matches", "rows": [{"segment": s, "strict": summary["verified"]["pro"]["by_segment_strict"][s], "on_topic": summary["verified"]["pro"]["by_segment_on_topic"][s]} for s in ["research", "aml", "kyb", "agents"]]})
chart("opt2_lookahead", {"title": "Future leakage: normal search vs Time Machine (query_time), 6 event queries x 10 results", "source": "data/fintech_judged.json",
    "rows": [{"q": x["q"], "cutoff": x["cutoff"], "event": x["event"], "now_states_outcome": x["now"]["states_outcome"], "tm_states_outcome": x["time_machine"]["states_outcome"],
              "now_acquired_after": x["now"]["acquired_after_cutoff"], "tm_acquired_after": x["time_machine"]["acquired_after_cutoff"]} for x in summary["lookahead"]],
    "totals": summary["lookahead_totals"]})
print(json.dumps({k: v for k, v in summary.items() if k != "lookahead"}, indent=1))
for x in summary["lookahead"]: print(x["q"][:40], x["now"], x["time_machine"], [e["host"] for e in x["time_machine_examples"]])
