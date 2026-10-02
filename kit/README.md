# Keenable in your stack in 15 minutes

This kit is for an ML engineer on an agent or eval team who has been asked to "look at Keenable". It does two things:

1. **Drops Keenable search and fetch into the stack you already run**: an OpenAI-style function tool, Anthropic tool use, a stdio MCP server, a Vercel AI SDK tool and a LangChain.js / LangGraph tool. All of them expose `query_time`.
2. **Runs your benchmark, not ours.** `eval/run.mjs` takes your queries as JSONL or CSV, runs Keenable and any competitor you hold a key for, judges blind, and writes a one-page `VERDICT.md` with a pilot proposal and a price sizing.

Everything runs today on Keenable's **keyless** endpoint (`/v1/search/public`, `/v1/fetch/public`). Competitor arms and model calls switch on when their keys are already in your environment.

```
kit/
  src/keenable.mjs        core client: keyless/keyed, process-wide pacer, query_time pin, PIT flags, telemetry
  src/tools.mjs           one canonical schema for keenable_search + keenable_fetch, and a tool runner
  adapters/openai.mjs     Chat Completions + Responses tool shapes, handler for tool_calls / function_call items
  adapters/anthropic.mjs  Messages API tool defs, handler that turns tool_use blocks into one tool_result turn
  adapters/ai-sdk.mjs     Vercel AI SDK tools (superset of @keenable/ai-sdk)
  adapters/langchain.mjs  LangChain.js tools (content + artifact), used in a LangGraph ReAct agent
  mcp/server.mjs          stdio MCP server, zero dependencies
  examples/               one runnable example per adapter
  eval/                   run.mjs, providers.mjs, load.mjs, judge.mjs, llm-judge.mjs, stats.mjs, verdict.mjs
  eval/sets/              fintech.jsonl (40 queries + 7 point-in-time events), agentic.csv (14 queries)
  eval/out/               results of the two sample sets, run 2026-10-01 on the keyless endpoint
  test/                   node --test: offline unit tests + live keyless tests
```

## Quickstart (15 minutes)

Node 20 or later.

```bash
npm install                     # framework deps for the AI SDK / LangChain adapters and the model SDKs
npm test                        # 26 tests; about a dozen live keyless calls, paced at <= 1.5 rps
node examples/mcp-client.mjs    # MCP: initialize, tools/list, tools/call with query_time
node examples/anthropic.mjs     # also: openai.mjs, ai-sdk.mjs, langgraph.mjs
```

The examples ask the same question: *what was publicly known about SVB's deposit outflows on 2023-03-09, the day before the FDIC closed it?* With a model key (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `OPENROUTER_API_KEY`) the model runs the tool loop. Without one, the example says so and calls the tool handler directly, so you still see exactly what the model would receive.

Now run your own queries:

```bash
node eval/run.mjs --queries my.jsonl --providers keenable,tavily
```

One JSON object per line (or CSV with the same column names; list fields separated by `;`):

```json
{"id": "q1", "query": "NVIDIA Q2 FY2026 data center revenue", "expected_domains": ["nvidia.com"], "expected_regex": "41\\.1", "gold_answer": "Data center revenue was $41.1B"}
{"id": "q2", "query": "FTX bankruptcy filing", "query_time": "2022-11-08", "leak_regex": "chapter 11|filed for bankruptcy"}
```

| Field | Meaning |
|---|---|
| `query` | required |
| `expected_domains` | primary sources you would accept (subdomains match) |
| `expected_regex` | a fact that must appear in a top-10 title or snippet; `regex_strength: "topic"` makes it count toward on-topic only |
| `query_time` | run the query as of this instant: Keenable `query_time`; other providers get their publish-date fence |
| `leak_regex` | text that would reveal an outcome that happened after `query_time` |
| `gold_answer` | used only by the optional LLM judge |

Outputs land in `eval/out/<set>/`: `results.jsonl` (one line per arm × query, raw results plus score), `summary.json` (board, pairwise tests, per-query verdicts), `blind_packet.json` (the evidence with provider names removed) and `VERDICT.md`. `--rejudge` re-scores existing results without calling anyone. Other flags: `--k`, `--limit`, `--monthly 1000000,50000000`, `--peak-rps`, `--seed`, `--no-llm`.

