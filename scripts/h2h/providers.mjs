// Provider adapters for the fintech head-to-head. Every adapter maps its API onto one shape:
//   search({ query, cutoff }) -> { results: [{ title, url, snippet, published_at, acquired_at }], cost_usd?, server_ms? }
// `cutoff` (YYYY-MM-DD) asks for the provider's best native "nothing after this date" fence; `fence` says what that
// fence actually filters on. Keys come only from environment variables; a missing key => provider is skipped as NEEDS KEY.
// Request shapes follow each vendor's public docs (URLs below, read 2026-10-01). Only Keenable has been exercised live;
// the keyed adapters run for the first time when George adds a key — treat their first run as the schema check.

const T = (s, n = 400) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
const env = (k) => process.env[k] || "";

async function http(url, init) {
  const r = await fetch(url, init);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!r.ok) {
    const err = new Error(`${r.status} ${(json?.error?.message || json?.error || json?.message || text).toString().slice(0, 160)}`);
    err.status = r.status;
    throw err;
  }
  return { json, headers: r.headers };
}

const mdy = (d) => { const [y, m, dd] = d.split("-"); return `${+m}/${+dd}/${y}`; };
const dayBefore = (d) => new Date(Date.parse(d + "T00:00:00Z") - 864e5).toISOString().slice(0, 10);

