// Blind judge for the head-to-head. For every query, each provider's result list is relabelled "A", "B", ... in a seeded
// random order, then scored against an answer key fixed before any run (scripts/h2h/queries.json). The scorer only sees
// labels; the label->provider map is applied after all verdicts exist. Also writes a blind packet (no provider names) so a
// human or third-party LLM judge can re-score the same evidence independently.
// Usage: node scripts/h2h/judge.mjs [data/h2h/latest_raw.json]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function shuffle(a, rand) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// --- scorers: see only (results, key) ---
function scoreNow(results, key) {
  const txt = (x) => `${x.title || ""} ${x.snippet || ""}`;
  const goldRank = results.findIndex((x) => key.gold.some((g) => host(x.url) === g || host(x.url).endsWith("." + g))) + 1;
  const rx = key.fact_regex ? new RegExp(key.fact_regex, "i") : null;
  const factRank = rx ? results.findIndex((x) => rx.test(txt(x))) + 1 : 0;
  if (key.fact_strength === "n/a") return { gold_rank: goldRank, fact_rank: factRank, verified: null, on_topic: null };
  return { gold_rank: goldRank, fact_rank: factRank, gold_top3: goldRank > 0 && goldRank <= 3,
    verified: goldRank > 0 || (factRank > 0 && key.fact_strength === "fact"), on_topic: goldRank > 0 || factRank > 0 };
}
function scorePit(results, ev) {
  const rx = new RegExp(ev.outcome_regex, "i");
  const cut = Date.parse(ev.cutoff + "T00:00:00Z");
  const dated = results.filter((x) => x.published_at && !isNaN(Date.parse(x.published_at)));
  return {
    n: results.length,
    states_outcome: results.filter((x) => rx.test(`${x.title || ""} ${x.snippet || ""}`)).length,
    published_after_cutoff: dated.filter((x) => Date.parse(x.published_at) >= cut).length,
    acquired_after_cutoff: results.filter((x) => x.acquired_at && Date.parse(x.acquired_at) >= cut).length,
    undated: results.length - dated.length,
    outcome_examples: results.filter((x) => rx.test(`${x.title || ""} ${x.snippet || ""}`)).slice(0, 3).map((x) => ({ host: host(x.url), title: (x.title || "").slice(0, 120), published_at: x.published_at, acquired_at: x.acquired_at })),
  };
}

