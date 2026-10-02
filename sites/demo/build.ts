// Builds sites/demo/index.html (page.html + tonight's recorded run inlined, so it also works from file:// or a PDF print)
// and sites/demo/recorded.json. Inputs (read only): data/h2h/latest_raw.json, latest_judged.json, pit_llm.json,
// data/fence_relevance.json.   bun sites/demo/build.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const rd = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const raw = rd("data/h2h/latest_raw.json");
const jd = rd("data/h2h/latest_judged.json");
const llm = rd("data/h2h/pit_llm.json");
const fr = rd("data/fence_relevance.json");

const ORDER = ["keenable", "keenable_nofence", "keenable_pubdate", "tavily", "exa", "linkup", "firecrawl", "parallel", "serper", "searchapi", "youcom", "valyu", "jina", "serpapi", "brave", "perplexity"];
const SHORT: Record<string, string> = { keenable: "Keenable", keenable_nofence: "Keenable", keenable_pubdate: "Keenable", tavily: "Tavily", exa: "Exa", linkup: "Linkup", firecrawl: "Firecrawl", parallel: "Parallel", serpapi: "SerpApi · Google", brave: "Brave", perplexity: "Perplexity", serper: "Serper · Google", searchapi: "SearchAPI · Google", youcom: "You.com", valyu: "Valyu", jina: "Jina" };
const FENCE: Record<string, string> = { keenable: "query_time", keenable_nofence: "no fence", keenable_pubdate: "published_before", tavily: "end_date", exa: "endPublishedDate", linkup: "toDate", firecrawl: "tbs cd_max", parallel: "no before-date filter", serpapi: "tbs cd_max", brave: "freshness range", perplexity: "search_before_date", serper: "tbs cd_max", searchapi: "time_period_max", youcom: "freshness range", valyu: "end_date", jina: "no date filter" };
const FENCE_ON: Record<string, string> = { keenable: "acquisition time", keenable_nofence: "—", keenable_pubdate: "publish date", tavily: "publish date", exa: "publish date", linkup: "publish date", firecrawl: "publish date", parallel: "—", serpapi: "publish date", brave: "page date", perplexity: "publish date", serper: "publish date", searchapi: "publish date", youcom: "page age", valyu: "publish date", jina: "—" };
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

const events = raw.keys.pit_events.map((e: any) => ({ q: e.q, cutoff: e.cutoff, event: e.event.split(" (")[0], outcome_regex: e.outcome_regex, entity: fr.events[e.cutoff]?.entity, question: fr.events[e.cutoff]?.question }));
const providers: any[] = [], cells: any = {};
for (const id of ORDER) {
  const p = raw.providers[id], b = jd.board[id];
  const base = { id, name: SHORT[id], fence: FENCE[id], fence_on: FENCE_ON[id], label: p?.label || id, price_per_1k: p?.price_per_1k ?? null, price_note: p?.price_note || "" };
  if (!p || !p.ran) { providers.push({ ...base, ran: false, status: p?.status || "not run" }); continue; }
  const pitCalls = Object.values(p.pit || {}) as any[];
  const lat = pitCalls.filter((c) => c.ok).map((c) => c.ms).sort((a, b) => a - b);
  cells[id] = {};
  for (const ev of raw.keys.pit_events) {
    const c = p.pit?.[ev.q];
    if (!c) continue;
    const labels = llm.per?.[id]?.[ev.q]?.labels || null;
    const cut = Date.parse(ev.cutoff + "T00:00:00Z"), rx = new RegExp(ev.outcome_regex, "i");
    cells[id][ev.q] = c.ok ? { ok: true, ms: c.ms, results: c.results.slice(0, 10).map((r: any, i: number) => ({
      t: (r.title || "").slice(0, 160), u: r.url, h: host(r.url), s: (r.snippet || "").slice(0, 260), pub: r.published_at || null, acq: r.acquired_at || null,
      rx: rx.test(`${r.title || ""} ${r.snippet || ""}`), pub_after: !!r.published_at && Date.parse(r.published_at) >= cut, acq_after: !!r.acquired_at && Date.parse(r.acquired_at) >= cut,
      label: labels?.[i] || null })) } : { ok: false, ms: c.ms, error: c.error };
  }
  providers.push({ ...base, ran: true, ran_at: p.ran_at || raw.ran_at, auth: p.auth,
    pit_p50: lat.length ? lat[Math.floor(lat.length * 0.5)] : null,
    p50: b?.latency_ms?.p50 ?? null, p95: b?.latency_ms?.p95 ?? null,
    now: b?.now ? { verified: b.now.verified, judged: b.now.judged, gold_top10: b.now.gold_top10, queries: b.now.queries } : null,
    errors: b?.errors ?? 0 });
}

