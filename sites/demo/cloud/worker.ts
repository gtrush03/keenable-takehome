// Keenable Time Machine demo — Cloudflare Worker (static assets + one API route).
//   POST /api/own {q, cutoff, words}  → the same query three ways on Keenable: no fence, published_before, query_time.
// The Keenable key is a Worker secret (KEENABLE_API_KEY); it never reaches the browser.
// Abuse guard: per-IP hourly limit + a global daily cap, counted in KV (RL). Over the limit → a designed message, no call.
export interface Env { ASSETS: Fetcher; RL: KVNamespace; KEENABLE_API_KEY: string }

const PER_IP_HOUR = 30;
const PER_DAY = 300;
const MODES = [
  { id: "nofence", label: "No fence", body: (cut: string) => ({}) },
  { id: "pubdate", label: "Published-date filter", body: (cut: string) => ({ published_before: dayBefore(cut) }) },
  { id: "query_time", label: "query_time", body: (cut: string) => ({ query_time: cut }) },
] as const;

const dayBefore = (d: string) => new Date(Date.parse(d + "T00:00:00Z") - 864e5).toISOString().slice(0, 10);
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex" } });
const page = (title: string, msg: string, status = 404) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · George’s Keenable take-home</title><body style="margin:0;background:#fff;color:#2A2A2A;font:300 16px/1.5 ui-sans-serif,system-ui,sans-serif"><div style="max-width:560px;margin:18vh auto;padding:0 24px"><img src="/keenable-wordmark-ink.svg" alt="Keenable" style="height:22px"><h1 style="font-weight:300;font-size:32px;letter-spacing:-.02em;margin:28px 0 8px">${title}</h1><p style="color:#646464">${msg}</p><p><a href="/" style="color:#005CFF">Back to the demo →</a></p><p style="font-size:12.5px;color:#8D8D8D;margin-top:40px">A take-home by George Trushevskiy for Keenable. Not an official Keenable site.</p></div>`, { status, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } });

async function bump(env: Env, key: string, ttl: number) {
  const n = Number((await env.RL.get(key)) || 0);
  try { await env.RL.put(key, String(n + 1), { expirationTtl: ttl }); } catch { /* KV write limits: count is best-effort */ }
  return n;
}

async function keenable(env: Env, q: string, extra: Record<string, string>) {
  const t0 = Date.now();
  const r = await fetch("https://api.keenable.ai/v1/search", {
    method: "POST",
    headers: { "content-type": "application/json", "X-API-Key": env.KEENABLE_API_KEY },
    body: JSON.stringify({ query: q, mode: "pro", max_results: 10, snippet_max_length: 300, ...extra }),
    signal: AbortSignal.timeout(25000),
  });
  const text = await r.text();
  let j: any = null; try { j = JSON.parse(text); } catch {}
  if (!r.ok) throw new Error(r.status === 429 ? "Keenable is rate-limiting this demo right now." : `Keenable answered ${r.status}.`);
  return { ms: Date.now() - t0, results: (j?.results || []) as any[] };
}

async function own(req: Request, env: Env) {
  const b: any = await req.json().catch(() => ({}));
  const q = String(b.q || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const cutoff = String(b.cutoff || "");
  const words = String(b.words || "").split(/[,;\n]/).map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 2).slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (q.length < 3) return json({ ok: false, error: "Type a question first, for example “Will SVB fail?”." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff) || isNaN(Date.parse(cutoff)) || cutoff < "2000-01-01" || cutoff > today) return json({ ok: false, error: "Pick a cutoff date in the past." });
  if (!env.KEENABLE_API_KEY) return json({ ok: false, error: "The live search key is not set on this deployment. The recorded test still works." });

  const ip = req.headers.get("cf-connecting-ip") || "anon";
  const hour = new Date().toISOString().slice(0, 13), day = today;
  const [nIp, nDay] = await Promise.all([bump(env, `ip:${ip}:${hour}`, 7200), bump(env, `day:${day}`, 172800)]);
  if (nIp >= PER_IP_HOUR) return json({ ok: false, limited: true, error: `That’s ${PER_IP_HOUR} runs from you this hour, the limit for this public demo. Try again next hour, or open “Our test” for the recorded run.` });
  if (nDay >= PER_DAY) return json({ ok: false, limited: true, error: "This demo has hit its daily run cap. Open “Our test” for the full recorded run, or come back tomorrow." });

  const cut = Date.parse(cutoff + "T00:00:00Z");
  const rx = words.length ? new RegExp(`\\b(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "i") : null;
  const out = await Promise.all(MODES.map(async (m) => {
    try {
      const r = await keenable(env, q, m.body(cutoff));
      const results = r.results.slice(0, 10).map((x: any) => {
        const text = `${x.title || ""} ${x.snippet || x.description || ""}`;
        const acq = x.acquired_at && !isNaN(Date.parse(x.acquired_at)) ? Date.parse(x.acquired_at) : null;
        const hit = rx ? text.match(rx) : null;
        return {
          t: String(x.title || x.url || "").slice(0, 160), u: x.url, h: host(x.url), s: String(x.snippet || x.description || "").replace(/\s+/g, " ").slice(0, 240),
          acq: x.acquired_at || null, pub: x.published_at || null,
          after: acq != null && acq >= cut, word: hit ? hit[1] : null,
        };
      });
      return { id: m.id, label: m.label, ok: true, ms: r.ms, results, after: results.filter((x) => x.after).length, words: results.filter((x) => x.word).length, n: results.length };
    } catch (e: any) {
      return { id: m.id, label: m.label, ok: false, error: String(e?.message || "The search did not answer in time.").slice(0, 160) };
    }
  }));
  return json({ ok: true, q, cutoff, words, at: new Date().toISOString(), modes: out, left_this_hour: Math.max(0, PER_IP_HOUR - nIp - 1) });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/api/own") {
      if (req.method !== "POST") return page("This is the demo’s search endpoint", "It answers the page, not the browser bar.", 405);
      try { return await own(req, env); } catch { return json({ ok: false, error: "Something went wrong on our side. Try again in a moment." }, 200); }
    }
    if (url.pathname.startsWith("/api/")) {
      // The recorded test page probes /api/status for a live server; in the cloud it runs in replay mode.
      if (req.headers.get("accept")?.includes("text/html")) return page("Not here", "The live multi-provider runner only runs on the presenter’s machine. The recorded run works everywhere.");
      return json({ live: false }, 404);
    }
    const res = await env.ASSETS.fetch(req);
    if (res.status === 404) return page("Not found", "That page isn’t part of this demo.");
    const h = new Headers(res.headers); h.set("x-robots-tag", "noindex, nofollow");
    return new Response(res.body, { status: res.status, headers: h });
  },
};
