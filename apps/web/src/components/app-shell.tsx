import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppNav, type NavItem } from './app-nav';
import { LogoutButton } from './logout-button';
import { Logo } from './site-header';

/**
 * Зурагчин/админы ажлын талбар. Нийтийн сайтаас ялгаатай бүтэц: өргөн дэлгэцэд зүүн талд
 * байнгын цэс (ажлын хэрэгсэл шиг), утсан дээр толгойн доор хэвтээ табууд.
 */
export async function AppShell({
  area,
  name,
  nav,
  action,
  children,
}: {
  area: string;
  name: string;
  nav: NavItem[];
  /** Цэсний дээр байрлах гол үйлдэл (ж: шинэ эвэнт) */
  action?: ReactNode;
  children: ReactNode;
}) {
  const t = await getTranslations('common');
  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2.5">
            <Link href="/" aria-label={t('appName')}>
              <Logo />
            </Link>
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">{area}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden max-w-40 truncate text-sm text-stone-700 sm:inline">{name}</span>
            <LogoutButton />
          </div>
        </div>
        {nav.length ? (
          <div className="mx-auto max-w-7xl px-4 pb-2 lg:hidden">
            <AppNav items={nav} />
          </div>
        ) : null}
      </header>

      <div className="mx-auto flex w-full max-w-7xl gap-8 px-4 py-6">
        {nav.length ? (
          <aside className="hidden w-52 shrink-0 lg:block">
            <div className="sticky top-24 flex flex-col gap-4">
              {action}
              <AppNav items={nav} orientation="vertical" />
            </div>
          </aside>
        ) : null}
        <main className="flex min-w-0 flex-1 flex-col gap-6">{children}</main>
      </div>
    </div>
  );
}
