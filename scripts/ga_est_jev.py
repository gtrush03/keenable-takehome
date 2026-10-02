#!/usr/bin/env python3
"""Galactica estimates, step 3: extend the live Jev FineWeb-Edu scores to the broad sample.

Same three questions as jev/galactica_edu.py (edu Score 0-5, page_type Choice, boilerplate Noul) plus one MODEL
question (machine_generated Noul). Content = first 8,000 chars of Keenable's indexed text, as in the G7 proof.
The 200 search_biased docs keep their G7 scores (data/jev_galactica_scores.json); only broad docs are sent.
Budget: <= 600 live Jev requests (seeded random draw of broad docs with >= 200 chars of text).

    set -a; . ./.env.jev; set +a; python3 scripts/ga_est_jev.py
"""
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "jev"))
from jevlib import DATA, Jev, now_iso, write_json  # noqa: E402
from galactica_edu import QUESTIONS, dry_run  # noqa: E402

BUDGET = 600
QS = dict(QUESTIONS)
QS["machine_generated"] = {
    "type": "noul",
    "instructions": ("Does `content` read as machine-generated or AI-written text (templated SEO filler, generic "
                     "LLM-style prose, auto-generated listings or summaries) rather than text written by a person?"),
}


def dry(state, qid, q):
    if qid == "machine_generated":
        return {"type": "noul", "noul": 0.5, "source": "dry-run"}
    return dry_run(state, qid, q)


def main():
    sample = json.loads((DATA / "galactica_sample.json").read_text())["docs"]
    broad = [d for d in sample if d["sample"] == "broad" and len(d.get("text", "").strip()) >= 200]
    pick = random.Random(20261001).sample(broad, min(BUDGET, len(broad)))
    jev = Jev(dry)
    print(f"jev mode={jev.mode}; scoring {len(pick)} of {len(broad)} broad docs", file=sys.stderr)
    out = []
    for i, d in enumerate(pick):
        state = {"url": d["url"], "title": d["title"], "content": d["text"][:8000]}
        try:
            r = jev.ask(state, QS)
        except Exception as e:  # keep going; record the failure
            out.append({"url": d["url"], "error": str(e)[:200]})
            continue
        a = r["answers"]
        out.append({"url": d["url"], "query_type": d["query_type"], "content_chars": len(state["content"]),
                    "edu_score": a["edu"]["score"], "edu_confidence": a["edu"]["confidence"],
                    "edu_probabilities": a["edu"]["probabilities"], "page_type": a["page_type"]["choice"],
                    "boilerplate_p": a["boilerplate"]["noul"], "machine_generated_p": a["machine_generated"]["noul"],
                    "input_tokens": r.get("usage", {}).get("input_tokens"), "answer_source": r.get("source")})
        if i % 50 == 0:
            print(f"  {i + 1}/{len(pick)} usage={jev.usage['requests']} req", file=sys.stderr)
    write_json(DATA / "galactica_jev_broad.json", {
        "meta": {"generated_at": now_iso(), "label": jev.label(), "mode": jev.mode, "models_seen": sorted(jev.models_seen),
                 "requests": jev.usage["requests"], "input_tokens": jev.usage["input_tokens"],
                 "output_tokens": jev.usage["output_tokens"], "budget": BUDGET,
                 "eligible_broad_docs": len(broad), "scored": sum(1 for o in out if "error" not in o),
                 "note": ("Questions = G7 QUESTIONS + machine_generated (MODEL, not a validated AI-text detector). "
                          "G7 ablation A showed fan-out extras move the edu score by 0.027 on average.")},
        "questions": QS, "docs": out})


if __name__ == "__main__":
    main()
