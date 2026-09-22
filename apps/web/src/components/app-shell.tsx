import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppNav, type NavItem } from './app-nav';
import { Avatar } from './avatar';
import { LogoutButton } from './logout-button';
import { Logo } from './site-header';

/**
 * Зурагчин/админы «найруулагчийн пульт». Өргөн дэлгэцэнд зүүн талд бүтэн өндөртэй хавтан,
 * утсан дээр шилэн толгой + хэвтээ табууд. Нийтийн сайтаас ялгаатай: ажлын хэрэгсэл шиг тогтвортой.
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
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr] print:block">
      {/* ——— Пульт (lg+) ——— */}
      <aside className="sticky top-0 hidden h-dvh print:hidden flex-col gap-8 border-r border-line bg-night-2/60 px-4 py-6 lg:flex">
        <div className="flex flex-col gap-3 px-2">
          <Link href="/" aria-label={t('appName')} className="inline-flex min-h-11 items-center self-start">
            <Logo />
          </Link>
          <span className="kicker">{area}</span>
        </div>
        {action ? <div className="px-1">{action}</div> : null}
        {nav.length ? <AppNav items={nav} orientation="vertical" /> : null}
        <div className="mt-auto flex items-center gap-3 rounded-2xl bg-night-3/70 p-3 ring-1 ring-inset ring-line">
          <Avatar url={null} name={name} size={36} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">{name}</span>
            <LogoutButton />
          </span>
        </div>
      </aside>

      {/* ——— Утасны толгой ——— */}
      <header className="glass sticky top-0 z-40 border-x-0 border-t-0 lg:hidden print:hidden">
        <div className="flex h-16 items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label={t('appName')} className="inline-flex min-h-11 items-center">
              <Logo />
            </Link>
            <span className="kicker hidden sm:inline">{area}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-40 truncate text-sm text-mist sm:inline">{name}</span>
            <LogoutButton />
          </div>
        </div>
        {nav.length ? (
          <div className="flex items-center gap-3 px-4 pb-3">
            <AppNav items={nav} />
            {action ? <div className="ml-auto shrink-0">{action}</div> : null}
          </div>
        ) : null}
      </header>

      <main className="relative mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-8 px-4 py-8 sm:px-8 lg:py-12 print:max-w-none print:p-0">
        <div aria-hidden className="pointer-events-none absolute right-0 top-0 -z-10 h-96 w-[36rem] rounded-full bg-gold/[0.05] blur-[120px] print:hidden" />
        {children}
      </main>
    </div>
  );
}
