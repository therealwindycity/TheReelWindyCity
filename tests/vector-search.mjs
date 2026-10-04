#!/usr/bin/env node
/** Schema + ranking smoke test for the compiled MiniLM civic index. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(ROOT, "src", "data", "transcript-vectors.json");

function dequantize(base64) {
  const bin = Buffer.from(base64, "base64");
  const vec = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) vec[i] = bin.readInt8(i) / 127;
  return vec;
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / Math.sqrt(na * nb);
}

function lexical(query, items, topK = 5) {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  return items
    .map((item) => {
      const hay = `${item.title ?? ""} ${item.text}`.toLowerCase();
      const hits = terms.filter((term) => hay.includes(term)).length;
      return { item, score: hits / terms.length };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

const index = JSON.parse(await readFile(INDEX, "utf8"));
if (index.model !== "Xenova/all-MiniLM-L6-v2") throw new Error(`Unexpected model ${index.model}`);
if (index.dims !== 384) throw new Error(`Unexpected dims ${index.dims}`);
if (index.itemCount !== index.items.length) throw new Error("itemCount does not match items.length");
if (index.items.length < 400) throw new Error(`Expected a compiled corpus, found ${index.items.length} items`);

let embedded = 0;
for (const item of index.items) {
  if (!item.id || !item.text || !item.sourceUrl || !item.kind || !item.meetingDate) {
    throw new Error(`Incomplete civic item ${item.id}`);
  }
  if (!item.embedding || typeof item.embedding !== "string") continue;
  const vec = dequantize(item.embedding);
  if (vec.length !== index.dims) throw new Error(`Bad vector length for ${item.id}`);
  const self = cosine(vec, vec);
  if (!(self > 0.99 && self < 1.01)) throw new Error(`Self-similarity ${self} for ${item.id}`);
  embedded += 1;
}

if (index.quantization === "int8" && embedded !== index.items.length) {
  throw new Error(`Expected every item to carry an int8 embedding, found ${embedded}/${index.items.length}`);
}

const ordinances = index.items.filter((item) => item.kind === "ordinance");
if (!ordinances.some((item) => item.id === "ordinance:2026-01-26-adu")) {
  throw new Error("Missing accessory-dwelling ordinance in the compiled index");
}

const jan26 = index.items.filter((item) => (item.path || "").includes("2026-01-26-city-council") || item.id.includes("2026-01-26"));
if (jan26.length < 50) throw new Error(`Expected timestamped January 26 chunks, found ${jan26.length}`);

const warrantHits = lexical("administrative inspection warrants", index.items, 3);
if (!warrantHits.some((row) => /warrant/i.test(row.item.title || "") || /warrant/i.test(row.item.text))) {
  throw new Error("Lexical search did not recover inspection-warrant records");
}

console.log(
  `PASS: ${index.items.length} civic records, ${embedded} MiniLM int8 vectors, ` +
    `${jan26.length} January 26 items, warrant lexical hit “${warrantHits[0].item.title}”`,
);
