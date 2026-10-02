(() => {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  fetch("data/public_people.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => {
    document.querySelectorAll(".pp-list[data-group]").forEach(ol => {
      let list = (d[ol.dataset.group] || []).slice();
      // canonical first five (research/first5_canonical.md): NVIDIA + Hugging Face count as one account (deal signed 2 Sep 2026, pending)
      if (ol.dataset.group === "galactica") {
        list = list.map(t => t.company === "AI21 Labs" ? Object.assign({}, t, { company: "AI21 Labs · expansion", path: "On Keenable’s “In production” strip: ask Andrey who owns it." }) : t);
        list = list.map(t => t.company === "Hugging Face" ? Object.assign({}, t, { company: "NVIDIA + Hugging Face", person: t.person + " · Markus Kliegl", role: t.role + " · Nemotron-CC, NVIDIA", path: t.path + " (von Werra) · Kliegl cold" }) : t);
        const order = ["NVIDIA + Hugging Face", "DatologyAI", "Arcee AI", "Microsoft AI", "AI21 Labs · expansion"];
        list.sort((a, b) => order.indexOf(a.company) - order.indexOf(b.company));
      }
      ol.innerHTML = list.map(t => `<li>
        <div><div class="co">${esc(t.company)}</div><div class="nm">${esc(t.person)}</div><div class="rl">${esc(t.role)}</div></div>
        <div><div class="wy">${esc(t.why)}</div><div class="pa">${esc(t.path)}</div></div></li>`).join("");
    });
    const n = d.network || {}, f = x => Number(x).toLocaleString("en-US");
    if (n.relevant_people) document.getElementById("ppRel").textContent = f(n.relevant_people);
    if (n.accounts) document.getElementById("ppAcc").textContent = f(n.accounts);
    if (n.first_degree) document.getElementById("ppFirst").textContent = f(n.first_degree);
  }).catch(() => {
    document.querySelectorAll(".pp-list[data-group]").forEach(ol => { ol.innerHTML = "<li>Could not load data/public_people.json</li>"; });
  });
})();
