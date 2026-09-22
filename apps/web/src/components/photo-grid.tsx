'use client';

import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, XIcon } from './icons';
import { useTranslations } from 'next-intl';
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { addToCart, type CartEventInfo, removeFromCart, useCart } from '@/lib/cart';
import { formatMnt, formatTime } from '@/lib/datetime';
import type { PublicPhoto } from '@/lib/types';
import { RemovalDialog } from './removal-dialog';

export interface GridCart {
  event: CartEventInfo;
  /** Селфи хайлтын үр дүнгээс нэмэхэд — багц үнийн шалгалтад */
  searchSessionId?: string | undefined;
}

const frame = (n: number) => String(n).padStart(3, '0');

/**
 * Зургийн хана (masonry) + бүтэн дэлгэцийн үзүүлэгч. Зураг бүр өөрийн харьцаагаараа — тайрахгүй.
 * `cart` өгвөл зураг бүр дээр сонгох товч гарна; сонгосон кадр алтан хүрээтэй.
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
      <ul className="columns-2 gap-2 sm:columns-3 sm:gap-3 lg:columns-4">
        {photos.map((photo, i) => {
          const selected = inCart.has(photo.id);
          const ratio = photo.width && photo.height ? `${photo.width} / ${photo.height}` : '4 / 3';
          return (
            <li
              key={photo.id}
              className="relative mb-2 animate-rise break-inside-avoid sm:mb-3"
              style={{ '--i': Math.min(i % 24, 12), animationDelay: `calc(var(--i) * 40ms)` } as CSSProperties}
            >
              <button
                type="button"
                onClick={() => setOpenIndex(i)}
                className={`group relative block w-full cursor-zoom-in overflow-hidden rounded-[14px] bg-night-2 transition duration-500 ease-cine ${
                  selected ? 'ring-2 ring-gold ring-offset-2 ring-offset-night' : ''
                }`}
                style={{ aspectRatio: ratio }}
                aria-label={t('open', { index: i + 1 })}
              >
                <img
                  src={photo.thumbUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width={photo.width ?? undefined}
                  height={photo.height ?? undefined}
                  className={`h-full w-full object-cover transition duration-700 ease-cine group-hover:scale-[1.04] ${selected ? 'opacity-80' : ''}`}
                />
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 flex translate-y-2 items-end bg-linear-to-t from-night/85 to-transparent p-3 pt-10 font-mono text-[10px] tracking-[0.16em] text-ivory opacity-0 transition duration-500 group-hover:translate-y-0 group-hover:opacity-100"
                >
                  #{frame(i + 1)}
                </span>
              </button>
              {cart ? (
                <button
                  type="button"
                  onClick={() => toggle(photo)}
                  aria-pressed={selected}
                  aria-label={selected ? tc('removeOne', { index: i + 1 }) : tc('addOne', { index: i + 1 })}
                  className={`absolute right-2 top-2 flex size-11 cursor-pointer items-center justify-center rounded-full transition duration-300 ease-cine active:scale-90 ${
                    selected ? 'bg-gold text-gold-ink shadow-[0_0_0_4px_rgba(232,180,90,0.25)]' : 'glass text-ivory hover:bg-white/20'
                  }`}
                >
                  {selected ? (
                    <CheckIcon key="on" size={20} strokeWidth={2.4} className="animate-pop" />
                  ) : (
                    <PlusIcon key="off" size={20} strokeWidth={2} />
                  )}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {openIndex !== null && photos[openIndex] ? (
        <Lightbox
          photo={photos[openIndex]}
          index={openIndex}
          total={photos.length}
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
  index,
  total,
  timezone,
  cart,
  selected,
  onToggleCart,
  onClose,
  onPrev,
  onNext,
}: {
  photo: PublicPhoto;
  index: number;
  total: number;
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchX = useRef<number | null>(null);

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

  // Цонх нээгдэхэд фокусыг дотор нь аваачиж, хаахад буцаана. Ард нь гүйлгэхгүй.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  // Tab цонхны дотор эргэлдэнэ — ард байгаа галерей руу гарахгүй
  const trapTab = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const items = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input,textarea');
    if (!items?.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Утсан дээр шударч солино
  const onTouchStart = (e: ReactTouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: ReactTouchEvent) => {
    if (touchX.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
    touchX.current = null;
    if (dx > 50) onPrev?.();
    if (dx < -50) onNext?.();
  };

  const nav =
    'glass absolute top-1/2 hidden size-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-ivory transition hover:bg-white/20 disabled:pointer-events-none disabled:opacity-0 sm:flex';

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('lightbox')}
      onKeyDown={trapTab}
      className="fixed inset-0 z-50 flex animate-fade flex-col bg-black/[0.97]"
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between gap-2 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] text-sm text-ivory"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="flex items-center gap-3 font-mono text-[11px] tracking-[0.16em] text-mist">
          <span className="text-ivory">{t('counter', { index: frame(index + 1), total: frame(total) })}</span>
          {photo.capturedAt ? <span>{formatTime(photo.capturedAt, timezone)}</span> : null}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setReporting(true)} className="min-h-11 cursor-pointer rounded-lg px-3 text-mist transition hover:text-ivory">
            {t('requestRemoval')}
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="glass flex size-11 cursor-pointer items-center justify-center rounded-full transition hover:bg-white/20"
          >
            <XIcon size={20} />
          </button>
        </div>
      </div>
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden px-2 sm:px-20"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <img key={photo.id} src={photo.previewUrl} alt="" className="max-h-full max-w-full animate-fade rounded-lg object-contain" />
        <button type="button" className={`${nav} left-4`} onClick={onPrev} disabled={!onPrev} aria-label={t('prev')}>
          <ChevronLeftIcon size={24} />
        </button>
        <button type="button" className={`${nav} right-4`} onClick={onNext} disabled={!onNext} aria-label={t('next')}>
          <ChevronRightIcon size={24} />
        </button>
      </div>
      <div
        className="flex min-h-20 flex-col items-center justify-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        {cart ? (
          <button
            type="button"
            onClick={onToggleCart}
            aria-pressed={selected}
            className={`inline-flex min-h-13 cursor-pointer items-center gap-2 rounded-full px-7 text-[15px] font-semibold transition duration-300 ease-cine active:scale-95 ${
              selected ? 'bg-white/10 text-gold ring-1 ring-inset ring-gold/50' : 'shine bg-gold text-gold-ink hover:bg-gold-soft'
            }`}
          >
            {selected ? (
              <>
                <CheckIcon size={18} strokeWidth={2.4} className="animate-pop" />
                {tc('inCart')}
              </>
            ) : (
              <>
                <PlusIcon size={18} strokeWidth={2.2} />
                {tc('add', { price: formatMnt(cart.event.pricePerPhoto) })}
              </>
            )}
          </button>
        ) : null}
        <span className="kicker sm:hidden">{t('swipeHint')}</span>
      </div>
      {reporting ? <RemovalDialog photoId={photo.id} onClose={() => setReporting(false)} /> : null}
    </div>
  );
}
