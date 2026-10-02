// Local preview: http://127.0.0.1:7950/<site>/  (galactica, fintech)
// Per site, /<site>/shared → sites/shared, /<site>/assets → assets/keenable, /<site>/data → data, /<site>/media → assets
import { join, normalize } from "node:path";
const ROOT = join(import.meta.dir, "..");
const SITES = ["galactica", "fintech", "v2"];
const map = (site: string, rest: string) => {
  const [head, ...tail] = rest.split("/"); const t = tail.join("/");
  if (head === "shared") return join(ROOT, "sites/shared", t);
  if (head === "assets") return join(ROOT, "assets/keenable", t);
  if (head === "data") return join(ROOT, "data", t);
  if (head === "research") return join(ROOT, "research", t);
  if (head === "drafts") return join(ROOT, "drafts", t);
  return join(ROOT, "sites", site, rest || "index.html");
};
Bun.serve({
  hostname: "127.0.0.1", port: 7950,
  async fetch(req) {
    const u = new URL(req.url); let p = decodeURIComponent(u.pathname);
    if (p === "/") return new Response(Bun.file(join(ROOT, "sites/hub.html")));
    const [, site, ...rest] = p.split("/");
    if (!SITES.includes(site)) return new Response("not found", { status: 404 });
    if (rest.length === 0) return Response.redirect(`/${site}/`, 301);
    let f = normalize(map(site, rest.join("/")));
    if (!f.startsWith(ROOT)) return new Response("no", { status: 403 });
    if (f.endsWith("/")) f += "index.html";
    const file = Bun.file(f);
    if (!(await file.exists())) return new Response("not found: " + p, { status: 404 });
    // HTTP Range for media, so <video> can seek
    const range = req.headers.get("range"), m = range && /\.(mp4|webm|mov|m4a|mp3)$/.test(f) ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
    if (m && (m[1] || m[2])) {
      const size = file.size;
      let start = m[1] ? +m[1] : Math.max(0, size - +m[2]), end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
      if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
      return new Response(file.slice(start, end + 1), { status: 206, headers: { "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes", "content-length": String(end - start + 1), "content-type": file.type, "cache-control": "no-store" } });
    }
    return new Response(file, { headers: { "cache-control": "no-store", "accept-ranges": "bytes" } });
  },
});
console.log("keenable sites on http://127.0.0.1:7950/");
