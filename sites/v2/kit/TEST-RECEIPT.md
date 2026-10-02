# Kit test receipt · 2026-10-02T00:58Z
Run: npm test (node --test, test/*.test.mjs) on the MacBook Pro copy of kit/.
That copy's code is identical to this repo's kit (sha256 of src, adapters, test and mcp *.mjs: d7624eb8…eca9a on both).
Live tests call Keenable's public endpoints. Rival providers without keys print NEEDS KEY and are not part of the 26.

```
v25.6.0

> keenable-stack-kit@0.1.0 test
> node --test --test-concurrency=1 --test-isolation=none "test/*.test.mjs"

✔ one canonical schema, re-shaped per vendor (2.563709ms)
✔ keyless by default: public endpoint, app title header, no key header (33.3695ms)
✔ keyed when a key is passed (0.451167ms)
✔ harness pin beats the model: query_time and mode overrides (2.30375ms)
✔ PIT flags: content-date and index leaks are counted, drop policy removes them (2.361459ms)
✔ validation and HTTP errors surface as errors (0.963792ms)
✔ OpenAI handler: chat tool_call and Responses function_call (21.390458ms)
✔ Anthropic handler: every tool_use answered in one user turn, errors marked is_error (1.719125ms)
✔ AI SDK tools: same names as @keenable/ai-sdk, queryTime passes through (1.394084ms)
✔ LangChain tools: content for the model, artifact for the harness (7.585459ms)
✔ CSV parser handles quotes, embedded commas and doubled quotes (0.52875ms)
✔ loader validates and both sample sets load (2.482125ms)
✔ rule judge: hit@k, fact vs topic regex, PIT leak checks (0.511459ms)
✔ blinding: labels hide provider names, are seeded, and unblind correctly (1.738709ms)
✔ stats: nearest-rank percentiles, Wilson interval, exact McNemar (0.145042ms)
✔ sizing at Keenable list prices (0.100958ms)
✔ verdict memo has every section and the honest caveats (21.389ms)
✔ LLM judge prompt is blind and its reply parser is strict (0.370875ms)
✔ every provider adapter declares price, fence and docs; keyed ones report NEEDS KEY without a key (0.161208ms)
✔ live: keyless search returns ranked results with dates (763.840584ms)
✔ live: query_time never returns pages acquired after the instant (684.946292ms)
✔ live: keyless fetch returns markdown for an indexed URL (1010.753209ms)
✔ live: OpenAI and Anthropic handlers round-trip a real search (1441.521083ms)
✔ live: AI SDK and LangChain tools execute (1230.691334ms)
tavily             NEEDS KEY: TAVILY_API_KEY
✔ live: MCP server over stdio — initialize, tools/list, tools/call with query_time (880.777041ms)
keenable           ag-01        208ms n=10
keenable           ag-02        355ms n=10
✔ live: eval runner end to end on two queries (1035.608709ms)
ℹ tests 26
ℹ suites 0
ℹ pass 26
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7474.939291
```
