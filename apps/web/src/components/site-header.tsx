'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cartPhotoCount, useCart } from '@/lib/cart';

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
      <img src="/icon.svg" alt="" width={28} height={28} />
      Pic
    </span>
  );
}

/** Оролцогчийн хуудсуудын толгой: гүйлгэхэд дээр үлдэнэ, сагс үргэлж нэг товшилтын зайд */
export function SiteHeader() {
  const t = useTranslations('site');
  const pathname = usePathname();
  const count = cartPhotoCount(useCart());
  const link = (href: string, label: string) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        href={href}
        className={`inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm font-medium sm:px-3 ${
          active ? 'bg-surface-3 text-ink' : 'text-ink-soft hover:text-ink'
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
        <Link href="/" aria-label={t('home')} className="inline-flex min-h-11 items-center">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1">
          {link('/photographers', t('photographers'))}
          {link('/my/orders', t('myOrders'))}
          <Link
            href="/cart"
            aria-label={t('cartLabel', { count })}
            className={`relative inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium ${
              count ? 'bg-ink text-surface' : 'text-ink-soft hover:bg-surface-3'
            }`}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="10" cy="20" r="1.3" fill="currentColor" />
              <circle cx="17" cy="20" r="1.3" fill="currentColor" />
            </svg>
            <span className={count ? '' : 'sr-only sm:not-sr-only'}>{count ? count : t('cart')}</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const t = useTranslations('site');
  return (
    <footer className="mt-16 border-t border-line bg-surface-2">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-ink-soft sm:flex-row sm:items-start sm:justify-between">
        <div className="flex max-w-sm flex-col gap-2">
          <Logo />
          <p>{t('tagline')}</p>
        </div>
        <nav className="flex flex-col">
          {[
            { href: '/photographers', label: t('photographers') },
            { href: '/my/orders', label: t('myOrders') },
            { href: '/login', label: t('forPhotographers') },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="inline-flex min-h-11 items-center hover:text-ink">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="flex items-center justify-center gap-4 pb-8 text-sm text-ink-faint">
        <span aria-hidden className="h-px w-12 bg-surface-3" />
        {t('motto')}
        <span aria-hidden className="h-px w-12 bg-surface-3" />
      </p>
    </footer>
  );
}
