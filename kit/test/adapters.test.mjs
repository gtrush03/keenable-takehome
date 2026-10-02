// Offline tests: tool schemas, handlers and harness controls, against a mocked Keenable API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createKeenable, pitFlags, toInstant } from "../src/keenable.mjs";
import { TOOLS } from "../src/tools.mjs";
import { openaiChatTools, openaiResponsesTools, createOpenAIToolHandler } from "../adapters/openai.mjs";
import { anthropicTools, createAnthropicToolHandler } from "../adapters/anthropic.mjs";
import { keenableTools } from "../adapters/ai-sdk.mjs";
import { createKeenableLangChainTools } from "../adapters/langchain.mjs";
import { mockFetch, RESULTS } from "./helpers.mjs";

const fast = (f, extra = {}) => ({ fetch: f, rps: 1000, apiKey: "", ...extra });

test("one canonical schema, re-shaped per vendor", () => {
  assert.deepEqual(TOOLS.map((t) => t.name), ["keenable_search", "keenable_fetch"]);
  assert.ok(TOOLS[0].schema.properties.query_time, "query_time exposed");
  assert.equal(openaiChatTools[0].type, "function");
  assert.equal(openaiChatTools[0].function.parameters, TOOLS[0].schema);
  assert.equal(openaiResponsesTools[1].name, "keenable_fetch");
  assert.equal(anthropicTools[0].input_schema, TOOLS[0].schema);
  assert.deepEqual(anthropicTools[0].input_schema.required, ["query"]);
});

test("keyless by default: public endpoint, app title header, no key header", async () => {
  const f = mockFetch(RESULTS);
  const k = createKeenable(fast(f));
  await k.search({ query: "x" });
  assert.match(f.calls[0].url, /\/v1\/search\/public$/);
  assert.ok(f.calls[0].headers["X-Keenable-Title"]);
  assert.equal(f.calls[0].headers["X-API-Key"], undefined);
});

test("keyed when a key is passed", async () => {
  const f = mockFetch(RESULTS);
  await createKeenable(fast(f, { apiKey: "keen_test" })).search({ query: "x" });
  assert.match(f.calls[0].url, /\/v1\/search$/);
  assert.equal(f.calls[0].headers["X-API-Key"], "keen_test");
});

test("harness pin beats the model: query_time and mode overrides", async () => {
  const f = mockFetch(RESULTS);
  const k = createKeenable(fast(f, { pinQueryTime: "2023-03-01", forceMode: "realtime" }));
  const res = await k.search({ query: "x", query_time: "2026-01-01", mode: "pro" });
  assert.equal(f.calls[0].body.query_time, "2023-03-01");
  assert.equal(f.calls[0].body.mode, "realtime");
  assert.equal(res.meta.pit.query_time, "2023-03-01");
});

test("PIT flags: content-date and index leaks are counted, drop policy removes them", async () => {
  const flagged = await createKeenable(fast(mockFetch(RESULTS))).search({ query: "x", query_time: "2023-03-01" });
  assert.equal(flagged.meta.pit.published_after_query_time, 1);
  assert.equal(flagged.meta.pit.acquired_after_query_time, 0);
  assert.equal(flagged.results[1].pit.published_after_query_time, true);
  const dropped = await createKeenable(fast(mockFetch(RESULTS), { leakPolicy: "drop" })).search({ query: "x", query_time: "2023-03-01" });
  assert.equal(dropped.results.length, 2);
  assert.equal(dropped.meta.pit.dropped, 1);
  assert.equal(toInstant("2023-03-01"), Date.parse("2023-03-01T00:00:00Z"));
  assert.deepEqual(pitFlags({ acquired_at: "2023-03-02T00:00:00Z" }, "2023-03-01"), { acquired_after_query_time: true, published_after_query_time: false, undated: true });
});

test("validation and HTTP errors surface as errors", async () => {
  const k = createKeenable(fast(mockFetch(RESULTS)));
  await assert.rejects(k.search({ query: "" }), /query is required/);
  await assert.rejects(k.search({ query: "x", mode: "turbo" }), /mode must be/);
  await assert.rejects(k.fetch({ url: "not a url" }), /absolute/);
  await assert.rejects(createKeenable(fast(mockFetch([], { status: 400 }))).search({ query: "x" }), /400/);
});

test("OpenAI handler: chat tool_call and Responses function_call", async () => {
  const handle = createOpenAIToolHandler(fast(mockFetch(RESULTS)));
  const chat = await handle({ id: "c1", type: "function", function: { name: "keenable_search", arguments: '{"query":"nvidia"}' } });
  assert.equal(chat.message.role, "tool");
  assert.equal(chat.message.tool_call_id, "c1");
  assert.match(chat.message.content, /\[1\] SEC filing/);
  const resp = await handle({ type: "function_call", call_id: "r1", name: "keenable_fetch", arguments: '{"url":"https://a.com/x"}' });
  assert.deepEqual(Object.keys(resp.message), ["type", "call_id", "output"]);
  assert.match(resp.message.output, /# Hello/);
  const bad = await handle({ id: "c2", function: { name: "nope", arguments: "{}" } });
  assert.match(bad.message.content, /Unknown tool/);
});

test("Anthropic handler: every tool_use answered in one user turn, errors marked is_error", async () => {
  const handle = createAnthropicToolHandler(fast(mockFetch(RESULTS)));
  const { message } = await handle([
    { type: "text", text: "searching" },
    { type: "tool_use", id: "t1", name: "keenable_search", input: { query: "a" } },
    { type: "tool_use", id: "t2", name: "keenable_search", input: { query: "" } },
  ]);
  assert.equal(message.role, "user");
  assert.deepEqual(message.content.map((b) => b.tool_use_id), ["t1", "t2"]);
  assert.equal(message.content[0].is_error, undefined);
  assert.equal(message.content[1].is_error, true);
  assert.equal((await handle([{ type: "text", text: "done" }])).message, null);
});

test("AI SDK tools: same names as @keenable/ai-sdk, queryTime passes through", async () => {
  const f = mockFetch(RESULTS);
  const tools = keenableTools({ client: createKeenable(fast(f)) });
  assert.deepEqual(Object.keys(tools), ["keenable_search", "keenable_fetch"]);
  const out = await tools.keenable_search.execute({ query: "q", queryTime: "2023-03-01", mode: "realtime" }, { toolCallId: "x", messages: [] });
  assert.equal(f.calls[0].body.query_time, "2023-03-01");
  assert.equal(f.calls[0].body.mode, "realtime");
  assert.equal(out.queryTime, "2023-03-01");
  assert.equal(out.results[1].pit.published_after_query_time, true);
});

test("LangChain tools: content for the model, artifact for the harness", async () => {
  const [search, fetchTool] = createKeenableLangChainTools({ client: createKeenable(fast(mockFetch(RESULTS))) });
  assert.equal(search.name, "keenable_search");
  assert.equal(fetchTool.name, "keenable_fetch");
  const msg = await search.invoke({ type: "tool_call", id: "1", name: "keenable_search", args: { query: "q", query_time: "2023-03-01" } });
  assert.match(String(msg.content), /SEC filing/);
  assert.equal(msg.artifact.meta.pit.published_after_query_time, 1);
});
