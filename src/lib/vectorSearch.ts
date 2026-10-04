/**
 * Client-side civic RAG engine.
 *
 * Document vectors are precomputed by `scripts/embed-transcripts.mjs` into
 * `transcript-vectors.json` (derived from transcript-tree.json). The browser
 * only has to embed the query, via Transformers.js + WASM.
 *
 * If the compiled index has no embeddings (the offline script could not reach
 * Hugging Face), this module embeds the corpus once in the browser and caches
 * the vectors in IndexedDB so later visits stay instant.
 */
import { asset, githubUrl, rawUrl, TRANSCRIPT_REPO } from "@/lib/civic-data";
import { sourceContentUrl } from "@/lib/source-content";
import type { SourceDocument } from "@/components/source-library";

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMS = 384;

export type CivicKind = "transcript" | "ordinance" | "meeting";

export interface CivicItem {
  id: string;
  text: string;
  meetingDate: string;
  sourceUrl: string;
  timestamp?: string;
  meetingId?: string;
  kind: CivicKind;
  title?: string;
  repo?: string;
  path?: string;
  videoUrl?: string;
  /** Base64-encoded int8 unit vector, or a float array. */
  embedding?: string | number[];
}

export interface VectorIndex {
  model: string;
  dims: number;
  quantization: "int8" | "none";
  sourceTreeSha: string;
  generatedAt: string;
  itemCount: number;
  items: CivicItem[];
}

export interface SearchHit extends CivicItem {
  confidenceScore: number;
}

type FeatureExtractor = (
  text: string,
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: ArrayLike<number> }>;

let embedPipeline: FeatureExtractor | null = null;
let pipelinePromise: Promise<FeatureExtractor> | null = null;
let indexPromise: Promise<VectorIndex> | null = null;
let runtimeVectors: Float32Array[] | null = null;

const IDB_NAME = "civic-cheyenne-vectors";
const IDB_STORE = "embeddings";

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

export function dequantizeInt8(base64: string): Float32Array {
  const binary = atob(base64);
  const vec = new Float32Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    let value = binary.charCodeAt(i);
    if (value > 127) value -= 256;
    vec[i] = value / 127;
  }
  return vec;
}

export function decodeEmbedding(embedding: string | number[] | undefined): Float32Array | null {
  if (!embedding) return null;
  if (Array.isArray(embedding)) return Float32Array.from(embedding);
  if (typeof embedding === "string" && embedding.length > 0) return dequantizeInt8(embedding);
  return null;
}

async function configureEnv() {
  const { env } = await import("@xenova/transformers");
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.numThreads = 1;
  }
}

/** Load the quantized MiniLM feature extractor in the browser (WASM). */
export async function initEmbeddingModel(): Promise<FeatureExtractor> {
  if (embedPipeline) return embedPipeline;
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      await configureEnv();
      const { pipeline } = await import("@xenova/transformers");
      const extractor = await pipeline("feature-extraction", EMBEDDING_MODEL, { quantized: true });
      embedPipeline = extractor as FeatureExtractor;
      return embedPipeline;
    })();
  }
  try {
    return await pipelinePromise;
  } catch (error) {
    pipelinePromise = null;
    throw error;
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const extractor = await initEmbeddingModel();
  const clipped = text.replace(/\s+/g, " ").trim().slice(0, 1100);
  const output = await extractor(clipped, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

export function localSemanticSearch(
  queryEmbedding: ArrayLike<number>,
  dataset: CivicItem[],
  vectors: Array<Float32Array | null>,
  topK = 5,
): SearchHit[] {
  const scored = dataset.map((item, index) => {
    const vector = vectors[index];
    const score = vector ? cosineSimilarity(queryEmbedding, vector) : 0;
    return { item, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ item, score }) => ({ ...item, confidenceScore: score }));
}

export function lexicalSearch(query: string, dataset: CivicItem[], topK = 5): SearchHit[] {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const scored = dataset.map((item) => {
    const hay = `${item.title ?? ""} ${item.text} ${item.meetingDate}`.toLowerCase();
    let hits = 0;
    let weight = 0;
    for (const term of terms) {
      if (hay.includes(term)) {
        hits += 1;
        weight += term.length;
      }
    }
    const score = hits / terms.length + weight / 400;
    return { item, score };
  });
  return scored
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ item, score }) => ({ ...item, confidenceScore: Math.min(0.99, score) }));
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2);
}

export async function loadVectorIndex(): Promise<VectorIndex> {
  if (!indexPromise) {
    indexPromise = (async () => {
      const response = await fetch(asset("data/transcript-vectors.json"));
      if (!response.ok) {
        throw new Error("The compiled semantic index is unavailable. Run npm run data:embed.");
      }
      const data = (await response.json()) as VectorIndex;
      if (!Array.isArray(data.items)) throw new Error("Semantic index is malformed.");
      return data;
    })();
  }
  return indexPromise;
}

function itemVector(item: CivicItem): Float32Array | null {
  return decodeEmbedding(item.embedding);
}

export function indexHasEmbeddings(index: VectorIndex): boolean {
  return index.items.some((item) => Boolean(item.embedding));
}

