'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './public-shell.module.css';
const links = [['/', 'Home'], ['/explore/', 'Explore'], ['/community/', 'Community'], ['/about/', 'About']];
export default function PublicShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div className={styles.shell}>
    <a className={styles.skip} href="#public-content">Skip to content</a>
    <header className={styles.header}>
      <Link className={styles.brand} href="/">The Real Windy City<small>Civic Cheyenne · Independent public-records guide</small></Link>
      <nav className={styles.nav} aria-label="Main navigation">
        {links.map(([href, label]) => <Link key={href} href={href} aria-current={(href === '/' ? pathname === '/' : pathname.startsWith(href.replace(/\/$/, ''))) ? 'page' : undefined}>{label}</Link>)}
      </nav>
    </header>
    <div id="public-content" tabIndex={-1}>{children}</div>
    <footer className={styles.footer}>
      <p>Independent research and community discussion—not an official government or emergency service.</p>
      <p><Link href="/about/">Sources & methods</Link> · <Link href="/community/">Questions & corrections</Link> · <Link href="/workspace/">Research workspace</Link></p>
    </footer>
  </div>;
}
