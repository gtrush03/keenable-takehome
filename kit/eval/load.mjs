// Loads a query set from JSONL or CSV into one normalised shape:
//   { id, query, expected_domains[], expected_regex, regex_strength ("fact"|"topic"), query_time, gold_answer, leak_regex, segment }
// CSV: header row required; list fields (expected_domains) split on ";" or "|"; RFC 4180 quoting.
import { readFileSync } from "node:fs";

export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const list = (v) => (Array.isArray(v) ? v : String(v || "").split(/[;|]/)).map((s) => String(s).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")).filter(Boolean);
const str = (v) => (v == null || v === "" ? null : String(v));

export function normalise(raw, i) {
  const query = str(raw.query ?? raw.q);
  if (!query) throw new Error(`row ${i + 1}: "query" is required`);
  const rec = {
    id: str(raw.id) || `q${String(i + 1).padStart(3, "0")}`,
    query,
    segment: str(raw.segment ?? raw.seg),
    expected_domains: list(raw.expected_domains ?? raw.gold),
    expected_regex: str(raw.expected_regex),
    regex_strength: raw.regex_strength === "topic" ? "topic" : "fact",
    query_time: str(raw.query_time),
    gold_answer: str(raw.gold_answer),
    leak_regex: str(raw.leak_regex),
    note: str(raw.note),
  };
  for (const k of ["expected_regex", "leak_regex"]) {
    if (rec[k]) try { new RegExp(rec[k], "i"); } catch (e) { throw new Error(`row ${i + 1} (${rec.id}): bad ${k}: ${e.message}`); }
  }
  if (rec.query_time && Number.isNaN(Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(rec.query_time) ? rec.query_time + "T00:00:00Z" : rec.query_time)))
    throw new Error(`row ${i + 1} (${rec.id}): query_time is not a date or ISO timestamp`);
  return rec;
}

export function loadQueries(path) {
  const text = readFileSync(path, "utf8");
  const rows = /\.csv$/i.test(path)
    ? parseCSV(text)
    : text.split(/\r?\n/).map((l, i) => [l.trim(), i]).filter(([l]) => l && !l.startsWith("//")).map(([l, i]) => { try { return JSON.parse(l); } catch (e) { throw new Error(`${path}:${i + 1}: ${e.message}`); } });
  const recs = rows.map(normalise);
  const dup = recs.map((r) => r.id).find((id, i, a) => a.indexOf(id) !== i);
  if (dup) throw new Error(`duplicate id: ${dup}`);
  return recs;
}