## Which adapter to use

Keenable already ships integrations; use them when they fit, and use this kit when you need the harness controls.

| Your stack | Keenable's own | What this kit adds |
|---|---|---|
| Any MCP client | Hosted MCP at `https://api.keenable.ai/mcp`; stdio bridge `@keenable/mcp-server` | Operator-controlled clock and SKU for evals: `KEENABLE_PIN_QUERY_TIME`, `KEENABLE_FORCE_MODE`, `KEENABLE_LEAK_POLICY=drop`, JSONL telemetry via `KIT_TELEMETRY`. The npm bridge (0.2.1) does not expose `query_time`; the hosted server does. |
| Vercel AI SDK | `@keenable/ai-sdk` 0.1.0 | Same tool names and fields, plus `queryTime`, `mode`, `acquiredAfter/Before`, PIT flags per result. |
| LangChain | `langchain-keenable` (Python) | The JS side: LangChain.js tools that return the citable text as content and the full JSON as the artifact. |
| OpenAI / Anthropic function calling, or any OpenAI-compatible endpoint | REST API | Ready schemas and handlers for Chat Completions, Responses and Messages. |

Add the MCP server to Claude Code with the clock pinned for an eval:

```bash
claude mcp add keenable-kit -e KEENABLE_PIN_QUERY_TIME=2023-03-09 -- node "$PWD/mcp/server.mjs"
```

## How judging works

1. **Fixed keys.** Answer keys live in your query file before any run. The file's sha256 is written into the verdict.
2. **Blind relabelling.** For each query, every arm's result list is relabelled A, B, C in a seeded random order. The scorers see only the results and the key; the label-to-provider map is applied after every verdict exists. `blind_packet.json` gives a third party the same blinded evidence.
3. **Rule judge** (always on):
   - `hit@k`: rank of the first expected domain is ≤ k (1, 3, 10).
   - `verified`: an expected domain is in the top 10, or a fact-strength regex appears in a top-10 title or snippet.
   - Point-in-time, for queries with `query_time`:
     - index leaks: results acquired after `query_time` (must be 0)
     - outcome leaks: `leak_regex` matches
     - the **content-date check**: results whose `published_at` is after `query_time`
4. **LLM judge** (optional): with a model key set, one call per query that has a `gold_answer`. The model sees only labels A, B, ..., the gold answer and the top-5 results. It returns supported or not, with a quoted piece of evidence. Defaults: `claude-sonnet-5-5`, `gpt-5-mini` or OpenRouter `anthropic/claude-sonnet-5.5`, in that order; override with `KIT_JUDGE_MODEL`.
5. **Metrics** for each arm:
   - client latency p50/p95/p99 (nearest-rank), not counting time spent waiting on the pacer
   - error and empty-result counts
   - verified rate with a 95% Wilson interval
   - pairwise exact McNemar tests on the queries both arms answered
   - list cost per 1K searches, and cost per verified answer at list and floor prices

## Sample results (keyless endpoint, 2026-10-01)

| Set | Arm | Verified | Hit@1 / 3 / 10 | p50 / p95 ms | PIT index / outcome / content-date |
|---|---|---|---|---|---|
| fintech (40 + 7 PIT) | keenable pro | 25/40 (63%, CI 47–76%) | 18% / 28% / 43% | 208 / 495 | 0 / 1 / 1 of 70 results |
| fintech | keenable realtime | 25/40 | 18% / 28% / 43% | 208 / 500 | 0 / 1 / 1 |
| agentic research (12 + 2 PIT) | keenable pro | 12/14 (86%, CI 60–96%) | 57% / 64% / 86% | 252 / 1,785 | 0 / 0 / 0 of 20 |
| agentic research | keenable realtime | 12/14 | 57% / 64% / 86% | 215 / 528 | 0 / 0 / 0 |

Full memos: [`eval/out/fintech/VERDICT.md`](eval/out/fintech/VERDICT.md), [`eval/out/agentic/VERDICT.md`](eval/out/agentic/VERDICT.md). The fintech set's answer keys come from the fintech head-to-head and were fixed on 2026-10-01 before any competitor run.

