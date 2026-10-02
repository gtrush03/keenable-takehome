// One call per provider (no files written): bun --env-file=.env.keys scripts/h2h/smoke.mjs serper,youcom
import { PROVIDERS, availability } from "./providers.mjs";
for (const id of process.argv[2].split(",")) {
  const p = PROVIDERS[id];
  if (!availability(id).ready) { console.log(id, "no key"); continue; }
  for (const cutoff of [undefined, "2023-03-09"]) {
    const t0 = performance.now();
    try { const r = await p.search({ query: "Silicon Valley Bank deposit outflows", cutoff }); console.log(id, cutoff || "now", Math.round(performance.now() - t0) + "ms", "n=" + r.results.length, JSON.stringify(r.results[0] || {}).slice(0, 220)); }
    catch (e) { console.log(id, cutoff || "now", "ERR", e.message.slice(0, 200)); }
  }
}
