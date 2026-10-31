import crossReferences from "@/data/legal-cross-references.json";
import autoData from "@/data/legal-audit-generated.json";
import evidenceData from "@/data/legal-evidence-generated.json";
import supportData from "@/data/legal-support-generated.json";

export type LegalEvidence = { label: string; url: string };
export type LegalRequirement = {
  id: string; title: string; law: string; requirement: string;
  status: "unverified" | "partial" | "supported" | "conflicting" | "not-applicable";
  finding: string; next: string; evidence: LegalEvidence[];
};
export type LegalReview = {
  meetingId: string; itemNumber: string; match: string; title: string; reviewedAt: string; note: string;
  authorities: { citation: string; name: string; url: string; note: string }[];
  requirements: LegalRequirement[];
};

/** Exact meeting and item plus a text guard: never attach a legal review based on keywords alone. */
export function findLegalReview(meetingId: string, itemNumber: string | number, text: string): LegalReview | undefined {
  const number = String(itemNumber).trim();
  return (crossReferences.items as LegalReview[]).find((review) =>
    review.meetingId === meetingId && review.itemNumber === number && text.toLowerCase().includes(review.match.toLowerCase()));
}

export type IndexedAgenda = { sourceUrl?: string | null; fetchedAt?: string | null; extraction?: string; limitation?: string; lastAttempt?: string | null; lastError?: string | null; items?: { number: string; kind: string; text: string }[] };
export function automatedAgenda(meetingId: string): IndexedAgenda | undefined {
  return (autoData.meetings as Record<string, IndexedAgenda>)[meetingId];
}

/** Citations explicitly appearing in agenda text. Discovery is not applicability analysis. */
export function citedWyomingStatutes(text: string): string[] {
  const matches = new Set<string>();
  const prefix = /(?:W\.\s*S\.\s*(?:A\.\s*)?|Wyo\.\s*Stat\.?(?:\s*Ann\.)?|Wyoming\s+Statutes?)\s*(?:§+|sections?|sec\.)?\s*([0-9]{1,2}-[0-9]{1,3}-[0-9]{1,4}(?:\([a-z0-9]+\))*)/gi;
  for (const match of text.matchAll(prefix)) {
    matches.add(match[1]);
    const rest = text.slice((match.index ?? 0) + match[0].length);
    const next = /^\s*(?:,|&|and)\s*([0-9]{1,2}-[0-9]{1,3}-[0-9]{1,4}(?:\([a-z0-9]+\))*)/i.exec(rest);
    if (next) matches.add(next[1]);
  }
  return [...matches];
}

export type AutomatedEvidence = { date: string; reading: number | null; outcome: string; excerpt: string; url: string; transcription: string | null };
export function matchedMinutes(meetingId: string, itemNumber: string | number, text: string): AutomatedEvidence[] {
  const records = evidenceData.meetings as Record<string, Record<string, { itemText: string; evidence: AutomatedEvidence[] }>>;
  const record = records[meetingId]?.[String(itemNumber)];
  return record?.itemText === text ? record.evidence : [];
}
export function potentialShortReadingInterval(evidence: AutomatedEvidence[]): { first: string; last: string; days: number } | undefined {
  const firsts = evidence.filter(e => e.reading === 1).sort((a,b) => a.date.localeCompare(b.date));
  const finals = evidence.filter(e => e.reading === 3 && e.outcome.includes("approval motion recorded as carried")).sort((a,b) => a.date.localeCompare(b.date));
  for (const first of firsts) for (const last of finals) {
    const days = (Date.parse(`${last.date}T00:00:00Z`) - Date.parse(`${first.date}T00:00:00Z`)) / 86400000;
    if (days >= 0 && days < 10) return { first: first.date, last: last.date, days };
  }
  return undefined;
}

export type MinutesDiscovery = { sourceUrl: string | null; fetchedAt: string | null; lastAttempt: string | null; lastError: string | null; available: boolean };
export function minutesDiscovery(meetingId: string): MinutesDiscovery | undefined {
  return (evidenceData.sources as Record<string, MinutesDiscovery>)[meetingId];
}

export type SupportingRecord = { label: string; url: string; origin: string | null; fetchedAt: string | null; lastAttempt: string | null; lastError: string | null; sha256: string | null; citations: string[]; snippets: { topic: string; label: string; excerpt: string }[] };
export function matchedSupportingRecords(meetingId: string, itemNumber: string | number, text: string): SupportingRecord[] {
  const records = supportData.meetings as Record<string, Record<string, {itemText: string; documents: SupportingRecord[]}>>;
  const record = records[meetingId]?.[String(itemNumber)];
  return record?.itemText === text ? record.documents : [];
}
