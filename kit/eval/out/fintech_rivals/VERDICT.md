# Verdict: fintech

47 queries from `eval/sets/fintech.jsonl` (sha256 0c8d1d356985), run 2026-10-01T21:39:46.853Z. Arms that ran: **keenable**, **keenable_realtime**, **tavily**, **exa**, **parallel**.

## Headline

- **keenable** verified **22/40** (55%, 95% CI 40%–69%); hit@1/3/10 on expected domains 18% / 28% / 33% over 40 queries.
- Latency (client wall-clock incl. TLS, node v24.3.0 on darwin): p50 **704 ms**, p95 **1358 ms**, p99 1422 ms over 47 calls; 0 errors.
- Point-in-time: 7 queries with query_time, 70 results. Index leaks (acquired after query_time): **0**. Results stating the later outcome: **1**. Results whose published_at is after query_time: **1** (content-date check; 34 undated).
- Cost: this run at list $0.188; at list price, **$0.007 per verified answer** ($0.002 at the $1/1K tier).

## Winner per metric

| Metric | Winner | Value | Note |
|---|---|---|---|
| Verified rate (rule judge) | exa | 100% | vs keenable: 18 wins / 0 losses, McNemar p=0; vs keenable_realtime: 18 wins / 0 losses, McNemar p=0; vs tavily: 3 wins / 0 losses, McNemar p=0.25; vs parallel: 3 wins / 0 losses, McNemar p=0.25 |
| Hit@1 (expected domain) | exa | 70% |  |
| Hit@3 | exa | 83% |  |
| Hit@10 | exa | 95% |  |
| LLM-judged supported | n/a | n/a | no data |
| Latency p50 | exa | 571 ms |  |
| Latency p95 | exa | 806 ms |  |
| Latency p99 | exa | 852 ms |  |
| PIT index leaks (acquired after query_time) | keenable, keenable_realtime, tavily, exa, parallel | 0 | tie |
| PIT outcome leaks (result states the later outcome) | keenable, keenable_realtime | 1 | tie |
| PIT content-date flags (published_at after query_time) | tavily, exa | 0 | tie |
| List price per 1K | parallel | $1.00 |  |
| List cost per verified answer | parallel | $0.001 |  |

| Arm | Verified | Hit@3 | p50 / p95 ms | PIT index / outcome / content-date | $ per verified (list) |
|---|---|---|---|---|---|
| keenable | 22/40 | 28% | 704 / 1358 | 0 / 1 / 1 | $0.007 |
| keenable_realtime | 22/40 | 28% | 728 / 1260 | 0 / 1 / 1 | $0.007 |
| tavily | 37/40 | 40% | 2070 / 6893 | 0 / 16 / 0 | $0.009 |
| exa | 40/40 | 83% | 571 / 806 | 0 / 31 / 0 | $0.017 |
| parallel | 37/40 | 73% | 1158 / 3472 | 0 / 24 / 22 | $0.001 |

## Sizing at list prices

| Monthly searches | Avg RPS | Keenable pay-go ($4/1K, first 100K free) | Keenable $1/1K tier (100+ RPS) | tavily list | exa list | parallel list |
|---|---|---|---|---|---|---|
| 1M | 0.4 | $3,600 | $1,000 (needs 100+ RPS capacity) | $8,000 | $17,000 | $1,000 |
| 10M | 3.9 | $39,600 | $10,000 (needs 100+ RPS capacity) | $80,000 | $170,000 | $10,000 |
| 100M | 38.6 | $399,600 | $100,000 (needs 100+ RPS capacity) | $800,000 | $1,700,000 | $100,000 |

100 RPS sustained is 259.2M searches a month. ASSUMPTION: the $1/1K tier is sold on provisioned 100+ RPS capacity, not average load; the 100K free allowance is applied to pay-go only. Annual = monthly × 12.

## Pilot proposal

1. **Week 0: integration.** Drop the tool into the buyer's harness with this kit (OpenAI / Anthropic tool, MCP, AI SDK or LangChain adapter). Keyed endpoint, 100K free requests/month cover the pilot's evaluation traffic.
2. **Weeks 1–2: their benchmark.** Run `eval/run.mjs` on the buyer's own query set (held-out half fixed before any run) against their current provider(s). Same blind judge, their gold answers, their LLM judge if they want one.
3. **Weeks 3–4: shadow traffic.** Mirror a fixed share of production agent searches; compare answer-level outcomes, not only retrieval.
4. **Pass criteria (agreed up front, from this run):** verified rate ≥ 40% on the held-out set; p95 ≤ 1698 ms measured from the buyer's region on the keyed endpoint; zero index leaks on query_time queries; outcome leaks no higher than the incumbent.
5. **Conversion:** on pass, a volume commitment sized from the table above (pick the row nearest the buyer's measured monthly search count), priced at pay-go below 100 RPS and at the $1/1K tier for provisioned 100+ RPS. Head of Revenue owns final terms.

## What this does not prove

- Rule judge: a result counts as verified when an expected primary domain is in the top 10 or a fact-strength regex appears in a top-10 title/snippet. It is strict and reproducible, and it is not a reader of full pages.
- LLM judge: openrouter anthropic/claude-sonnet-5.5 on 0 items with gold answers, blind to provider names.
- Latency is client wall-clock from one residential connection, paced to ≤2 rps on the keyless endpoint; it is not server latency and not a load test.
- Point-in-time fences differ by provider: Keenable filters on acquisition time (query_time); others filter on a publish-date field, so their PIT numbers measure a weaker fence.
- A result acquired before query_time but carrying a published_at after it is flagged, not counted as an index leak. Two explanations fit and the API response cannot tell them apart: the stored copy was refreshed after first acquisition while acquired_at kept the first date (a tag or listing page that kept updating), or the page's date metadata is wrong. Either way, an agent replaying the past could read later content; check `pit.examples` in summary.json.
- Keenable pro and realtime returned identical URL lists for 47/47 queries (served mode echoed as requested), so on this endpoint the two modes differ in latency only, if at all.
- Sample size: 47 queries. Treat differences inside the 95% CI as ties.

Files: `results.jsonl` (one line per arm × query), `summary.json`, `blind_packet.json` (evidence without provider names). Seed 20261001.
