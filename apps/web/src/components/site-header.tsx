'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import { cartPhotoCount, useCart } from '@/lib/cart';
import { CartIcon, HomeIcon, TicketIcon, UsersIcon } from './icons';

/** Брэнд: хиртэлт (гэрэл → сүүдэр) + serif italic үгэн тэмдэг */
export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const mark = size === 'lg' ? 34 : 26;
  return (
    <span className="group/logo flex items-center gap-2">
      <svg viewBox="0 0 64 64" width={mark} height={mark} aria-hidden className="shrink-0">
        <circle cx="32" cy="32" r="22" fill="var(--color-gold)" />
        <circle
          cx="41"
          cy="23"
          r="17"
          fill="var(--color-night)"
          className="transition-transform duration-700 ease-cine group-hover/logo:translate-x-[3px] group-hover/logo:-translate-y-[3px]"
        />
      </svg>
      <span className={`font-display font-semibold italic leading-none tracking-[-0.02em] ${size === 'lg' ? 'text-4xl' : 'text-[28px]'}`}>pic</span>
    </span>
  );
}

function useActive() {
  const pathname = usePathname();
  return (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));
}

/** Оролцогчийн толгой: hero дээр тунгалаг, гүйлгэхэд шилэн болно */
export function SiteHeader() {
  const t = useTranslations('site');
  const isActive = useActive();
  const count = cartPhotoCount(useCart());
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { href: '/photographers', label: t('photographers') },
    { href: '/my/orders', label: t('myOrders') },
  ];

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5">
      <div
        className={`pointer-events-auto mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 rounded-[20px] px-3 transition-all duration-500 ease-cine sm:px-4 ${
          scrolled ? 'glass shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]' : 'border border-transparent'
        }`}
      >
        <Link href="/" aria-label={t('home')} className="inline-flex min-h-11 items-center rounded-lg px-1">
          <Logo />
        </Link>

        <nav aria-label={t('home')} className="hidden items-center gap-1 rounded-full bg-white/[0.03] p-1 ring-1 ring-inset ring-white/[0.06] md:flex">
          {links.map((l) => {
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={`relative inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold transition duration-300 ${
                  active ? 'bg-ivory text-night' : 'text-mist hover:text-ivory'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden min-h-11 items-center rounded-lg px-3 text-sm font-medium text-mist transition hover:text-ivory md:inline-flex">
            {t('forPhotographers')}
          </Link>
          <Link
            href="/cart"
            aria-label={t('cartLabel', { count })}
            className={`relative hidden min-h-11 items-center gap-2 rounded-full pl-3.5 pr-4 text-sm font-semibold ring-1 ring-inset transition duration-300 md:inline-flex ${
              count ? 'bg-gold text-gold-ink ring-gold' : 'text-ivory ring-line-strong hover:ring-mist'
            }`}
          >
            <CartIcon size={18} />
            <span key={count} className={count ? 'animate-pop tabular-nums' : ''}>
              {count ? count : t('cart')}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Утсан дээрх доод цэс: эрхий хурууны бүсэд 4 чиглэл */
export function MobileDock() {
  const t = useTranslations('site');
  const pathname = usePathname();
  const isActive = useActive();
  const count = cartPhotoCount(useCart());
  // Селфи хайлт бүтэн дэлгэцийн урсгал — өөрийн доод мөртэй
  if (pathname.endsWith('/find')) return null;

  const items: { href: string; label: string; icon: ReactNode; badge?: number }[] = [
    { href: '/', label: t('dockHome'), icon: <HomeIcon size={22} /> },
    { href: '/photographers', label: t('photographers'), icon: <UsersIcon size={22} /> },
    { href: '/my/orders', label: t('dockOrders'), icon: <TicketIcon size={22} /> },
    { href: '/cart', label: t('cart'), icon: <CartIcon size={22} />, badge: count },
  ];

  return (
    <nav
      aria-label={t('home')}
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 md:hidden"
    >
      <ul className="glass grid grid-cols-4 rounded-[22px] p-1.5 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.9)]">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                aria-label={item.badge ? `${item.label}, ${t('cartLabel', { count: item.badge })}` : undefined}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold transition duration-300 ${
                  active ? 'bg-white/[0.07] text-ivory' : 'text-dim'
                }`}
              >
                <span className={`relative ${active ? 'text-gold' : ''}`}>
                  {item.icon}
                  {item.badge ? (
                    <span
                      key={item.badge}
                      className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] animate-pop items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold tabular-nums text-gold-ink"
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Төгсгөлийн титр */
export function SiteFooter() {
  const t = useTranslations('site');
  return (
    <footer className="relative mt-24 overflow-hidden border-t border-line pb-[calc(var(--dock)+2.5rem)] pt-20 md:pb-12">
      <div aria-hidden className="pointer-events-none absolute -bottom-40 left-1/2 h-80 w-[48rem] -translate-x-1/2 rounded-full bg-gold/[0.07] blur-3xl" />
      <div className="relative mx-auto flex max-w-7xl flex-col items-center gap-8 px-5 text-center">
        <Logo size="lg" />
        <p className="max-w-md font-display text-2xl italic leading-snug text-mist">{t('tagline')}</p>
        <nav className="flex flex-wrap justify-center gap-x-8 gap-y-1">
          {[
            { href: '/photographers', label: t('photographers') },
            { href: '/my/orders', label: t('myOrders') },
            { href: '/login', label: t('forPhotographers') },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="inline-flex min-h-11 items-center text-sm font-semibold text-ivory transition hover:text-gold">
              {item.label}
            </Link>
          ))}
        </nav>
        <p className="kicker">{t('motto')}</p>
      </div>
    </footer>
  );
}
