const WEBVTT_TIMESTAMP = /^(?:(\d{2,}):)?(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;
const TRANSCRIPT_LINE = /^\[(\d{2}:\d{2}:\d{2})\]\s+(.+)$/;

function normalizeTimestamp(value) {
  const match = String(value || "").trim().match(WEBVTT_TIMESTAMP);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (minutes >= 60 || seconds >= 60) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function cleanCueText(value) {
  return decodeEntities(value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function parseTimestampLine(line) {
  const [start] = line.split(/\s+-->/, 1);
  return normalizeTimestamp(start);
}

/** Parse WebVTT captions into clean, second-resolution timestamped cues. */
export function parseWebVtt(vtt) {
  const lines = String(vtt || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const cues = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i].trim();
    if (!line || /^(?:WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/.test(line)) continue;

    // Cue identifiers occupy their own line; the timestamp follows them.
    if (!line.includes("-->")) {
      const next = lines[i + 1]?.trim() || "";
      if (!next.includes("-->")) continue;
      line = next;
      i += 1;
    }

    const timestamp = parseTimestampLine(line);
    if (!timestamp) continue;

    const text = [];
    for (i += 1; i < lines.length; i += 1) {
      const cueLine = lines[i].trim();
      if (!cueLine || cueLine.includes("-->")) {
        if (cueLine.includes("-->")) i -= 1;
        break;
      }
      text.push(cueLine);
    }

    const cleanText = cleanCueText(text.join(" "));
    if (!cleanText) continue;
    const key = `${timestamp}\u0000${cleanText.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cues.push({ timestamp, text: cleanText });
  }

  return cues;
}

/** Classify only recognized public video hosts; unknown links are never fetched. */
export function classifyVideoUrl(value) {
  if (!value) return "unknown";
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be" || host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") return "youtube";
    if (host === "cheyenne.granicus.com" || host.endsWith(".granicus.com")) return "granicus";
    return "other";
  } catch {
    return "unknown";
  }
}

export function youtubeVideoId(value) {
  if (!value) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || null;
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const id = url.searchParams.get("v");
      if (id) return id;
      return url.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{6,})/)?.[1] || null;
    }
  } catch {
    return null;
  }
  return null;
}

/** Return video-backed meetings that do not yet have a transcript attachment. */
export function transcriptGapWorklist(meetings) {
  return meetings
    .filter((meeting) => meeting?.official?.video && !(meeting.transcripts?.length || meeting.transcript))
    .map((meeting) => ({
      meetingId: meeting.id,
      date: meeting.date,
      body: meeting.body,
      bodyLabel: meeting.bodyLabel,
      dateLabel: meeting.dateLabel,
      videoUrl: meeting.official.video,
      provider: classifyVideoUrl(meeting.official.video),
      videoId: youtubeVideoId(meeting.official.video),
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.body.localeCompare(b.body) || a.meetingId.localeCompare(b.meetingId));
}

/** Select a small, evenly spaced set of excerpts for static meeting pages. */
export function sampleTranscriptCues(cues, maximum = 12) {
  if (cues.length <= maximum) return cues;
  const sample = [];
  for (let index = 0; index < maximum; index += 1) {
    sample.push(cues[Math.round((index * (cues.length - 1)) / (maximum - 1))]);
  }
  return sample;
}

export function timestampedMarkdownCues(markdown) {
  return String(markdown || "")
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.trim().match(TRANSCRIPT_LINE);
      return match ? [{ timestamp: match[1], text: match[2].trim() }] : [];
    });
}

/** Render only captions actually supplied in WebVTT; no transcript is synthesized. */
export function renderTranscriptMarkdown({ meeting, videoUrl, language = "en", sourceLabel, capturedAt, cues }) {
  if (!meeting?.id || !meeting.bodyLabel || !meeting.dateLabel) throw new Error("A dated meeting record is required to create a transcript file");
  if (!videoUrl || !classifyVideoUrl(videoUrl).match(/^(youtube|granicus)$/)) throw new Error("Transcript imports require a recognized YouTube or Granicus source URL");
  if (!Array.isArray(cues) || cues.length === 0) throw new Error("No timestamped caption cues were found; refusing to create an empty transcript");

  const safeLanguage = String(language || "en").replace(/[^A-Za-z0-9-]/g, "") || "en";
  const label = String(sourceLabel || "Imported WebVTT captions").replace(/[\r\n]/g, " ").trim();
  const captureDate = String(capturedAt || new Date().toISOString().slice(0, 10));
  const lines = [
    `# ${meeting.bodyLabel} — ${meeting.dateLabel} (caption transcript)`,
    "",
    `**Source:** ${label}`,
    `**Meeting ID:** \`${meeting.id}\``,
    `**Video:** ${videoUrl}`,
    `**Language:** ${safeLanguage}`,
    `**Captured:** ${captureDate}`,
    "",
    "> Captions are reproduced from the linked recording and have not been human-verified. Automated captions may misidentify speakers, names, or words; check the official minutes and recording before quoting.",
    "",
    ...cues.map(({ timestamp, text }) => {
      const stamp = normalizeTimestamp(timestamp);
      const content = cleanCueText(text);
      if (!stamp || !content) throw new Error("A caption cue has an invalid timestamp or empty text");
      return `[${stamp}] ${content}`;
    }),
    "",
  ];
  return lines.join("\n");
}
