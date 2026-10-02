# v3 spine: minimal, one case, starts with the fintech film

> **Superseded on 2 Oct 00:47Z by ruling #16:** the live flow is the 19 slides in `order-v3.txt`. This file is kept as the design record (per-slide reasons). The current script is in `research/talk_track_v3.md`.

For George ruling #5 ("much more minimal, fewer things per slide; justify every slide; starts with the fintech film"). **23 slides in the flow** (cap 24), all existing ids. Numbers are copied from the current deck. Machine list: `order-v3.txt`.

## The flow

| # | id | Headline (≤8 words) | The one thing on screen | Body (≤25 words) | Proof caption | Earns its place because… |
|---|---|---|---|---|---|---|
| 1 | `hero` | Search, with a clock. | One button: Start presentation. | George Trushevskiy · Founding GTM take-home · Keenable · 1 Oct 2026. | — | The door. One click starts the case; nothing to read. |
| 2 | `film-fintech` | Search, with a clock. | The fintech film (6:11), with a spoken welcome and overview intro. | No body; the film is the slide. | Real top results, Keenable live API, 1 Oct 2026 · data/fintech_run.json | Tells the whole fintech case in one watch: story, problem, fix, first step. |
| 3 | `tk-grid` | Every requirement, answered in one line. | A 2 × 3 grid: Option 2 and Option 1, three boxes each. | Each box: the answer and its key number (33/60 → 0/60, 4.3 vs 0.4, 75.4%, 10 estimates). Tap a box for the evidence. | toc/brief-map.json · 9 requirements: 8 done, 1 partly | Ruling #4: shows every brief question answered, and where. It replaces the agenda. |
| 4 | `tk-f-thesis` | Backtests read the future. query_time fences them. | A 3-card panel: today · what it costs · why Keenable. | 33/60 unfenced results state the outcome · $14–35 per 1K grounded calls · 0/60 acquired after the cutoff, at $4 → $1 per 1K. | data/fintech_judged.json · six events × top 10 | Answers Option 2’s sales thesis (all three questions) on one screen. |
| 5 | `fx-h2h` | Keenable leaked least of eight. | Leaderboard: leaks per provider, Keenable first. | Same seven events, same rule fixed before any run. Keenable 1/70; rivals 10–37/70. On today’s questions it trails. | data/h2h/latest_judged.json · MEASURED 1 Oct 2026, 21:15–22:17Z | The only rival-vs-rival proof. A buyer’s first question is “vs whom?” |
| 6 | `fx-useful` | Ten times more usable evidence. | Bar chart: useful pre-event results per top 10. | No fence 0.4 · publish-date filter 0.6 · query_time 4.3. The fence keeps evidence; it doesn’t just remove leaks. | data/fence_relevance.json · 7 events; 28/30 second-model check, no human validation | Answers the objection “a fence just returns less”. |
| 7 | `fx-flip` | Switch the fence and the results flip. | The in-deck demo: SVB, 9 March 2023, fence on / off. | Same query, the day before SVB failed. Off: the future. On: the web as it stood. Live head-to-head at :7952. | data/fintech_run.json · SVB, query_time 2023-03-09 | Option 2’s first-meeting demo, run in the room. |
| 8 | `tk-f-targets` | Five own a backtest or a screen. Second-degree. | Five rows: company · person · why. | Balyasny · Hebbia · Rogo · Sardine · Bretton AI. Second-degree, two to confirm; no intros yet. | research/first5_canonical.md · second-degree, to confirm | Answers Option 2’s “5 targets and the exact people”. |
| 9 | `tk-bridge` | One timestamp, two products. | Two cards: the search (0/60) and the model (1,209/1,209). | A fund buys search; a lab buys a corpus. One field, acquired_at, answers both. Fintech first: measured today. | research/galactica_estimates.md · acquired_at on 1,209/1,209 | States the recommendation and joins the two options in one move. |
| 10 | `film-galactica` | The same timestamp, for labs. | The Galactica film (5:18). | No body. In a 15-minute slot, skip it and speak the 90-second version. | data/cc_overlap.json · 75.4% of 500 pages | Option 1’s case in one watch, for the lab-side listener (Matthias). |
| 11 | `tk-g-thesis` | Labs share one crawl. Keenable reaches past it. | A 3-card panel: how labs collect · what it costs · why Keenable. | ≥64% of LLMs trained on Common Crawl; Sep 2026 crawl only 27% new · build $6.7M/year vs $1–2M card · 75.4% in no 2026 crawl. | data/cc_overlap.json · data/opt1_cost_model.json | Answers Option 1’s sales thesis (all three questions) on one screen. |
| 12 | `tk-g-card` | I rebuilt the card and estimated the blanks. | A 3-card panel: today’s card · card v2 · the lawyer’s number. | ~4/30 buyer questions answered today · 10 unknowns estimated with 95% CIs · 15.7% of docs on AI opt-out sites. | research/opt1_card_v2.md · 1,209 docs of the live index | Answers Option 1’s “improve the dataset card”. |
| 13 | `ga-card` | Ten unknowns, estimated from 1,209 docs. | The ten-row card: estimate plus 95% CI. | One-off domains 63.9% · PII 8.7% · AI opt-out 15.7% · news 18.3% · EU/EEA 5.3% … each with n. | data/charts/ga_est_ten.json · search-results sample, not random | The card itself: the deliverable, not a description of it. |
| 14 | `tk-g-targets` | Five data owners. NVIDIA + HF is one. | Five rows: company · person · why. | NVIDIA + Hugging Face · DatologyAI · Arcee AI · Microsoft AI · AI21 Labs (expansion: ask Andrey). | research/first5_canonical.md · NVIDIA 8-K, 2 Sep 2026 | Answers Option 1’s “5 companies and the exact people”. |
| 15 | `fd-bug` | The fence held. One page served later text. | A 3-card panel: 1/60 · acquired 2022 · published 2024. | blockworks.co, acquired 28 Jun 2022, serves 2024 FTX–BlockFi text. Fix: serve the version from query_time. | data/fintech_run.json · research/g9_product_feedback.md #1 | Real feedback: I bought it, tested it, and brought back the bug. |
| 16 | `fd-weak` | Today’s questions: rivals rank primary sources higher. | A 3-card panel: 23/39 · 14/40 · 8/8. | Verified today: Keenable 23 vs Exa 39. Primary source in top 10: 14/40. Site-restricted: 8/8 found. Ranking, not coverage. | data/h2h/latest_judged.json · data/fintech_site_probe.json | Say the loss first; it’s the credibility the wins need. |
| 17 | `film-ad` | 40 seconds, for fun. | The ad (0:41). | No body. | — | A Founding GTM makes the content too; 41 seconds, and a breath before the plan. |
| 18 | `proof` | Five steps. The bar is set first. | The PROOF diagram: P · R · O · O · F. | Pick the query that hurts · run it in their harness · open the evidence · order · fan out and feed back. | Run once for this take-home: fintech, P through O | How I’d sell, as a repeatable method, not a one-off. |
| 19 | `pp-net` | My network, mapped. | Network graph: 864 people, 119 accounts. | Second-degree only; every tie marked “to confirm”. Critique first, pitch after they’ve seen data. | research/li_network.md · 864 / 119 | Proves the targets are reachable, not a wish list. |
| 20 | `oc-days` | Day 30: three evals. Day 90: paid pilot. | A 30 / 60 / 90 timeline. | Day 30: 3 evals with a written bar · Day 60: 2 verdicts, 1 volume pilot · Day 90: 3 pilots, 1 paid. | research/candidacy.md §7 · targets, not promises | What Keenable gets, with dates. It merges the plan and the outcomes. |
| 21 | `why` | I ran it, found a bug, mapped buyers. | Three facts: the customer · the kit · San Francisco. | I build agent products on web search. A kit that drops into five stacks. In SF. | kit/README.md · 26 of 26 tests pass | Why me, after the proof, so it’s earned. |
| 22 | `ask` | Send me 50 queries. Verdict in 48 hours. | One line, one button. | Or a lab’s cutoff and a sample of its pool: an overlap report in 48 hours. | — | The one next step. It ends the talk on an action. |
| 23 | `sources` | Every claim has a source. | The source index, graded A / B / C. | Mine (MEASURED) · fintech · Galactica · Keenable itself. Then the appendix: the full version. | research/v3_sources.md | Any number can be checked in one click. |

