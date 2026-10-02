"""Are the point-in-time fenced results RELEVANT, not just leak-free?

Judges every result in every arm (no fence / published_before / query_time) for every event in
sites/fintech/demo_runs.json (read only), then re-queries Keenable with query_time using three
query-construction rules and judges those too.

Labels (one live Jev Choice per result, plus a transparent rule-based check):
  useful-pre-event-evidence | related-but-weak | irrelevant | leaks-outcome

Run:  cd ~/Genie/scratch/keenable && set -a; . ./.env.jev; set +a; python3 scripts/fence_relevance.py
      add --dry-run to skip Jev (rule labels only).
      add --from-cache to rebuild metrics from the rows already in data/fence_relevance.json (no API calls).
"""
import datetime as dt
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "jev"))
from jevlib import CACHE, CHARTS, DATA, ROOT, MIN_INTERVAL_S, Jev, now_iso, write_json  # noqa: E402

DEMO = ROOT / "sites/fintech/demo_runs.json"
LABELS = ["useful-pre-event-evidence", "related-but-weak", "irrelevant", "leaks-outcome"]
JEV_BUDGET = 500
STALE_DAYS = 365  # code-side freshness flag: acquired_at more than a year before the cutoff

# Per event: the analyst's question AS OF the cutoff, the later outcome in words (for the judge), and
# the vocabulary for the rule-based check and the rewritten queries. Keys = cutoff date.
# Rewrite rules (applied identically to every event; terms come from the analyst question, not the outcome):
#   period    = original query + "<Month YYYY of cutoff>"
#   preevent  = entity + the quantity the analyst asks about, with outcome words removed
#   preevent+period = both
EVENTS = {
    "2023-06-01": dict(
        entity="Microsoft / Activision Blizzard",
        question="What is the status of Microsoft's pending $68.7B acquisition of Activision Blizzard (regulatory reviews by the CMA, FTC and EU; deal terms; expected timing)?",
        outcome="Microsoft completed (closed) the acquisition on 2023-10-13; any statement that the deal has closed or been completed, or that Activision is now a Microsoft subsidiary, reveals the outcome.",
        entity_re=r"activision|blizzard",
        topic_re=r"acqui|deal|merger|regulat|cma|ftc|antitrust|approv|block|\$6[89]",
        preevent="Microsoft Activision Blizzard deal regulators CMA FTC review"),
    "2023-03-09": dict(
        entity="Silicon Valley Bank / SVB Financial Group",
        question="What is the state of Silicon Valley Bank's deposits, liquidity and balance sheet (deposit trends, securities losses, capital raise) on this date?",
        outcome="SVB failed and the FDIC took it into receivership on 2023-03-10; any mention of SVB's collapse, failure, bank run outcome, receivership or the 2023 crisis in hindsight reveals the outcome.",
        entity_re=r"svb|silicon valley bank",
        topic_re=r"deposit|liquidit|balance sheet|securities|capital|bond|loss|cash burn|outflow",
        preevent="SVB Financial Group deposits liquidity securities losses capital raise"),
    "2023-03-17": dict(
        entity="Credit Suisse / UBS",
        question="What is the state of Credit Suisse (deposit outflows, liquidity support, share price, any talks with UBS) on this date?",
        outcome="UBS agreed to buy Credit Suisse on 2023-03-19 for about CHF 3 billion in a government-brokered deal; any statement that UBS acquired/took over/merged with Credit Suisse, or that Credit Suisse no longer exists, reveals the outcome.",
        entity_re=r"credit suisse",
        topic_re=r"ubs|outflow|deposit|liquidit|snb|national bank|share|stock|restructur|talks|merger|rescue|capital",
        preevent="Credit Suisse deposit outflows liquidity Swiss National Bank UBS talks"),
    "2022-11-08": dict(
        entity="FTX",
        question="What is FTX's financial condition (liquidity, customer withdrawals, balance sheet, FTT token, rescue talks) on this date?",
        outcome="FTX filed for Chapter 11 bankruptcy on 2022-11-11 and collapsed; any statement that FTX went bankrupt, collapsed, or describing the aftermath (fraud charges, creditor payouts) reveals the outcome.",
        entity_re=r"\bftx\b|bankman|\bftt\b",
        topic_re=r"liquidit|withdraw|balance sheet|ftt|alameda|binance|rescue|billion|funding|reserves",
        preevent="FTX liquidity customer withdrawals FTT Alameda balance sheet"),
    "2022-12-01": dict(
        entity="Nvidia",
        question="What is Nvidia's market capitalization and stock valuation on this date?",
        outcome="Nvidia first closed above $1 trillion market cap on 2023-05-30 and later reached $2T-$5T; any market-cap figure of $1 trillion or more, or valuation data from 2023 onward, reveals the outcome.",
        entity_re=r"nvidia|nvda",
        topic_re=r"market cap|market value|valuation|worth|stock|share price|\$\d",
        preevent="Nvidia market cap stock valuation"),
    "2024-03-27": dict(
        entity="Sam Bankman-Fried",
        question="What sentence is Sam Bankman-Fried facing (conviction counts, prosecutors' and defence sentencing requests) on this date?",
        outcome="Sam Bankman-Fried was sentenced to 25 years in prison on 2024-03-28; any statement of the actual sentence (25 years) reveals the outcome.",
        entity_re=r"bankman|\bsbf\b",
        topic_re=r"sentenc|prison|convict|guilty|years|prosecutor|judge|kaplan|fraud",
        preevent="Sam Bankman-Fried sentencing prosecutors request years"),
    "2026-09-15": dict(
        entity="Keenable",
        question="What partnerships and distribution deals has the web-search API company Keenable announced as of this date?",
        outcome="Keenable announced a partnership with Baseten and Baseten launched Hosted Tools (web search) on 2026-09-16; any mention of the Keenable x Baseten partnership or Baseten Hosted Tools reveals the outcome.",
        entity_re=r"keenable",
        topic_re=r"partner|integrat|distribut|customer|launch|deal|baseten|seed|raise|\$26",
        preevent="Keenable web search API partnership integration"),
}


