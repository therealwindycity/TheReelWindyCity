import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, siteUrl } from "@/lib/site-config";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const dmSans = localFont({
  src: [
    { path: "../../public/fonts/dm-sans-regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/dm-sans-bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-dm-sans",
  display: "swap",
});

const SOCIAL_IMAGE = siteUrl("images/council-chambers-session.png");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Civic Cheyenne | Cheyenne Public Meetings & Records",
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  category: "education",
  alternates: {
    // Pass an absolute string so Next keeps the GitHub Pages project path intact.
    canonical: SITE_URL,
  },
  icons: {
    icon: [{ url: siteUrl("favicon.svg"), type: "image/svg+xml" }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "Civic Cheyenne | Cheyenne Public Meetings & Records",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: SOCIAL_IMAGE,
        alt: "The Cheyenne City Council chambers, the setting for real public meetings explored by Civic Cheyenne",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Civic Cheyenne | Cheyenne Public Meetings & Records",
    description: SITE_DESCRIPTION,
    images: [SOCIAL_IMAGE],
  },
};

const websiteStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}#website`,
  url: SITE_URL,
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  inLanguage: "en-US",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteStructuredData).replace(/</g, "\\u003c") }}
        />
        {children}
      </body>
    </html>
  );
}
