import CivicApp from "@/components/civic-app";
import { getSnapshot } from "@/lib/archive";
import { ARCHIVE_REPO } from "@/lib/civic-data";

export default function HomePage() {
  const archive = getSnapshot(ARCHIVE_REPO);
  return <CivicApp initialFiles={archive.files} sourceSha={archive.sha} />;
}
