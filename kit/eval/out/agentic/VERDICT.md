# Verdict: agentic

14 queries from `eval/sets/agentic.csv` (sha256 0393927ba691), run 2026-10-01T13:54:12.110Z. Arms that ran: **keenable**, **keenable_realtime**.

## Headline

- **keenable** verified **12/14** (86%, 95% CI 60%–96%); hit@1/3/10 on expected domains 57% / 64% / 86% over 14 queries.
- Latency (client wall-clock incl. TLS, node v25.6.0 on darwin): p50 **252 ms**, p95 **1785 ms**, p99 1785 ms over 14 calls; 0 errors.
- Point-in-time: 2 queries with query_time, 20 results. Index leaks (acquired after query_time): **0**. Results stating the later outcome: **0**. Results whose published_at is after query_time: **0** (content-date check; 13 undated).
- Cost: this run billed $0 (keyless endpoint); at list price, **$0.005 per verified answer** ($0.001 at the $1/1K tier).

## Winner per metric

| Metric | Winner | Value | Note |
|---|---|---|---|
| Verified rate (rule judge) | keenable, keenable_realtime | 86% | tie |
| Hit@1 (expected domain) | keenable, keenable_realtime | 57% | tie |
| Hit@3 | keenable, keenable_realtime | 64% | tie |
| Hit@10 | keenable, keenable_realtime | 86% | tie |
| LLM-judged supported | n/a | n/a | no data |
| Latency p50 | keenable_realtime | 215 ms |  |
| Latency p95 | keenable_realtime | 528 ms |  |
| Latency p99 | keenable_realtime | 528 ms |  |
| PIT index leaks (acquired after query_time) | keenable, keenable_realtime | 0 | tie |
| PIT outcome leaks (result states the later outcome) | keenable, keenable_realtime | 0 | tie |
| PIT content-date flags (published_at after query_time) | keenable, keenable_realtime | 0 | tie |
| List price per 1K | keenable, keenable_realtime | $4.00 | tie |
| List cost per verified answer | keenable, keenable_realtime | $0.005 | tie |

| Arm | Verified | Hit@3 | p50 / p95 ms | PIT index / outcome / content-date | $ per verified (list) |
|---|---|---|---|---|---|
| keenable | 12/14 | 64% | 252 / 1785 | 0 / 0 / 0 | $0.005 |
| keenable_realtime | 12/14 | 64% | 215 / 528 | 0 / 0 / 0 | $0.005 |

## Sizing at list prices

| Monthly searches | Avg RPS | Keenable pay-go ($4/1K, first 100K free) | Keenable $1/1K tier (100+ RPS) |
|---|---|---|---|
| 1M | 0.4 | $3,600 | $1,000 (needs 100+ RPS capacity) |
| 10M | 3.9 | $39,600 | $10,000 (needs 100+ RPS capacity) |
| 100M | 38.6 | $399,600 | $100,000 (needs 100+ RPS capacity) |

100 RPS sustained is 259.2M searches a month. ASSUMPTION: the $1/1K tier is sold on provisioned 100+ RPS capacity, not average load; the 100K free allowance is applied to pay-go only. Annual = monthly × 12.

## Pilot proposal

1. **Week 0: integration.** Drop the tool into the buyer's harness with this kit (OpenAI / Anthropic tool, MCP, AI SDK or LangChain adapter). Keyed endpoint, 100K free requests/month cover the pilot's evaluation traffic.
2. **Weeks 1–2: their benchmark.** Run `eval/run.mjs` on the buyer's own query set (held-out half fixed before any run) against their current provider(s). Same blind judge, their gold answers, their LLM judge if they want one.
3. **Weeks 3–4: shadow traffic.** Mirror a fixed share of production agent searches; compare answer-level outcomes, not only retrieval.
4. **Pass criteria (agreed up front, from this run):** verified rate ≥ 60% on the held-out set; p95 ≤ 2231 ms measured from the buyer's region on the keyed endpoint; zero index leaks on query_time queries; outcome leaks no higher than the incumbent.
5. **Conversion:** on pass, a volume commitment sized from the table above (pick the row nearest the buyer's measured monthly search count), priced at pay-go below 100 RPS and at the $1/1K tier for provisioned 100+ RPS. Head of Revenue owns final terms.

## What this does not prove

- All arms that ran are Keenable modes; this compares pro vs realtime, not Keenable vs competitors.
- Rule judge: a result counts as verified when an expected primary domain is in the top 10 or a fact-strength regex appears in a top-10 title/snippet. It is strict and reproducible, and it is not a reader of full pages.
- LLM judge did not run (NEEDS KEY: ANTHROPIC_API_KEY or OPENAI_API_KEY or OPENROUTER_API_KEY (rule judge only)).
- Latency is client wall-clock from one residential connection, paced to ≤2 rps on the keyless endpoint; it is not server latency and not a load test.
- Point-in-time fences differ by provider: Keenable filters on acquisition time (query_time); others filter on a publish-date field, so their PIT numbers measure a weaker fence.
- Keenable pro and realtime returned identical URL lists for 14/14 queries (served mode echoed as requested), so on this endpoint the two modes differ in latency only, if at all.
- Sample size: 14 queries. Treat differences inside the 95% CI as ties.

Files: `results.jsonl` (one line per arm × query), `summary.json`, `blind_packet.json` (evidence without provider names). Seed 20261001.
