#!/usr/bin/env python3
"""Galactica (Keenable Option 1) simulations.

Reads data/opt1_cost_model.json and writes data/charts/opt1_*.json:
  1. build vs buy annual cost (low / mid / high) + breakeven (price, volume, months)
  2. freshness: share of the pool newer than a model's cutoff, CC vs Galactica cadence
  3. token-yield funnel: 100B docs -> usable tokens, three quality profiles
  4. Monte Carlo over every ranged input (10k draws), P10 / P50 / P90
  5. tornado sensitivity + stress tests

Usage: python3 scripts/opt1_sim.py [--draws 10000] [--seed 7]
Deterministic for a given seed. Needs only numpy.
"""
import argparse
import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
MODEL = ROOT / "data" / "opt1_cost_model.json"
OUT = ROOT / "data" / "charts"

LMH = ("low", "mid", "high")


def tri_ppf(u, lo, mode, hi):
    """Inverse CDF of triangular(lo, mode, hi)."""
    if hi == lo:
        return np.full_like(u, lo, dtype=float)
    c = (mode - lo) / (hi - lo)
    return np.where(
        u < c,
        lo + np.sqrt(u * (hi - lo) * (mode - lo)),
        hi - np.sqrt((1 - u) * (hi - lo) * (hi - mode)),
    )


def norm_cdf(x):
    return 0.5 * (1 + np.vectorize(math.erf)(x / math.sqrt(2)))


def pct(a):
    a = np.asarray(a, dtype=float)
    return {"p10": float(np.percentile(a, 10)), "p50": float(np.percentile(a, 50)),
            "p90": float(np.percentile(a, 90)), "mean": float(a.mean())}


def write(name, obj):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"opt1_{name}.json"
    path.write_text(json.dumps(obj, indent=1))
    return str(path.relative_to(ROOT))


# ---------------------------------------------------------------- 1. build vs buy
def build_lines(m):
    b = m["build"]
    return b["fixed_lines_k_per_month"], b["variable_lines_k_per_month_at_20B"]


def build_annual(m, idx, volume_scale=1.0, team_override_k=None):
    """Annual build cost in $ for scenario index idx (0 low, 1 mid, 2 high)."""
    fixed, var = build_lines(m)
    f = sum(v["range"][idx] for k, v in fixed.items() if k != "team")
    team = fixed["team"]["range"][idx] if team_override_k is None else team_override_k
    v = sum(x["range"][idx] for x in var.values()) * volume_scale
    return (f + team + v) * 12 * 1000


