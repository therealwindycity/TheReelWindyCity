import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlaceCivic } from "@/components/place-civic";
import { civicPlace } from "@/lib/civic-places";
import { MUNICIPALITIES } from "@/lib/wyoming-ecosystem";
import { SITE_NAME, siteUrl } from "@/lib/site-config";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return MUNICIPALITIES.map((place) => ({ id: place.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const place = civicPlace("place", id);
  if (!place) return {};
  const title = `${place.title} civic`;
  const description = `The ${place.title} civic: its own document archive, public site, and scanner links. Not a relabel of Cheyenne.`;
  return { title, description, alternates: { canonical: siteUrl(place.href) }, openGraph: { title, description, url: siteUrl(place.href), siteName: SITE_NAME } };
}

export default async function PlaceCivicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const place = civicPlace("place", id);
  if (!place) notFound();
  return <PlaceCivic place={place} />;
}
