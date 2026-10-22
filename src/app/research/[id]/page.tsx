import type { Metadata } from "next";
import { notFound } from "next/navigation";
import data from "@/data/research-records.json";
import { siteUrl } from "@/lib/site-config";
export const dynamic = "force-static";
export const dynamicParams = false;
type Props = { params: Promise<{ id: string }> };
export function generateStaticParams() { return data.records.map((record) => ({ id: record.id })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params; const record = data.records.find((item) => item.id === id);
  return record ? { title: `${record.title} | Civic Cheyenne`, description: record.contentScope, alternates: { canonical: siteUrl(`research/${id}/`) } } : { title: "Record not found", robots: { index: false, follow: false } };
}
export default async function SourcePage({ params }: Props) {
  const { id } = await params; const record = data.records.find((item) => item.id === id);
  if (!record) notFound();
  return <main className="seo-container"><nav aria-label="Breadcrumb"><a href={siteUrl("")}>Home</a>{" / "}<a href={siteUrl("research/")}>Connected evidence</a></nav><h1>{record.title}</h1><p>{record.contentScope}. This page publishes a selected passage from the Drive extraction, not the complete PDF or an independent transcription.</p><dl><dt>Document date</dt><dd>{record.date}</dd><dt>Date status</dt><dd>{record.dateStatus}</dd><dt>Source container</dt><dd>{record.extractedFrom}</dd><dt>Harvested at</dt><dd>{record.harvestedAt}</dd><dt>Page reference</dt><dd>{record.pageStatus}</dd><dt>Outcome</dt><dd>{record.outcomeStatus}</dd><dt>Original file hash</dt><dd>Not obtained in this batch</dd><dt>Published text SHA-256</dt><dd style={{ overflowWrap: "anywhere" }}>{record.textSha256}</dd></dl><p><a href={record.sourceUrl} target="_blank" rel="noreferrer">Original publisher URL</a> — its URL was preserved in the Drive extraction; a fresh download was not verified in this batch.</p><section><h2>Published source excerpt</h2><pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{record.text}</pre></section><p>No final adoption, legal conclusion or audio verification is asserted. Refer to the original record and final proceedings before making those claims.</p></main>;
}