def month_year(cutoff):
    return dt.date.fromisoformat(cutoff).strftime("%B %Y")


# --- Keenable query_time client (keyless, <=2 rps, cached) --------------------------------------

class KeenablePIT:
    URL = "https://api.keenable.ai/v1/search/public"

    def __init__(self):
        self._last = 0.0
        self.calls = {"search": 0, "cache_hits": 0, "errors": 0}

    def search(self, query, query_time):
        body = {"query": query, "mode": "pro", "max_results": 10, "snippet_max_length": 240, "query_time": query_time}
        f = CACHE / f"pit_{hashlib.sha1(json.dumps(body, sort_keys=True).encode()).hexdigest()[:16]}.json"
        if f.exists():
            self.calls["cache_hits"] += 1
            return json.loads(f.read_text())
        for attempt in range(3):
            wait = MIN_INTERVAL_S - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            req = urllib.request.Request(self.URL, data=json.dumps(body).encode(), method="POST", headers={
                "X-Keenable-Title": "george-keenable-fence-relevance", "Content-Type": "application/json"})
            t0 = time.monotonic()
            try:
                with urllib.request.urlopen(req, timeout=40) as r:
                    out = json.loads(r.read().decode())
                out["_ms"] = round((time.monotonic() - t0) * 1000)
                out["_fetched_at"] = now_iso()
                out["_request"] = body
                self.calls["search"] += 1
                write_json(f, out)
                return out
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    time.sleep(float(e.headers.get("Retry-After", "5")))
                    continue
                self.calls["errors"] += 1
                return {"error": e.code, "results": []}
            except Exception:
                self.calls["errors"] += 1
                time.sleep(2 * (attempt + 1))
        return {"error": "network", "results": []}


