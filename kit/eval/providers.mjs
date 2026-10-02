// Provider adapters for the bring-your-own-benchmark runner. Every adapter maps its API onto one shape:
//   search({ query, query_time, k }) -> { results: [{ title, url, snippet, published_at, acquired_at }], cost_usd?, server_ms? }
// query_time asks for the provider's best native "nothing after this instant" fence; `fence` says what that fence
// actually filters on (Keenable: acquisition time; everyone else: a publish-date filter, or nothing).
// Keys come only from environment variables; a missing key => the provider is skipped and reported as NEEDS KEY.
// Request shapes follow each vendor's public docs (URLs below, read 2026-10-01). Ported from the fintech head-to-head
// harness. Only the Keenable arms have been exercised live; treat each keyed adapter's first run as its schema check.
import { createKeenable } from "../src/keenable.mjs";

const T = (s, n = 400) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
const env = (k) => process.env[k] || "";

async function http(url, init) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!r.ok) {
    const err = new Error(`${r.status} ${String(json?.error?.message || json?.error || json?.message || text).slice(0, 160)}`);
    err.status = r.status;
    throw err;
  }
  return json;
}

const day = (t) => String(t).slice(0, 10);
const dayBefore = (t) => new Date(Date.parse(day(t) + "T00:00:00Z") - 864e5).toISOString().slice(0, 10);
const mdy = (d) => { const [y, m, dd] = d.split("-"); return `${+m}/${+dd}/${y}`; };

function keenableArm(mode) {
  let client;
  return {
    label: `Keenable (${mode})`, envKey: "KEENABLE_API_KEY", keyless: true, rps: 1.5,
    price_per_1k: 4, price_floor_per_1k: 1, free_per_month: 100000,
    price_note: "$4/1K pay-go, $1/1K at 100+ RPS, 100K requests/month free (keenable.ai/pricing, read 2026-10-01). Keyless calls bill $0.",
    fence: "query_time: index as it stood at the instant (acquisition time)",
    docs: "https://docs.keenable.ai/api-reference/search",
    async search({ query, query_time, k = 10 }) {
      client ||= createKeenable({ title: "keenable-stack-kit-eval" });
      const res = await client.search({ query, mode, max_results: k, snippet_max_length: 300, ...(query_time && { query_time }) });
      return { request_ms: res.meta.ms, served_mode: res.mode, results: res.results.map((x) => ({ title: x.title, url: x.url, snippet: T(x.snippet), published_at: x.published_at, acquired_at: x.acquired_at })) };
    },
  };
}

