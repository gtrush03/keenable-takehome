# Keenable take-home · George Trushevskiy

My take-home for Keenable's Founding GTM role (October 2026). I did both options: Option 2, web search for fintech, which is the lead, and Option 1, the Galactica pretraining corpus.

This is not an official Keenable project. Keenable and every other company mark shown belong to their owners.

## What's here

| Folder | What it is |
| --- | --- |
| `sites/v2/` | The presentation: a short main flow followed by an appendix. `full.html` is the extended version. Run `bun sites/server.ts`, then open http://127.0.0.1:7950/v2/. The films are not in this repo. |
| `sites/demo/` | The time-machine demo: set a date, then search only what Keenable had acquired by then. The Cloudflare Worker is in `sites/demo/cloud/`. |
| `kit/` | A drop-in kit that adds Keenable search with `query_time` as an OpenAI tool, Anthropic tool use, an MCP server, the Vercel AI SDK and LangChain.js. Run `cd kit && npm test`; `npm run test:offline` runs without keys. |
| `scripts/` | The measurement scripts: the head-to-head against seven rivals, fence relevance, replay and stress runs, the Galactica estimates and the Common Crawl overlap. |
| `data/` | The datasets the deck cites. Each slide labels its numbers MEASURED, MODEL or CITED and links the file they come from. |

## Notes

- API keys are read from the environment and are never committed.
- Measured runs are dated in their files. Most samples are small, and the slides give the n and the confidence intervals.
- The rival comparison uses each provider's own date filter on the same events. The outcome rule was fixed before any run.
