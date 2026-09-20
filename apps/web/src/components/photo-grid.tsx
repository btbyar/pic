'use client';

import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, XIcon } from './icons';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { addToCart, type CartEventInfo, removeFromCart, useCart } from '@/lib/cart';
import { formatMnt, formatTime } from '@/lib/datetime';
import type { PublicPhoto } from '@/lib/types';
import { RemovalDialog } from './removal-dialog';

export interface GridCart {
  event: CartEventInfo;
  /** Селфи хайлтын үр дүнгээс нэмэхэд — багц үнийн шалгалтад */
  searchSessionId?: string | undefined;
}

/**
 * Зургийн grid + томоор харах цонх. Thumb-ууд lazy load, `content-visibility`-ээр дэлгэцэн гадуурх мөрүүдийг
 * browser render хийхгүй (олон зурагтай үед утсан дээр гүйлгэхэд хөнгөн).
 * `cart` өгвөл зураг бүр дээр сагсанд нэмэх/хасах товч гарна.
 */
export function PhotoGrid({ photos, timezone, cart }: { photos: PublicPhoto[]; timezone: string; cart?: GridCart | undefined }) {
  const t = useTranslations('gallery');
  const tc = useTranslations('cart');
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const cartState = useCart();
  const inCart = new Set(cart ? cartState[cart.event.slug]?.photos.map((p) => p.id) : []);

  const toggle = (photo: PublicPhoto) => {
    if (!cart) return;
    if (inCart.has(photo.id)) removeFromCart(cart.event.slug, [photo.id]);
    else addToCart(cart.event, [photo], cart.searchSessionId);
  };

  return (
    <>
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo, i) => {
          const selected = inCart.has(photo.id);
          return (
            <li key={photo.id} className="relative" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 180px' }}>
              <button
                type="button"
                onClick={() => setOpenIndex(i)}
                className={`block aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-lg bg-surface-3 ${selected ? 'ring-4 ring-brand-600 ring-inset' : ''}`}
                aria-label={t('open', { index: i + 1 })}
              >
                <img
                  src={photo.thumbUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width={photo.width ?? undefined}
                  height={photo.height ?? undefined}
                  className="h-full w-full object-cover"
                />
              </button>
              {cart ? (
                <button
                  type="button"
                  onClick={() => toggle(photo)}
                  aria-pressed={selected}
                  aria-label={selected ? tc('removeOne', { index: i + 1 }) : tc('addOne', { index: i + 1 })}
                  className={`absolute right-1.5 top-1.5 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-xl font-bold shadow ${
                    selected ? 'bg-brand-600 text-on-brand' : 'bg-surface-2/90 text-ink'
                  }`}
                >
                  {selected ? <CheckIcon size={20} strokeWidth={2.5} /> : <PlusIcon size={20} strokeWidth={2.5} />}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {openIndex !== null && photos[openIndex] ? (
        <Lightbox
          photo={photos[openIndex]}
          timezone={timezone}
          cart={cart}
          selected={inCart.has(photos[openIndex].id)}
          onToggleCart={() => toggle(photos[openIndex]!)}
          onClose={() => setOpenIndex(null)}
          onPrev={openIndex > 0 ? () => setOpenIndex(openIndex - 1) : undefined}
          onNext={openIndex < photos.length - 1 ? () => setOpenIndex(openIndex + 1) : undefined}
        />
      ) : null}
    </>
  );
}

function Lightbox({
  photo,
  timezone,
  cart,
  selected,
  onToggleCart,
  onClose,
  onPrev,
  onNext,
}: {
  photo: PublicPhoto;
  timezone: string;
  cart: GridCart | undefined;
  selected: boolean;
  onToggleCart: () => void;
  onClose: () => void;
  onPrev: (() => void) | undefined;
  onNext: (() => void) | undefined;
}) {
  const t = useTranslations('gallery');
  const tc = useTranslations('cart');
  const [reporting, setReporting] = useState(false);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (reporting) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev?.();
      if (e.key === 'ArrowRight') onNext?.();
    },
    [onClose, onPrev, onNext, reporting],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  const nav = 'absolute top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white disabled:opacity-0';

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={onClose}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-sm text-white" onClick={(e) => e.stopPropagation()}>
        <span>{photo.capturedAt ? formatTime(photo.capturedAt, timezone) : ''}</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setReporting(true)} className="min-h-11 cursor-pointer px-2 text-ink-faint underline-offset-4 hover:underline">
            {t('requestRemoval')}
          </button>
          <button type="button" onClick={onClose} className="min-h-11 cursor-pointer px-2 text-base">
            <span className="inline-flex items-center gap-1.5">
              {t('close')}
              <XIcon size={18} />
            </span>
          </button>
        </div>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-2" onClick={(e) => e.stopPropagation()}>
        <img src={photo.previewUrl} alt="" className="max-h-full max-w-full object-contain" />
        <button type="button" className={`${nav} left-2`} onClick={onPrev} disabled={!onPrev} aria-label={t('prev')}>
          <ChevronLeftIcon size={28} />
        </button>
        <button type="button" className={`${nav} right-2`} onClick={onNext} disabled={!onNext} aria-label={t('next')}>
          <ChevronRightIcon size={28} />
        </button>
      </div>
      <div className="flex min-h-16 items-center justify-center px-4 py-3" onClick={(e) => e.stopPropagation()}>
        {cart ? (
          <button
            type="button"
            onClick={onToggleCart}
            className={`min-h-11 cursor-pointer rounded-xl px-5 text-sm font-medium ${selected ? 'bg-brand-600 text-on-brand' : 'bg-surface-2 text-ink'}`}
          >
            {selected ? (
              <span className="inline-flex items-center gap-1.5">
                <CheckIcon size={16} />
                {tc('inCart')}
              </span>
            ) : (
              tc('add', { price: formatMnt(cart.event.pricePerPhoto) })
            )}
          </button>
        ) : null}
      </div>
      {reporting ? <RemovalDialog photoId={photo.id} onClose={() => setReporting(false)} /> : null}
    </div>
  );
}
