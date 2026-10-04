#!/usr/bin/env node
/**
 * Offline compiler for Civic Cheyenne's client-side semantic search index.
 *
 * Reads transcript-tree.json (GitHub tree snapshot), pulls transcript text
 * (local jan-26 file, plus other files via `gh api` when available), chunks
 * timestamped captions, mixes in ordinances and recent meetings, then writes
 * src/data/transcript-vectors.json + public/data/transcript-vectors.json.
 *
 * Each chunk is embedded with all-MiniLM-L6-v2 and stored as a compact int8
 * vector so browsers only embed the query. Weights are loaded from a local
 * GitHub mirror (no Hugging Face required); Xenova/HF is a fallback. If the
 * model still cannot load, the compiled corpus is written without vectors and
 * the browser indexes it locally on first search.
 *
 * Usage:
 *   node scripts/embed-transcripts.mjs
 *   node scripts/embed-transcripts.mjs --skip-remote
 *   node scripts/embed-transcripts.mjs --limit 40
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DATA = path.join(ROOT, "src", "data");
const PUBLIC_DATA = path.join(ROOT, "public", "data");
const CACHE_DIR = path.join(ROOT, ".cache", "transcripts");
const MODEL_CACHE = path.join(ROOT, ".cache", "transformers");
const LOCAL_MODELS = path.join(ROOT, ".cache", "models");
const WEIGHTS_DIR = path.join(ROOT, ".cache", "minilm-weights");
const WEIGHTS_REPO = "https://github.com/sspcodeflix/textembedding-model-weights.git";
const OWNER = "therealwindycity";
const TRANSCRIPT_REPO = "The-Real-Windy-City-";
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const DIMS = 384;
const SKIP_REMOTE = process.argv.includes("--skip-remote");
const LIMIT_FLAG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_FLAG ? Number(LIMIT_FLAG.slice(8)) : Number(process.argv[process.argv.indexOf("--limit") + 1] || 0) || 0;

const ORDINANCES = [
  {
    id: "2026-01-26-adu",
    title: "Accessory dwelling units",
    meetingDate: "January 26, 2026",
    sourceUrl: "https://cheyenne.granicus.com/MetaViewer.php?view_id=5&event_id=1382&meta_id=145679",
    meetingId: "city-council-2026-01-26",
    text: "Accessory dwelling units. Amending 5.7.3 Accessory Dwelling Units of the Cheyenne Unified Development Code to remove owner-occupancy and adjust parking requirements for Accessory Dwellings. A proposed update to owner-occupancy and parking rules for accessory dwellings. Staff report describes about three ADU applications a year. Proposal would remove the owner-occupancy requirement and allow more flexible parking, including a third driveway stall or on-street parking. Approved on second reading January 26, 2026.",
  },
  {
    id: "2026-01-26-annexation",
    title: "East Cheyenne annexation",
    meetingDate: "January 26, 2026",
    sourceUrl: "https://cheyenne.granicus.com/MetaViewer.php?view_id=5&event_id=1382&meta_id=145674",
    meetingId: "city-council-2026-01-26",
    text: "East Cheyenne annexation. Annexing to the City of Cheyenne various tracts of land completely surrounded by current City limits situate in eastern Cheyenne, generally located south of Storey Boulevard, east of Powderhouse Road, north of Dell Range Boulevard, and west of Ridge Road. Bringing surrounded county tracts in eastern Cheyenne into city limits. Unanimous approval on second reading January 26, 2026.",
  },
  {
    id: "2026-01-26-displays",
    title: "Private displays on public land",
    meetingDate: "January 26, 2026",
    sourceUrl: "https://cheyenne.granicus.com/MetaViewer.php?view_id=5&event_id=1382&meta_id=145681",
    meetingId: "city-council-2026-01-26",
    text: "Private displays on public property. Creating Chapter 8.72, Private Displays on Public Property, to prohibit the unauthorized use of public property for specified private displays. Proposed rules for unauthorized private displays on public property. First reading referred to the Public Services Committee on January 26, 2026.",
  },
  {
    id: "2026-01-26-warrants",
    title: "Administrative inspection warrants",
    meetingDate: "January 26, 2026",
    sourceUrl: "https://cheyenne.granicus.com/MetaViewer.php?view_id=5&event_id=1382&meta_id=145727",
    meetingId: "city-council-2026-01-26",
    text: "Administrative inspection warrants. Creating Chapter 1.28, Administrative Inspection Warrants, establishing authority for their issuance, and authorizing certain city officials to apply for administrative inspection warrants. Public testimony raised Fourth Amendment and judicial oversight concerns. Postponed to February 9, 2026 rather than adopted at third reading.",
  },
  {
    id: "2026-01-26-zoning",
    title: "East Cheyenne zoning",
    meetingDate: "January 26, 2026",
    sourceUrl: "https://cheyenne.granicus.com/MetaViewer.php?view_id=5&event_id=1382&meta_id=145676",
    meetingId: "city-council-2026-01-26",
    text: "East Cheyenne zoning. Amending the Official Zoning Map of the City of Cheyenne, establishing AG Agricultural and MR Medium-Density Residential classifications for land annexed south of Storey Boulevard, east of Powderhouse Road, north of Dell Range Boulevard, and west of Ridge Road. Companion to the East Cheyenne annexation. Unanimous approval on second reading January 26, 2026.",
  },
];

function stubSharp() {
  const stub = Object.assign(function sharp() { return stub; }, { default: null });
  const load = Module._load;
  Module._load = function (request, parent, isMain) {
    const id = String(request);
    if (id === "sharp" || id.includes(`${path.sep}sharp${path.sep}`) || id.endsWith(`${path.sep}sharp`)) return stub;
    return load.apply(this, arguments);
  };
}

function githubBlob(repo, filePath) {
  return `https://github.com/${OWNER}/${repo}/blob/main/${filePath.split("/").map(encodeURIComponent).join("/")}`;
}

function dateLabel(iso) {
  if (!iso) return "Undated record";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function parseCues(markdown) {
  const cues = [];
  let current = null;
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\[(\d{2}:\d{2}:\d{2})\]\s*(.*)$/);
    if (match) {
      if (current) cues.push(current);
      current = { timestamp: match[1], text: match[2] };
    } else if (current && line.trim() && !line.startsWith("#") && !line.startsWith("- **") && !line.startsWith(">")) {
      current.text += ` ${line.trim()}`;
    }
  }
  if (current) cues.push(current);
  return cues;
}

function groupCues(cues, maxChars = 850) {
  const chunks = [];
  let buffer = null;
  for (const cue of cues) {
    const piece = cue.text.replace(/\s+/g, " ").trim();
    if (!piece) continue;
    if (!buffer) {
      buffer = { timestamp: cue.timestamp, text: piece };
      continue;
    }
    if (buffer.text.length + 1 + piece.length > maxChars) {
      chunks.push(buffer);
      buffer = { timestamp: cue.timestamp, text: piece };
    } else {
      buffer.text += ` ${piece}`;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

function chunkPlain(markdown, maxChars = 850) {
  const text = markdown
    .replace(/^#.+$/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
  const chunks = [];
  for (let i = 0; i < text.length; i += maxChars) {
    const slice = text.slice(i, i + maxChars).trim();
    if (slice.length > 80) chunks.push({ timestamp: undefined, text: slice });
  }
  return chunks;
}

function sampleEven(items, n) {
  if (items.length <= n) return items;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(items[Math.round((i * (items.length - 1)) / (n - 1))]);
  }
  return out;
}

function windowsFor(filePath, chunks) {
  if (filePath.includes("2026-01-26-city-council")) return chunks;
  if (filePath.includes("/city-council/")) return sampleEven(chunks, 5);
  return sampleEven(chunks, 3);
}

function youtubeFrom(markdown) {
  const idMatch = markdown.match(/YouTube ID:\*\*\s*`([A-Za-z0-9_-]{6,})`/) || markdown.match(/watch\?v=([A-Za-z0-9_-]{6,})/);
  return idMatch ? idMatch[1] : null;
}

function timestampToSeconds(stamp) {
  const [hours, minutes, seconds] = stamp.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

function loadLocalTranscript(filePath) {
  const localJan26 = path.join(SRC_DATA, "jan-26-transcript.md");
  if (filePath.endsWith("2026-01-26-city-council.md") && existsSync(localJan26)) {
    return readFileSync(localJan26, "utf8");
  }
  const cached = path.join(CACHE_DIR, filePath);
  if (existsSync(cached)) return readFileSync(cached, "utf8");
  return null;
}

function fetchTranscriptGh(filePath) {
  if (SKIP_REMOTE) return null;
  try {
    const payload = execFileSync("gh", ["api", `repos/${OWNER}/${TRANSCRIPT_REPO}/contents/${filePath}`], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    const parsed = JSON.parse(payload);
    if (parsed.encoding !== "base64" || !parsed.content) return null;
    const markdown = Buffer.from(parsed.content.replace(/\n/g, ""), "base64").toString("utf8");
    const target = path.join(CACHE_DIR, filePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, markdown);
    return markdown;
  } catch {
    return null;
  }
}

async function poolMap(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

function quantizeInt8(vector) {
  const bytes = Buffer.alloc(vector.length);
  for (let i = 0; i < vector.length; i++) {
    const value = Math.max(-127, Math.min(127, Math.round(vector[i] * 127)));
    bytes.writeInt8(value, i);
  }
  return bytes.toString("base64");
}

function ensureMeetings() {
  const meetingsPath = path.join(SRC_DATA, "meetings.json");
  if (!existsSync(meetingsPath)) {
    const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", "build-data.mjs")], { stdio: "inherit" });
    if (result.status !== 0) throw new Error("build-data.mjs failed");
  }
  return JSON.parse(readFileSync(meetingsPath, "utf8"));
}

function meetingItems(meetings) {
  const items = [];
  for (const meeting of meetings) {
    const recent = meeting.date >= "2026-01-01" || meeting.upcoming || Boolean(meeting.transcript);
    if (!recent) continue;
    const agenda = (meeting.items || []).map((item) => `${item.kind}: ${item.text}`).join(" ");
    const notes = (meeting.notes || []).join(". ");
    const text = `${meeting.bodyLabel}. ${meeting.dateLabel}. ${notes} ${agenda}`.replace(/\s+/g, " ").trim().slice(0, 900);
    if (text.length < 40) continue;
    items.push({
      id: `meeting:${meeting.id}`,
      kind: "meeting",
      title: `${meeting.bodyLabel} · ${meeting.shortDate}`,
      text,
      meetingDate: meeting.dateLabel,
      meetingId: meeting.id,
      sourceUrl: meeting.official?.agenda || meeting.official?.granicus || githubBlob(TRANSCRIPT_REPO, meeting.transcript?.path || "README.md"),
    });
  }
  return items;
}

function ordinanceItems() {
  return ORDINANCES.map((ordinance) => ({
    id: `ordinance:${ordinance.id}`,
    kind: "ordinance",
    title: ordinance.title,
    text: ordinance.text,
    meetingDate: ordinance.meetingDate,
    meetingId: ordinance.meetingId,
    sourceUrl: ordinance.sourceUrl,
  }));
}

function transcriptItems(tree, limit) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const files = tree.tree.filter((entry) => (
    entry.type === "blob"
    && entry.path.startsWith("cheyenne-2026-transcripts/")
    && entry.path.toLowerCase().endsWith(".md")
    && !entry.path.endsWith("README.md")
  ));
  const selected = limit ? files.slice(0, limit) : files;
  const items = [];
  let fetched = 0;
  let skipped = 0;
  for (const file of selected) {
    let markdown = loadLocalTranscript(file.path);
    if (!markdown) {
      markdown = fetchTranscriptGh(file.path);
      if (markdown) fetched += 1;
    }
    if (!markdown) {
      skipped += 1;
      continue;
    }
    const cues = parseCues(markdown);
    const chunks = windowsFor(file.path, cues.length ? groupCues(cues) : chunkPlain(markdown));
    const dateMatch = file.path.match(/(\d{4}-\d{2}-\d{2})/);
    const meetingDate = dateMatch ? dateLabel(dateMatch[1]) : "2026 meeting";
    const youtubeId = youtubeFrom(markdown);
    const body = file.path.split("/")[1]?.replaceAll("-", " ") || "public meeting";
    chunks.forEach((chunk, index) => {
      const seconds = chunk.timestamp ? timestampToSeconds(chunk.timestamp) : undefined;
      items.push({
        id: `transcript:${file.path}:${chunk.timestamp || index}`,
        kind: "transcript",
        title: `${body} · ${meetingDate}${chunk.timestamp ? ` · ${chunk.timestamp}` : ""}`,
        text: chunk.text,
        meetingDate,
        timestamp: chunk.timestamp,
        sourceUrl: githubBlob(TRANSCRIPT_REPO, file.path),
        videoUrl: youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}${seconds ? `&t=${seconds}s` : ""}` : undefined,
        repo: TRANSCRIPT_REPO,
        path: file.path,
        meetingId: dateMatch ? `${file.path.split("/")[1]}-${dateMatch[1]}` : undefined,
      });
    });
  }
  console.log(`Transcripts compiled: ${items.length} chunks from ${selected.length - skipped} files (${fetched} fetched, ${skipped} skipped).`);
  return items;
}

function ensureLocalMiniLM() {
  const onnxSrc = path.join(WEIGHTS_DIR, "all-MiniLM-L6-v2-onnx", "model.onnx");
  if (!existsSync(onnxSrc)) {
    console.log(`Cloning MiniLM ONNX weights from GitHub (${WEIGHTS_REPO}) …`);
    mkdirSync(path.dirname(WEIGHTS_DIR), { recursive: true });
    const clone = spawnSync("git", ["clone", "--depth", "1", WEIGHTS_REPO, WEIGHTS_DIR], { stdio: "inherit" });
    if (clone.status !== 0 || !existsSync(onnxSrc)) throw new Error("Unable to clone local MiniLM weights");
  }
  const dest = path.join(LOCAL_MODELS, MODEL_ID);
  mkdirSync(path.join(dest, "onnx"), { recursive: true });
  const srcDir = path.join(WEIGHTS_DIR, "all-MiniLM-L6-v2-onnx");
  const links = [
    ["config.json", "config.json"],
    ["tokenizer.json", "tokenizer.json"],
    ["tokenizer_config.json", "tokenizer_config.json"],
    ["special_tokens_map.json", "special_tokens_map.json"],
    ["model.onnx", path.join("onnx", "model.onnx")],
  ];
  for (const [from, to] of links) {
    const target = path.join(dest, to);
    if (existsSync(target)) continue;
    writeFileSync(target, readFileSync(path.join(srcDir, from)));
  }
  return dest;
}

async function embedItems(items) {
  stubSharp();
  mkdirSync(MODEL_CACHE, { recursive: true });
  const { pipeline, env } = await import("@xenova/transformers");
  env.cacheDir = MODEL_CACHE;
  let quantized = true;
  try {
    ensureLocalMiniLM();
    env.localModelPath = LOCAL_MODELS;
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    quantized = false;
    console.log(`Loading local ${MODEL_ID} (fp32 ONNX) …`);
  } catch (error) {
    console.warn(`Local MiniLM mirror unavailable (${error.message}). Trying Hugging Face …`);
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
    quantized = true;
    console.log(`Loading ${MODEL_ID} from Hugging Face …`);
  }
  const extractor = await pipeline("feature-extraction", MODEL_ID, { quantized });
  for (let i = 0; i < items.length; i++) {
    const output = await extractor(items[i].text.slice(0, 1100), { pooling: "mean", normalize: true });
    items[i].embedding = quantizeInt8(Array.from(output.data));
    if ((i + 1) % 25 === 0 || i + 1 === items.length) {
      process.stdout.write(`  embedded ${i + 1}/${items.length}\n`);
    }
  }
  return true;
}

function writeIndex(index) {
  mkdirSync(SRC_DATA, { recursive: true });
  mkdirSync(PUBLIC_DATA, { recursive: true });
  const json = `${JSON.stringify(index)}\n`;
  writeFileSync(path.join(SRC_DATA, "transcript-vectors.json"), json);
  writeFileSync(path.join(PUBLIC_DATA, "transcript-vectors.json"), json);
  const bytes = Buffer.byteLength(json);
  console.log(`Wrote transcript-vectors.json (${index.itemCount} items, ${(bytes / 1024).toFixed(1)} KB).`);
}

async function main() {
  const tree = JSON.parse(readFileSync(path.join(SRC_DATA, "transcript-tree.json"), "utf8"));
  const meetings = ensureMeetings();
  const items = [
    ...transcriptItems(tree, LIMIT),
    ...ordinanceItems(),
    ...meetingItems(meetings.meetings || []),
  ];
  const index = {
    model: MODEL_ID,
    dims: DIMS,
    quantization: "int8",
    sourceTreeSha: tree.sha,
    generatedAt: new Date().toISOString(),
    itemCount: items.length,
    items,
  };

  let embedded = false;
  try {
    embedded = await embedItems(items);
  } catch (error) {
    console.warn(`MiniLM precompute skipped (${error.message || error}).`);
    console.warn("The compiled corpus will still ship; the browser indexes it locally on first semantic query.");
    index.quantization = "none";
    for (const item of items) delete item.embedding;
  }

  writeIndex(index);
  if (embedded) {
    const sample = items.find((item) => item.id.includes("adu")) || items[0];
    console.log(`Sample embedded record: ${sample.id} (${sample.embedding?.length || 0} bytes b64).`);
  }
}

await main();
