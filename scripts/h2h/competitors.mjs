// Competitor rows for the point-in-time head-to-head: the same 7 events (queries.json pit_events), judged with the same code
// (judge.mjs states_outcome regex + pit_judge.mjs blind LLM labels), written to NEW files only. Never touches latest_raw.json,
// latest_judged.json, blind_packet.json, pit_llm.json or SUMMARY.md.
//   bun --env-file=.env.keys scripts/h2h/competitors.mjs --providers exa_snapshot
//   bun --env-file=.env.keys scripts/h2h/competitors.mjs --providers backsearch --dry-run   (prints request bodies, no network)
// Options: --out data/h2h/competitors_2026-10-02 (stem for .json/.md; an existing .json is merged by provider)  --max-requests 14
// Stops the provider on 401/402/403 or a body asking for a card, plan, payment or sales contact; the exact body is kept.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { PROVIDERS, availability } from "./providers.mjs";
import { judge } from "./judge.mjs";
import { labelResults, tally, MODEL } from "./pit_judge.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const DRY = process.argv.includes("--dry-run");
const want = (arg("--providers") || "exa_snapshot").split(",");
const stem = arg("--out") || "data/h2h/competitors_2026-10-02";
const MAX = +(arg("--max-requests") || 14);
const keys = JSON.parse(readFileSync(new URL("./queries.json", import.meta.url), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STOP_RX = /contact (our )?sales|talk to sales|upgrade|payment|credit card|add a card|billing|subscribe|subscription|enterprise plan|insufficient (balance|credit|funds)/i;

// Every HTTP exchange is logged (host, status, body excerpt); key values are scrubbed from anything kept.
const secrets = Object.entries(process.env).filter(([k, v]) => /_API_KEY$/.test(k) && v && v.length > 8).map(([, v]) => v);
const scrub = (s) => secrets.reduce((a, v) => a.split(v).join("[KEY]"), String(s));
const log = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const host = new URL(url).hostname;
  if (DRY && host !== "openrouter.ai") throw Object.assign(new Error("dry-run: no network"), { status: 0 });
  if (host !== "openrouter.ai" && log.filter((x) => x.host !== "openrouter.ai").length >= MAX) throw Object.assign(new Error(`request budget ${MAX} reached`), { status: 0 });
  const at = new Date().toISOString();
  const r = await realFetch(url, init);
  const text = await r.clone().text();
  let usage = null, cost = null;
  let meta = null;
  try { const j = JSON.parse(text); usage = j.usage || null; cost = j.costDollars || null;
    meta = Object.fromEntries(Object.entries(j).filter(([, v]) => v === null || typeof v !== "object" || (!Array.isArray(v) && JSON.stringify(v).length < 400))); } catch {}
  log.push({ at, host, path: new URL(url).pathname, status: r.status, body: host === "openrouter.ai" ? undefined : scrub(text.slice(0, r.ok ? 300 : 2000)), usage, costDollars: cost, meta: host === "openrouter.ai" ? undefined : meta });
  return r;
};

async function call(p, body) {
  const t0 = performance.now();
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await p.search(body);
      return { ok: true, ms: Math.round(performance.now() - t0), server_ms: r.server_ms, cost_usd: r.cost_usd, n: r.results.length, results: r.results, raw_keys: r.raw_keys };
    } catch (e) {
      if (attempt < 1 && (e.status === 429 || e.status >= 500)) { await sleep(2000); continue; }
      const last = log.filter((x) => x.host !== "openrouter.ai").at(-1);
      return { ok: false, ms: Math.round(performance.now() - t0), status: e.status || 0, error: scrub(e.message), body: last && last.status === e.status ? last.body : null };
    }
  }
}

