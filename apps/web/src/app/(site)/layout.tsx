import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '@/components/site-header';

/** Оролцогчийн (нэвтрэлтгүй) хуудсууд: нэг ижил толгой, хөл */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
