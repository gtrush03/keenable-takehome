# Hosted web_search on Keenable: search-side demo

Run 2026-10-01T14:13:07.057Z → 2026-10-01T14:13:36.681Z. Endpoint: https://api.keenable.ai/v1/search/public (keyless). Pacing: kit pacer, <= 1.5 rps (rule: <= 2 rps).
Produced by `kit/channel/demo.mjs`; raw rows in `demo_report.json`.

## Latency and results by mode

| mode | calls | errors | p50 ms | p95 ms | max ms | mean results | expected domain in top 3 | in top 10 | share dated |
|---|---|---|---|---|---|---|---|---|---|
| realtime | 20 | 0 | 230 | 434 | 606 | 10 | 12/20 | 14/20 | 0.69 |
| pro | 20 | 0 | 240 | 422 | 458 | 10 | 12/20 | 14/20 | 0.69 |

## By workload segment

| segment/mode | calls | p50 ms | p95 ms | expected domain top 10 |
|---|---|---|---|---|
| coding-agent/realtime | 8 | 268 | 606 | 6/8 |
| research-agent/realtime | 4 | 230 | 434 | 3/4 |
| freshness/realtime | 4 | 225 | 301 | 3/4 |
| factual-qa/realtime | 4 | 206 | 305 | 2/4 |
| coding-agent/pro | 8 | 265 | 422 | 6/8 |
| research-agent/pro | 4 | 210 | 458 | 3/4 |
| freshness/pro | 4 | 194 | 267 | 3/4 |
| factual-qa/pro | 4 | 215 | 263 | 2/4 |

## Cache replay (same calls inside TTL)

- code-01: 0 ms, billed Keenable requests 0, cache hits 1
- code-02: 0 ms, billed Keenable requests 0, cache hits 1
- code-03: 0 ms, billed Keenable requests 0, cache hits 1
- code-04: 0 ms, billed Keenable requests 0, cache hits 1
- code-05: 0 ms, billed Keenable requests 0, cache hits 1

## Client domain controls

- allowed_domains [2 domains] → 2 parallel legs, 2 billed requests, hosts: docs.fireworks.ai, docs.together.ai
- blocked_domains [fireworks.ai] → hosts: angelinvestorsnetwork.com, aidb.digital, tamradar.com, aiflownews.com, venturepost.co; contains blocked: false

## Metering (what the platform invoice would show for this run)

- realtime: 27 tool calls → 23 Keenable requests → $0.023 at $1/1K, $0.092 at $4/1K
- pro: 20 tool calls → 20 Keenable requests → $0.02 at $1/1K, $0.08 at $4/1K

## Model side

STUB (NEEDS KEY: FIREWORKS_API_KEY or OPENROUTER_API_KEY) — see `kit/channel/out/transcript_STUB.md`

## Caveats

- Latency is measured from this machine (Mac, residential/office network, US West unverified) to Keenable US East; a platform calling from its own cloud region sees lower network time.
- Keyless tier only. The keyed tier and dedicated Frontier capacity were not measured.
- expected_domain hit is a domain proxy for relevance, not a graded judgment.
