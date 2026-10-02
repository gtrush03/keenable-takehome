# Fintech head-to-head harness

Every reachable provider gets the same 40 fintech queries (research / AML / KYB / agents) plus 7 point-in-time events. A blind judge scores the results against answer keys that were fixed before any run.

## Re-run with your keys (one command)

```bash
cd ~/Genie/scratch/keenable
TAVILY_API_KEY=… EXA_API_KEY=… BRAVE_API_KEY=… SERPAPI_API_KEY=… PARALLEL_API_KEY=… node scripts/h2h/run.mjs
```

- Any key you leave out shows up as `NEEDS KEY: <name>`, and that provider is skipped. Keenable runs keyless; set `KEENABLE_API_KEY` to use the keyed endpoint instead.
- Free tiers cover one run of 47 calls per provider: Tavily 1,000 credits/mo, Exa $10/mo, Brave $5/mo, SerpApi 250/mo. Parallel's free allowance is not verified.
- Options: `--providers keenable,exa`, `--limit 10` (first N queries), `--no-pit`.
- Pacing: Keenable keyless at ≤1.8 rps (the per-IP pool is shared), every other provider at 1 rps. Retries happen only on 429 or 5xx.

## Tonight's run (2026-10-01, mini) — how to repeat it

```bash
zsh scripts/h2h/env_keys.sh                                   # .env.keys (chmod 600) from Keychain keenable-h2h-<provider>, keenable-api, hackday-openrouter-api
bun --env-file=.env.keys scripts/h2h/run.mjs --providers keenable,keenable_pubdate,keenable_nofence
bun --env-file=.env.keys scripts/h2h/run.mjs --merge --providers tavily,exa,parallel,linkup,firecrawl
bun --env-file=.env.keys scripts/h2h/pit_judge.mjs           # blind LLM judge on the 7 events, JEV_CRITERIA labels → data/h2h/pit_llm.json
bun scripts/h2h/summary.mjs                                   # data/h2h/SUMMARY.md
bun sites/demo/build.ts && bun sites/demo/server.ts           # demo at http://127.0.0.1:7952/
```
- `node` is blocked in this shell; everything runs under bun. `--merge` keeps providers from the previous `latest_raw.json` (each keeps its own `ran_at`). `--charts` is now opt-in (data/charts belongs to the site lane).
- New arms: `keenable_nofence` (control), `linkup` (toDate), `firecrawl` (tbs cd_max; free tier ≈10 req/min, paced at 0.15 rps), `perplexity` (search_before_date_filter; not run, needs a card).
- `pit_judge.mjs` caches labels in `data/h2h/pit_llm_cache.json` (OpenRouter new-account cap: 20 req/min on Sonnet 5.5). `qa_demo.mjs` / `qa_sections.mjs` take headless screenshots into `data/h2h/qa/`; `leakscan.mjs` checks no key value landed in any output file.

## Files

| File | What |
|---|---|
| `providers.mjs` | One adapter per provider (`keenable`, `keenable_pubdate`, `tavily`, `exa`, `brave`, `serpapi`, `parallel`), each with its doc URL, list price and **date fence type**. |
| `queries.json` | 40 queries with gold domains, fact regex and strength, plus 7 PIT events with cutoff and outcome regex. Fixed on 2026-10-01. |
| `judge.mjs` | Blind judge. For each item, providers are relabelled A, B, … in seeded random order before scoring, and unblinded afterwards. Re-score an existing run: `node scripts/h2h/judge.mjs data/h2h/latest_raw.json`. |
| `../../data/h2h/latest_raw.json` | Raw results (a timestamped copy is kept too) |
| `../../data/h2h/latest_judged.json` | Leaderboard and per-item verdicts |
| `../../data/h2h/blind_packet.json` | The same evidence with provider names removed, for a human or third-lab LLM judge |
| `../../data/charts/opt2_h2h.json` | Chart rows |

## Judge rules

- **verified**: an expected primary-source domain is in the top 10, OR a "fact"-strength expected fact (a number, date or outcome) appears in a top-10 title or snippet. A "topic" match counts only toward `on_topic`. Items whose answer wasn't public yet are excluded.
- **PIT `states_outcome`**: a top-10 title or snippet already states the outcome that happened after the cutoff. Lower is better. Each provider uses its own best native fence:
  - Keenable `query_time`: acquisition time
  - Keenable `published_before`, Tavily `end_date`, Exa `endPublishedDate`, Brave `freshness` range, SerpApi `tbs=cdr`: publish date
  - Exa `startCrawlDate`/`endCrawlDate`: "Deprecated. Ignored by the API."
  - Parallel: `after_date` only, so its PIT arm runs unfenced
- **Cost**: list $/1K × calls. Exa's response reports `costDollars`, which is recorded when present.

## Caveats

- Tavily, Exa, Parallel, Linkup and Firecrawl ran live on 2026-10-01 21:35Z (free tiers). SerpApi (phone verification), Brave (card) and Perplexity (card) have not run.
- The regex judge is strict and reproducible, but it is not an LLM reading pages. Use `blind_packet.json` for a second, independent judge.
