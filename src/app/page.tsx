import CivicApp from "@/components/civic-app";
import { getSnapshot } from "@/lib/archive";
import { ARCHIVE_REPO, TRANSCRIPT_REPO } from "@/lib/civic-data";

export default function HomePage() {
  const archive = getSnapshot(ARCHIVE_REPO);
  const transcripts = getSnapshot(TRANSCRIPT_REPO);
  return <CivicApp initialFiles={archive.files} transcriptFiles={transcripts.files} sourceSha={archive.sha} />;
}
