# v2: structure and components

Main site: http://127.0.0.1:7950/v2/ · client decks: `/v2/client/lab/`, `/v2/client/fintech/`, `/v2/client/fireworks/`.

## 1. How to work in parallel

```
sites/v2/
  index.template.html      head, top bar (chapter bar + Download PDF + Present), <main><!--CHAPTERS--></main>, footer, scripts
  chapters/
    00-opening.html  10-proof.html  20-fintech.html  30-galactica.html  40-client.html
    50-people.html   60-gtm.html    90-appendix.html 99-close.html
    NN-name.js / NN-name.css       optional, per chapter; build.py links them
  v2.css  v2.js                    shared design system (do not fork per chapter)
  build.py                         builds every index.template.html under sites/v2
  fitcheck.mjs                     print + screen fit check and 16px floor
  client/<slug>/index.template.html + client/<slug>/chapters/*.html   (same mechanism)
```

- **Edit only your partial** (and its `.js`/`.css`). Never edit `index.html`: it is generated.
- A partial holds only `<section class="slide" ...>` blocks. Every section needs `id` (unique across the page), `data-chapter`, and a short `data-title` (it becomes the PDF page footer).
- Chapter ids for the main site: `opening proof fintech galactica client people gtm appendix ask`. The bar's order and labels are in `data-chapters` on `.c-path` in the template. An empty chapter shows dimmed.
- Client decks use `opening problem proof demo pilot next` (see their templates). In client partials, data and shared paths start with `../../` (e.g. `../../data/fintech_judged.json`).
- Per-chapter JS: wrap in an IIFE, look up your own element ids, return early if missing. Fetch data with paths relative to the page (`data/...` main site, `../../data/...` client decks).

Loop:
```bash
python3 sites/v2/build.py
PW=/opt/homebrew/lib/node_modules/playwright/node_modules/playwright-core node sites/v2/fitcheck.mjs http://127.0.0.1:7950/v2/
node sites/pdf.mjs http://127.0.0.1:7950/v2/ sites/v2/v2.pdf
node sites/pdf.mjs http://127.0.0.1:7950/v2/client/fintech/ sites/v2/client/fintech/fintech.pdf   # same for lab, fireworks
```
`fitcheck.mjs` fails any slide that overflows its 16:9 print page (1280×720), or 1600×1000 / 390×844 in present mode, or has text under its floor: 15px print, 18px present (1600×1000), 14px phone. It must print `all slides fit` before you hand back.

## 2. Locked identity

- **Ground** white `#FFFFFF`; **ink** `#0B0B0B`, secondary `#4A4A4A`, never lighter than `#6B6B6B` for text. Chapter dividers are black slides (`.c-chapter`).
- **Type**: Archivo 800 (tight, slightly narrow) for headlines and big numbers · Instrument Sans for body and labels · JetBrains Mono for numbers, dates, sources. Sizes come from tokens in `v2.css` (`--t-min/label/foot/small/body/h2/num/big`, all vw-scaled; values at 1600 wide: 18/20/19/22/28/72/104/176) and spacing from `--s1..s5` (8/16/24/40/64). Content spans ~84% of the width (max 1440). Use the tokens, not px. Lists: five rows per slide at most.
- **Accent: signal orange**, defined once in the accent block at the top of `v2.css`:
  - `--accent #FF4A12`: fills, rules, thumbs, highlighted bars and boxes
  - `--accent-ink #C83A08`: small accent marks on white
  - `--accent-fill`: backgrounds, can be a gradient
  - `--on-accent #FFF`: text placed on an accent fill
  - `--accent-text`: emphasis inside large headlines (`<em>` and `.acc`)
  - `--accent-on-dark`: the accent on black dividers
  Never use a hex colour for the accent in a partial; use these tokens. A gold swap is written out in the comment there (and sets `--accent-text` to ink and `--on-accent` to black).
