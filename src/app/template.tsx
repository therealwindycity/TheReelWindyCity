import type { ReactNode } from 'react';
import PublicShell from '@/components/public-shell';
export default function Template({ children }: { children: ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