// Product findings: every one carries a number measured in this workspace and the file it comes from.
const k = raw.providers.keenable;
const kAll = [...Object.values(k?.now || {}), ...Object.values(k?.pit || {})].flatMap((c: any) => c.ok ? c.results : []);
const pre2025 = kAll.filter((r: any) => r.acquired_at && r.acquired_at < "2025").length;
const earliest = kAll.map((r: any) => r.acquired_at).filter(Boolean).sort()[0] || "";
const impossible = kAll.filter((r: any) => r.published_at && r.acquired_at && Date.parse(r.published_at) > Date.parse(r.acquired_at) + 864e5).length;
const kp = jd.board.keenable_pubdate?.pit, kn = jd.board.keenable_nofence?.pit, kq = jd.board.keenable?.pit;
const L = llm.board || {};
const RIVALS = ["tavily", "exa", "linkup", "firecrawl", "parallel", "serper", "searchapi", "youcom", "valyu", "jina"].filter((id) => raw.providers[id]?.ran);
const nm = (id: string) => SHORT[id];
const nowv = (id: string) => jd.board[id]?.now ? `${jd.board[id].now.verified}/${jd.board[id].now.judged}` : "—";
const gold = (id: string) => jd.board[id]?.now ? `${jd.board[id].now.gold_top10}/${jd.board[id].now.queries}` : "—";
const leakUndated = (id: string) => { let n = 0, u = 0; for (const ev of raw.keys.pit_events) { const c = raw.providers[id]?.pit?.[ev.q]; if (!c?.ok) continue; const rx = new RegExp(ev.outcome_regex, "i"); for (const r of c.results) if (rx.test(`${r.title || ""} ${r.snippet || ""}`)) { n++; if (!r.published_at) u++; } } return { n, u }; };
const rxl = (id: string) => jd.board[id]?.pit ? `${jd.board[id].pit.states_outcome}/${jd.board[id].pit.results}` : "?";
const proxy = kAll.filter((r: any) => /translate\.goog|translate\.google|zproxy/.test(r.url)).length;
const findings = [
  { sev: "A", title: "Time Machine served later text under query_time", ev: "blockworks.co/tag/zac-prince — acquired 2022-06-28, published_at 2024-03-06, snippet describes the FTX–BlockFi settlement (2023). 1 of 70 fenced results tonight, same page as the earlier 1/60.", fix: "Serve the version acquired ≤ query_time; add first_seen_at / version_acquired_at.", path: "data/h2h/latest_raw.json → keenable.pit['FTX bankruptcy filing']" },
  { sev: "A", title: "acquired_at reads as last fetch, not first seen", ev: "The same blockworks tag page keeps its 2022 acquired_at while serving 2024 text, so acquired_at cannot be a per-version timestamp.", fix: "Expose first_seen_at and last_crawled_at separately.", path: "research/g9_product_feedback.md §1, §5" },
  { sev: "A", title: "published_at misdates pages → publish-date fence leaks", ev: `Same engine with published_before: ${kp?.states_outcome ?? "?"}/${kp?.results ?? 70} results state the outcome (regex), ${L.keenable_pubdate?.["leaks-outcome"] ?? "?"}/${L.keenable_pubdate?.results_labelled ?? 70} by the LLM judge. Wikipedia's Nvidia article is dated 2002-02-15.`, fix: "Split created_at / modified_at; date_confidence flag.", path: "data/h2h/latest_judged.json → board.keenable_pubdate" },
  { sev: "A", title: "Without the fence, the answer leaks almost every time", ev: `No fence: ${kn?.states_outcome ?? "?"}/${kn?.results ?? 70} (regex), ${L.keenable_nofence?.["leaks-outcome"] ?? "?"}/${L.keenable_nofence?.results_labelled ?? 70} (LLM judge). query_time: ${kq?.states_outcome ?? "?"}/${kq?.results ?? 70} (regex), ${L.keenable?.["leaks-outcome"] ?? "?"}/${L.keenable?.results_labelled ?? 70} (LLM; 1 genuine on manual review, rest are announcements and quote pages).`, fix: "Make query_time the default in finance recipes; it is the product.", path: "data/h2h/pit_llm.json" },
  { sev: "A", title: "Keenable trails every rival on today’s fintech questions", ev: `Verified answers on the same 40 queries tonight: Keenable ${nowv("keenable")} vs ${RIVALS.map((id) => `${nm(id)} ${nowv(id)}`).join(", ")}. Same rule judge, same client.`, fix: "Bring the misses to ranking weekly with the rival’s hit next to each; fact-bearing snippets.", path: "data/h2h/latest_judged.json → board.*.now" },
  { sev: "A", title: "Finance queries rank aggregators above primary sources", ev: `Expected primary-source domain in top 10: Keenable ${gold("keenable")} vs ${RIVALS.map((id) => `${nm(id)} ${gold(id)}`).join(", ")}.`, fix: "Authority prior for regulator/filer domains; source_type field.", path: "data/h2h/latest_judged.json → board.*.now.gold_top10" },
  { sev: "A", title: "Time Machine status differs across surfaces", ev: "Home page: “Request early access · Q4 2026”; docs changelog: query_time live since Aug 2026 and it answered every call.", fix: "One status + entitlement per feature.", path: "raw/txt/home.txt" },
  { sev: "B", title: "published_at later than acquired_at (impossible for one version)", ev: `${impossible} of ${kAll.length} Keenable results tonight carry published_at more than a day after acquired_at.`, fix: "Enforce published_at ≤ acquired_at per version; flag violations.", path: "data/h2h/latest_raw.json → keenable" },
  { sev: "B", title: "acquired_at goes back to 2001 for a ~6-month-old index", ev: `${pre2025} of ${kAll.length} results tonight acquired before 2025; earliest ${earliest.slice(0, 10)}.`, fix: "Document acquired_at; add acquisition_source.", path: "data/h2h/latest_raw.json" },
  { sev: "B", title: "pro mode p95 tail vs realtime", ev: `NEEDLE: pro p95 1,336 ms vs realtime 169 ms. Tonight (keyed, residential): p50 ${jd.board.keenable?.latency_ms?.p50} ms / p95 ${jd.board.keenable?.latency_ms?.p95} ms over ${jd.board.keenable?.calls} calls.`, fix: "deadline_ms parameter; per-mode p95 on status page.", path: "data/needle_results.json; data/h2h/latest_judged.json" },
  { sev: "B", title: "Proxy and mirror copies take top-10 slots", ev: `${proxy} translate.goog / translate.google / zproxy copies in tonight's Keenable results; they inherit Wikipedia's 2002 date.`, fix: "Canonicalise proxy hosts; collapse near-duplicates.", path: "data/h2h/latest_raw.json" },
  { sev: "B", title: "Forks and look-alikes above canonical sources", ev: "pipecat canonical repo at #7 behind six forks; dmvcalifornia.us above dmv.ca.gov.", fix: "Fork signal; official-domain prior.", path: "research/candidacy.md §4" },
  { sev: "B", title: "Keyless limits cap a fair self-serve eval", ev: "1,000 req/h per IP, no usage metadata; keyless pro = realtime results on 24/24 pilot queries.", fix: "72-hour eval key; echo the served mode.", path: "raw/api_headers.txt; data/fintech_judged.json" },
  { sev: "B", title: "No content hash or version id per result", ev: "Six query_time replays returned identical URL lists, but only URLs can be hashed, not the text read.", fix: "content_sha256 + version_id; receipt endpoint.", path: "data/fintech_repro.json" },
  { sev: "B", title: "Server-Timing exposed in CORS but never sent", ev: "access-control-expose-headers lists Server-Timing; responses carry none.", fix: "Send Server-Timing: search;dur, rank;dur.", path: "raw/api_headers.txt" },
  { sev: "B", title: "No eval-harness recipes in the docs", ev: "0 hits for Inspect, LangGraph, OpenAI Agents SDK, promptfoo in llms-full.txt.", fix: "“Evaluate Keenable in your harness” page (kit/ is a draft).", path: "raw/txt/docs_keenable_ai_llms-full_txt.txt" },
  { sev: "B", title: "NEEDLE runner vantage undocumented", ev: "Latency columns (realtime p95 169 ms vs Exa 3,317 ms) state no region or network.", fix: "State runner region; client vs server time.", path: "research/keenable_intel.md #37" },
  { sev: "C", title: "Trust and procurement surface is thin", ev: "trust.keenable.ai renders empty; HTTP Message Signatures “not live yet”; no SOC 2 / SLA / retention terms.", fix: "One-page security + data-use sheet.", path: "research/keenable_intel.md #29" },
  { sev: "C", title: "PAYMENT-REQUIRED headers exposed without docs", ev: "CORS exposes PAYMENT-REQUIRED and PAYMENT-RESPONSE; docs never mention them.", fix: "Document (x402 channel) or remove.", path: "raw/api_headers.txt" },
  { sev: "C", title: "cognee prefers Tavily over Keenable when both keys are set", ev: "cognee 1.5 web fetch precedence: Tavily → Keenable → crawler.", fix: "Keyless Keenable default; precedence flag.", path: "research/keenable_intel.md #44" },
  { sev: "+", title: "Every rival’s date filter leaks the outcome", ev: `Pre-registered rule, 7 events × top 10: Keenable query_time ${rxl("keenable")} vs ${RIVALS.map((id) => `${nm(id)} ${rxl(id)}`).join(", ")}. Blind LLM judge (second opinion): Keenable ${L.keenable?.["leaks-outcome"] ?? "?"}, ${RIVALS.map((id) => `${nm(id)} ${L[id]?.["leaks-outcome"] ?? "?"}`).join(", ")}. Parallel has no before-date filter at all.`, fix: "Lead finance and backtest pitches with this table, run on the buyer’s own events.", path: "data/h2h/pit_llm.json" },
  { sev: "+", title: "Rivals’ fenced results carry no date a buyer can audit", ev: (() => { const d = (id: string, arm: string) => { const rs = Object.values(raw.providers[id]?.[arm] || {}).flatMap((c: any) => c.ok ? c.results : []); return `${rs.filter((r: any) => r.published_at).length}/${rs.length}`; }; return `Dated results under the date filter vs unfenced: ${RIVALS.map((id) => `${nm(id)} ${d(id, "pit")} vs ${d(id, "now")}`).join(" · ")}. Tavily, Linkup and Firecrawl return no date field in this mode; Exa drops to 1 dated result in 70 once the filter is on, which suggests undated pages pass it. Every Keenable result carries acquired_at.`; })(), fix: "Sales line: query_time fences on acquisition time, which every result has and the buyer can check.", path: "data/h2h/latest_raw.json → providers.*.pit / .now" },
  { sev: "+", title: "query_time keeps the most useful pre-event evidence", ev: `Useful pre-event results out of 70: Keenable query_time ${L.keenable?.["useful-pre-event-evidence"] ?? "?"}, ${RIVALS.map((id) => `${nm(id)} ${L[id]?.["useful-pre-event-evidence"] ?? "?"}`).join(", ")}; no fence ${L.keenable_nofence?.["useful-pre-event-evidence"] ?? "?"}.`, fix: "Show useful-before, not just zero leaks: a fence that returns nothing is also “clean”.", path: "data/h2h/pit_llm.json" },
  { sev: "+", title: "Coverage vs Common Crawl is an unpublished sales asset", ev: "75.4% (CI 71.4–79.0) of 500 returned pages absent from all nine 2026 CC crawls.", fix: "Publish a monthly coverage-vs-CC number.", path: "research/cc_overlap.md" },
];