def sim_build_vs_buy(m):
    price = m["galactica"]["price_usd_per_year"]["range"]
    vol = m["build"]["volume_docs_per_month"]
    fixed, var = build_lines(m)
    rows = []
    for i, s in enumerate(LMH):
        total = build_annual(m, i)
        infra = sum(x["range"][i] for x in var.values()) * 12 * 1000
        mt = m["build"]["existing_team_marginal_fte"]
        marginal = (sum(x["range"][i] for x in var.values()) * 12 * 1000
                    + mt["range"][i] * mt["loaded_k_per_fte_year"][i] * 1000
                    + fixed["legal_compliance_pii"]["range"][i] * 12 * 1000 * 0.5)
        rows.append({
            "scenario": s,
            "build_total_usd_yr": total,
            "build_infra_only_usd_yr": infra,
            "build_marginal_existing_team_usd_yr": marginal,
            "build_usd_per_1B_docs": total / (vol * 12 / 1e9),
            "lines_k_per_month": {**{k: v["range"][i] for k, v in fixed.items()},
                                  **{k: v["range"][i] for k, v in var.items()}},
        })
    buy = {"low": price[0], "mid": price[1], "high": price[2],
           "usd_per_1B_docs_mid": price[1] / (vol * 12 / 1e9)}

    # Breakeven A: buy price at which buying equals building (= build cost itself).
    # Breakeven B: monthly volume at which build == buy (mid price). Fixed cost alone may exceed it.
    vols = [v * 1e9 for v in (1, 2, 5, 10, 15, 20, 30, 40)]
    curve = []
    for v in vols:
        scale = v / vol
        curve.append({"docs_per_month": v,
                      **{f"build_{s}_usd_yr": build_annual(m, i, scale) for i, s in enumerate(LMH)},
                      "buy_mid_usd_yr": price[1]})
    be_volume = {}
    for i, s in enumerate(LMH):
        fixed_yr = build_annual(m, i, 0.0)
        var_per_doc_yr = (build_annual(m, i, 1.0) - fixed_yr) / vol
        if fixed_yr >= price[1]:
            be_volume[s] = {"docs_per_month": None,
                            "reason": f"fixed cost alone ${fixed_yr/1e6:.2f}M/yr >= buy ${price[1]/1e6:.1f}M/yr; build never cheaper at any volume"}
        else:
            be_volume[s] = {"docs_per_month": (price[1] - fixed_yr) / var_per_doc_yr,
                            "reason": "volume where build total equals buy mid price"}

    # Breakeven C: cumulative cash over 36 months incl. time-to-first-dump.
    ttfd = m["build"]["time_to_first_dump_months"]["range"]
    months = list(range(0, 37))
    cum = []
    for t in months:
        r = {"month": t, "buy_mid_cum_usd": price[1] / 12 * t}
        for i, s in enumerate(LMH):
            r[f"build_{s}_cum_usd"] = build_annual(m, i) / 12 * t
            r[f"build_{s}_docs_delivered"] = max(0, t - ttfd[i]) * vol
        r["buy_docs_delivered"] = t * vol
        cum.append(r)

    out = {
        "title": "Build vs buy: annual cost of a 20B-docs/month web corpus",
        "units": "USD per year",
        "buy": buy,
        "build": rows,
        "ratio_build_over_buy_mid": {r["scenario"]: r["build_total_usd_yr"] / price[1] for r in rows},
        "breakeven_price_usd_yr": {r["scenario"]: r["build_total_usd_yr"] for r in rows},
        "breakeven_volume": be_volume,
        "volume_curve": curve,
        "cumulative_36mo": cum,
        "time_to_first_dump_months": dict(zip(LMH, ttfd)),
        "sources": "data/opt1_cost_model.json -> build.*, galactica.price_usd_per_year",
    }
    return out


# ---------------------------------------------------------------- 3. funnel
def funnel(m, docs, idx_tok=1, idx_stage=1, profile_idx=1):
    tpd = m["tokens"]["tokens_per_doc_raw"]["range"][idx_tok]
    tokens = docs * tpd
    steps = [{"stage": "Raw extracted text", "tokens": tokens}]
    for st in m["funnel"]["stages"]:
        tokens *= st["keep"][idx_stage]
        steps.append({"stage": st["name"], "tokens": tokens})
    profiles = {}
    for name, p in m["funnel"]["quality_profiles"].items():
        profiles[name] = tokens * p["classifier_keep"][profile_idx]
    return steps, profiles


def sim_funnel(m):
    stock = m["galactica"]["stock_docs"]["value"]
    flow = m["galactica"]["flow_docs_per_month"]["value"]
    nov = m["galactica"]["novel_share_of_flow"]["range"]
    out = {"title": "Token-yield funnel: 100B docs -> usable pretraining tokens", "units": "tokens",
           "stock": {}, "monthly_novel_flow": {}}
    for i, s in enumerate(LMH):
        steps, prof = funnel(m, stock, i, i, i)
        out["stock"][s] = {"steps": steps, "after_classifier": prof,
                           "yield_vs_raw": {k: v / steps[0]["tokens"] for k, v in prof.items()}}
        steps_f, prof_f = funnel(m, flow * nov[i], i, i, i)
        out["monthly_novel_flow"][s] = {"novel_docs": flow * nov[i], "steps": steps_f, "after_classifier": prof_f}
    out["reference_points"] = {
        "FineWeb_tokens": 15e12, "FineWeb_Edu_tokens": 1.3e12, "DCLM_Baseline_tokens": 4e12,
        "Nemotron_CC_real_unique_tokens": 4.4e12, "RedPajama_V2_dedup_tokens": 30.4e12,
        "Llama3_pretrain_tokens": 15e12, "Qwen3_pretrain_tokens": 36e12,
        "src": ["A14", "A18", "A23", "A32", "A27", "A38", "E09"]}
    return out


