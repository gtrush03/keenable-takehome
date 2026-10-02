// Offline tests for the hosted web_search shim. Run: node --test channel/hosted-tool.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { planSearch, mergeResults, cacheKey, createHostedWebSearch, toAnthropic, toOpenAIResponses } from "./hosted-tool.mjs";

const R = (url, title = url) => ({ url, title, snippet: "s", published_at: "2026-09-16T00:00:00Z", acquired_at: null });

test("one allowed domain maps to Keenable site", () => {
  const p = planSearch({ query: "x", allowed_domains: ["https://www.docs.fireworks.ai/a"] });
  assert.equal(p.requests.length, 1);
  assert.equal(p.requests[0].site, "docs.fireworks.ai");
});

test("two or three allowed domains fan out; more fall back to a post-filter", () => {
  assert.equal(planSearch({ query: "x", allowed_domains: ["a.com", "b.com"] }).requests.length, 2);
  const many = planSearch({ query: "x", allowed_domains: ["a.com", "b.com", "c.com", "d.com"] });
  assert.equal(many.requests.length, 1);
  assert.equal(many.requests[0].max_results, 50);
});

test("blocked domains widen the request and are filtered out", () => {
  const p = planSearch({ query: "x", blocked_domains: ["bad.com"], max_results: 5 });
  assert.equal(p.requests[0].max_results, 15);
  const out = mergeResults([[R("https://bad.com/1"), R("https://sub.bad.com/2"), R("https://ok.com/3")]], p);
  assert.deepEqual(out.map((r) => r.url), ["https://ok.com/3"]);
});

test("allowed and blocked together are rejected", () => {
  assert.throws(() => planSearch({ query: "x", allowed_domains: ["a.com"], blocked_domains: ["b.com"] }));
});

test("operator overrides (mode, query_time) are applied and the model cannot see them", () => {
  const p = planSearch({ query: "x", mode: "pro" }, { mode: "realtime", query_time: "2026-01-01" });
  assert.equal(p.requests[0].mode, "realtime");
  assert.equal(p.requests[0].query_time, "2026-01-01");
});

test("fan-out merge interleaves and dedups", () => {
  const out = mergeResults([[R("https://a.com/1"), R("https://a.com/2")], [R("https://b.com/1"), R("https://a.com/1")]], { n: 10 });
  assert.deepEqual(out.map((r) => r.url), ["https://a.com/1", "https://b.com/1", "https://a.com/2"]);
});

test("cache key ignores case and whitespace, not filters", () => {
  assert.equal(cacheKey({ query: "Foo  Bar", site: "a.com" }), cacheKey({ query: "foo bar", site: "a.com" }));
  assert.notEqual(cacheKey({ query: "foo", site: "a.com" }), cacheKey({ query: "foo", site: "b.com" }));
});

test("cache hits are not billed; failures are not billed", async () => {
  let calls = 0, fail = false;
  const client = { auth: "fake", async search(req) { calls++; if (fail) throw new Error("503"); return { results: [R("https://a.com/" + req.query)], meta: { ms: 100 } }; } };
  let t = 0;
  const tool = createHostedWebSearch({ client, mode: "realtime", now: () => t });
  await tool.run({ query: "q1" });
  await tool.run({ query: "q1" });
  assert.equal(calls, 1);
  t = 6 * 60_000; // past the realtime TTL
  await tool.run({ query: "q1" });
  assert.equal(calls, 2);
  fail = true;
  await assert.rejects(tool.run({ query: "q2" }));
  assert.equal(tool.bill(1).keenable_requests, 2);
  assert.equal(tool.bill(4).usd, 0.008);
});

test("output shapes for Anthropic and OpenAI Responses clients", () => {
  const a = toAnthropic("srvtoolu_1", "q", [R("https://a.com/1")]);
  assert.equal(a[0].type, "server_tool_use");
  assert.equal(a[1].content[0].type, "web_search_result");
  assert.equal(a[1].content[0].page_age, "2026-09-16");
  const o = toOpenAIResponses("ws_1", "q", [R("https://a.com/1")]);
  assert.equal(o.type, "web_search_call");
  assert.equal(o.action.sources[0].url, "https://a.com/1");
});