export const PROVIDERS = {
  keenable: keenableArm("pro"),
  keenable_realtime: keenableArm("realtime"),

  // https://docs.tavily.com/documentation/api-reference/endpoint/search ; https://www.tavily.com/pricing
  tavily: {
    label: "Tavily (basic)", envKey: "TAVILY_API_KEY", rps: 1,
    price_per_1k: 8, price_floor_per_1k: 8, price_note: "$0.008/credit, basic = 1 credit (tavily.com/pricing); 1,000 free credits/mo",
    fence: "published or last-updated date (end_date)", docs: "https://docs.tavily.com/documentation/api-reference/endpoint/search",
    async search({ query, query_time, k = 10 }) {
      const json = await http("https://api.tavily.com/search", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${env("TAVILY_API_KEY")}` },
        body: JSON.stringify({ query, search_depth: "basic", max_results: k, ...(query_time && { end_date: dayBefore(query_time) }) }) });
      return { server_ms: json.response_time ? Math.round(json.response_time * 1000) : undefined,
        results: (json.results || []).map((x) => ({ title: x.title, url: x.url, snippet: T(x.content), published_at: x.published_date || null, acquired_at: null })) };
    },
  },

  // https://exa.ai/docs/reference/search ; https://exa.ai/pricing (crawl-date filters: "Deprecated. Ignored by the API.")
  exa: {
    label: "Exa (auto + highlights)", envKey: "EXA_API_KEY", rps: 1,
    price_per_1k: 17, price_floor_per_1k: 17, price_note: "$7/1K auto search + $1/1K pages highlights x 10 results (exa.ai/pricing); costDollars recorded when returned",
    fence: "published date (endPublishedDate)", docs: "https://exa.ai/docs/reference/search",
    async search({ query, query_time, k = 10 }) {
      const json = await http("https://api.exa.ai/search", { method: "POST", headers: { "content-type": "application/json", "x-api-key": env("EXA_API_KEY") },
        body: JSON.stringify({ query, type: "auto", numResults: k, contents: { highlights: { maxCharacters: 300 } }, ...(query_time && { endPublishedDate: `${dayBefore(query_time)}T23:59:59.999Z` }) }) });
      return { cost_usd: json.costDollars?.total, server_ms: json.searchTime,
        results: (json.results || []).map((x) => ({ title: x.title, url: x.url, snippet: T((x.highlights || []).join(" … ") || x.text), published_at: x.publishedDate || null, acquired_at: null })) };
    },
  },

  // https://api-dashboard.search.brave.com/app/documentation/web-search/query ; https://brave.com/search/api/
  brave: {
    label: "Brave Search API", envKey: "BRAVE_API_KEY", rps: 1,
    price_per_1k: 5, price_floor_per_1k: 5, price_note: "$5/1K Search plan (brave.com/search/api); storing results needs a storage-rights plan",
    fence: "page date (freshness=YYYY-MM-DDtoYYYY-MM-DD)", docs: "https://api-dashboard.search.brave.com/app/documentation/web-search/query",
    async search({ query, query_time, k = 10 }) {
      const p = new URLSearchParams({ q: query, count: String(Math.min(k, 20)), ...(query_time && { freshness: `1990-01-01to${dayBefore(query_time)}` }) });
      const json = await http(`https://api.search.brave.com/res/v1/web/search?${p}`, { headers: { Accept: "application/json", "X-Subscription-Token": env("BRAVE_API_KEY") } });
      return { results: (json.web?.results || []).map((x) => ({ title: x.title, url: x.url, snippet: T(x.description), published_at: x.page_age || null, acquired_at: null })) };
    },
  },

  // https://serpapi.com/search-api ; https://serpapi.com/pricing (Google results)
  serpapi: {
    label: "SerpApi (Google)", envKey: "SERPAPI_API_KEY", rps: 1,
    price_per_1k: 7.25, price_floor_per_1k: 1.96, price_note: "$7.25/1K Searcher plan down to ~$1.96/1K at the top tier (serpapi.com/pricing)",
    fence: "Google custom date range (tbs=cdr) - publish-date based", docs: "https://serpapi.com/search-api",
    async search({ query, query_time, k = 10 }) {
      const p = new URLSearchParams({ engine: "google", q: query, num: String(k), api_key: env("SERPAPI_API_KEY"), ...(query_time && { tbs: `cdr:1,cd_max:${mdy(dayBefore(query_time))}` }) });
      const json = await http(`https://serpapi.com/search.json?${p}`, {});
      return { server_ms: json.search_metadata?.total_time_taken ? Math.round(json.search_metadata.total_time_taken * 1000) : undefined,
        results: (json.organic_results || []).map((x) => ({ title: x.title, url: x.link, snippet: T(x.snippet), published_at: x.date || null, acquired_at: null })) };
    },
  },

  // https://docs.parallel.ai/api-reference/search-beta/search ; https://parallel.ai/pricing
  parallel: {
    label: "Parallel Search (fast)", envKey: "PARALLEL_API_KEY", rps: 1,
    price_per_1k: 1, price_floor_per_1k: 1, price_note: "fast mode $1/1K (parallel.ai/pricing); H2H_PARALLEL_MODE=basic|advanced for $5/1K modes",
    fence: "none before a date (source_policy only has after_date): PIT items run unfenced", docs: "https://docs.parallel.ai/api-reference/search-beta/search",
    async search({ query, k = 10 }) {
      const json = await http("https://api.parallel.ai/v1/search", { method: "POST", headers: { "content-type": "application/json", "x-api-key": env("PARALLEL_API_KEY") },
        body: JSON.stringify({ objective: query, search_queries: [query], mode: env("H2H_PARALLEL_MODE") || "fast", advanced_settings: { max_results: k } }) });
      return { results: (json.results || []).slice(0, k).map((x) => ({ title: x.title || "", url: x.url, snippet: T((x.excerpts || []).join(" … ")), published_at: x.publish_date || null, acquired_at: null })) };
    },
  },

  // https://docs.perplexity.ai/api-reference/search-post ; https://docs.perplexity.ai/getting-started/pricing
  // ("$5.00 per 1,000 requests"). Date-filter field names follow the Sonar docs; unverified until the first keyed run.
  perplexity: {
    label: "Perplexity Search API", envKey: "PERPLEXITY_API_KEY", rps: 1,
    price_per_1k: 5, price_floor_per_1k: 5, price_note: "$5/1K requests (docs.perplexity.ai/getting-started/pricing)",
    fence: "publish date (search_before_date_filter)", docs: "https://docs.perplexity.ai/api-reference/search-post",
    async search({ query, query_time, k = 10 }) {
      const json = await http("https://api.perplexity.ai/search", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${env("PERPLEXITY_API_KEY")}` },
        body: JSON.stringify({ query, max_results: Math.min(k, 20), ...(query_time && { search_before_date_filter: mdy(dayBefore(query_time)) }) }) });
      return { results: (json.results || []).map((x) => ({ title: x.title || "", url: x.url, snippet: T(x.snippet), published_at: x.date || null, acquired_at: null })) };
    },
  },
};

export function availability(id) {
  const p = PROVIDERS[id];
  if (!p) return { ready: false, status: `UNKNOWN PROVIDER: ${id} (known: ${Object.keys(PROVIDERS).join(", ")})` };
  if (env(p.envKey)) return { ready: true, auth: "key" };
  if (p.keyless) return { ready: true, auth: "keyless" };
  return { ready: false, status: `NEEDS KEY: ${p.envKey}` };
}
