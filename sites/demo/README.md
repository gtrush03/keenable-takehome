# Time Machine head-to-head demo (separate link)

- Live: https://george-keenable-demo.trusynth.workers.dev/ (the Cloudflare Worker in `sites/demo/cloud/`; keys stay server-side).
- Offline / PDF: open `sites/demo/index.html` directly. Tonight's recorded run is inlined, so Replay, both scopes, the today's-questions table and the findings work without the server.
- Rebuild after a new run: `bun sites/demo/build.ts` (reads data/h2h/latest_raw.json, latest_judged.json, pit_llm.json, data/fence_relevance.json).
- Buttons: **Run live** = this event × every provider with a key, then the blind judge. **Replay** = the recorded run, replayed at its real latencies. **Run the full test** = 7 events × every provider live (~80 s) with a progress bar, then the 7-event scoreboard. Live calls are logged to data/h2h/live/<date>.jsonl.