export function judge(raw, seed = 20261001) {
  const rand = rng(seed);
  const verdicts = { now: [], pit: [] }, packet = { now: [], pit: [] };

  for (const [arm, items, scorer] of [["now", raw.keys.queries, scoreNow], ["pit", raw.keys.pit_events, scorePit]]) {
    for (const key of items) {
      const entries = Object.entries(raw.providers).filter(([, p]) => p.ran && p[arm]?.[key.id || key.q]?.ok);
      const order = shuffle(entries.map(([id]) => id), rand);
      const labels = Object.fromEntries(order.map((id, i) => [String.fromCharCode(65 + i), id]));
      const blind = Object.fromEntries(Object.entries(labels).map(([L, id]) => [L, raw.providers[id][arm][key.id || key.q].results]));
      packet[arm].push({ item: key.id || key.q, query: key.q, cutoff: key.cutoff, answer_key: key, candidates: blind });
      const scored = Object.fromEntries(Object.entries(blind).map(([L, res]) => [L, scorer(res, key)])); // blind step
      verdicts[arm].push({ item: key.id || key.q, labels, scored }); // unblinding map kept alongside, applied below
    }
  }

  const board = {};
  for (const [id, p] of Object.entries(raw.providers)) {
    if (!p.ran) { board[id] = { label: p.label, status: p.status }; continue; }
    const mine = (arm) => verdicts[arm].flatMap((v) => Object.entries(v.labels).filter(([, pid]) => pid === id).map(([L]) => ({ item: v.item, ...v.scored[L] })));
    const now = mine("now"), pit = mine("pit");
    const calls = Object.values(p.now || {}).concat(Object.values(p.pit || {}));
    const okCalls = calls.filter((c) => c.ok), lat = okCalls.map((c) => c.ms);
    const judged = now.filter((x) => x.verified !== null), ver = judged.filter((x) => x.verified).length;
    const nowCalls = Object.values(p.now || {});
    const cost = (n, price) => r3((n / 1000) * price);
    board[id] = {
      label: p.label, auth: p.auth, fence: p.fence,
      calls: calls.length, ok: okCalls.length, errors: calls.length - okCalls.length,
      error_samples: [...new Set(calls.filter((c) => !c.ok).map((c) => c.error))].slice(0, 3),
      latency_ms: { p50: pct(lat, 0.5), p95: pct(lat, 0.95), p99: pct(lat, 0.99), max: lat.length ? Math.max(...lat) : null, note: "client wall-clock incl. TLS" },
      now: nowCalls.length ? {
        queries: nowCalls.length, judged: judged.length, verified: ver, verified_rate: judged.length ? r3(ver / judged.length) : null,
        on_topic: judged.filter((x) => x.on_topic).length, gold_top3: now.filter((x) => x.gold_top3).length, gold_top10: now.filter((x) => x.gold_rank > 0).length,
        by_segment: Object.fromEntries(["research", "aml", "kyb", "agents"].map((s) => { const ids = raw.keys.queries.filter((q) => q.seg === s).map((q) => q.id); const j = judged.filter((x) => ids.includes(x.item)); return [s, `${j.filter((x) => x.verified).length}/${j.length}`]; })),
      } : null,
      pit: pit.length ? {
        events: pit.length, results: pit.reduce((a, x) => a + x.n, 0), states_outcome: pit.reduce((a, x) => a + x.states_outcome, 0),
        published_after_cutoff: pit.reduce((a, x) => a + x.published_after_cutoff, 0), acquired_after_cutoff: pit.reduce((a, x) => a + x.acquired_after_cutoff, 0),
        undated: pit.reduce((a, x) => a + x.undated, 0), per_event: pit.map(({ item, n, states_outcome, undated, outcome_examples }) => ({ item, n, states_outcome, undated, outcome_examples })),
      } : null,
      cost: {
        list_per_1k: p.price_per_1k, floor_per_1k: p.price_floor_per_1k, note: p.price_note,
        reported_usd: okCalls.some((c) => c.cost_usd != null) ? r3(okCalls.reduce((a, c) => a + (c.cost_usd || 0), 0)) : null,
        this_run_list_usd: cost(calls.length, p.price_per_1k),
        list_usd_per_verified_answer: ver ? r3(cost(nowCalls.length, p.price_per_1k) / ver) : null,
        per_10m_queries_yr_list_usd: Math.round(1e4 * p.price_per_1k), per_10m_queries_yr_floor_usd: Math.round(1e4 * p.price_floor_per_1k),
      },
    };
  }
  return { judged_at: new Date().toISOString(), seed, rule: {
    now: "verified = expected primary-source domain in top 10 OR a 'fact'-strength expected fact (number/date/outcome) in a top-10 title/snippet; 'topic' patterns only count toward on_topic; 'n/a' items (answer not yet public) excluded.",
    pit: "states_outcome = top-10 title/snippet states the post-cutoff outcome (regex fixed in queries.json); lower is better. Each provider uses its own best native date fence (see 'fence').",
    blinding: "providers relabelled A.. per item in seeded random order before scoring; see blind packet." }, board, verdicts, packet };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const src = process.argv[2] || "data/h2h/latest_raw.json";
  const raw = JSON.parse(readFileSync(src, "utf8"));
  const { packet, ...out } = judge(raw);
  mkdirSync("data/h2h", { recursive: true });
  writeFileSync("data/h2h/latest_judged.json", JSON.stringify({ source: src, ran_at: raw.ran_at, ...out }, null, 1));
  writeFileSync("data/h2h/blind_packet.json", JSON.stringify({ note: "Provider names removed; labels are per-item.", ...packet }, null, 1));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(out.board).map(([k, v]) => [k, v.status || { p50: v.latency_ms.p50, p95: v.latency_ms.p95, verified: v.now && `${v.now.verified}/${v.now.judged}`, pit_outcome_leaks: v.pit && `${v.pit.states_outcome}/${v.pit.results}`, errors: v.errors }])), null, 1));
}