# ---------------------------------------------------------------- 2. freshness
def sim_freshness(m):
    g, cc = m["galactica"], m["common_crawl"]
    H = m["freshness"]["horizon_months"]
    budget = m["freshness"]["continual_pretraining_monthly_budget_tokens"]["range"]
    gaps = {k: v for k, v in m["freshness"]["model_cutoff_to_release_gap_months"].items() if k != "src"}
    stockG, stockC = g["stock_docs"]["value"], cc["unique_doc_pool"]["value"]
    res = {"title": "Freshness: share of the pool newer than a model's cutoff", "months": list(range(0, H + 1)),
           "scenarios": {}}
    for i, s in enumerate(LMH):
        newG = g["flow_docs_per_month"]["value"] * g["novel_share_of_flow"]["range"][i]
        newC = cc["new_urls_per_crawl"]["range"][i]  # one crawl per month
        shareG = [newG * t / (stockG + newG * t) for t in range(H + 1)]
        shareC = [newC * t / (stockC + newC * t) for t in range(H + 1)]
        # usable new tokens per month under each quality profile
        _, profG = funnel(m, newG, i, i, i)
        _, profC = funnel(m, newC, i, i, i)
        res["scenarios"][s] = {
            "new_unique_docs_per_month": {"galactica": newG, "common_crawl": newC, "ratio": newG / newC},
            "share_newer_than_cutoff": {"galactica": shareG, "common_crawl": shareC},
            "usable_new_tokens_per_month": {"galactica": profG, "common_crawl": profC},
            "months_of_TiC_LM_budget_covered_per_month": {
                "galactica": {k: v / budget[i] for k, v in profG.items()},
                "common_crawl": {k: v / budget[i] for k, v in profC.items()}},
            "at_release_gap": {name: {"galactica": newG * gm / (stockG + newG * gm),
                                      "common_crawl": newC * gm / (stockC + newC * gm)}
                               for name, gm in gaps.items()},
        }
    # Cadence lag: expected age of the newest document in hand at an arbitrary freeze date.
    win = cc["crawl_window_days"]["value"]
    rel = cc["release_lag_days_after_crawl_end"]["range"]
    proc = g["dump_processing_lag_days"]["range"]
    cad = g["delivery_cadence_days"]["value"]
    res["newest_doc_age_days_at_random_freeze"] = {
        s: {"common_crawl": 30 / 2 + win / 2 + rel[i], "galactica": cad / 2 + proc[i]} for i, s in enumerate(LMH)}
    res["honest_note"] = ("Both sources ship monthly, so the age of the newest document is similar (~3-4 weeks). "
                          "The difference is volume: Galactica's monthly drop carries ~10x more never-seen documents.")
    res["sources"] = ["A01", "A02", "A22", "E01-E04", "E07", "galactica card"]
    return res