# --- judges -----------------------------------------------------------------------------------

def rule_label(ev, r, outcome_re):
    """Transparent rule: outcome regex -> leak; entity + topic terms -> useful; entity only -> weak; else irrelevant."""
    text = f"{r.get('title', '')} {r.get('snippet', '')}".lower()
    if re.search(outcome_re, text, re.I):
        return "leaks-outcome"
    ent = re.search(ev["entity_re"], text, re.I)
    top = len(set(m.group(0).lower() for m in re.finditer(ev["topic_re"], text, re.I)))
    if ent and top >= 2:
        return "useful-pre-event-evidence"
    if ent:
        return "related-but-weak"
    return "irrelevant"


JEV_CRITERIA = {
    "leaks-outcome": ("The title or snippet states or clearly implies `later_outcome` or any other development that "
                      "happened after `as_of_date` in this story. Choose this even if the result is otherwise useful."),
    "useful-pre-event-evidence": ("The title or snippet is about the entity in `analyst_question` and gives concrete facts, "
                                  "figures or developments that help answer `analyst_question` as it stood before "
                                  "`as_of_date`, without revealing `later_outcome`."),
    "related-but-weak": ("The result is about the entity in `analyst_question` but gives little that answers it: a generic "
                         "company profile, a stock-quote or homepage, a marketing page, a bare table fragment, or a "
                         "different topic about the same entity."),
    "irrelevant": ("The result is not about the entity in `analyst_question`, or mentions it only in passing "
                   "(a forum thread on another subject, a different company, a document fragment with no clear subject)."),
}


def jev_dry(state, qid, q):
    raise RuntimeError("dry-run path does not call Jev")


def judge_jev(jev, ev, cutoff, r):
    state = {"analyst_question": ev["question"], "entity": ev["entity"], "as_of_date": cutoff,
             "later_outcome": ev["outcome"],
             "result": {"title": r.get("title", ""), "url": r.get("url", ""), "snippet": (r.get("snippet") or "")[:600]}}
    q = {"label": {"type": "choice",
                   "instructions": ("An analyst must answer `analyst_question` using only information available on "
                                    "`as_of_date`. Label `result` by what its title and snippet show."),
                   "criteria": JEV_CRITERIA}}
    out = jev.ask(state, q)
    a = out["answers"]["label"]
    return {"label": a["choice"], "p": {k: round(v, 4) for k, v in a["probabilities"].items()},
            "confidence": a.get("confidence")}


# --- metrics ----------------------------------------------------------------------------------

def metrics(rows, key):
    n_ev = len({r["cutoff"] for r in rows}) or 1
    n = len(rows) or 1
    c = {lab: sum(r[key] == lab for r in rows) for lab in LABELS}
    useful = c["useful-pre-event-evidence"]
    return {"n_results": len(rows), "n_events": n_ev, "counts": c,
            "useful_at_10_mean": round(useful / n_ev, 2),
            "useful_share": round(useful / n, 3),
            "useful_fresh_at_10_mean": round(sum(r[key] == "useful-pre-event-evidence" and not r["stale"] for r in rows) / n_ev, 2),
            "events_with_any_useful": sum(any(r[key] == "useful-pre-event-evidence" for r in rows if r["cutoff"] == cf)
                                          for cf in {r["cutoff"] for r in rows}),
            "irrelevant_share": round(c["irrelevant"] / n, 3),
            "leak_share": round(c["leaks-outcome"] / n, 3),
            "acquired_after_cutoff": sum(r["acq_after"] for r in rows)}


class CachedRun:
    """Stands in for Jev and KeenablePIT when rebuilding from a previous run's saved rows."""

    def __init__(self, prev):
        self.mode = "live"
        self.usage = {"requests": prev["judge"]["jev_requests"], "input_tokens": prev["judge"]["jev_input_tokens"]}
        self.calls = prev["keenable_calls"]
        self._label = prev["judge"]["primary"]

    def label(self):
        return self._label


