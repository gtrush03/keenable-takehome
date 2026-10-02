"""Fill research/cc_overlap.md placeholders from data/cc_overlap.json."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
d = json.load(open(ROOT / "data/cc_overlap.json"))
t = open(ROOT / "data/cc_cdx_cache/cc_overlap.md.tmpl").read()
lr = json.load(open(ROOT / "data/cc_cdx_cache/lookup_results.json"))
older = [c for c in lr["crawls"] if not c.startswith("CC-MAIN-2026")]
total_older = d["crawls"]["total_listed"] - len(d["crawls"]["y2026"])


def cell(s):
    e = d["samples"][s].get("absent_from_every_crawl")
    if not e:
        return "pending"
    c = e["subsample_absent_from_2026_checked_in_every_crawl"]
    return (f"**{e['share']*100:.1f}%** ({e['ci95'][0]*100:.1f}–{e['ci95'][1]*100:.1f}); "
            f"{c['k']}/{c['n']} subsample URLs missing from 2026 were in no older crawl")


status = (f"PASS (all {total_older} older crawls checked for the subsample)" if len(older) >= total_older
          else f"PARTIAL: older crawls checked so far {len(older)}/{total_older}; every-crawl column is provisional")
rows = "\n".join(f"| {i+1} | {x['url']} | {x['sample']} | {(x['keenable_acquired_at'] or '')[:10]} | {x['absent_from']} |"
                 for i, x in enumerate(d["examples_keenable_has_cc_lacks"]))
ex = "| # | URL | Sample | Keenable acquired | Absent from |\n|---|---|---|---|---|\n" + rows
t = (t.replace("PHASE_B_GAL", cell("galactica")).replace("PHASE_B_FIN", cell("fintech"))
     .replace("EXAMPLES_TABLE", ex).replace("PHASE_B_STATUS", status))
open(ROOT / "research/cc_overlap.md", "w").write(t)
print(status)
