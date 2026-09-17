'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cartPhotoCount, useCart } from '@/lib/cart';

/** Сагсанд зураг байхад дэлгэцийн доод буланд харагдана (утсан дээр эрхий хуруунд ойр) */
export function CartButton() {
  const t = useTranslations('cart');
  const count = cartPhotoCount(useCart());
  if (count === 0) return null;
  return (
    <Link
      href="/cart"
      className="fixed bottom-4 right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-slate-900 px-5 text-sm font-semibold text-white shadow-lg"
    >
      <span aria-hidden>🛒</span>
      {t('button', { count })}
    </Link>
  );
}