- **Keenable blue** appears only inside Keenable's logo and screenshots.
- **One idea per slide**: headline ≤ 10 words and states the takeaway; ≤ 25 words of body; one component; one `.foot` with the source. No "honest", no hype adjectives.
- **PROOF letters (final)**: P Pick the query that hurts, and the bar it must clear · R Run it in their harness · O Open the evidence · O Order: size the deal · F Fan out, and feed back. The gate lives in P, so P is the highlighted box.

## 3. Components

### c-hero
```html
<section class="slide c-hero" id="hero" data-chapter="opening" data-title="Opening">
  <div class="inner">
    <p class="eyebrow">George Trushevskiy · Founding GTM · Keenable</p>
    <h1 data-reveal>I sell search the way labs buy it: <em>on their queries.</em></h1>
    <p class="lede" data-reveal>One line, 15 words or fewer.</p>
    <div class="cta" data-reveal><a class="btn accent" href="#proof">See the method</a><button class="btn ghost" data-present-toggle>Present (P)</button></div>
  </div>
</section>
```
`<em>` in a headline renders upright in `--accent-text` (orange now; ink if the accent is swapped to gold). The CTA row is hidden in print.

### c-chapter (black divider, one per chapter)
```html
<section class="slide c-chapter" id="fintech" data-chapter="fintech" data-title="Fintech">
  <div class="inner">
    <p class="eyebrow">Example · Fintech heads of data</p>
    <h2 data-reveal>Search with a clock, for backtests.</h2>
    <div class="steps" aria-hidden="true"><b>P</b><b>R</b><b>O</b><b>O</b><b>F</b></div>
  </div>
</section>
```
`<b>` letters are accent, `<span>` letters are dim. Light only the letters the chapter covers.

### c-step (ProofStep: big letter left, one visual right)
```html
<section class="slide c-step" id="fx-p" data-chapter="fintech" data-title="P · 33 of 60 state the outcome">
  <div class="inner">
    <div class="letter" aria-hidden="true">P<small>Pick the query that hurts</small></div>
    <div>
      <h2 data-reveal>33 of 60 results already state the outcome.</h2>
      <p class="lede" data-reveal>One line.</p>
      <!-- optional: one compact component (c-gate, small c-compare) -->
      <p class="foot">Source: <a class="src" href="data/fintech_judged.json">data/fintech_judged.json</a></p>
    </div>
  </div>
</section>
```

### c-big (BigNumber)
```html
<section class="slide c-big" id="zero" data-chapter="fintech" data-title="0 of 60 after the cutoff">
  <div class="inner">
    <p class="eyebrow">The leak test</p>
    <h2 data-reveal>No result came from after the cutoff.</h2>
    <div class="big" data-reveal><span data-count="0">0</span><span class="of">/60</span></div>
    <p class="big-label" data-reveal>results acquired after the cutoff with <code>query_time</code></p>
    <p class="foot">Caveat. Source: <a class="src" href="data/fintech_judged.json">data/fintech_judged.json</a></p>
  </div>
</section>
```
The accent underline is automatic; wrap the hero digit in `<span class="acc">` to colour it. `data-count` counts up (`data-dec`, `data-prefix`, `data-suffix`).

### c-compare (2–3 columns)
```html
<div class="c-compare" style="--cols:3" data-reveal>
  <div><p class="k">No fence</p><p class="v">0.4<small>useful / top 10</small></p><p class="d"><b>87%</b> of results reveal the outcome</p></div>
  <div><p class="k">Publish-date filter</p><p class="v">0.6<small>useful / top 10</small></p><p class="d"><b>71%</b> of results reveal the outcome</p></div>
  <div class="us"><p class="k">Keenable query_time</p><p class="v">4.9<small>useful / top 10</small></p><p class="d"><b>0</b> results acquired after the cutoff</p></div>
</div>
```
`.us` = the winning column (accent bar, tint, accent number). On phones the columns stack and `<small>` hides, so put the unit in the eyebrow too.

