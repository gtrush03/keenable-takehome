// Blind LLM judge for the 7 point-in-time events, with the SAME four labels and definitions as data/fence_relevance.json
// (JEV_CRITERIA in scripts/fence_relevance.py). The model sees one result list at a time, numbered 1..10, with no provider
// name, and labels each result from its title + snippet only. Needs OPENROUTER_API_KEY.
//   bun --env-file=.env.keys scripts/h2h/pit_judge.mjs [data/h2h/latest_raw.json]
// Writes data/h2h/pit_llm.json and merges `pit_llm` into data/h2h/latest_judged.json (board[id].pit_llm).
import { readFileSync, writeFileSync, existsSync } from "node:fs";

export const MODEL = process.env.H2H_PIT_MODEL || "anthropic/claude-sonnet-5.5";
export const CRITERIA = {
  "leaks-outcome": "The title or snippet states or clearly implies `later_outcome` or any other development that happened after `as_of_date` in this story. Choose this even if the result is otherwise useful.",
  "useful-pre-event-evidence": "The title or snippet is about the entity in `analyst_question` and gives concrete facts, figures or developments that help answer `analyst_question` as it stood before `as_of_date`, without revealing `later_outcome`.",
  "related-but-weak": "The result is about the entity in `analyst_question` but gives little that answers it: a generic company profile, a stock-quote or homepage, a marketing page, a bare table fragment, or a different topic about the same entity.",
  "irrelevant": "The result is not about the entity in `analyst_question`, or mentions it only in passing (a forum thread on another subject, a different company, a document fragment with no clear subject).",
};
const LABELS = Object.keys(CRITERIA);
const root = new URL("../../", import.meta.url);
export const EVENTS = JSON.parse(readFileSync(new URL("data/fence_relevance.json", root), "utf8")).events; // keyed by cutoff

function prompt(ev, cutoff, results) {
  const list = results.map((r, i) => `[${i + 1}] ${r.title || ""} | ${r.url}\n${(r.snippet || "").slice(0, 600)}`).join("\n\n");
  return `An analyst must answer \`analyst_question\` using only information available on \`as_of_date\`. Label each search result by what its title and snippet show (do not use outside knowledge about the page).\n\n` +
    `analyst_question: ${ev.question}\nentity: ${ev.entity}\nas_of_date: ${cutoff}\nlater_outcome: ${ev.outcome}\n\nLabels:\n` +
    LABELS.map((l) => `- ${l}: ${CRITERIA[l]}`).join("\n") + `\n\nResults:\n${list}\n\n` +
    `Reply with JSON only: {"labels": ["<label for 1>", "<label for 2>", ...]} with exactly ${results.length} entries, each one of: ${LABELS.join(", ")}.`;
}

// Cache: same event + same result text => same labels (keeps re-runs and the live demo inside OpenRouter's 20 rpm new-account cap).
const CACHE_F = new URL("data/h2h/pit_llm_cache.json", root);
const cache = existsSync(CACHE_F) ? JSON.parse(readFileSync(CACHE_F, "utf8")) : {};
const ckey = (model, cutoff, results) => Bun.hash(model + cutoff + JSON.stringify(results.map((r) => [r.url, r.title, r.snippet]))).toString(36);

export async function labelResults(cutoff, results, { model = MODEL, key = process.env.OPENROUTER_API_KEY } = {}) {
  const ev = EVENTS[cutoff];
  if (!ev || !results.length || !key) return null;
  const ck = ckey(model, cutoff, results);
  if (cache[ck]) return { ...cache[ck], cached: true };
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${key}`, "X-Title": "keenable-h2h-pit-judge" },
        body: JSON.stringify({ model, temperature: 0, max_tokens: 3000, reasoning: { effort: "low" }, messages: [{ role: "user", content: prompt(ev, cutoff, results) }] }) });
      const j = await r.json();
      const txt = j.choices?.[0]?.message?.content || "";
      const m = txt.match(/\{[\s\S]*\}/);
      const labels = m ? JSON.parse(m[0]).labels : null;
      if (Array.isArray(labels) && labels.length === results.length && labels.every((l) => LABELS.includes(l))) {
        cache[ck] = { model: j.model || model, labels }; writeFileSync(CACHE_F, JSON.stringify(cache));
        return cache[ck];
      }
      if (process.env.H2H_DEBUG) console.error("bad judge reply", r.status, JSON.stringify(j.error || txt).slice(0, 300));
    } catch (e) { if (process.env.H2H_DEBUG) console.error("judge error", e.message); }
    await new Promise((s) => setTimeout(s, 3500 * (attempt + 1)));
  }
  return null;
}

export function tally(labels) {
  const c = Object.fromEntries(LABELS.map((l) => [l, 0]));
  for (const l of labels || []) c[l]++;
  return c;
}

async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } })); return out; }

if (import.meta.main) {
  const src = process.argv[2] || "data/h2h/latest_raw.json";
  const raw = JSON.parse(readFileSync(src, "utf8"));
  const jobs = [];
  for (const [id, p] of Object.entries(raw.providers)) if (p.ran) for (const ev of raw.keys.pit_events) { const c = p.pit?.[ev.q]; if (c?.ok && c.results.length) jobs.push({ id, ev, results: c.results }); }
  const t0 = Date.now();
  const done = await pool(jobs, 3, async (j) => ({ ...j, out: await labelResults(j.ev.cutoff, j.results) }));
  const per = {}, board = {};
  for (const { id, ev, results, out } of done) {
    (per[id] ||= {})[ev.q] = { cutoff: ev.cutoff, labels: out?.labels || null, rows: results.map((r, i) => ({ url: r.url, label: out?.labels?.[i] || null })) };
  }
  for (const [id, evs] of Object.entries(per)) {
    const all = Object.values(evs).flatMap((e) => e.labels || []);
    const t = tally(all);
    board[id] = { results_labelled: all.length, events_labelled: Object.values(evs).filter((e) => e.labels).length, ...t,
      leak_share: all.length ? +(t["leaks-outcome"] / all.length).toFixed(3) : null,
      useful_at_10_mean: all.length ? +(t["useful-pre-event-evidence"] / Object.values(evs).filter((e) => e.labels).length).toFixed(2) : null,
      events_with_any_useful: Object.values(evs).filter((e) => (e.labels || []).includes("useful-pre-event-evidence")).length };
  }
  const out = { judged_at: new Date().toISOString(), source: src, model: MODEL, calls: jobs.length, failed: done.filter((d) => !d.out).length, secs: Math.round((Date.now() - t0) / 1000),
    rule: "Blind: one provider's 10 results at a time, numbered, no provider name. Labels and definitions = JEV_CRITERIA (scripts/fence_relevance.py), title + snippet only.", board, per };
  writeFileSync("data/h2h/pit_llm.json", JSON.stringify(out, null, 1));
  if (existsSync("data/h2h/latest_judged.json")) {
    const jd = JSON.parse(readFileSync("data/h2h/latest_judged.json", "utf8"));
    for (const [id, b] of Object.entries(board)) if (jd.board[id]) jd.board[id].pit_llm = { model: MODEL, ...b };
    jd.pit_llm_rule = out.rule;
    writeFileSync("data/h2h/latest_judged.json", JSON.stringify(jd, null, 1));
  }
  console.log(JSON.stringify({ model: MODEL, calls: out.calls, failed: out.failed, secs: out.secs, board }, null, 1));
}
