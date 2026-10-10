import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AtSign, Mail, Volume2 } from "lucide-react";
import Github from "@/components/github-icon";
import { NewspaceStyle } from "@/components/newspace-live";
import { ARCHIVE_OWNER, asset } from "@/lib/civic-data";
import { SITE_NAME, siteUrl } from "@/lib/site-config";

export const metadata: Metadata = {
  title: {
    default: "MyNewSpace · Customize your view of the Cheyenne public record",
    template: `%s | MyNewSpace`,
  },
  description:
    "A 2006-style profile page for Cheyenne's public record: real agendas, real transcripts, real counties and towns — restyled by you with an Arena code window and a code console, saved only in your browser.",
  alternates: { canonical: siteUrl("mynewspace/") },
  openGraph: {
    type: "website",
    url: siteUrl("mynewspace/"),
    siteName: SITE_NAME,
    title: "MyNewSpace · your view of the record",
    description:
      "The old profile-HTML box, rebuilt: ask Arena for a theme, paste it in, and the public record looks like yours. Nothing you change is published.",
  },
  twitter: {
    card: "summary",
    title: "MyNewSpace · your view of the record",
    description: "A retro profile page for Cheyenne's public record, customizable with generated CSS and HTML.",
  },
};

/** Page-local navigation: everything here is an anchor on this one profile. */
const PROFILE_LINKS = [
  { href: "#nsp-sec-about", label: "About Me" },
  { href: "#nsp-sec-agenda", label: "Next Meeting" },
  { href: "#nsp-sec-interests", label: "Interests" },
  { href: "#nsp-sec-friends", label: "Top 8" },
  { href: "#nsp-sec-wall", label: "Friend Space" },
  { href: "#nsp-sec-custom", label: "Your HTML" },
  { href: "#nsp-studio", label: "Customize" },
];

export default function MyNewSpaceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="nsp-page">
      <NewspaceStyle />

      <header className="nsp-topbar">
        <div className="nsp-topbar-inner">
          <a className="nsp-logo" href={asset("mynewspace/")} aria-label="MyNewSpace home">
            MyNew<span>Space</span>
            <small>A PUBLIC RECORD, BLURBED</small>
          </a>
          <nav className="nsp-topnav" aria-label="Profile sections">
            {PROFILE_LINKS.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
          <p className="nsp-inbox">
            <Mail size={12} aria-hidden="true" /> You have (0) new messages
            <small>
              <Volume2 size={10} aria-hidden="true" /> static page · no inbox
            </small>
          </p>
        </div>
      </header>

      <div className="nsp-notice">
        <span>
          <AtSign size={11} aria-hidden="true" /> <strong>Nothing here is an account.</strong> There is no login, no
          server, and nowhere to save a profile &mdash; your customization lives in this browser&rsquo;s
          localStorage, and the record underneath it is read-only for everyone.
        </span>
        <span>
          An affectionate 2006 format homage. Not affiliated with, endorsed by, or derived from MySpace; the
          wordmark, layout language, and colour scheme are paraphrase, not reuse.
        </span>
      </div>

      {children}

      <footer className="nsp-footer">
        <div className="nsp-footer-row">
          <a href={asset("")}>{SITE_NAME} main experience</a>
          <span aria-hidden="true">·</span>
          <a href={asset("hub/")}>Live government hub</a>
          <span aria-hidden="true">·</span>
          <a href={asset("meetings/")}>Meeting archive</a>
          <span aria-hidden="true">·</span>
          <a href={asset("transcripts/")}>Transcript archive</a>
          <span aria-hidden="true">·</span>
          <a href={`https://github.com/${ARCHIVE_OWNER}`} target="_blank" rel="noopener noreferrer">
            Source repositories
          </a>
        </div>
        <p>
          MyNewSpace is a presentation layer on {SITE_NAME}, an independent civic-learning project. Every number,
          name, and quotation on this profile is copied from the published archive; if you restyle a module, you are
          changing your view, never the record.
        </p>
        <p>
          <Github size={11} aria-hidden="true" /> Emergencies go to 911 or the responsible agency &mdash; not to a
          comment box.
        </p>
      </footer>
    </div>
  );
}
