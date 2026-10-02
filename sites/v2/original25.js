// Original 25 (George ruling #20): its two requirement tables list the brief's detailed lines from toc/brief-map.json.
// Table "a" = Option 2 lines; table "b" = Option 1 lines plus the general ones. Same columns as the main flow's table.
(() => {
  const a = document.querySelector('[data-brief-rows="a"]'), b = document.querySelector('[data-brief-rows="b"]');
  if (!a && !b) return;
  const PRIVATE = /li_network|li_outreach|data\/li\/|_g5|\/g5\/|candidacy|drafts\/|goals\/|chief|\.env|memory-sweep|review_|audit_/;
  const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const num = id => { const s = window.Deck ? Deck.slides : [...document.querySelectorAll("section.slide")]; const i = s.findIndex(x => x.id === id); return i < 0 ? 0 : i + 1; };
  const row = r => {
    const sl = [r.slide, ...(r.slides || [])].filter(Boolean), sid = sl.find(num) || sl[0], n = num(sid);
    const pf = (r.proof || []).find(x => x.href && !PRIVATE.test(x.href)), part = r.status === "partly";
    const go = n ? `<a href="#${esc(sid)}">${n}</a>` : sid ? `<a href="full.html#${esc(sid)}" title="In the Extended version">Ext.</a>` : "";
    return `<tr${part ? ' class="partly"' : ""}><td>${esc(r.requirement)}</td><td>${part ? '<span class="pt" title="Partly done">◐</span> ' : ""}${esc(r.answer)}</td><td>${pf ? `<a class="src" href="${esc(pf.href)}" title="${esc(pf.label)}" target="_blank" rel="noopener">proof ↗</a>` : ""}</td><td>${go}</td></tr>`;
  };
  fetch("toc/brief-map.json").then(r => r.json()).then(rows => {
    if (a) a.innerHTML = rows.filter(r => r.id.startsWith("o2-")).map(row).join("");
    if (b) b.innerHTML = rows.filter(r => !r.id.startsWith("o2-")).map(row).join("");
  }).catch(() => {});
})();
