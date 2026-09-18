'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cartPhotoCount, useCart } from '@/lib/cart';

export function Logo() {
  return (
    <span className="flex items-center gap-2 text-lg font-bold tracking-tight">
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
        className={`hidden rounded-lg px-3 py-2 text-sm font-medium sm:inline-flex ${
          active ? 'bg-brand-50 text-brand-700' : 'text-stone-600 hover:text-stone-900'
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
        <Link href="/" aria-label={t('home')}>
          <Logo />
        </Link>
        <nav className="flex items-center gap-1">
          {link('/photographers', t('photographers'))}
          {link('/my/orders', t('myOrders'))}
          <Link
            href="/cart"
            aria-label={t('cartLabel', { count })}
            className={`relative inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium ${
              count ? 'bg-brand-600 text-white' : 'text-stone-600 hover:bg-stone-100'
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
    <footer className="mt-16 border-t border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-stone-600 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex max-w-sm flex-col gap-2">
          <Logo />
          <p>{t('tagline')}</p>
        </div>
        <nav className="flex flex-col gap-2">
          <Link href="/photographers" className="hover:text-stone-900">
            {t('photographers')}
          </Link>
          <Link href="/my/orders" className="hover:text-stone-900">
            {t('myOrders')}
          </Link>
          <Link href="/login" className="hover:text-stone-900">
            {t('forPhotographers')}
          </Link>
        </nav>
      </div>
      <p className="flex items-center justify-center gap-4 pb-8 text-sm text-stone-400">
        <span aria-hidden className="h-px w-12 bg-stone-200" />
        {t('motto')}
        <span aria-hidden className="h-px w-12 bg-stone-200" />
      </p>
    </footer>
  );
}