async function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbRead(key: string): Promise<ArrayBuffer[] | null> {
  try {
    const db = await openIdb();
    if (!db) return null;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as ArrayBuffer[] | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbWrite(key: string, buffers: ArrayBuffer[]): Promise<void> {
  try {
    const db = await openIdb();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(buffers, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Private-mode browsers can refuse IndexedDB; semantic search still works in-memory.
  }
}

/**
 * Resolve a Float32 vector per corpus item: compiled int8 embeddings, then
 * IndexedDB, then on-device MiniLM (cached after the first run).
 */
export async function ensureDocumentEmbeddings(
  index: VectorIndex,
  onProgress?: (done: number, total: number) => void,
): Promise<Array<Float32Array | null>> {
  if (runtimeVectors && runtimeVectors.length === index.items.length) return runtimeVectors;

  const compiled = index.items.map(itemVector);
  if (compiled.every((vector) => vector && vector.length === (index.dims || EMBEDDING_DIMS))) {
    runtimeVectors = compiled as Float32Array[];
    return runtimeVectors;
  }

  const cacheKey = `${index.sourceTreeSha}:${index.generatedAt}:${index.itemCount}`;
  const cached = await idbRead(cacheKey);
  if (cached && cached.length === index.items.length) {
    runtimeVectors = cached.map((buffer) => new Float32Array(buffer));
    return runtimeVectors;
  }

  const vectors: Array<Float32Array | null> = compiled.slice();
  const missing = vectors.reduce((count, vector) => count + (vector ? 0 : 1), 0);
  if (!missing) {
    runtimeVectors = vectors as Float32Array[];
    return runtimeVectors;
  }

  let done = index.items.length - missing;
  onProgress?.(done, index.items.length);
  for (let i = 0; i < index.items.length; i++) {
    if (vectors[i]) continue;
    const values = await generateEmbedding(index.items[i].text);
    vectors[i] = Float32Array.from(values);
    done += 1;
    if (done % 4 === 0 || done === index.items.length) onProgress?.(done, index.items.length);
  }
  runtimeVectors = vectors as Float32Array[];
  await idbWrite(
    cacheKey,
    runtimeVectors.map((vector) => {
      const copy = new Float32Array(vector);
      return copy.buffer as ArrayBuffer;
    }),
  );
  return runtimeVectors;
}

/**
 * Embed only a candidate subset (used when the compiled JSON has no MiniLM
 * vectors). Avoids running the WASM model over the entire corpus on first search.
 */
export async function embedCandidates(
  items: CivicItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<Array<Float32Array | null>> {
  const vectors: Array<Float32Array | null> = [];
  for (let i = 0; i < items.length; i++) {
    const compiled = decodeEmbedding(items[i].embedding);
    if (compiled) {
      vectors.push(compiled);
    } else {
      vectors.push(Float32Array.from(await generateEmbedding(items[i].text)));
    }
    if (i === items.length - 1 || (i + 1) % 4 === 0) onProgress?.(i + 1, items.length);
  }
  return vectors;
}

export async function semanticSearch(query: string, topK = 5): Promise<SearchHit[]> {
  const index = await loadVectorIndex();
  const lexical = lexicalSearch(query, index.items, Math.max(topK, 40));
  const queryVector = await generateEmbedding(query);
  if (indexHasEmbeddings(index)) {
    const vectors = await ensureDocumentEmbeddings(index);
    const semantic = localSemanticSearch(queryVector, index.items, vectors, topK);
    return mergeHits(semantic, lexical.slice(0, topK), topK);
  }
  const candidates = lexical.length ? lexical : index.items.slice(0, 40);
  const vectors = await embedCandidates(candidates);
  const semantic = localSemanticSearch(queryVector, candidates, vectors, topK);
  return mergeHits(semantic, lexical.slice(0, topK), topK);
}

function mergeHits(semantic: SearchHit[], lexical: SearchHit[], topK: number): SearchHit[] {
  const byId = new Map<string, SearchHit>();
  for (const hit of semantic) byId.set(hit.id, hit);
  for (const hit of lexical) {
    const existing = byId.get(hit.id);
    if (!existing) {
      byId.set(hit.id, { ...hit, confidenceScore: Math.min(hit.confidenceScore, 0.62) });
    } else {
      existing.confidenceScore = Math.min(1, existing.confidenceScore + 0.04);
    }
  }
  return [...byId.values()].sort((a, b) => b.confidenceScore - a.confidenceScore).slice(0, topK);
}

export function hitToDocument(hit: SearchHit): SourceDocument {
  if (hit.repo && hit.path) {
    return {
      title: hit.title || hit.path.split("/").pop() || "Transcript",
      kind: "text",
      url: sourceContentUrl(hit.repo, hit.path),
      originalUrl: githubUrl(hit.repo, hit.path),
      downloadUrl: rawUrl(hit.repo, hit.path),
      repo: hit.repo,
      path: hit.path,
      warning:
        "Auto-generated captions can contain errors, particularly names. Verify quotations against the official meeting video.",
    };
  }
  return {
    title: hit.title || "Public record",
    kind: "document",
    url: hit.sourceUrl,
    originalUrl: hit.sourceUrl,
    downloadUrl: hit.sourceUrl,
    external: true,
  };
}

export function defaultSourceUrl(path: string): string {
  return githubUrl(TRANSCRIPT_REPO, path);
}
