// Lab deck: the timestamp cut. Split the 500 measured pages by Keenable acquired_at at a cutoff month T:
// train slice (acquired <= T), held-out eval window (acquired > T), and the eval window's share in no 2026 CC crawl.
(() => {
  const cut = document.getElementById("labCut"); if (!cut) return;
  const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];
  const NAME = { "2026-04": "Apr", "2026-05": "May", "2026-06": "Jun", "2026-07": "Jul", "2026-08": "Aug" };
  const PRINTED = "2026-06"; // a mid-year cutoff: a big train slice and a big eval window
  fetch("../../data/cc_overlap.json").then(r => r.json()).then(d => {
    const rows = d.rows.filter(r => r.acquired_at);
    const at = (T) => {
      const ev = rows.filter(r => r.acquired_at.slice(0, 7) > T), out = ev.filter(r => !r.in_2026).length;
      return { T, train: rows.length - ev.length, ev: ev.length, pct: Math.round(out / ev.length * 100) };
    };
    const html = (x) => `<div class="ev">Cutoff: end of ${NAME[x.T]} 2026<small>train on pages acquired by then; evaluate on the rest</small></div>` +
      `<div class="m">${x.train}<small>pages in the train slice</small></div>` +
      `<div class="m">${x.ev}<small>pages in the eval window</small></div>` +
      `<div class="m us">${x.pct}%<small>of the eval window in no 2026 Common Crawl</small></div>`;
    document.getElementById("labCutTicks").innerHTML = MONTHS.map(m => `<span>${NAME[m]}</span>`).join("");
    const render = () => { cut.style.setProperty("--p", (cut.value / cut.max * 100) + "%"); document.getElementById("labCutOut").innerHTML = html(at(MONTHS[+cut.value])); };
    cut.addEventListener("input", render); render();
    document.getElementById("labCutPrint").innerHTML = `<div class="ix-out">${html(at(PRINTED))}</div><p class="ix-printed-note">Printed state: cutoff end of June 2026. On the web, drag April to August.</p>`;
  }).catch(() => {
    const msg = `<p class="ix-printed-note">Could not load cc_overlap.json, so the cut cannot be computed here. Recorded: June cutoff, 170 train / 330 eval pages, 76% in no 2026 Common Crawl.</p>`;
    document.getElementById("labCutOut").innerHTML = msg; document.getElementById("labCutPrint").innerHTML = msg; cut.disabled = true;
  });
})();
