import type { ReactNode } from "react";

export default function TranscriptLibraryLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <section aria-label="Extended caption transcript library" style={{ padding: "1rem", borderBottom: "1px solid #d7dedb" }}>
        <a href="https://bartimoussmith-oss.github.io/therealwindycity/transcripts-master/index.html">
          Browse the extended master caption transcript library
        </a>
        <p>Additional existing caption texts are published separately from the catalog below. Duplicate representations are identified by exact text. Dates, speaker attribution and recording completeness require verification; these are not official minutes.</p>
      </section>
      {children}
    </>
  );
}
