import type { ReactNode } from 'react';
import PublicShell from '@/components/public-shell';
import SiteHelp from '@/components/site-help';
export default function Template({ children }: { children: ReactNode }) {
  return <PublicShell>{children}<SiteHelp /></PublicShell>;
}