## Brief cross-check (toc/brief-map.json)

| Requirement | Answered on (spine) |
|---|---|
| Choice: Option 1 or 2 | tk-bridge (fintech first), tk-grid |
| Option 2 · vertical | film-fintech |
| Option 2 · sales thesis | tk-f-thesis, then fx-h2h and fx-useful |
| Option 2 · 5 targets + people | tk-f-targets |
| Option 2 · first-meeting demo | fx-flip (+ :7952 link) |
| Option 1 · sales thesis | tk-g-thesis |
| Option 1 · 5 targets + people | tk-g-targets |
| Option 1 · dataset card | tk-g-card, ga-card |
| Both · real feedback (partly) | fd-bug, fd-weak |

All 9 are answered in the spine. Merges: plan + outcomes → oc-days; recommendation + bridge → tk-bridge; card summary + opt-outs → tk-g-card; thesis panels absorb fx-p, ga-r and ga-cost.

## Cut → "Appendix · full version" (after Sources; nothing deleted): 78 ids

- `agenda`: The film intro, tk-grid and the TOC cover it.
- `task`: Chapter divider; tk-grid does the job.
- `fintech`: Chapter divider; the film opens the chapter.
- `fx-story`: The film tells the SVB story; fx-flip shows it live.
- `fx-p`: 33/60 is on the thesis panel and in the film.
- `fx-fences`: Three fences; fx-h2h and fx-useful carry the same numbers.
- `tk-f-accounts`: Long-list of 8; tk-f-targets is the answer.
- `pp-fintech`: Same five people as tk-f-targets.
- `tk-f-demo`: Describes the demo; fx-flip is the demo.
- `fx-live`: Live search box; the :7952 link on fx-flip covers it.
- `fx-open`: Replay 6/6 and 1/60; fd-bug carries 1/60.
- `fx-recipe`: Phrasing recipe; detail for the pilot, not the pitch.
- `fx-order`: List price; it’s on the thesis panel.
- `fx-fan`: Channel via Fireworks; detail of the F step.
- `fx-screen`: Adverse-media screen 19/22; LLM labels, a screen, not proof.
- `fx-gate`: Pilot gate; folded into PROOF and the plan.
- `client-fintech`: Client deck; a leave-behind, not a slide.
- `two-buyers`: Buyer table; tk-bridge makes the same point with two numbers.
- `tk-clock`: Use cases beyond the brief; an appendix idea.
- `galactica`: Chapter divider; the film opens the chapter.
- `ga-story`: ≥64% on CC is on the thesis panel; the film tells the story.
- `ga-bridge`: Interactive cutoff slider; tk-bridge makes the point.
- `ga-p`: P step for Galactica; method detail.
- `ga-bar`: Pilot bar; detail for the first meeting.
- `ga-r`: 75.4% is on the thesis panel; no duplicate proof.
- `ga-tokens`: 290T tokens; context, not the answer.
- `ga-quality`: Quality 16%; context, not the answer.
- `ga-cost`: $6.7M vs $1–2M is on the thesis panel.
- `ga-optout`: 15.7% is on tk-g-card and ga-card.
- `tk-g-accounts`: Long-list; tk-g-targets is the answer.
- `pp-galactica`: Same five as tk-g-targets.
- `ga-order`: Full vs Delta offer; spoken in the close.
- `ga-jev`: Jev as a labeller; off the case.
- `ga-feedback`: first_seen_at ask; in the product-feedback memo.
- `findings`: Chapter divider.
- `fd-a`: Four severity-A items; fd-bug and fd-weak carry the two that matter.
- `fd-b`: Severity-B list; for the product team, not the pitch.
- `proof-ch`: Chapter divider.
- `pf-p`: Per-step detail of PROOF; one diagram is enough.
- `pf-r`: Per-step detail of PROOF.
- `pf-o1`: Per-step detail of PROOF; the memo is a leave-behind.
- `pf-o2`: Per-step detail of PROOF.
- `pf-f`: Per-step detail of PROOF.
- `people`: Chapter divider.
- `pp-platform`: Platform first five; outside the brief’s two options.
- `pp-chain`: How I reach them; pp-net covers reachability.
- `pp-weeks`: First three weeks; oc-days covers the plan.
- `gtm`: Chapter divider.
- `q-plan`: Same 30/60/90 as oc-days.
- `q-kit`: 26/26 tests; it’s the proof caption on why.
- `q-terms`: Deal terms; for the offer letter, not the deck.
- `q-channel`: Channel map; detail of the F step.
- `q-product`: Four fixes; fd-bug and fd-weak carry them.
- `q-score`: Weekly scorecard; operating detail.
- `quote`: Lab client deck; a leave-behind.
- `client-fireworks`: Platform client deck; a leave-behind.
- `outcomes`: Chapter divider.
- `oc-pilot`: First-pilot detail; oc-days covers it.
- `whoami`: Bio; why covers it in three facts.
- `numbers`: Three numbers; all already on earlier slides.
- `ask-found`: Recap of what I found; the deck just showed it.
- `ask-gets`: Recap of what Keenable gets; oc-days showed it.
- `sx-mine`: Source list; behind the sources index.
- `sx-f1`: Source list; behind the sources index.
- `sx-f2`: Source list; behind the sources index.
- `sx-g1`: Source list; behind the sources index.
- `sx-g2`: Source list; behind the sources index.
- `sx-k`: Source list; behind the sources index.
- `appendix`: Appendix slide; stays in the appendix.
- `ax-src-fence`: Appendix slide; stays in the appendix.
- `ax-src-fence-2`: Appendix slide; stays in the appendix.
- `ax-src-more`: Appendix slide; stays in the appendix.
- `ax-src-more-2`: Appendix slide; stays in the appendix.
- `ax-objections`: Appendix slide; stays in the appendix.
- `ax-objections-2`: Appendix slide; stays in the appendix.
- `ax-caveats`: Appendix slide; stays in the appendix.
- `ax-caveats-2`: Appendix slide; stays in the appendix.
- `ax-links`: Appendix slide; stays in the appendix.

## Notes for site-elevate
- Headlines above are target text; where a slide differs, shorten it to match (text only).
- brief-map.json primaries all sit in the spine (o2-demo primary is now fx-flip).
- The two films run 11:01 together. In a 15-minute slot George plays the fintech film and speaks Galactica; film-galactica stays in the flow so deck and PDF match.
- Long headlines kept from the deck where they are already ≤8 words.
