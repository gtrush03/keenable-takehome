// Small, dependency-free statistics used by the judge and the verdict.

// Nearest-rank percentile on a copy (p in 0..1). Returns null for an empty sample.
export function pct(a, p) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
}

// Wilson score interval for k successes out of n (95% by default).
export function wilson(k, n, z = 1.96) {
  if (!n) return [null, null];
  const p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

// Exact two-sided McNemar test on discordant pairs: b = A right & B wrong, c = A wrong & B right.
export function mcnemar(b, c) {
  const n = b + c;
  if (!n) return 1;
  const k = Math.min(b, c);
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += binom(n, i) * 0.5 ** n;
  return Math.min(1, 2 * tail);
}
function binom(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; }

export const r3 = (x) => (x == null || Number.isNaN(x) ? null : Math.round(x * 1000) / 1000);

// Seeded PRNG + shuffle so blinding is reproducible from the seed recorded in summary.json.
export function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
export function shuffle(a, rand) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
