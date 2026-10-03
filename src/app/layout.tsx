import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const dmSans = localFont({ src: [{ path: "../../public/fonts/dm-sans-regular.woff2", weight: "400", style: "normal" }, { path: "../../public/fonts/dm-sans-bold.woff2", weight: "700", style: "normal" }], variable: "--font-dm-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Civic Cheyenne — Your city. Your seat at the table.",
  description: "Step inside real Cheyenne City Council sessions, explore public records, and trace proposed ordinance impacts across the city. An independent, source-backed civic learning experience.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className={dmSans.variable}><body>{children}</body></html>;
}