const recorded = {
  built_at: new Date().toISOString(), ran_at: raw.ran_at, client: raw.client,
  judge: { model: llm.model, rule: llm.rule, judged_at: llm.judged_at, calls: llm.calls, failed: llm.failed },
  regex_rule: "states the outcome (regex fallback) = title/snippet matches the outcome pattern fixed in scripts/h2h/queries.json before any run",
  review: { keenable: { flags: L.keenable?.["leaks-outcome"], genuine: 1, note: "blockworks.co FTX tag page; the other flags are the Jan-2022 deal announcement, quote pages, and another company's bankruptcy" }, linkup: { flags: L.linkup?.["leaks-outcome"], genuine: 14, note: "14 of 15 state the outcome; 1 is a current quote page" } },
  events, providers, cells, findings,
};
writeFileSync(join(import.meta.dir, "recorded.json"), JSON.stringify(recorded));
const page = readFileSync(join(import.meta.dir, "page.html"), "utf8");
const inline = JSON.stringify(recorded).replace(/</g, "\\u003c");
writeFileSync(join(import.meta.dir, "index.html"), page.replace("/*__RECORDED__*/null", inline));
console.log(`built index.html (${Math.round(inline.length / 1024)} KB data): ${providers.filter((p) => p.ran).map((p) => p.id).join(", ")} ran; not run: ${providers.filter((p) => !p.ran).map((p) => `${p.id} (${p.status})`).join(", ")}; ${findings.length} findings`);