Three things in these runs are worth a researcher's attention:

- **Pro and realtime returned identical URL lists** on 47/47 fintech queries and 14/14 agentic queries. The response echoes the requested mode each time. On the keyless endpoint, the two modes differ in latency at most.
- **Content-date check.** One FTX result was acquired on 2022-06-28, before the 2022-11-08 `query_time`. It carries `published_at` 2024-03-06 and a snippet about a 2024 settlement: a tag page whose stored copy is newer than its `acquired_at`. `query_time` filters on acquisition time, so the page passes the fence while its text is from after the instant. The kit flags results like this (`pit.published_after_query_time`) and can drop them (`KEENABLE_LEAK_POLICY=drop`).
- **Tail latency.** p95 on a 14-call sample is the single slowest call (1,785 ms in pro mode). Use the fintech run's 47 calls, or larger, for tail claims.

## What this kit does not prove

- **No head-to-head yet.** No competitor ran: Tavily, Exa, Brave, SerpApi, Parallel and Perplexity are all `NEEDS KEY`. Both sample verdicts compare Keenable pro with Keenable realtime only.
- **Untested competitor adapters.** They follow each vendor's public docs (URLs in `eval/providers.mjs`), but none has made a live call yet. Their first keyed run doubles as their schema check.
- **The rule judge reads only snippets.** It is strict and reproducible, but it reads titles and snippets, not full pages. A source can be correct and still miss the regex. The LLM judge narrows that gap only when a key exists.
- **Latency is not server latency.** It is measured on one residential connection's wall clock, paced to stay within the keyless pool (1,000 requests/hour, shared per IP). This is not a load test, and tail numbers on 14 calls are anecdotes.
- **The point-in-time fences differ.** Keenable's `query_time` filters on acquisition time. Competitors filter on a publish date, or not at all (Parallel only has `after_date`). So PIT columns compare different guarantees, and the verdict says so.
- **Small samples.** 47 and 14 queries. Treat any difference inside the confidence interval as a tie; the verdict reports McNemar p-values for that reason.

## What switches on with keys

Only environment variables you have already set are read.

| Variable | Effect |
|---|---|
| `KEENABLE_API_KEY` | Keyed `/v1/search` and `/v1/fetch`: no hourly cap, 10 rps per org, 100K free requests a month |
| `TAVILY_API_KEY`, `EXA_API_KEY`, `BRAVE_API_KEY`, `SERPAPI_API_KEY`, `PARALLEL_API_KEY`, `PERPLEXITY_API_KEY` | That competitor arm runs in `eval/run.mjs --providers ...` |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY` | Examples run a real model tool loop; the eval's LLM judge runs |
| `KIT_ANTHROPIC_MODEL`, `KIT_OPENAI_MODEL`, `KIT_JUDGE_MODEL` | Model overrides (defaults: `claude-opus-5-5`, `gpt-5`, and the judge defaults above) |

## Adding a provider

Add an entry to `PROVIDERS` in `eval/providers.mjs`:

```js
myprovider: {
  label: "My Provider", envKey: "MYPROVIDER_API_KEY", rps: 1,
  price_per_1k: 5, price_floor_per_1k: 3, price_note: "source URL + date",
  fence: "what its date filter actually filters on", docs: "https://...",
  async search({ query, query_time, k }) {
    const json = await http("https://api.example.com/search", { method: "POST", headers: { ... }, body: JSON.stringify({ q: query }) });
    return { results: json.items.map((x) => ({ title: x.title, url: x.url, snippet: x.text, published_at: x.date ?? null, acquired_at: null })) };
  },
},
```

The same shape covers an internal search service: point `search` at it and run it as one more arm. The provider test in `test/eval.test.mjs` checks that every adapter declares a price, a fence and a docs URL.

## Prices used in the sizing

Keenable list prices are from keenable.ai/pricing, read 2026-10-01:
- $4 per 1K requests, pay as you go
- $1 per 1K at 100+ RPS
- 100K requests a month free

The sizing table applies the free allowance to pay-go only. It treats the $1/1K tier as provisioned 100+ RPS capacity, which is an ASSUMPTION, labelled as such in every verdict. Competitor list and floor prices come with their source next to each adapter.
