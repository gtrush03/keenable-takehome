// Live tests against Keenable's keyless endpoint (no key needed). About a dozen calls, paced at <= 1.5 rps by the
// shared client pacer. Skipped with KIT_OFFLINE=1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, readFileSync } from "node:fs";
import { createKeenable } from "../src/keenable.mjs";
import { createOpenAIToolHandler } from "../adapters/openai.mjs";
import { createAnthropicToolHandler } from "../adapters/anthropic.mjs";
import { keenableTools } from "../adapters/ai-sdk.mjs";
import { createKeenableLangChainTools } from "../adapters/langchain.mjs";
import { startMcp } from "../examples/mcp-client.mjs";
import { evaluate } from "../eval/run.mjs";
import { offline } from "./helpers.mjs";

const live = { skip: offline ? "KIT_OFFLINE=1" : false, timeout: 60000 };
const k = createKeenable({ apiKey: "" });

test("live: keyless search returns ranked results with dates", live, async () => {
  const r = await k.search({ query: "PostgreSQL 17 release", max_results: 5 });
  assert.equal(r.meta.endpoint, "/v1/search/public");
  assert.ok(r.results.length > 0 && r.results.every((x) => x.url.startsWith("http")));
  assert.ok(r.results.some((x) => x.acquired_at));
});

test("live: query_time never returns pages acquired after the instant", live, async () => {
  const r = await k.search({ query: "Silicon Valley Bank deposit outflows", query_time: "2023-03-09", max_results: 10 });
  assert.ok(r.results.length > 0);
  assert.equal(r.meta.pit.acquired_after_query_time, 0);
});

test("live: keyless fetch returns markdown for an indexed URL", live, async () => {
  const s = await k.search({ query: "PostgreSQL 17 released", site: "postgresql.org", max_results: 3 });
  const p = await k.fetch({ url: s.results[0].url, max_chars: 2000 });
  assert.ok(p.content.length > 50);
});

test("live: OpenAI and Anthropic handlers round-trip a real search", live, async () => {
  const o = await createOpenAIToolHandler({ apiKey: "" })({ id: "c", type: "function", function: { name: "keenable_search", arguments: '{"query":"RFC 8446 TLS 1.3","max_results":3}' } });
  assert.match(o.message.content, /\[1\]/);
  const a = await createAnthropicToolHandler({ apiKey: "" })([{ type: "tool_use", id: "t", name: "keenable_search", input: { query: "RFC 9110 HTTP semantics", max_results: 3 } }]);
  assert.match(a.message.content[0].content, /\[1\]/);
});

test("live: AI SDK and LangChain tools execute", live, async () => {
  const out = await keenableTools({ apiKey: "" }).keenable_search.execute({ query: "Kubernetes v1.31 Elli", queryTime: "2026-01-01" }, { toolCallId: "x", messages: [] });
  assert.ok(out.results.length > 0);
  const [search] = createKeenableLangChainTools({ apiKey: "" });
  const msg = await search.invoke({ type: "tool_call", id: "1", name: "keenable_search", args: { query: "arXiv 1706.03762", max_results: 3 } });
  assert.ok(msg.artifact.results.length > 0);
});

test("live: MCP server over stdio — initialize, tools/list, tools/call with query_time", live, async () => {
  const mcp = startMcp({ KEENABLE_API_KEY: "" });
  try {
    const init = await mcp.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    assert.equal(init.result.protocolVersion, "2025-06-18");
    mcp.notify("notifications/initialized");
    const list = await mcp.rpc("tools/list", {});
    assert.deepEqual(list.result.tools.map((t) => t.name), ["keenable_search", "keenable_fetch"]);
    assert.ok(list.result.tools[0].inputSchema.properties.query_time);
    const call = await mcp.rpc("tools/call", { name: "keenable_search", arguments: { query: "FTX bankruptcy filing", query_time: "2022-11-08", max_results: 5 } });
    assert.equal(call.result.isError, false);
    assert.equal(call.result._meta["kit/telemetry"].pit.acquired_after_query_time, 0);
    const unknown = await mcp.rpc("tools/call", { name: "nope", arguments: {} });
    assert.equal(unknown.error.code, -32602);
    const missing = await mcp.rpc("bogus/method", {});
    assert.equal(missing.error.code, -32601);
  } finally { mcp.close(); }
});

test("live: eval runner end to end on two queries", live, async () => {
  const outDir = new URL("../.cache/test/e2e", import.meta.url).pathname;
  rmSync(outDir, { recursive: true, force: true });
  const { summary, md } = await evaluate({ queriesPath: new URL("../eval/sets/agentic.csv", import.meta.url).pathname, providers: ["keenable", "tavily"], outDir, limit: 2, llm: false });
  assert.equal(summary.board.keenable.calls, 2);
  assert.match(summary.board.tavily.status || "ran", /NEEDS KEY|ran/);
  assert.equal(readFileSync(outDir + "/results.jsonl", "utf8").trim().split("\n").length, 2 * (summary.board.tavily.status ? 1 : 2));
  assert.match(md, /## Pilot proposal/);
});