### c-diagram
`<figure class="c-diagram">` with `svg.land` (viewBox 1200 wide, left to right) and `svg.portrait` (viewBox 360 wide, top to bottom, used under 600px). Inside: `rect.box` / `rect.box.hl` (one accent box; add `.hl` to its texts), `text.letter`, `text.lab` (21px, max ~15 characters per line in a 214-wide box), `text.sub` (mono), `path.arrow` / `path.arrow.hl` (draws in). Marker ids must be unique per page: copy `#proof` in `chapters/10-proof.html` and rename `chev*`. Max 5 boxes, 6 arrows.

### c-chart (one chart)
```html
<figure class="c-chart" data-reveal>
  <div id="ccChart" data-label="What it shows"></div>
  <figcaption>One line. Source: <a class="src" href="data/charts/opt1_cc_overlap.json">opt1_cc_overlap.json</a></figcaption>
</figure>
```
Draw it in your chapter JS with `KC.bar/line/scatter/funnel/hist` (shared/charts.js). Highlighted data (`hl: true`) uses `--accent`; pass `color: "rgba(11,11,11,.16)"` for context bars. Max 6 categories; use shorter labels when `host.clientWidth < 600` (see `chapters/30-galactica.js`).

### c-ix (interactive, with a printed state)
```html
<figure class="c-ix" data-ix="slider">
  <span class="ix-badge screen-only"><i></i><span>Try this · drag</span></span>
  <span class="ix-badge print-only"><i></i><span>Printed state · live on the web</span></span>
  <div class="screen-only">
    <p class="ix-how"><b>Drag the dot</b> across six market events.</p>
    <input id="cut" type="range" min="0" max="5" step="1" value="0" aria-label="Market event">
    <div class="ticks" aria-hidden="true"><span>A</span>…</div>
    <output class="ix-out" for="cut" id="cutOut"></output>   <!-- .ev + .m + .m.us -->
  </div>
  <div class="print-only" id="cutPrint"></div>                <!-- the one frame that makes the point -->
</figure>
```
v2.js adds a 1.5s pulse when the slide enters, `data-noswipe`, and changes the badge to "You moved it" after the first input. Set `--p` on the range to fill the track. The printed state is the strongest example, never the default position (see `chapters/20-fintech.js`: it reads `data/fence_relevance.json` per event and fence). One control per slide.

### c-gate (pass/fail line)
```html
<div class="c-gate" data-reveal>
  <div class="line"><b>PASS IF</b> acquired after cutoff = 0<br><b>AND</b> served text after cutoff = 0</div>
  <div class="meta"><span>200 events · 2 weeks · $0</span><span>agreed: <span class="placeholder">date</span></span><span>owner: <span class="placeholder">buyer</span></span></div>
</div>
```

### c-quote
```html
<blockquote class="c-quote" data-reveal><p>"Quote, 30 words or fewer."</p><cite>Name, role, company</cite></blockquote>
```

### c-close
```html
<section class="slide c-close" id="ask" data-chapter="ask" data-title="The ask">
  <div class="inner">
    <p class="eyebrow">The first step</p>
    <h2 data-reveal>Send me one team's 50 queries. <em>Verdict memo in 48 hours.</em></h2>
    <a class="url" href="https://george.trusynth.com" data-reveal>george.trusynth.com</a>
  </div>
</section>
```

### Helpers
- `.placeholder` prints a TO FILL tag: use it for anything not yet sourced.
- `.mark` puts an accent highlighter behind ink text.
- `.screen-only` / `.print-only` switch content between the web and the PDF.
- `.foot` + `a.src`: one source line per slide, `--t-foot`.

## 4. Print
Print CSS in v2.css sets each slide to one 13.333×7.5 in page (1280×720 CSS px). It hides the top bar, stops motion, uses the landscape diagram, shows `.print-only` states and sets fixed print sizes for each component. Fit is checked, not assumed: run `fitcheck.mjs`.
