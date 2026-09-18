import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { LogoutButton } from './logout-button';
import { Logo } from './site-header';

export async function AppHeader({ area, name, nav }: { area: string; name: string; nav?: ReactNode }) {
  const t = await getTranslations('common');
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/" aria-label={t('appName')}>
            <Logo />
          </Link>
          <span className="text-sm text-stone-500">{area}</span>
          {nav}
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-stone-700 sm:inline">{name}</span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
