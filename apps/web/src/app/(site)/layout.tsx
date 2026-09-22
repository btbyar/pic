import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { MobileDock, SiteFooter, SiteHeader } from '@/components/site-header';

/** Оролцогчийн (нэвтрэлтгүй) хуудсууд: хөвөгч толгой, утсан дээр доод цэс, титр */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('site');
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="fixed left-4 top-4 z-60 -translate-y-24 rounded-lg bg-gold px-4 py-3 font-semibold text-gold-ink transition focus:translate-y-0"
      >
        {t('skip')}
      </a>
      <SiteHeader />
      <div id="main" className="flex-1">
        {children}
      </div>
      <SiteFooter />
      <MobileDock />
    </div>
  );
}
