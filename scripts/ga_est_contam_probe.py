#!/usr/bin/env python3
"""Galactica estimates, step 2b: does Keenable's index hold benchmark test items verbatim?

One keyless search per probe item (6 calls, <= 2 req/s, cached). A result counts as a verbatim hit when its
snippet or title contains a distinctive 6-word span of the item (normalised). This is a targeted probe, not a rate.

    python3 scripts/ga_est_contam_probe.py
"""
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "jev"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from jevlib import DATA, Keenable, now_iso, write_json  # noqa: E402
from ga_est_bench import ITEMS  # noqa: E402

PROBES = ["GSM8K/test[0]", "GSM8K/test[1]", "HumanEval/HumanEval/0", "MMLU/abstract_algebra/test[0]",
          "ARC/ARC-Challenge/test[0]", "BIG-bench canary/canary"]


def nw(t):
    return re.findall(r"[a-z0-9]+", unicodedata.normalize("NFKC", t).lower().replace("’", "'"))


def main():
    kn = Keenable()
    rows = []
    for bench, iid, txt, src in ITEMS:
        if f"{bench}/{iid}" not in PROBES:
            continue
        w = nw(txt)
        spans = {" ".join(w[i:i + 6]) for i in range(max(1, len(w) - 5))}
        res = kn.search(txt, max_results=10)
        hits = []
        for r in res.get("results", []) or []:
            blob = " ".join(nw((r.get("title") or "") + " " + (r.get("snippet") or "")))
            if any(s in blob for s in spans):
                hits.append({"url": r.get("url"), "acquired_at": r.get("acquired_at")})
        rows.append({"benchmark": bench, "item": iid, "source": src, "results": len(res.get("results", []) or []),
                     "verbatim_hits_top10": len(hits), "hit_urls": hits[:5], "error": res.get("error")})
        print(f"  {bench} {iid}: {len(hits)} verbatim of {rows[-1]['results']}", file=sys.stderr)
    write_json(DATA / "ga_contam_probe.json", {"generated_at": now_iso(), "method": __doc__.strip(), "rows": rows,
                                               "keenable_calls": kn.calls})


if __name__ == "__main__":
    main()
