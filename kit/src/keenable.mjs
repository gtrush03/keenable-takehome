// Keenable core client shared by every adapter in this kit. Zero dependencies (Node >= 20 fetch).
//
// What it adds on top of a plain HTTP call, all of it things an eval harness needs:
//   - keyless by default (/v1/search/public, /v1/fetch/public), keyed when KEENABLE_API_KEY is set
//   - a process-wide pacer: keyless pool is shared per IP (1,000/h, <=10 rps); this kit stays <= 2 rps
//   - pinQueryTime: freeze every search at one instant (query_time), so an agent eval cannot see the future
//   - PIT flags on every result: acquired_at > query_time (index leak, must be 0) and published_at > query_time
//     (content-date leak: the page claims a date after the instant)
//   - per-call telemetry (endpoint, mode, latency, result count, flags) through an onCall hook
//
// API facts: https://docs.keenable.ai/api-reference/search , /api-reference/fetch , /rate-limits (read 2026-10-01).

export const BASE_URL = process.env.KEENABLE_API_URL || "https://api.keenable.ai";
export const APP_TITLE = process.env.KEENABLE_APP_TITLE || "keenable-stack-kit";
export const MODES = ["pro", "realtime"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One pacer per process, shared by every client instance: keyless calls never exceed `rps`.
const pacer = { next: 0, chain: Promise.resolve() };
export function pace(rps) {
  const gap = 1000 / rps;
  const turn = pacer.chain.then(async () => {
    const wait = pacer.next - Date.now();
    if (wait > 0) await sleep(wait);
    pacer.next = Date.now() + gap;
  });
  pacer.chain = turn.catch(() => {});
  return turn;
}

export class KeenableError extends Error {
  constructor(message, status, body) { super(message); this.name = "KeenableError"; this.status = status; this.body = body; }
}

// A date-only query_time resolves to 00:00:00Z (docs). Normalise to an instant for local comparisons.
export function toInstant(t) {
  if (!t) return null;
  const s = /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T00:00:00Z` : t;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

export function pitFlags(result, queryTime) {
  const qt = toInstant(queryTime);
  if (qt == null) return null;
  const acq = toInstant(result.acquired_at), pub = toInstant(result.published_at);
  return {
    acquired_after_query_time: acq != null && acq > qt,
    published_after_query_time: pub != null && pub > qt,
    undated: pub == null,
  };
}

const SEARCH_FIELDS = ["mode", "site", "acquired_after", "acquired_before", "published_after", "published_before", "query_time", "snippet_max_length", "max_results"];

export function createKeenable(opts = {}) {
  const apiKey = opts.apiKey ?? process.env.KEENABLE_API_KEY ?? "";
  const baseUrl = opts.baseUrl || BASE_URL;
  const rps = opts.rps ?? (apiKey ? 10 : Number(process.env.KEENABLE_KEYLESS_RPS || 1.5));
  const pinQueryTime = opts.pinQueryTime ?? process.env.KEENABLE_PIN_QUERY_TIME ?? null;
  const forceMode = opts.forceMode ?? process.env.KEENABLE_FORCE_MODE ?? null;
  const defaultMode = opts.defaultMode ?? process.env.KEENABLE_DEFAULT_MODE ?? null;
  const leakPolicy = opts.leakPolicy || process.env.KEENABLE_LEAK_POLICY || "flag"; // flag | drop
  const fetchImpl = opts.fetch || globalThis.fetch;
  const onCall = opts.onCall || null;
  const timeoutMs = opts.timeoutMs ?? 30000;
  const auth = apiKey ? "key" : "keyless";
  const headers = apiKey ? { "X-API-Key": apiKey } : { "X-Keenable-Title": opts.title || APP_TITLE };

  async function request(path, init, retries = 2) {
    for (let attempt = 0; ; attempt++) {
      await pace(rps);
      const t0 = performance.now();
      let r, text;
      try {
        r = await fetchImpl(baseUrl + path, { ...init, headers: { ...headers, ...(init.headers || {}) }, signal: AbortSignal.timeout(timeoutMs) });
        text = await r.text();
      } catch (e) {
        if (attempt < retries) { await sleep(1000 * (attempt + 1)); continue; }
        throw new KeenableError(`network: ${e.message}`, 0);
      }
      const ms = Math.round(performance.now() - t0);
      let json = null;
      try { json = JSON.parse(text); } catch {}
      if (r.ok) return { json, ms, status: r.status, remaining: r.headers.get("x-ratelimit-remaining") };
      if (attempt < retries && (r.status === 429 || r.status >= 500)) { await sleep(1500 * (attempt + 1)); continue; }
      throw new KeenableError(`${r.status} ${String(json?.error?.message || json?.error || json?.message || text).slice(0, 200)}`, r.status, json);
    }
  }

  async function search(args) {
    if (!args || typeof args.query !== "string" || !args.query.trim()) throw new KeenableError("query is required", 400);
    const body = { query: args.query };
    for (const k of SEARCH_FIELDS) if (args[k] != null && args[k] !== "") body[k] = args[k];
    if (!body.mode && defaultMode) body.mode = defaultMode;
    if (forceMode) body.mode = forceMode;          // operator override beats the model's choice
    if (pinQueryTime) body.query_time = pinQueryTime; // harness pin beats the model's choice
    if (body.mode && !MODES.includes(body.mode)) throw new KeenableError(`mode must be one of ${MODES.join(", ")}`, 400);
    const path = apiKey ? "/v1/search" : "/v1/search/public";
    const { json, ms, remaining } = await request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    let results = (json?.results || []).map((x) => ({
      title: x.title || "", url: x.url, description: x.description || "", snippet: x.snippet || x.description || "",
      published_at: x.published_at || null, acquired_at: x.acquired_at || null,
    }));
    let dropped = 0;
    if (body.query_time) {
      for (const x of results) x.pit = pitFlags(x, body.query_time);
      if (leakPolicy === "drop") {
        const kept = results.filter((x) => !x.pit.acquired_after_query_time && !x.pit.published_after_query_time);
        dropped = results.length - kept.length; results = kept;
      }
    }
    const pit = body.query_time ? {
      query_time: body.query_time, policy: leakPolicy, dropped,
      acquired_after_query_time: results.filter((x) => x.pit?.acquired_after_query_time).length,
      published_after_query_time: results.filter((x) => x.pit?.published_after_query_time).length,
    } : null;
    const out = { query: json?.query ?? body.query, mode: json?.mode ?? body.mode ?? null, results, meta: { endpoint: path, auth, ms, remaining, request: body, pit } };
    onCall?.({ tool: "search", ...out.meta, n: results.length });
    return out;
  }

  async function fetchPage(args) {
    if (!args || typeof args.url !== "string" || !/^https?:\/\//.test(args.url)) throw new KeenableError("url must be an absolute http(s) URL", 400);
    const p = new URLSearchParams({ url: args.url });
    if (args.max_chars != null) p.set("max_chars", String(args.max_chars));
    if (args.live) p.set("live", "true");
    if (args.prompt) p.set("prompt", String(args.prompt).slice(0, 2000));
    const path = (apiKey ? "/v1/fetch" : "/v1/fetch/public");
    const { json, ms } = await request(`${path}?${p}`, { method: "GET" });
    const published_at = typeof json?.published_at === "number" ? new Date(json.published_at * 1000).toISOString() : (json?.published_at || null);
    const page = { url: json?.url || args.url, title: json?.title || "", author: json?.author || null, published_at, content: json?.content || "" };
    if (pinQueryTime) page.pit = pitFlags(page, pinQueryTime); // fetch has no query_time; flag content dated after the pin
    onCall?.({ tool: "fetch", endpoint: path, auth, ms, n: page.content.length });
    return { ...page, meta: { endpoint: path, auth, ms } };
  }

  return { search, fetch: fetchPage, auth, config: { baseUrl, rps, pinQueryTime, forceMode, defaultMode, leakPolicy } };
}

// Compact, model-facing rendering of a search response: numbered, citable, dates visible.
export function renderForModel(res, { maxChars = 8000 } = {}) {
  const lines = [];
  if (res.meta?.pit) lines.push(`(index as of ${res.meta.pit.query_time}; ${res.meta.pit.published_after_query_time} result(s) carry a publish date after it)`);
  res.results.forEach((x, i) => {
    const d = [x.published_at && `published ${x.published_at.slice(0, 10)}`, x.pit?.published_after_query_time && "DATE AFTER QUERY_TIME"].filter(Boolean).join(", ");
    lines.push(`[${i + 1}] ${x.title} (${x.url})${d ? ` [${d}]` : ""}\n${x.snippet}`);
  });
  let s = lines.join("\n\n");
  if (s.length > maxChars) s = s.slice(0, maxChars) + "\n[truncated]";
  return s || "No results.";
}
