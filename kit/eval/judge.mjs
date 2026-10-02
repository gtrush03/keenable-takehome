// Blind judge. For every item, each provider's result list is relabelled "A", "B", ... in a seeded random order and
// scored by functions that see only (results, answer key). The label -> provider map is applied after every verdict
// exists. An optional LLM judge (llm-judge.mjs) scores the same blinded candidates. The blind packet (no provider
// names) is written out so a human or a third-party judge can re-score the same evidence.
import { pct, wilson, mcnemar, r3, rng, shuffle } from "./stats.mjs";
import { toInstant } from "../src/keenable.mjs";

export const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const text = (x) => `${x.title || ""} ${x.snippet || ""}`;
const KS = [1, 3, 10];

// Rule judge. Sees only the result list and the key.
export function scoreRules(results, key) {
  const top = results.slice(0, 10);
  const domainRank = key.expected_domains.length ? top.findIndex((x) => key.expected_domains.some((g) => host(x.url) === g || host(x.url).endsWith("." + g))) + 1 : null;
  const rx = key.expected_regex ? new RegExp(key.expected_regex, "i") : null;
  const regexRank = rx ? top.findIndex((x) => rx.test(text(x))) + 1 : null;
  const factRegex = rx && key.regex_strength === "fact";
  const judged = Boolean(key.expected_domains.length || factRegex);
  const out = {
    n: results.length,
    domain_rank: domainRank, regex_rank: regexRank,
    hit: Object.fromEntries(KS.map((k) => [k, domainRank == null ? null : domainRank > 0 && domainRank <= k])),
    judged,
    verified: judged ? (domainRank > 0 || (factRegex && regexRank > 0)) : null,
    on_topic: domainRank > 0 || regexRank > 0,
  };
  if (key.query_time) {
    const qt = toInstant(key.query_time);
    const leak = key.leak_regex ? new RegExp(key.leak_regex, "i") : null;
    const dated = top.filter((x) => toInstant(x.published_at) != null);
    out.pit = {
      results: top.length,
      acquired_after_query_time: top.filter((x) => toInstant(x.acquired_at) != null && toInstant(x.acquired_at) > qt).length,
      published_after_query_time: dated.filter((x) => toInstant(x.published_at) > qt).length,
      outcome_leaks: leak ? top.filter((x) => leak.test(text(x))).length : null,
      undated: top.length - dated.length,
      examples: top.filter((x) => (leak && leak.test(text(x))) || toInstant(x.published_at) > qt || toInstant(x.acquired_at) > qt).slice(0, 3)
        .map((x) => ({ host: host(x.url), title: (x.title || "").slice(0, 120), published_at: x.published_at || null, acquired_at: x.acquired_at || null })),
    };
  }
  return out;
}

export function blind(run, seed = 20261001) {
  const rand = rng(seed);
  const verdicts = [], packet = [];
  for (const key of run.items) {
    const ids = Object.entries(run.providers).filter(([, p]) => p.ran && p.calls[key.id]?.ok).map(([id]) => id);
    const order = shuffle(ids, rand);
    const labels = Object.fromEntries(order.map((id, i) => [String.fromCharCode(65 + i), id]));
    const candidates = Object.fromEntries(Object.entries(labels).map(([L, id]) => [L, run.providers[id].calls[key.id].results]));
    packet.push({ item: key.id, query: key.query, query_time: key.query_time, answer_key: key, candidates });
    verdicts.push({ item: key.id, labels, scored: Object.fromEntries(Object.entries(candidates).map(([L, res]) => [L, scoreRules(res, key)])) });
  }
  return { verdicts, packet };
}