# ---------------------------------------------------------------- 4. Monte Carlo
def sim_monte_carlo(m, draws, seed):
    rng = np.random.default_rng(seed)
    fixed, var = build_lines(m)
    lines = {**fixed, **var}
    names = list(lines)
    rho = 0.5
    z_common = rng.standard_normal(draws)
    U = {}
    for n in names:
        z = math.sqrt(rho) * z_common + math.sqrt(1 - rho) * rng.standard_normal(draws)
        U[n] = norm_cdf(z)
    build_k_month = sum(tri_ppf(U[n], *lines[n]["range"]) for n in names)
    build_yr = build_k_month * 12 * 1000

    def tri(r):
        return tri_ppf(rng.random(draws), *r)

    price = tri(m["galactica"]["price_usd_per_year"]["range"])
    tpd = tri(m["tokens"]["tokens_per_doc_raw"]["range"])
    keep = np.ones(draws)
    for st in m["funnel"]["stages"]:
        keep *= tri(st["keep"])
    prof = {k: tri(p["classifier_keep"]) if p["classifier_keep"][0] != p["classifier_keep"][2] else np.ones(draws)
            for k, p in m["funnel"]["quality_profiles"].items()}
    novel = tri(m["galactica"]["novel_share_of_flow"]["range"])
    cc_new = tri(m["common_crawl"]["new_urls_per_crawl"]["range"])
    flow = m["galactica"]["flow_docs_per_month"]["value"]
    stock = m["galactica"]["stock_docs"]["value"]
    ttfd = tri(m["build"]["time_to_first_dump_months"]["range"])

    newG = flow * novel
    usable_G = {k: newG * tpd * keep * v for k, v in prof.items()}
    usable_C = {k: cc_new * tpd * keep * v for k, v in prof.items()}
    stock_usable = {k: stock * tpd * keep * v for k, v in prof.items()}
    # 24-month window. Buy delivers the 100B stock plus 24 months of flow. Build delivers nothing before its
    # first dump and has no backfill stock, so it gets (24 - ttfd) months of the same flow.
    win = 24
    tok_buy = {k: stock_usable[k] + win * usable_G[k] for k in prof}
    tok_build = {k: np.clip(win - ttfd, 0, win) * usable_G[k] for k in prof}
    mt = m["build"]["existing_team_marginal_fte"]
    var_yr = sum(tri_ppf(U[n], *var[n]["range"]) for n in var) * 12 * 1000
    marginal_yr = (var_yr + tri(mt["range"]) * tri(mt["loaded_k_per_fte_year"]) * 1000
                   + 0.5 * tri_ppf(U["legal_compliance_pii"], *fixed["legal_compliance_pii"]["range"]) * 12 * 1000)
    share6G = newG * 6 / (stock + newG * 6)
    share6C = cc_new * 6 / (m["common_crawl"]["unique_doc_pool"]["value"] + cc_new * 6)

    agg = "aggressive (DCLM top-10% / FineWeb-Edu score>=3)"
    light = "light (RedPajama-V2 / Nemotron-CC style: keep most, weight by signals)"
    out = {
        "title": "Monte Carlo over ranged inputs", "draws": draws, "seed": seed,
        "build_annual_usd": pct(build_yr),
        "buy_annual_usd": pct(price),
        "build_over_buy_ratio": pct(build_yr / price),
        "p_build_cheaper_than_buy": float((build_yr < price).mean()),
        "year1_savings_buy_vs_build_usd": pct(build_yr - price),
        "marginal_build_existing_crawl_team_usd": pct(marginal_yr),
        "p_marginal_build_cheaper_than_buy": float((marginal_yr < price).mean()),
        "usable_new_tokens_per_month": {
            "galactica": {k: pct(v) for k, v in usable_G.items()},
            "common_crawl": {k: pct(v) for k, v in usable_C.items()},
            "ratio_galactica_over_cc": pct(newG / cc_new)},
        "stock_usable_tokens": {k: pct(v) for k, v in stock_usable.items()},
        "usd_per_usable_T_tokens_24mo": {
            "buy": {k: pct(2 * price / (tok_buy[k] / 1e12)) for k in prof},
            "build_new_team": {k: pct(2 * build_yr / (tok_build[k] / 1e12)) for k in prof},
            "note": "Build tokens exclude the 100B backfill and the months before first dump; P90 can be large when ttfd is long."},
        "share_of_pool_newer_than_cutoff_after_6mo": {"galactica": pct(share6G), "common_crawl": pct(share6C)},
        "time_to_first_dump_months": pct(ttfd),
        "histograms": {
            "build_annual_usd_M": np.histogram(build_yr / 1e6, bins=30)[0].tolist(),
            "build_annual_usd_M_edges": np.histogram(build_yr / 1e6, bins=30)[1].round(3).tolist(),
            "usable_new_T_tokens_per_month_galactica_aggressive": np.histogram(usable_G[agg] / 1e12, bins=30)[0].tolist(),
            "usable_new_T_tokens_per_month_galactica_aggressive_edges":
                np.histogram(usable_G[agg] / 1e12, bins=30)[1].round(4).tolist(),
        },
        "profile_keys": {"aggressive": agg, "light": light},
    }
    return out


