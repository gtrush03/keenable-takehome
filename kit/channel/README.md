# kit/channel: Keenable as an inference platform's hosted web_search

The server-side half of the SP2 play: what an inference platform (target: Fireworks AI) runs inside its gateway when a model calls `web_search`. It reuses the kit's core client (`../src/keenable.mjs`) and changes nothing outside this folder.

```
channel/
  hosted-tool.mjs         translate client tool input → Keenable, operator overrides, cache, metering, native output shapes
  hosted-tool.test.mjs    9 offline tests (domain mapping, fan-out merge, cache billing, failure billing, output shapes)
  demo.mjs                live demo: 20 platform-typical agent queries x {realtime, pro}, cache replay, domain controls, model side
  queries.jsonl           the query set (coding agent, research agent, freshness, factual QA), eval/run.mjs-compatible
  out/                    DEMO.md, demo_report.json, transcript_STUB.md (or transcript_LIVE.md when a key exists)
```

```bash
node --test channel/hosted-tool.test.mjs       # offline
node channel/demo.mjs                          # live, keyless, paced <= 1.5 rps, ~43 upstream calls
node channel/demo.mjs --queries their.jsonl    # the platform's own queries
node eval/run.mjs --queries channel/queries.jsonl --providers keenable,keenable_realtime   # same set through the blind eval runner
```

The model side runs only if `FIREWORKS_API_KEY` (or `OPENROUTER_API_KEY`) is already in the environment (model: `KIT_FW_MODEL`, default `accounts/fireworks/models/deepseek-v3p1`). Without a key the demo writes `out/transcript_STUB.md`: its tool results are real Keenable responses, and its model turns are hand-written placeholders, labelled as such.

What the shim does on each call:

1. Claude Code `WebSearch` input (`query`, `allowed_domains`, `blocked_domains`) or a Responses API `web_search` call becomes Keenable parameters. One allowed domain becomes `site`. Two or three become parallel legs. More than three become a post-filter. Blocked domains widen `max_results` and are filtered out.
2. Operator overrides (`mode`, `query_time`) are applied where the model cannot see them, the same pattern as Keenable's MCP `_meta["keenable/overrides"]`.
3. A short-TTL cache is checked first: 5 min for realtime, 1 h for pro. Both TTLs are design assumptions to agree with Keenable. Cache hits are not Keenable-billed.
4. Only successful upstream calls are metered, as in Baseten's "Failed calls are not billed". `bill(pricePer1k)` returns the invoice line.
5. Results come back as Anthropic `server_tool_use` + `web_search_tool_result` blocks, or as an OpenAI `web_search_call` item.
