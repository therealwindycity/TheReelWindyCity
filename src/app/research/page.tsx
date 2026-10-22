import type { Metadata } from "next";
import Explorer from "@/components/research-explorer";
import { siteUrl } from "@/lib/site-config";
export const metadata: Metadata = { title: "Connected Evidence | Civic Cheyenne", description: "Source-linked document search, session grouping and timeline, with explicit coverage and verification limits.", alternates: { canonical: siteUrl("research/") } };
export default function ResearchPage() { return <Explorer />; }