# ---------------------------------------------------------------- 5. tornado + stress
def sim_tornado(m):
    fixed, var = build_lines(m)
    lines = {**fixed, **var}
    mid = sum(v["range"][1] for v in lines.values()) * 12 * 1000
    price = m["galactica"]["price_usd_per_year"]["range"][1]
    bars = []
    for n, v in lines.items():
        lo = mid + (v["range"][0] - v["range"][1]) * 12 * 1000
        hi = mid + (v["range"][2] - v["range"][1]) * 12 * 1000
        bars.append({"input": n, "build_usd_yr_at_low": lo, "build_usd_yr_at_high": hi, "swing": hi - lo})
    bars.sort(key=lambda b: -b["swing"])

    stress = []
    # S1: Keenable doubles price to $4M; S2: lab already has the team; S3: lab crawls with zero proxies,
    # bare-metal everything (all variable lines low) and only 3 FTE; S4: novelty collapses to 10%.
    lowvar = sum(v["range"][0] for v in var.values()) * 12 * 1000
    stress.append({"name": "Keenable price doubles to $4M/yr", "build_mid_usd_yr": mid, "buy_usd_yr": 4e6,
                   "build_cheaper": mid < 4e6})
    mt = m["build"]["existing_team_marginal_fte"]
    marginal_mid = (sum(v["range"][1] for v in var.values()) * 12 * 1000
                    + mt["range"][1] * mt["loaded_k_per_fte_year"][1] * 1000)
    stress.append({"name": "Lab already runs a crawl team (marginal 2 FTE + mid infra)",
                   "build_usd_yr": marginal_mid, "buy_usd_yr": price, "build_cheaper": marginal_mid < price})
    marginal_low = lowvar + mt["range"][0] * mt["loaded_k_per_fte_year"][0] * 1000
    stress.append({"name": "Frontier lab with an existing crawl team, lean infra (marginal 1 FTE + all infra low)",
                   "build_usd_yr": marginal_low, "buy_usd_yr": price, "build_cheaper": marginal_low < price})
    lean = lowvar + 3 * 450e3 + 150e3
    for p_ in (price, m["galactica"]["price_usd_per_year"]["range"][2]):
        stress.append({"name": f"Leanest new build: all infra low, 3 FTE at $450K, $150K legal vs buy ${p_/1e6:.1f}M",
                       "build_usd_yr": lean, "buy_usd_yr": p_, "build_cheaper": lean < p_,
                       "but": "build ships nothing for 4-14 months and has no 100B-doc backfill"})
    flow = m["galactica"]["flow_docs_per_month"]["value"]
    cc_hi = m["common_crawl"]["new_urls_per_crawl"]["range"][2]
    stress.append({"name": "Galactica novelty collapses to 10% of flow",
                   "galactica_new_docs_per_month": flow * 0.10, "cc_best_new_docs_per_month": cc_hi,
                   "galactica_still_ahead_x": flow * 0.10 / cc_hi})
    stress.append({"name": "Novelty 5% (near-pure recrawl)",
                   "galactica_new_docs_per_month": flow * 0.05, "cc_best_new_docs_per_month": cc_hi,
                   "galactica_still_ahead_x": flow * 0.05 / cc_hi})
    return {"title": "Sensitivity of mid build cost to each line (low->high)", "build_mid_usd_yr": mid,
            "buy_mid_usd_yr": price, "bars": bars, "stress_tests": stress}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--draws", type=int, default=10000)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    m = json.loads(MODEL.read_text())
    written = [
        write("build_vs_buy", sim_build_vs_buy(m)),
        write("freshness", sim_freshness(m)),
        write("funnel", sim_funnel(m)),
        write("montecarlo", sim_monte_carlo(m, a.draws, a.seed)),
        write("tornado", sim_tornado(m)),
    ]
    print("\n".join(written))


if __name__ == "__main__":
    main()
