// Reproducibility check: re-issue the 6 point-in-time queries from data/fintech_run.json (same body) and compare
// the returned URL lists with the first run. SR 11-7-style "can you replay the evidence?" test. 6 requests, 1 rps.
import { readFileSync, writeFileSync } from "node:fs";

const BASE = "https://api.keenable.ai/v1/search/public";
const run = JSON.parse(readFileSync("data/fintech_run.json", "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { first_run_at: run.ran_at, rerun_at: new Date().toISOString(), rows: [] };

for (const row of run.rows.filter((r) => r.pit)) {
  const first = row.runs.find((x) => x.kind === "pit");
  const body = { query: row.q, mode: "pro", max_results: 10, snippet_max_length: 240, query_time: row.pit };
  const t0 = performance.now();
  const r = await fetch(BASE, { method: "POST", headers: { "content-type": "application/json", "X-Keenable-Title": "keenable-fintech-research" }, body: JSON.stringify(body) });
  const j = await r.json();
  const ms = Math.round(performance.now() - t0);
  const a = first.results.map((x) => x.url), b = (j.results || []).map((x) => x.url);
  const overlap = b.filter((u) => a.includes(u)).length;
  out.rows.push({ q: row.q, query_time: row.pit, ms, identical_order: JSON.stringify(a) === JSON.stringify(b), overlap_of_10: overlap, first: a, rerun: b });
  process.stderr.write(`${row.q.slice(0, 40)}: overlap ${overlap}/10 identical=${JSON.stringify(a) === JSON.stringify(b)} ${ms}ms\n`);
  await sleep(1000);
}
out.summary = { n: out.rows.length, identical_order: out.rows.filter((x) => x.identical_order).length, mean_overlap: +(out.rows.reduce((s, x) => s + x.overlap_of_10, 0) / out.rows.length).toFixed(2) };
writeFileSync("data/fintech_repro.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.summary));