export const PROVIDERS = {
  // Keenable with its point-in-time fence: query_time excludes pages *acquired* after the instant.
  // https://docs.keenable.ai/api-reference/search ; https://keenable.ai/pricing
  keenable: {
    label: "Keenable (pro, query_time)", envKey: "KEENABLE_API_KEY", keyless: true, rps: 1.8,
    price_per_1k: 4, price_floor_per_1k: 1, price_note: "$4/1K Agent Builder pay-go; $1/1K Frontier at 100+ RPS (keenable.ai/pricing). Keyless calls bill $0.",
    fence: "acquired_at (index state at query_time)",
    async search({ query, cutoff }) {
      const key = env("KEENABLE_API_KEY");
      const url = key ? "https://api.keenable.ai/v1/search" : "https://api.keenable.ai/v1/search/public";
      const headers = { "content-type": "application/json", ...(key ? { "X-API-Key": key } : { "X-Keenable-Title": "keenable-fintech-h2h" }) };
      const body = { query, mode: "pro", max_results: 10, snippet_max_length: 300, ...(cutoff && { query_time: cutoff }) };
      const { json } = await http(url, { method: "POST", headers, body: JSON.stringify(body) });
      return { results: (json.results || []).map((x) => ({ title: x.title, url: x.url, snippet: T(x.snippet || x.description), published_at: x.published_at || null, acquired_at: x.acquired_at || null })) };
    },
  },

  // Same Keenable engine, but fenced the way competitors fence: on the page's *published* date. Isolates the fence type.
  keenable_pubdate: {
    label: "Keenable (pro, published_before)", envKey: "KEENABLE_API_KEY", keyless: true, rps: 1.8, pit_only: true,
    price_per_1k: 4, price_floor_per_1k: 1, price_note: "same SKU as keenable",
    fence: "published_at metadata (published_before = day before cutoff)",
    async search({ query, cutoff }) {
      const key = env("KEENABLE_API_KEY");
      const url = key ? "https://api.keenable.ai/v1/search" : "https://api.keenable.ai/v1/search/public";
      const headers = { "content-type": "application/json", ...(key ? { "X-API-Key": key } : { "X-Keenable-Title": "keenable-fintech-h2h" }) };
      const body = { query, mode: "pro", max_results: 10, snippet_max_length: 300, ...(cutoff && { published_before: dayBefore(cutoff) }) };
      const { json } = await http(url, { method: "POST", headers, body: JSON.stringify(body) });
      return { results: (json.results || []).map((x) => ({ title: x.title, url: x.url, snippet: T(x.snippet || x.description), published_at: x.published_at || null, acquired_at: x.acquired_at || null })) };
    },
  },

  // Same Keenable engine with no date fence at all: the control arm (what an agent sees if it forgets the fence).
  keenable_nofence: {
    label: "Keenable (pro, no fence)", envKey: "KEENABLE_API_KEY", keyless: true, rps: 1.8, pit_only: true,
    price_per_1k: 4, price_floor_per_1k: 1, price_note: "same SKU as keenable",
    fence: "none (control arm)",
    async search({ query }) {
      const key = env("KEENABLE_API_KEY");
      const url = key ? "https://api.keenable.ai/v1/search" : "https://api.keenable.ai/v1/search/public";
      const headers = { "content-type": "application/json", ...(key ? { "X-API-Key": key } : { "X-Keenable-Title": "keenable-fintech-h2h" }) };
      const body = { query, mode: "pro", max_results: 10, snippet_max_length: 300 };
      const { json } = await http(url, { method: "POST", headers, body: JSON.stringify(body) });
      return { results: (json.results || []).map((x) => ({ title: x.title, url: x.url, snippet: T(x.snippet || x.description), published_at: x.published_at || null, acquired_at: x.acquired_at || null })) };
    },
  },

  // https://docs.tavily.com/documentation/api-reference/endpoint/search ; https://www.tavily.com/pricing
  tavily: {
    label: "Tavily (basic)", envKey: "TAVILY_API_KEY", rps: 1,
    price_per_1k: 8, price_floor_per_1k: 8, price_note: "$0.008/credit, basic = 1 credit (tavily.com/pricing); free tier 1,000 credits/mo",
    fence: "published or last-updated date (end_date)",
    async search({ query, cutoff }) {
      const body = { query, search_depth: "basic", max_results: 10, ...(cutoff && { end_date: dayBefore(cutoff) }) };
      const { json } = await http("https://api.tavily.com/search", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${env("TAVILY_API_KEY")}` }, body: JSON.stringify(body) });
      return { server_ms: json.response_time ? Math.round(json.response_time * 1000) : undefined,
        results: (json.results || []).map((x) => ({ title: x.title, url: x.url, snippet: T(x.content), published_at: x.published_date || null, acquired_at: null })) };
    },
  },

  // https://exa.ai/docs/reference/search (startCrawlDate/endCrawlDate: "Deprecated. Ignored by the API.") ; https://exa.ai/pricing
  exa: {
    label: "Exa (auto + highlights)", envKey: "EXA_API_KEY", rps: 1,
    price_per_1k: 17, price_floor_per_1k: 17, price_note: "$7/1K auto search + $1/1K pages highlights x 10 results (exa.ai/pricing); actual costDollars recorded when returned; $10 free credit/mo",
    fence: "published date (endPublishedDate); crawl-date filters are deprecated and ignored",
    async search({ query, cutoff }) {
      const body = { query, type: "auto", numResults: 10, contents: { highlights: { maxCharacters: 300 } }, ...(cutoff && { endPublishedDate: `${dayBefore(cutoff)}T23:59:59.999Z` }) };
      const { json } = await http("https://api.exa.ai/search", { method: "POST", headers: { "content-type": "application/json", "x-api-key": env("EXA_API_KEY") }, body: JSON.stringify(body) });
      return { cost_usd: json.costDollars?.total, server_ms: json.searchTime,
        results: (json.results || []).map((x) => ({ title: x.title, url: x.url, snippet: T((x.highlights || []).join(" … ") || x.text), published_at: x.publishedDate || null, acquired_at: null })) };
    },
  },

  // https://api-dashboard.search.brave.com/app/documentation/web-search/query ; https://brave.com/search/api/
  brave: {
    label: "Brave Search API", envKey: "BRAVE_API_KEY", rps: 1,
    price_per_1k: 5, price_floor_per_1k: 5, price_note: "$5/1K Search plan, $5 free credit/mo (brave.com/search/api); storing results needs a storage-rights plan",
    fence: "page date (freshness=YYYY-MM-DDtoYYYY-MM-DD)",
    async search({ query, cutoff }) {
      const p = new URLSearchParams({ q: query, count: "10", ...(cutoff && { freshness: `1990-01-01to${dayBefore(cutoff)}` }) });
      const { json } = await http(`https://api.search.brave.com/res/v1/web/search?${p}`, { headers: { Accept: "application/json", "X-Subscription-Token": env("BRAVE_API_KEY") } });
      return { results: (json.web?.results || []).map((x) => ({ title: x.title, url: x.url, snippet: T(x.description), published_at: x.page_age || null, acquired_at: null })) };
    },
  },

  // https://serpapi.com/search-api ; https://serpapi.com/pricing  (Google results; date fence = Google custom date range via tbs)
  serpapi: {
    label: "SerpApi (Google)", envKey: "SERPAPI_API_KEY", rps: 1,
    price_per_1k: 7.25, price_floor_per_1k: 1.96, price_note: "$7.25/1K Searcher plan down to ~$1.96/1K at 51M+/mo (serpapi.com/pricing); free 250/mo",
    fence: "Google custom date range (tbs=cdr:1,cd_max) — publish-date based",
    async search({ query, cutoff }) {
      const p = new URLSearchParams({ engine: "google", q: query, num: "10", api_key: env("SERPAPI_API_KEY"), ...(cutoff && { tbs: `cdr:1,cd_max:${mdy(dayBefore(cutoff))}` }) });
      const { json } = await http(`https://serpapi.com/search.json?${p}`, {});
      return { server_ms: json.search_metadata?.total_time_taken ? Math.round(json.search_metadata.total_time_taken * 1000) : undefined,
        results: (json.organic_results || []).map((x) => ({ title: x.title, url: x.link, snippet: T(x.snippet), published_at: x.date || null, acquired_at: null })) };
    },
  },

  // https://docs.parallel.ai/api-reference/search-beta/search ; https://parallel.ai/pricing
  parallel: {
    label: "Parallel Search (fast)", envKey: "PARALLEL_API_KEY", rps: 1,
    price_per_1k: 1, price_floor_per_1k: 1, price_note: "fast mode $1/1K, ~700 ms claimed (parallel.ai/pricing); set H2H_PARALLEL_MODE=basic|advanced for $5/1K modes",
    fence: "none before a date (source_policy only has after_date) — PIT arm runs unfenced",
    async search({ query }) {
      const body = { objective: query, search_queries: [query], mode: env("H2H_PARALLEL_MODE") || "fast", advanced_settings: { max_results: 10 } };
      const { json } = await http("https://api.parallel.ai/v1/search", { method: "POST", headers: { "content-type": "application/json", "x-api-key": env("PARALLEL_API_KEY") }, body: JSON.stringify(body) });
      return { results: (json.results || []).slice(0, 10).map((x) => ({ title: x.title || "", url: x.url, snippet: T((x.excerpts || []).join(" … ")), published_at: x.publish_date || null, acquired_at: null })) };
    },
  },

  // https://docs.linkup.so/pages/documentation/api-reference/endpoint/post-search ; https://www.linkup.so/pricing
  linkup: {
    label: "Linkup (standard)", envKey: "LINKUP_API_KEY", rps: 1,
    price_per_1k: 6, price_floor_per_1k: 5, price_note: "standard search $0.005-0.006 per request (linkup.so/pricing, read 2026-10-01; currency not stated on page); 4,000 free queries",
    fence: "published date (toDate)",
    async search({ query, cutoff }) {
      const body = { q: query, depth: "standard", outputType: "searchResults", includeImages: false, maxResults: 10, ...(cutoff && { toDate: dayBefore(cutoff) }) };
      const { json } = await http("https://api.linkup.so/v1/search", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${env("LINKUP_API_KEY")}` }, body: JSON.stringify(body) });
      return { results: (json.results || []).filter((x) => !x.type || x.type === "text").slice(0, 10).map((x) => ({ title: x.name || "", url: x.url, snippet: T(x.content), published_at: x.date || x.publishedDate || null, acquired_at: null })) };
    },
  },

  // https://docs.firecrawl.dev/api-reference/endpoint/search ; https://www.firecrawl.dev/pricing (search = 2 credits / 10 results)
  firecrawl: {
    label: "Firecrawl search", envKey: "FIRECRAWL_API_KEY", rps: 0.15, // free tier: ~10 req/min
    price_per_1k: 6.4, price_floor_per_1k: 1.66, price_note: "2 credits per 10 results; Hobby $16/5K credits = $6.40/1K searches, Standard $83/100K credits = $1.66/1K (firecrawl.dev/pricing, annual billing, read 2026-10-01); free 1,000 credits/mo",
    fence: "Google-style custom date range (tbs=cdr:1,cd_max) — publish-date based",
    async search({ query, cutoff }) {
      const body = { query, limit: 10, sources: ["web"], ...(cutoff && { tbs: `cdr:1,cd_max:${mdy(dayBefore(cutoff))}` }) };
      const { json } = await http("https://api.firecrawl.dev/v2/search", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${env("FIRECRAWL_API_KEY")}` }, body: JSON.stringify(body) });
      const rows = Array.isArray(json.data) ? json.data : (json.data?.web || []);
      return { results: rows.slice(0, 10).map((x) => ({ title: x.title || "", url: x.url, snippet: T(x.description || x.markdown), published_at: x.date || x.publishedDate || null, acquired_at: null })) };
    },
  },

  // https://docs.perplexity.ai/api-reference/search-post ; https://docs.perplexity.ai/getting-started/pricing
  perplexity: {
    label: "Perplexity Search API", envKey: "PERPLEXITY_API_KEY", rps: 1,
    price_per_1k: 5, price_floor_per_1k: 5, price_note: "$5/1K requests (docs.perplexity.ai pricing); no free tier without a card",
    fence: "publish date (search_before_date_filter)",
    async search({ query, cutoff }) {
      const body = { query, max_results: 10, max_tokens_per_page: 256, ...(cutoff && { search_before_date_filter: mdy(dayBefore(cutoff)) }) };
      const { json } = await http("https://api.perplexity.ai/search", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${env("PERPLEXITY_API_KEY")}` }, body: JSON.stringify(body) });
      return { results: (json.results || []).slice(0, 10).map((x) => ({ title: x.title || "", url: x.url, snippet: T(x.snippet), published_at: x.date || null, acquired_at: null })) };
    },
  },

  // https://serper.dev (Google results). Date fence = Google custom date range via tbs, as SerpApi.
  serper: {
    label: "Serper (Google)", envKey: "SERPER_API_KEY", rps: 1,
    price_per_1k: 1, price_floor_per_1k: 0.3, price_note: "$50 for 50K credits = $1.00/1K, down to $0.30/1K at volume (serper.dev dashboard pricing, read 2026-10-01); 2,500 free queries, no card",
    fence: "Google custom date range (tbs=cdr:1,cd_max) — publish-date based",
    async search({ query, cutoff }) {
      const body = { q: query, num: 10, ...(cutoff && { tbs: `cdr:1,cd_max:${mdy(dayBefore(cutoff))}` }) };
      const { json } = await http("https://google.serper.dev/search", { method: "POST", headers: { "content-type": "application/json", "X-API-KEY": env("SERPER_API_KEY") }, body: JSON.stringify(body) });
      return { results: (json.organic || []).slice(0, 10).map((x) => ({ title: x.title || "", url: x.link, snippet: T(x.snippet), published_at: x.date || null, acquired_at: null })) };
    },
  },

  // https://you.com/docs/api-reference/search/v1-search  (freshness accepts YYYY-MM-DDtoYYYY-MM-DD)
  youcom: {
    label: "You.com Search API", envKey: "YOUCOM_API_KEY", rps: 1,
    price_per_1k: null, price_floor_per_1k: null, price_note: "list price not published on the docs page read 2026-10-01; the free key has $0 credit (HTTP 402 payment_required on 2026-10-01)",
    fence: "page age (freshness=YYYY-MM-DDtoYYYY-MM-DD)",
    async search({ query, cutoff }) {
      const body = { query, count: 10, ...(cutoff && { freshness: `1990-01-01to${dayBefore(cutoff)}` }) };
      const { json } = await http("https://ydc-index.io/v1/search", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${env("YOUCOM_API_KEY")}` }, body: JSON.stringify(body) }); // X-API-Key returned 403; Bearer reaches billing
      const web = json.results?.web || json.hits || [];
      return { results: web.slice(0, 10).map((x) => ({ title: x.title || "", url: x.url, snippet: T(x.description || (x.snippets || []).join(" … ")), published_at: x.page_age || null, acquired_at: null })) };
    },
  },

  // https://docs.valyu.ai/api-reference/endpoint/search ; https://www.valyu.ai/pricing ($1.50 per 1K web results retrieved)
  valyu: {
    label: "Valyu (web)", envKey: "VALYU_API_KEY", rps: 1,
    price_per_1k: 15, price_floor_per_1k: 15, price_note: "$1.50 per 1K web results retrieved = $15/1K searches at 10 results (valyu.ai/pricing, read 2026-10-01); actual deduction recorded when returned",
    fence: "publication date (end_date)",
    async search({ query, cutoff }) {
      const body = { query, search_type: "web", max_num_results: 10, response_length: "short", ...(cutoff && { end_date: dayBefore(cutoff) }) };
      const { json } = await http("https://api.valyu.ai/v1/search", { method: "POST", headers: { "content-type": "application/json", "x-api-key": env("VALYU_API_KEY") }, body: JSON.stringify(body) });
      return { cost_usd: json.total_deduction_dollars,
        results: (json.results || []).slice(0, 10).map((x) => ({ title: x.title || "", url: x.url, snippet: T(x.content), published_at: x.publication_date || null, acquired_at: null })) };
    },
  },

  // https://jina.ai/reader (s.jina.ai search endpoint). No date filter exists, so its PIT arm runs unfenced.
  jina: {
    label: "Jina Search (s.jina.ai)", envKey: "JINA_API_KEY", rps: 1,
    price_per_1k: null, price_floor_per_1k: null, price_note: "token-metered; no per-search list price",
    fence: "none (no date filter) — PIT arm runs unfenced",
    async search({ query }) {
      const { json } = await http(`https://s.jina.ai/?q=${encodeURIComponent(query)}`, { headers: { Accept: "application/json", Authorization: `Bearer ${env("JINA_API_KEY")}`, "X-Respond-With": "no-content" } });
      return { results: (json.data || []).slice(0, 10).map((x) => ({ title: x.title || "", url: x.url, snippet: T(x.description || x.content), published_at: x.date || x.publishedTime || null, acquired_at: null })) };
    },
  },

  // https://www.searchapi.io/docs/google ; https://www.searchapi.io/pricing (Google results; time_period_max = MM/DD/YYYY)
  searchapi: {
    label: "SearchAPI (Google)", envKey: "SEARCHAPI_API_KEY", rps: 1,
    price_per_1k: 4, price_floor_per_1k: 1, price_note: "$40/10K Developer = $4/1K down to $1/1K at 5M/mo (searchapi.io/pricing, read 2026-10-01); 100 free requests",
    fence: "Google custom date range (time_period_max) — publish-date based",
    async search({ query, cutoff }) {
      const p = new URLSearchParams({ engine: "google", q: query, num: "10", api_key: env("SEARCHAPI_API_KEY"), ...(cutoff && { time_period_max: mdy(dayBefore(cutoff)) }) });
      const { json } = await http(`https://www.searchapi.io/api/v1/search?${p}`, {});
      return { results: (json.organic_results || []).slice(0, 10).map((x) => ({ title: x.title || "", url: x.link, snippet: T(x.snippet), published_at: x.date || null, acquired_at: null })) };
    },
  },
};

export function availability(id) {
  const p = PROVIDERS[id];
  if (env(p.envKey)) return { ready: true, auth: "key" };
  if (p.keyless) return { ready: true, auth: "keyless" };
  return { ready: false, status: `NEEDS KEY: ${p.envKey}` };
}
