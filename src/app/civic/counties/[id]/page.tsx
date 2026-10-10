import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlaceCivic } from "@/components/place-civic";
import { civicPlace } from "@/lib/civic-places";
import { COUNTIES } from "@/lib/wyoming-ecosystem";
import { SITE_NAME, siteUrl } from "@/lib/site-config";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return COUNTIES.map((county) => ({ id: county.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const place = civicPlace("county", id);
  if (!place) return {};
  const title = `${place.title} civic`;
  const description = `The ${place.title} civic: clerk contact, document archive, and the cities that are not this county.`;
  return { title, description, alternates: { canonical: siteUrl(place.href) }, openGraph: { title, description, url: siteUrl(place.href), siteName: SITE_NAME } };
}

export default async function CountyCivicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const place = civicPlace("county", id);
  if (!place) notFound();
  return <PlaceCivic place={place} />;
}
