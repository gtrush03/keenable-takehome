// Keenable as a platform-hosted web search tool: the server-side half of an inference platform's "web_search".
//
// The shape follows Baseten Hosted Tools (https://docs.baseten.co/inference/model-apis/web-search.md, read 2026-10-01)
// and the slot Fireworks already exposes (https://docs.fireworks.ai/nexus/web-search: "When Claude Code calls its
// native WebSearch tool, Fireworks runs the search server-side"; provider not named, "pricing will be published soon").
//
// What the platform's inference gateway does on a web_search call, and what this module implements:
//   1. translate the client's tool input (Anthropic web_search / Claude Code WebSearch, or OpenAI Responses web_search)
//      into Keenable parameters: allowed_domains -> site or a fan-out, blocked_domains -> post-filter
//   2. apply operator-only overrides the model never sees (mode, query_time pin), like Keenable's MCP _meta overrides
//   3. serve from a short-TTL cache when it can (cache hits are not Keenable-billed)
//   4. call Keenable, meter only successful calls (Baseten: "Failed calls are not billed"), record latency
//   5. return the result in the client's native shape (Anthropic web_search_tool_result or OpenAI web_search_call)
import { createKeenable } from "../src/keenable.mjs";

// ASSUMPTION (design defaults, to agree with Keenable): realtime results go stale faster than pro results.
export const CACHE_TTL_MS = { realtime: 5 * 60_000, pro: 60 * 60_000 };
export const PRICE_PER_1K = { frontier: 1, payg: 4 }; // https://keenable.ai/pricing (read 2026-10-01)
const MAX_FANOUT = 3;

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const matches = (h, d) => h === d || h.endsWith("." + d);
const norm = (d) => String(d).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

// Client tool input -> one or more Keenable search requests plus a post-filter. Pure, so it is unit-tested offline.
export function planSearch(input, overrides = {}) {
  const query = String(input?.query || "").trim();
  if (!query) throw new Error("web_search: query is required");
  const allowed = (input.allowed_domains || []).map(norm).filter(Boolean);
  const blocked = (input.blocked_domains || []).map(norm).filter(Boolean);
  if (allowed.length && blocked.length) throw new Error("web_search: allowed_domains and blocked_domains are mutually exclusive");
  const n = Math.min(Math.max(Number(input.max_results) || 10, 1), 50);
  const base = { query, max_results: n };
  if (overrides.mode) base.mode = overrides.mode;
  if (overrides.query_time) base.query_time = overrides.query_time;
  if (input.published_after) base.published_after = input.published_after;
  let requests;
  if (allowed.length === 1) requests = [{ ...base, site: allowed[0] }];
  else if (allowed.length > 1 && allowed.length <= MAX_FANOUT) requests = allowed.map((site) => ({ ...base, site }));
  else if (allowed.length > MAX_FANOUT) requests = [{ ...base, max_results: 50 }]; // too many for a fan-out: filter after
  else requests = [{ ...base, max_results: blocked.length ? Math.min(50, n + 10) : n }];
  return { requests, allowed, blocked, n };
}

// Round-robin merge of fan-out result lists, dedup by URL, then domain filters, then cut to n.
export function mergeResults(lists, { allowed = [], blocked = [], n = 10 } = {}) {
  const seen = new Set(), out = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) for (const l of lists) {
    const r = l[i];
    if (!r || seen.has(r.url)) continue;
    const h = host(r.url);
    if (allowed.length && !allowed.some((d) => matches(h, d))) continue;
    if (blocked.some((d) => matches(h, d))) continue;
    seen.add(r.url); out.push(r);
  }
  return out.slice(0, n);
}

export function cacheKey(req) {
  const { query, ...rest } = req;
  return JSON.stringify([query.toLowerCase().replace(/\s+/g, " ").trim(), Object.keys(rest).sort().map((k) => [k, rest[k]])]);
}

// Output shapes. Anthropic's encrypted_content is opaque to clients; the platform picks the encoding. We carry the
// snippet so the model can read it when the platform feeds the block back into its own context.
export function toAnthropic(toolUseId, query, results) {
  return [
    { type: "server_tool_use", id: toolUseId, name: "web_search", input: { query } },
    {
      type: "web_search_tool_result", tool_use_id: toolUseId,
      content: results.map((r) => ({
        type: "web_search_result", url: r.url, title: r.title,
        page_age: r.published_at ? r.published_at.slice(0, 10) : null,
        encrypted_content: Buffer.from(JSON.stringify({ snippet: r.snippet })).toString("base64"),
      })),
    },
  ];
}

export function toOpenAIResponses(callId, query, results) {
  return {
    type: "web_search_call", id: callId, status: "completed",
    action: { type: "search", query, sources: results.map((r) => ({ type: "url", url: r.url })) },
  };
}

export function createHostedWebSearch(opts = {}) {
  const k = opts.client || createKeenable({ title: opts.title || "keenable-channel-demo", ...opts.keenable });
  const overrides = { mode: opts.mode || null, query_time: opts.queryTime || null };
  const cache = new Map();
  const ledger = []; // one row per tool call: what the platform would meter
  const now = opts.now || (() => Date.now());

  async function run(input, { format = "anthropic", id = `srvtoolu_${ledger.length + 1}` } = {}) {
    const t0 = performance.now();
    const plan = planSearch(input, overrides);
    const lists = [];
    let billed = 0, cacheHits = 0, upstreamMs = 0, failed = 0;
    for (const req of plan.requests) {
      const key = cacheKey(req);
      const hit = cache.get(key);
      const ttl = CACHE_TTL_MS[req.mode || "pro"];
      if (hit && now() - hit.at < ttl) { lists.push(hit.results); cacheHits++; continue; }
      try {
        const res = await k.search(req);
        upstreamMs = Math.max(upstreamMs, res.meta.ms); // fan-out legs run in parallel in production
        cache.set(key, { at: now(), results: res.results });
        lists.push(res.results); billed++;
      } catch (e) {
        failed++; lists.push([]);
        if (plan.requests.length === 1) { ledger.push({ id, query: plan.requests[0].query, billed: 0, failed: 1, error: e.message }); throw e; }
      }
    }
    const results = mergeResults(lists, plan);
    const row = {
      id, query: input.query, mode: plan.requests[0].mode || "pro", legs: plan.requests.length,
      billed_keenable_requests: billed, cache_hits: cacheHits, failed,
      upstream_ms: upstreamMs, total_ms: Math.round(performance.now() - t0), n: results.length,
    };
    ledger.push(row);
    const body = format === "openai" ? toOpenAIResponses(id, input.query, results) : toAnthropic(id, input.query, results);
    return { body, results, meter: row };
  }

  function bill(pricePer1k = PRICE_PER_1K.payg) {
    const requests = ledger.reduce((s, r) => s + (r.billed_keenable_requests || 0), 0);
    return { tool_calls: ledger.length, keenable_requests: requests, usd: +(requests * pricePer1k / 1000).toFixed(4), price_per_1k: pricePer1k };
  }

  return { run, ledger, bill, auth: k.auth };
}