const ran_at = new Date().toISOString();
const providers = {};
for (const id of want) {
  const p = PROVIDERS[id], av = availability(id);
  const meta = { label: p.label, fence: p.fence, price_per_1k: p.price_per_1k ?? 0, price_floor_per_1k: p.price_floor_per_1k ?? 0, price_note: p.price_note };
  if (DRY) {
    console.log(`\n${id} DRY RUN (no network). env ${p.envKey}: ${av.ready ? "present" : "MISSING"}`);
    for (const e of keys.pit_events) {
      let captured = null;
      const f = globalThis.fetch;
      globalThis.fetch = async (url, init) => { captured = { url, method: init.method, body: JSON.parse(init.body) }; throw Object.assign(new Error("dry-run"), { status: 0 }); };
      try { await p.search({ query: e.q, cutoff: e.cutoff }); } catch {}
      globalThis.fetch = f;
      console.log(`${e.cutoff}  ${captured.method} ${captured.url}  ${JSON.stringify(captured.body)}`);
    }
    continue;
  }
  if (!av.ready) { providers[id] = { ...meta, ran: false, status: av.status }; continue; }
  const out = { ...meta, ran: true, auth: av.auth, ran_at, now: {}, pit: {}, params: {} };
  // In-window event first, so a window rejection is seen on the older ones, not mistaken for an auth problem.
  const order = [...keys.pit_events].sort((a, b) => b.cutoff.localeCompare(a.cutoff));
  let stopped = null;
  for (const e of order) {
    if (stopped) { out.pit[e.q] = { ok: false, status: 0, error: `not sent: run stopped after ${stopped}` }; continue; }
    let sent = null;
    const f = globalThis.fetch;
    globalThis.fetch = async (url, init) => { sent = JSON.parse(init.body); return f(url, init); };
    const t = Date.now();
    out.pit[e.q] = { at: new Date().toISOString(), ...(await call(p, { query: e.q, cutoff: e.cutoff })) };
    globalThis.fetch = f;
    out.params[e.q] = sent;
    const r = out.pit[e.q];
    process.stderr.write(`${id} ${e.cutoff} ${r.ok ? `${r.ms}ms n=${r.n} cost=${r.cost_usd ?? "-"}` : `ERR ${r.error}`}\n`);
    if (!r.ok && ([401, 402, 403].includes(r.status) || STOP_RX.test(`${r.error} ${r.body || ""}`))) stopped = `${e.cutoff} (${r.status})`;
    const wait = 1000 / p.rps - (Date.now() - t);
    if (wait > 0) await sleep(wait);
  }
  out.stopped = stopped;
  providers[id] = out;
}
if (DRY) process.exit(0);

const raw = { ran_at, client: `bun ${Bun.version} on George's Mac mini; competitors.mjs`, keys: { queries: [], pit_events: keys.pit_events }, providers };
mkdirSync("data/h2h", { recursive: true });
const stamp = ran_at.replace(/[:.]/g, "-");
writeFileSync(`data/h2h/competitors_raw_${stamp}.json`, JSON.stringify(raw));

const { packet, ...judged } = judge(raw);
// Blind LLM labels: same function, model and criteria as pit_judge.mjs (cache shared; nothing else of pit_judge's output is written).
const llm = {};
for (const [id, p] of Object.entries(providers)) {
  if (!p.ran) continue;
  for (const e of keys.pit_events) {
    const c = p.pit[e.q];
    const lab = c?.ok && c.results.length ? await labelResults(e.cutoff, c.results) : null;
    (llm[id] ||= {})[e.q] = { labels: lab?.labels || null, model: lab?.model || null, cached: !!lab?.cached, tally: lab ? tally(lab.labels) : null };
  }
}

