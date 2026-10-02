# Search, with a clock

**George Trushevskiy · Founding GTM take-home for Keenable · October 2026**

I didn't pitch the product. I ran it on Keenable's live API against seven rival search APIs, measured where it wins and where it loses, found a bug, and built the first-meeting demo. I did both options: **Option 2, web search for fintech**, leads; **Option 1, the Galactica pretraining corpus**, runs off the same timestamp.

### ▶ [Open the presentation](https://founding-gtm.trusynth.com/hub/)

Press **Play presentation**: 19 slides with three short films inside. Works on a phone.

---

## Start here

| | Link | What it is |
|---|---|---|
| **Presentation** | [founding-gtm.trusynth.com](https://founding-gtm.trusynth.com) | The main flow, 19 slides. Swipe or use the arrow keys. **Menu** has every section. |
| **Live demo** | [george-keenable-demo.trusynth.workers.dev](https://george-keenable-demo.trusynth.workers.dev/) | Pick a date, search only what Keenable had acquired by then, and compare rivals side by side. **Replay** works offline. |
| **Home** | [/hub](https://founding-gtm.trusynth.com/hub/) | Start, Continue where you left off, and the Index. |
| **Index map** | [/index-map](https://founding-gtm.trusynth.com/index-map/) | Every slide on one subway map, with the downloads. |
| **Films** | [/films](https://founding-gtm.trusynth.com/films/) | Fintech (6:11), Galactica (5:19), and a 41-second ad. |
| **Extended version** | [/full](https://founding-gtm.trusynth.com/full) | 98 slides with the full depth and the section dividers. |
| **One-page memo** | [/memo](https://founding-gtm.trusynth.com/memo/) · [PDF](https://founding-gtm.trusynth.com/memo/memo.pdf) | The claim, three measured numbers, the method and the ask. |

**Downloads:** [Deck PDF (19)](https://founding-gtm.trusynth.com/v2.pdf) · [Extended PDF (98)](https://founding-gtm.trusynth.com/dl/keenable-extended.pdf) · [All datasets (zip)](https://founding-gtm.trusynth.com/dl/keenable-takehome-datasets.zip) · [Kit (zip)](https://founding-gtm.trusynth.com/dl/keenable-kit.zip)

**First-meeting client decks:** [Backtests Without Lookahead](https://founding-gtm.trusynth.com/client/fintech/) (a fintech head of data) · [Web Search Backend](https://founding-gtm.trusynth.com/client/fireworks/) (a platform team) · [Pretraining Data, Monthly](https://founding-gtm.trusynth.com/client/lab/) (a pretraining data lead)

---

## The results

Key numbers on the slides carry a label: **MEASURED** (run by me, dated), **MODEL** (an estimate with its inputs) or **CITED** (a graded public source), with a link to the file behind them.

| Result | Number | Label | Data |
|---|---|---|---|
| Unfenced search results that already state the outcome, asked the day before (6 events) | **33 of 60** | MEASURED | [`fintech_judged.json`](data/fintech_judged.json) |
| Results that gave the outcome away with Keenable's `query_time` fence, vs the seven other search APIs on the same 7 events | **1 of 70** vs **10–37** of about 70 each | MEASURED | [`h2h/latest_judged.json`](data/h2h/latest_judged.json) |
| Useful pre-event results per top 10: no fence · publish-date filter · `query_time` | **0.4 · 0.6 · 4.3** | MEASURED | [`fence_relevance.json`](data/fence_relevance.json) |
| Where Keenable loses today: questions about now (Keenable vs Exa) | **23 of 39** vs **39 of 39** | MEASURED | [`h2h/latest_judged.json`](data/h2h/latest_judged.json) |
| A product bug: under the fence, a 2022 page served its 2024 text | **1 of 60** | MEASURED | [slide 8](https://founding-gtm.trusynth.com/?present=1#fd-bug) |
| Sampled pages Keenable served with no URL match in Common Crawl's 2026 crawls | **75.4%** of 500 (95% CI 71.4–79.0) | MEASURED | [`cc_overlap.json`](data/cc_overlap.json) |
| Documents on sites that opt out of AI training (95% CI 10.9–21.3%, n=504) | **15.7%** | MEASURED | [`galactica_estimates.json`](data/galactica_estimates.json) |
| A lab's own crawl vs Galactica on the card, per year | **~$6.7M** vs **$1–2M** | MODEL | [`opt1_build_vs_buy.json`](data/charts/opt1_build_vs_buy.json) |
| The drop-in kit's test suite | **26 of 26** pass | MEASURED | [`TEST-RECEIPT.md`](kit/TEST-RECEIPT.md) |

---

## What the brief asked, and where it's answered

Each slide link opens that slide in the presentation.

| Part | The ask | The answer | Slide | Status |
|---|---|---|---|---|
| General | Pick Option 1 or Option 2 | Both answered. Fintech leads; Galactica is the second product. | [9](https://founding-gtm.trusynth.com/?present=1#tk-bridge) | Done |
| General | Ground it in real data | Measured on Keenable's live API and seven rivals, 1 Oct 2026. | [5](https://founding-gtm.trusynth.com/?present=1#fx-h2h) | Done |
| General | Ground it in the product | Found a bug: 1 of 60 fenced results served later text. | [8](https://founding-gtm.trusynth.com/?present=1#fd-bug) | Done |
| General | Ground it in practitioners | No practitioner conversations yet; nobody contacted. | [18](https://founding-gtm.trusynth.com/?present=1#ask) | Partial |
| Option 2 · Fintech | Pick one vertical | Fintech: backtests and adverse-media screens that read the live web. | [2](https://founding-gtm.trusynth.com/?present=1#film-fintech) | Done |
| Option 2 · Fintech | What they do with web search today | Agents search the live web; 33 of 60 results already leak the outcome. | [4](https://founding-gtm.trusynth.com/?present=1#tk-f-thesis) | Done |
| Option 2 · Fintech | What it costs them | $14–35 per 1,000 grounded calls; Bing Search API retired in 2025. | [4](https://founding-gtm.trusynth.com/?present=1#tk-f-thesis) | Done |
| Option 2 · Fintech | Why Keenable is better | 1 of 70 leaks vs 10–37 for rivals; useful results 0.4 → 4.3. | [5](https://founding-gtm.trusynth.com/?present=1#fx-h2h) | Done |
| Option 2 · Fintech | 5 targets | Balyasny, Hebbia, Rogo, Sardine, Bretton AI. Targets, not customers. | [7](https://founding-gtm.trusynth.com/?present=1#tk-f-targets) | Done |
| Option 2 · Fintech | The people from your network, and why | Five named people, second-degree (two to confirm), no intros yet. Each owns a backtest or a screen where look-ahead costs money. | [7](https://founding-gtm.trusynth.com/?present=1#tk-f-targets) | Done |
| Option 2 · Fintech | Design the first-meeting demo | The day before the event: flip the fence live, rivals side by side. | [6](https://founding-gtm.trusynth.com/?present=1#fx-flip) · [demo](https://george-keenable-demo.trusynth.workers.dev/) | Done |
| Option 1 · Galactica | How labs collect pretraining data today | Most share one crawl: ≥64% of the LLMs studied used Common Crawl. | [11](https://founding-gtm.trusynth.com/?present=1#tk-g-thesis) | Done |
| Option 1 · Galactica | What it costs them | Own crawl ≈ $6.7M a year (midpoint) vs $1–2M for Galactica. | [11](https://founding-gtm.trusynth.com/?present=1#tk-g-thesis) | Done |
| Option 1 · Galactica | Why Keenable can be better | 75.4% of 500 sampled pages had no URL match in any 2026 crawl. | [11](https://founding-gtm.trusynth.com/?present=1#tk-g-thesis) | Done |
| Option 1 · Galactica | 5 companies | NVIDIA + Hugging Face, DatologyAI, Arcee, Microsoft AI, AI21 (expansion). Targets, not customers. | [13](https://founding-gtm.trusynth.com/?present=1#tk-g-targets) | Done |
| Option 1 · Galactica | The people from your network, and why | Five named data owners, second-degree unless marked, one cold, no intros. Each decides or curates what pretraining data a lab uses. | [13](https://founding-gtm.trusynth.com/?present=1#tk-g-targets) | Done |
| Option 1 · Galactica | Improve the dataset card | Rebuilt around a data lead's 30 questions; today's card answers about 4. | [12](https://founding-gtm.trusynth.com/?present=1#ga-card) | Done |
| Option 1 · Galactica | Placeholder answers for the missing statistics | 10 unknowns estimated from 1,209 documents, with 95% intervals. | [12](https://founding-gtm.trusynth.com/?present=1#ga-card) | Done |

---

## What's in this repo

| Folder | What it is |
|---|---|
| [`sites/v2/`](sites/v2/) | The presentation: the 19-slide main flow (`index.html`) and `full.html` (the Extended version). The films are hosted on the live site, not in the repo. |
| [`sites/demo/`](sites/demo/) | The time-machine demo: set a date, then search only what Keenable had acquired by then. The Cloudflare Worker is in `sites/demo/cloud/`. |
| [`kit/`](kit/) | A drop-in kit that adds Keenable search with `query_time` as an OpenAI tool, Anthropic tool use, an MCP server, the Vercel AI SDK and LangChain.js. |
| [`scripts/`](scripts/) | The measurement scripts: the head-to-head against seven rivals, fence relevance, replay and stress runs, the Galactica estimates and the Common Crawl overlap. |
| [`data/`](data/) | The datasets cited on the slides. The [datasets zip](https://founding-gtm.trusynth.com/dl/keenable-takehome-datasets.zip) adds a README saying what each file is, how it was measured, and when. |

## Run the kit

```sh
cd kit && npm test                  # the kit's tests
cd kit && npm run test:offline      # runs without keys
```

API keys are read from the environment and are never committed.

## Method and limits

- **The outcome rule was fixed before any run.** A result "gives the outcome away" if it states the event's result.
- **The rival comparison** runs each provider on the same 7 events and top 10, with its best available date filter. Parallel has no before-date filter, so it ran unfenced.
- **The samples are small:** 7 events and about 70 results per provider. The slides give the n and, where computed, 95% intervals.
- **"Useful" labels come from a model, not people.** A blind second-model check agreed on 28 of 30.
- **Six replays came back identical** (same URLs and order), about 8 minutes apart. That isn't a long-term reproducibility test.
- **The 75.4% is URL overlap** on a search-biased sample, not a share of new content. **The $6.7M is a model**, and its inputs and ranges are in the file.
- **Prices** are each provider's list price, read from its pricing page on 1 Oct 2026. **Latency** is client wall-clock from a residential Mac mini in San Francisco, not server time.

---

*Not an official Keenable project. Keenable and every other company mark shown belong to their owners. Made by [George Trushevskiy](https://founding-gtm.trusynth.com).*
