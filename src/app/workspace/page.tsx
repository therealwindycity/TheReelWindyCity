import type { Metadata } from 'next';
import CivicApp from '@/components/civic-app';
import { getSnapshot } from '@/lib/archive';
import { ARCHIVE_REPO } from '@/lib/civic-data';
import { siteUrl } from '@/lib/site-config';
export const metadata: Metadata = { title: 'Research workspace | Civic Cheyenne', alternates: { canonical: siteUrl('workspace/') } };
export default function WorkspacePage() {
  const archive = getSnapshot(ARCHIVE_REPO);
  return <CivicApp initialFiles={archive.files} sourceSha={archive.sha} />;
}