// Per event: which corpora/dates the results came from (acquired_at = provider's crawl/acquisition date where it has one).
function archive(results, cutoff) {
  const d = (k) => results.map((r) => r[k]).filter(Boolean).sort();
  const acq = d("acquired_at"), pub = d("published_at"), cut = Date.parse(cutoff + "T00:00:00Z");
  const corpora = {}; for (const r of results) if (r.corpus) corpora[r.corpus] = (corpora[r.corpus] || 0) + 1;
  return { corpora, acquired_min: acq[0] || null, acquired_max: acq.at(-1) || null, published_min: pub[0] || null, published_max: pub.at(-1) || null,
    acquired_after_cutoff: acq.filter((x) => Date.parse(x) >= cut).length, published_after_cutoff: pub.filter((x) => Date.parse(x) >= cut).length };
}
const rows = {};
for (const [id, p] of Object.entries(providers)) {
  if (!p.ran) { rows[id] = { label: p.label, status: p.status }; continue; }
  const b = judged.board[id];
  rows[id] = { label: p.label, fence: p.fence, stopped: p.stopped, reported_usd: b.cost.reported_usd, requests_sent: Object.values(p.pit).filter((c) => c.at).length, ok: b.ok, not_sent: Object.values(p.pit).filter((c) => !c.at).length,
    events: keys.pit_events.map((e) => {
      const c = p.pit[e.q], pe = b.pit?.per_event.find((x) => x.item === e.q), L = llm[id]?.[e.q];
      return { cutoff: e.cutoff, query: e.q, sent_at: c.at || null, params: p.params[e.q] || null, ok: c.ok, http_status: c.ok ? 200 : c.status,
        results: c.ok ? c.n : null, states_outcome: pe ? pe.states_outcome : null, undated: pe ? pe.undated : null,
        useful_pre_event: L?.tally ? L.tally["useful-pre-event-evidence"] : null, leaks_outcome_llm: L?.tally ? L.tally["leaks-outcome"] : null,
        llm_labels: L?.labels || null, cost_usd: c.cost_usd ?? null, server_ms: c.server_ms ?? null, ms: c.ms,
        error: c.ok ? null : c.error, error_body: c.ok ? null : c.body || null,
        archive: c.ok ? archive(c.results, e.cutoff) : null,
        outcome_examples: pe?.outcome_examples || [], top3: c.ok ? c.results.slice(0, 3).map((r) => ({ url: r.url, title: (r.title || "").slice(0, 120), published_at: r.published_at })) : [] };
    }) };
}

const outF = `${stem}.json`;
const prev = existsSync(outF) ? JSON.parse(readFileSync(outF, "utf8")) : { rows: {}, runs: [] };
const or = log.filter((x) => x.host === "openrouter.ai");
const doc = {
  note: "Competitor rows on the same 7 point-in-time events. states_outcome = judge.mjs rule (regex fixed in queries.json, title+snippet, top 10). useful/leaks = pit_judge.mjs blind LLM labels (" + MODEL + "). New file; latest_judged.json and SUMMARY.md are untouched.",
  rule: { pit: judged.rule.pit, pit_llm: "Blind: one provider's results at a time, numbered, no provider name; labels/criteria = pit_judge.mjs CRITERIA, title + snippet only." },
  rows: { ...prev.rows, ...rows },
  runs: [...(prev.runs || []), { ran_at, providers: want, raw: `data/h2h/competitors_raw_${stamp}.json`,
    http: log.filter((x) => x.host !== "openrouter.ai"), openrouter_calls: or.length,
    openrouter_tokens: or.reduce((a, x) => ({ prompt: a.prompt + (x.usage?.prompt_tokens || 0), completion: a.completion + (x.usage?.completion_tokens || 0), cost: a.cost + (x.usage?.cost || 0) }), { prompt: 0, completion: 0, cost: 0 }) }],
};
writeFileSync(outF, JSON.stringify(doc, null, 1));
for (const [id, r] of Object.entries(rows)) {
  console.log(`\n${id}  ${r.status || `sent ${r.requests_sent}, ok ${r.ok}, not sent ${r.not_sent}, reported $${r.reported_usd ?? "-"}${r.stopped ? `, STOPPED after ${r.stopped}` : ""}`}`);
  for (const e of r.events || []) console.log(`${e.cutoff}  n=${e.results ?? "-"}  states_outcome=${e.states_outcome ?? "-"}  useful=${e.useful_pre_event ?? "-"}  ${e.error ? "ERR " + e.error : ""}`);
}
console.log(`\nwrote ${outF} (+ data/h2h/competitors_raw_${stamp}.json); http requests ${log.filter((x) => x.host !== "openrouter.ai").length}, openrouter ${or.length}`);
