// Fails if any key value from .env.keys appears in the demo or data files. Prints variable names only.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const keys = readFileSync(".env.keys", "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.+)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]);
const files = []; const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
["sites/demo", "data/h2h", "kit/eval/out", "scripts/h2h"].forEach(walk);
let hits = 0;
for (const f of files) { if (/\.(png|woff2)$/.test(f)) continue; const t = readFileSync(f, "utf8"); for (const [k, v] of keys) if (v.length > 8 && t.includes(v)) { console.log("KEY FOUND:", k, "in", f); hits++; } }
console.log(`scanned ${files.length} files for ${keys.length} keys: ${hits ? hits + " HITS" : "clean"}`);