// Applies the unblinding map and aggregates per provider. `llm` (optional) = { item: { label: { supported } } }.
export function aggregate(run, verdicts, llm = null) {
  const board = {}, perItem = {};
  for (const [id, p] of Object.entries(run.providers)) {
    if (!p.ran) { board[id] = { label: p.label, status: p.status }; continue; }
    const mine = verdicts.flatMap((v) => Object.entries(v.labels).filter(([, pid]) => pid === id).map(([L]) => ({ item: v.item, label: L, ...v.scored[L], llm: llm?.[v.item]?.[L] ?? null })));
    perItem[id] = Object.fromEntries(mine.map((m) => [m.item, m]));
    const calls = Object.values(p.calls), ok = calls.filter((c) => c.ok), lat = ok.map((c) => c.ms);
    const judged = mine.filter((m) => m.judged), ver = judged.filter((m) => m.verified).length;
    const domainJudged = mine.filter((m) => m.domain_rank != null);
    const llmJudged = mine.filter((m) => m.llm && typeof m.llm.supported === "boolean");
    const pit = mine.filter((m) => m.pit);
    const sum = (k) => pit.reduce((a, m) => a + (m.pit[k] || 0), 0);
    const listCost = (calls.length / 1000) * p.price_per_1k;
    const [lo, hi] = wilson(ver, judged.length);
    board[id] = {
      label: p.label, auth: p.auth, fence: p.fence,
      calls: calls.length, ok: ok.length, errors: calls.length - ok.length,
      error_samples: [...new Set(calls.filter((c) => !c.ok).map((c) => c.error))].slice(0, 3),
      empty_results: ok.filter((c) => !c.results.length).length,
      latency_ms: { p50: pct(lat, 0.5), p95: pct(lat, 0.95), p99: pct(lat, 0.99), max: lat.length ? Math.max(...lat) : null, n: lat.length },
      quality: {
        judged: judged.length, verified: ver, verified_rate: judged.length ? r3(ver / judged.length) : null, verified_ci95: [r3(lo), r3(hi)],
        hit_at: Object.fromEntries(KS.map((k) => [k, domainJudged.length ? r3(domainJudged.filter((m) => m.hit[k]).length / domainJudged.length) : null])),
        domain_judged: domainJudged.length,
        on_topic: mine.filter((m) => m.on_topic).length,
        llm_supported: llmJudged.length ? llmJudged.filter((m) => m.llm.supported).length : null, llm_judged: llmJudged.length,
      },
      pit: pit.length ? {
        items: pit.length, results: sum("results"),
        acquired_after_query_time: sum("acquired_after_query_time"),
        published_after_query_time: sum("published_after_query_time"),
        outcome_leaks: pit.some((m) => m.pit.outcome_leaks != null) ? sum("outcome_leaks") : null,
        undated: sum("undated"),
        per_item: pit.map((m) => ({ item: m.item, ...m.pit })),
      } : null,
      cost: {
        list_per_1k: p.price_per_1k, floor_per_1k: p.price_floor_per_1k, note: p.price_note,
        this_run_list_usd: r3(listCost),
        reported_usd: ok.some((c) => c.cost_usd != null) ? r3(ok.reduce((a, c) => a + (c.cost_usd || 0), 0)) : null,
        billed_usd: p.auth === "keyless" ? 0 : null,
        list_usd_per_verified: ver ? r3(((judged.length / 1000) * p.price_per_1k) / ver) : null,
        floor_usd_per_verified: ver ? r3(((judged.length / 1000) * p.price_floor_per_1k) / ver) : null,
      },
    };
  }
  // Pairwise on items both providers answered and both were judged on.
  const ran = Object.keys(perItem), pairwise = [];
  for (let i = 0; i < ran.length; i++) for (let j = i + 1; j < ran.length; j++) {
    const [a, b] = [ran[i], ran[j]];
    let aOnly = 0, bOnly = 0, both = 0, neither = 0;
    for (const item of Object.keys(perItem[a])) {
      const x = perItem[a][item], y = perItem[b][item];
      if (!y || !x.judged) continue;
      if (x.verified && y.verified) both++; else if (x.verified) aOnly++; else if (y.verified) bOnly++; else neither++;
    }
    pairwise.push({ a, b, a_only: aOnly, b_only: bOnly, both, neither, mcnemar_p: r3(mcnemar(aOnly, bOnly)) });
  }
  return { board, pairwise, perItem };
}
