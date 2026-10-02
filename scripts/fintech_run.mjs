// Live proof run: 40 fintech queries x {pro, realtime} + point-in-time variants through Keenable's keyless endpoint.
// Paced at <= 2 req/s (keyless pool is shared per IP: 1,000/h, 10 rps). Usage: node scripts/fintech_run.mjs [out.json]
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://api.keenable.ai/v1/search/public";
const TITLE = "keenable-fintech-research";
const PACE_MS = 550; // ~1.8 rps

// gold = domains/paths an evaluator expects in the top results; pit = query_time for the point-in-time variant,
// pit_note = what must NOT appear if there is no lookahead.
const Q = [
  // --- A. investment research / hedge funds / quant
  { seg: "research", q: "NVIDIA Q2 FY2026 earnings data center revenue", gold: ["nvidianews.nvidia.com", "investor.nvidia.com", "nvidia.com"] },
  { seg: "research", q: "FOMC statement September 2026 federal funds rate decision", gold: ["federalreserve.gov"] },
  { seg: "research", q: "Apple 10-K fiscal 2025 risk factors", gold: ["sec.gov", "investor.apple.com"] },
  { seg: "research", q: "Tesla Q3 2026 vehicle deliveries production", gold: ["ir.tesla.com", "tesla.com"] },
  { seg: "research", q: "Berkshire Hathaway 13F holdings latest quarter", gold: ["sec.gov"] },
  { seg: "research", q: "Microsoft Activision Blizzard acquisition closed", gold: ["news.microsoft.com", "microsoft.com"], pit: "2023-06-01", pit_note: "deal closed 2023-10-13; pre-close index must not say 'completed'" },
  { seg: "research", q: "Silicon Valley Bank deposit outflows", gold: ["svb.com", "fdic.gov"], pit: "2023-03-09", pit_note: "FDIC closed SVB 2023-03-10" },
  { seg: "research", q: "Credit Suisse UBS merger", gold: ["ubs.com", "credit-suisse.com", "snb.ch"], pit: "2023-03-17", pit_note: "merger announced 2023-03-19" },
  { seg: "research", q: "FTX bankruptcy filing", gold: ["ftx.com", "sec.gov", "justice.gov"], pit: "2022-11-08", pit_note: "FTX filed Chapter 11 on 2022-11-11" },
  { seg: "research", q: "Nvidia market capitalization", gold: ["companiesmarketcap.com", "nvidia.com"], pit: "2022-12-01", pit_note: "pre-ChatGPT-boom snapshot" },
  // --- B. KYC / AML / adverse media
  { seg: "aml", q: "Danske Bank Estonia money laundering investigation", gold: ["danskebank.com", "justice.gov", "reuters.com"] },
  { seg: "aml", q: "Changpeng Zhao Binance guilty plea sentence", gold: ["justice.gov", "reuters.com"] },
  { seg: "aml", q: "Wirecard Markus Braun fraud trial verdict", gold: ["reuters.com", "ft.com", "handelsblatt.com"] },
  { seg: "aml", q: "OFAC SDN list recent actions September 2026", gold: ["ofac.treasury.gov", "treasury.gov"] },
  { seg: "aml", q: "FinCEN enforcement action 2026 money services business", gold: ["fincen.gov"] },
  { seg: "aml", q: "Trevor Milton Nikola fraud conviction pardon", gold: ["justice.gov", "reuters.com", "sec.gov"] },
  { seg: "aml", q: "Wirecard Betrug Urteil Landgericht München", gold: ["sueddeutsche.de", "handelsblatt.com", "faz.net", "spiegel.de", "tagesschau.de"], lang: "de" },
  { seg: "aml", q: "Jho Low 1MDB arrest warrant Malaysia", gold: ["justice.gov", "thestar.com.my", "reuters.com"] },
  { seg: "aml", q: "FATF grey list countries latest plenary", gold: ["fatf-gafi.org"] },
  { seg: "aml", q: "Sam Bankman-Fried sentenced years prison", gold: ["justice.gov", "reuters.com"], pit: "2024-03-27", pit_note: "sentenced 2024-03-28 to 25 years" },
  // --- C. credit underwriting / KYB
  { seg: "kyb", q: "Ramp Business Corporation headquarters address New York", gold: ["ramp.com"] },
  { seg: "kyb", q: "Middesk business verification API documentation", gold: ["middesk.com", "docs.middesk.com"] },
  { seg: "kyb", q: "Delaware Division of Corporations entity search", gold: ["delaware.gov", "icis.corp.delaware.gov"] },
  { seg: "kyb", q: "Joe's Pizza Carmine Street New York reviews hours", gold: ["joespizzanyc.com", "yelp.com", "tripadvisor.com"] },
  { seg: "kyb", q: "Klarna IPO prospectus NYSE listing", gold: ["sec.gov", "klarna.com"] },
  { seg: "kyb", q: "Chime Better Business Bureau complaints", gold: ["bbb.org"] },
  { seg: "kyb", q: "SBA PPP loan recipient lookup database", gold: ["sba.gov", "projects.propublica.org", "federalpay.org"] },
  { seg: "kyb", q: "Big Lots store closures list 2025", gold: ["biglots.com", "usatoday.com", "reuters.com"] },
  { seg: "kyb", q: "California Secretary of State business search Brex Inc", gold: ["bizfileonline.sos.ca.gov", "sos.ca.gov"] },
  { seg: "kyb", q: "Companies House Revolut Ltd filing history", gold: ["company-information.service.gov.uk", "gov.uk"] },
  // --- D. fintech AI agents / copilots
  { seg: "agents", q: "SOFR rate today", gold: ["newyorkfed.org"] },
  { seg: "agents", q: "ECB monetary policy decision September 2026 deposit facility rate", gold: ["ecb.europa.eu"] },
  { seg: "agents", q: "spot bitcoin ETF net inflows this week", gold: ["farside.co.uk", "coinshares.com", "bloomberg.com"] },
  { seg: "agents", q: "US CPI August 2026 release BLS", gold: ["bls.gov"] },
  { seg: "agents", q: "Robinhood Q3 2026 earnings date", gold: ["investors.robinhood.com", "robinhood.com"] },
  { seg: "agents", q: "Visa interchange fee changes 2026", gold: ["usa.visa.com", "visa.com"] },
  { seg: "agents", q: "Stripe Radar machine learning fraud detection how it works", gold: ["stripe.com", "docs.stripe.com"] },
  { seg: "agents", q: "CFPB Section 1071 small business lending rule compliance date", gold: ["consumerfinance.gov"] },
  { seg: "agents", q: "Polymarket odds Fed rate cut next meeting", gold: ["polymarket.com"] },
  { seg: "agents", q: "10 year 2 year treasury yield spread today", gold: ["fred.stlouisfed.org", "home.treasury.gov", "treasury.gov"] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

function goldRank(results, gold) {
  for (let i = 0; i < results.length; i++) {
    const h = host(results[i].url).toLowerCase();
    if (gold.some((g) => h === g || h.endsWith("." + g))) return i + 1;
  }
  return 0;
}

async function search(body) {
  const t0 = performance.now();
  try {
    const r = await fetch(BASE, { method: "POST", headers: { "content-type": "application/json", "X-Keenable-Title": TITLE }, body: JSON.stringify(body) });
    const json = await r.json().catch(() => null);
    const ms = Math.round(performance.now() - t0);
    if (!r.ok) return { ok: false, status: r.status, ms, error: json?.error || json?.message || String(r.status), remaining: r.headers.get("x-ratelimit-remaining") };
    return { ok: true, status: r.status, ms, mode: json?.mode, results: json?.results || [], remaining: r.headers.get("x-ratelimit-remaining"), server_timing: r.headers.get("server-timing") };
  } catch (e) {
    return { ok: false, status: 0, ms: Math.round(performance.now() - t0), error: e.name };
  }
}

function pct(arr, p) { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }

const jobs = [];
for (const [i, it] of Q.entries()) {
  for (const mode of ["pro", "realtime"]) jobs.push({ i, kind: "now", mode, body: { query: it.q, mode, max_results: 10, snippet_max_length: 240 } });
  if (it.pit) jobs.push({ i, kind: "pit", mode: "pro", body: { query: it.q, mode: "pro", max_results: 10, snippet_max_length: 240, query_time: it.pit } });
}

const ran_at = new Date().toISOString();
const started = Date.now();
const rows = Q.map((it) => ({ ...it, runs: [] }));
let n = 0;
for (const j of jobs) {
  let r = await search(j.body);
  for (let t = 0; t < 3 && !r.ok && (r.status === 429 || r.status >= 500); t++) { await sleep(1500 * (t + 1)); r = await search(j.body); }
  const run = { kind: j.kind, mode: j.mode, ok: r.ok, ms: r.ms, status: r.status, error: r.error, served_mode: r.mode, remaining: r.remaining };
  if (r.ok) {
    run.n = r.results.length;
    run.gold_rank = goldRank(r.results, rows[j.i].gold);
    run.top3 = r.results.slice(0, 3).map((x) => host(x.url));
    const acq = r.results.map((x) => x.acquired_at).filter(Boolean).sort();
    run.newest_acquired_at = acq.at(-1) || null;
    run.oldest_acquired_at = acq[0] || null;
    if (j.kind === "pit") {
      const cutoff = Date.parse(j.body.query_time + "T00:00:00Z");
      run.query_time = j.body.query_time;
      run.leaks = r.results.filter((x) => x.acquired_at && Date.parse(x.acquired_at) > cutoff).length; // must be 0
    }
    run.results = r.results.map((x) => ({ title: (x.title || "").slice(0, 160), url: x.url, host: host(x.url), snippet: (x.snippet || x.description || "").slice(0, 240), published_at: x.published_at || null, acquired_at: x.acquired_at || null }));
  }
  rows[j.i].runs.push(run);
  n++;
  process.stderr.write(`${n}/${jobs.length} ${j.kind} ${j.mode} ${r.ok ? r.ms + "ms" : "ERR " + r.status + " " + r.error} | ${Q[j.i].q.slice(0, 50)}\n`);
  await sleep(PACE_MS);
}

// summaries
const summary = { by_mode: {}, by_segment: {}, pit: {} };
for (const mode of ["pro", "realtime"]) {
  const runs = rows.flatMap((r) => r.runs.filter((x) => x.kind === "now" && x.mode === mode));
  const ok = runs.filter((x) => x.ok);
  const lat = ok.map((x) => x.ms);
  summary.by_mode[mode] = { n: runs.length, ok: ok.length, p50_ms: pct(lat, 0.5), p95_ms: pct(lat, 0.95), max_ms: Math.max(...lat), gold_top3: ok.filter((x) => x.gold_rank && x.gold_rank <= 3).length, gold_top10: ok.filter((x) => x.gold_rank).length, empty: ok.filter((x) => x.n === 0).length };
}
for (const seg of ["research", "aml", "kyb", "agents"]) {
  const runs = rows.filter((r) => r.seg === seg).flatMap((r) => r.runs.filter((x) => x.kind === "now" && x.mode === "pro" && x.ok));
  const lat = runs.map((x) => x.ms);
  const fresh = runs.map((x) => x.newest_acquired_at).filter(Boolean).map((d) => (Date.now() - Date.parse(d)) / 864e5);
  summary.by_segment[seg] = { n: runs.length, p50_ms: pct(lat, 0.5), p95_ms: pct(lat, 0.95), gold_top3: runs.filter((x) => x.gold_rank && x.gold_rank <= 3).length, gold_top10: runs.filter((x) => x.gold_rank).length, median_days_since_newest_crawl: fresh.length ? +pct(fresh, 0.5).toFixed(1) : null };
}
const pitRuns = rows.flatMap((r) => r.runs.filter((x) => x.kind === "pit" && x.ok));
summary.pit = { n: pitRuns.length, total_results: pitRuns.reduce((a, x) => a + x.n, 0), leaks: pitRuns.reduce((a, x) => a + (x.leaks || 0), 0), p50_ms: pct(pitRuns.map((x) => x.ms), 0.5), p95_ms: pct(pitRuns.map((x) => x.ms), 0.95) };

const out = { ran_at, wall_ms: Date.now() - started, endpoint: BASE, auth: "keyless public endpoint (X-Keenable-Title)", pace_rps: +(1000 / PACE_MS).toFixed(2), client: "Mac, residential ISP; latency includes TLS + body read", node: process.version, competitors: { note: "No other free/keyless search API with ToS allowing programmatic use was available; Brave/Tavily/Exa/SerpAPI/Google CSE require keys. Recorded as 'not run' — no fabricated numbers.", brave: "not run", tavily: "not run", exa: "not run", serpapi: "not run", google_cse: "not run", bing: "retired 2025-08-11" }, summary, rows };
mkdirSync("data", { recursive: true });
writeFileSync(process.argv[2] || "data/fintech_run.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(summary, null, 1));