def main():
    dry = "--dry-run" in sys.argv
    cached = "--from-cache" in sys.argv
    demo = json.loads(DEMO.read_text())
    if cached:
        prev = json.loads((DATA / "fence_relevance.json").read_text())
        jev = kn = CachedRun(prev)
        rows, searches, probes = prev["rows"], prev["searches"], prev["coverage_probes"]
        for row in rows:
            row["jev_adj"] = row["jev"]
    else:
        jev = None if dry else Jev(jev_dry)
        if jev and jev.mode != "live":
            sys.exit("TYPESAFE_API_KEY not in environment: load .env.jev or pass --dry-run")
        kn = KeenablePIT()
        rows, searches = [], []

        def add(arm, ev_key, ev_demo, r, query):
            cutoff = ev_key
            cut = dt.datetime.fromisoformat(cutoff + "T00:00:00+00:00")
            acq = r.get("acquired_at")
            acq_dt = dt.datetime.fromisoformat(acq.replace("Z", "+00:00")) if acq else None
            row = {"arm": arm, "cutoff": cutoff, "event": ev_demo["event"], "query": query,
                   "title": r.get("title", ""), "url": r.get("url", ""), "snippet": (r.get("snippet") or "")[:600],
                   "acquired_at": acq, "published_at": r.get("published_at"),
                   "acq_after": bool(acq_dt and acq_dt >= cut),
                   "stale": bool(acq_dt and (cut - acq_dt).days > STALE_DAYS),
                   "rule": rule_label(EVENTS[cutoff], r, ev_demo["outcome_regex"])}
            rows.append(row)

        # 1) baseline arms from the published demo data (sources recorded per arm)
        for e in demo["events"]:
            for arm, name in (("now", "no fence"), ("pub", "published_before"), ("tm", "query_time")):
                for r in e[arm]["results"]:
                    add(name, e["cutoff"], e, r, e["q"])

        # 2) rewritten queries, all with query_time = cutoff
        for e in demo["events"]:
            ev = EVENTS[e["cutoff"]]
            variants = {"query_time + period": f"{e['q']} {month_year(e['cutoff'])}",
                        "query_time + pre-event terms": ev["preevent"],
                        "query_time + pre-event terms + period": f"{ev['preevent']} {month_year(e['cutoff'])}"}
            for arm, q in variants.items():
                res = kn.search(q, e["cutoff"])
                searches.append({"arm": arm, "cutoff": e["cutoff"], "query": q, "n": len(res.get("results", [])),
                                 "ms": res.get("_ms"), "error": res.get("error"), "fetched_at": res.get("_fetched_at")})
                for r in res.get("results", []):
                    add(arm, e["cutoff"], e, r, q)

        # 2b) coverage probe, not judged: is SVB's 2023-03-08 capital-raise news in the index as of 2023-03-09?
        probes = []
        for q in ("SVB Financial Group capital raise share sale March 2023", "SVB Financial stock plunge"):
            res = kn.search(q, "2023-03-09")
            acq = sorted(r.get("acquired_at") or "" for r in res.get("results", []))
            probes.append({"query": q, "query_time": "2023-03-09", "n": len(acq), "newest_acquired_at": acq[-1] if acq else None,
                           "titles": [r.get("title", "") for r in res.get("results", [])]})

        # 3) live Jev label per result (cached by payload, so duplicate results across arms are free)
        if jev:
            for i, row in enumerate(rows):
                if jev.usage["requests"] >= JEV_BUDGET:
                    sys.exit("Jev budget reached")
                j = judge_jev(jev, EVENTS[row["cutoff"]], row["cutoff"], row)
                row.update({"jev": j["label"], "jev_p": j["p"], "jev_confidence": j["confidence"]})
                # No date-based relabelling: a page acquired before the cutoff can still carry later text
                # (the blockworks FTX page did), so Jev's "leak" label stands as a leak flag.
                row["jev_adj"] = j["label"]
                if i % 25 == 0:
                    print(f"{i}/{len(rows)} jev", file=sys.stderr)
    key = "jev_adj" if jev else "rule"

    arms = ["no fence", "published_before", "query_time", "query_time + period",
            "query_time + pre-event terms", "query_time + pre-event terms + period"]
    by_arm = {a: {"jev_adj": metrics([r for r in rows if r["arm"] == a], "jev_adj") if jev else None,
                  "jev_raw": metrics([r for r in rows if r["arm"] == a], "jev") if jev else None,
                  "rule": metrics([r for r in rows if r["arm"] == a], "rule")} for a in arms}
    per_event = {f"{cf}|{a}": {"useful": sum(r[key] == "useful-pre-event-evidence" for r in rows if r["cutoff"] == cf and r["arm"] == a),
                               "leaks": sum(r[key] == "leaks-outcome" for r in rows if r["cutoff"] == cf and r["arm"] == a),
                               "irrelevant": sum(r[key] == "irrelevant" for r in rows if r["cutoff"] == cf and r["arm"] == a),
                               "n": sum(1 for r in rows if r["cutoff"] == cf and r["arm"] == a)}
                 for cf in EVENTS for a in arms}
    agree = sum(r["rule"] == r.get("jev") for r in rows) if jev else None

    # Gold: 30 results labelled by a second model (Claude), blind to Jev (data/fence_gold.json), matched by arm + cutoff + url.
    gold_f = DATA / "fence_gold.json"
    gold = None
    if jev and gold_f.exists():
        g = json.loads(gold_f.read_text())
        idx = {(r["arm"], r["cutoff"], r["url"]): r for r in rows}
        items = []
        for it in g["items"]:
            r = idx[(it["arm"], it["cutoff"], it["url"])]
            items.append({**it, "jev": r["jev"], "jev_adj": r["jev_adj"], "rule": r["rule"], "jev_p": r["jev_p"]})
        gold = {"labelled_by": re.sub(r"\s*\(agent [^)]*\)", "", g["labelled_by"]), "sampling": g["sampling"], "n": len(items),
                **{f"{k}_agreement": round(sum(x[k] == x["gold"] for x in items) / len(items), 3)
                   for k in ("jev", "jev_adj", "rule")},
                **{f"{k}_agree_n": sum(x[k] == x["gold"] for x in items) for k in ("jev", "jev_adj", "rule")},
                "disagreements": [x for x in items if x["jev_adj"] != x["gold"]], "items": items}
    fenced_leak_flags = [{k: r[k] for k in ("arm", "cutoff", "acquired_at", "title", "url", "snippet", "jev_p")}
                         for r in rows if jev and r["jev"] == "leaks-outcome" and not r["acq_after"]]

    out = {"built_at": now_iso(),
           "inputs": {"baseline": "sites/fintech/demo_runs.json (built from data/fintech_run.json and data/h2h/latest_raw.json; read only)",
                      "rewrites": "live keyless POST https://api.keenable.ai/v1/search/public, mode=pro, max_results=10, query_time=cutoff, <=2 rps"},
           "judge": {"primary": jev.label() if jev else "rule-based only (dry run)",
                     "jev_requests": jev.usage["requests"] if jev else 0,
                     "jev_input_tokens": jev.usage["input_tokens"] if jev else 0,
                     "jev_cost_usd": round(jev.usage["input_tokens"] * 42e-9, 4) if jev else 0,
                     "rule": "outcome_regex (fixed before runs, from demo_runs.json) -> leaks-outcome; entity regex + >=2 distinct topic terms -> useful; entity only -> related-but-weak; else irrelevant",
                     "stale_flag": f"acquired_at more than {STALE_DAYS} days before the cutoff (code-side, not a label)",
                     "basis": "title + snippet as returned by the API, not the full page"},
           "events": {k: {kk: v[kk] for kk in ("entity", "question", "outcome", "preevent")} for k, v in EVENTS.items()},
           "searches": searches, "coverage_probes": probes, "keenable_calls": kn.calls,
           "by_arm": by_arm, "per_event": per_event,
           "jev_rule_agreement": round(agree / len(rows), 3) if jev else None,
           "gold": gold, "fenced_leak_flags": fenced_leak_flags,
           "rows": rows}
    write_json(DATA / "fence_relevance.json", out)

    if jev:
        ev_names = {e["cutoff"]: e["q"] for e in demo["events"]}
        chart = {"id": "opt2_fence_relevance",
                 "title": "Are the fenced results useful?",
                 "subtitle": "7 point-in-time events, top 10 per arm, each result labelled by live Jev (jev-1.13.0) on title + snippet",
                 "built_at": out["built_at"], "source": "data/fence_relevance.json (scripts/fence_relevance.py)",
                 "metric_definitions": {
                     "useful_at_10": "mean number of top-10 results per event labelled useful-pre-event-evidence",
                     "useful_fresh_at_10": "same, counting only results acquired within 365 days before the cutoff",
                     "leak_share": "share of results whose title/snippet reveals the later outcome",
                     "irrelevant_share": "share of results labelled irrelevant"},
                 "series": [{"arm": a, "fence": {"no fence": "none", "published_before": "publish-date metadata"}.get(a, "query_time (acquired_at)"),
                             "query_rule": {"query_time + period": "original + Month YYYY",
                                            "query_time + pre-event terms": "entity + what the analyst measures, no outcome words",
                                            "query_time + pre-event terms + period": "entity + measure + Month YYYY"}.get(a, "original"),
                             **{k: by_arm[a]["jev_adj"][k] for k in ("useful_at_10_mean", "useful_fresh_at_10_mean", "useful_share",
                                                                    "events_with_any_useful", "irrelevant_share", "leak_share",
                                                                    "acquired_after_cutoff")}} for a in arms],
                 "per_event": [{"event": ev_names[cf], "cutoff": cf,
                                **{a: per_event[f"{cf}|{a}"]["useful"] for a in arms}} for cf in EVENTS],
                 "judge_check": {"jev_vs_gold": gold and f"{gold['jev_adj_agree_n']}/{gold['n']}",
                                 "rule_vs_gold": gold and f"{gold['rule_agree_n']}/{gold['n']}"},
                 "caveats": ["n=7 events, 10 results each: directional, not a benchmark",
                             "labels judge title + snippet, not the full page",
                             "pre-event query terms were written by someone who knows the outcome; they use only the analyst's question vocabulary",
                             f"{sum(f['arm'] == 'query_time' for f in fenced_leak_flags)} of 70 query_time results flagged by Jev as possible outcome leaks although acquired before the cutoff "
                             "(at least 1 confirmed: the blockworks FTX page); flags stand, not relabelled",
                             "judge check: a second model (Claude) labelled 30 results blind to Jev; no human validation yet"]}
        write_json(CHARTS / "opt2_fence_relevance.json", chart)
    for k in (["jev_adj", "jev_raw"] if jev else []) + ["rule"]:
        print(k)
        for a in arms:
            m = by_arm[a][k]
            print(f"  {a:40s} useful@10 {m['useful_at_10_mean']:4} fresh {m['useful_fresh_at_10_mean']:4} "
                  f"ev>=1 {m['events_with_any_useful']}/7 irr {m['irrelevant_share']:.3f} leak {m['leak_share']:.3f} acq_after {m['acquired_after_cutoff']}")
    print("kn", kn.calls, "jev", out["judge"]["jev_requests"], out["judge"]["jev_cost_usd"], "jev-rule agreement", out["jev_rule_agreement"])
    if gold:
        print("gold", {k: gold[k] for k in gold if k.endswith("_agree_n") or k.endswith("_agreement")}, "fenced leak flags", len(fenced_leak_flags))


if __name__ == "__main__":
    main()
