'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { formatTime } from '@/lib/datetime';
import type { PublicPhoto, PublicPhotoPage } from '@/lib/types';
import { Button } from './ui';

/**
 * Эвэнтийн галерей. Thumb-ууд lazy load-оор ачаалагдана; дарахад watermark-тай preview.
 * TODO(Phase 4): 10k зурагт virtualized grid, цагаар шүүх.
 */
export function Gallery({
  slug,
  accessToken,
  timezone,
  initial,
}: {
  slug: string;
  accessToken: string | undefined;
  timezone: string;
  initial: PublicPhotoPage;
}) {
  const t = useTranslations('gallery');
  const [photos, setPhotos] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    const params = new URLSearchParams({ cursor });
    if (accessToken) params.set('t', accessToken);
    const res = await api<PublicPhotoPage>(`/events/${slug}/photos?${params}`);
    if (res.ok) {
      setPhotos((prev) => [...prev, ...res.data.items]);
      setCursor(res.data.nextCursor);
    }
    setLoading(false);
  }

  if (photos.length === 0) return <p className="py-10 text-center text-slate-500">{t('empty')}</p>;

  return (
    <>
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo, i) => (
          <li key={photo.id}>
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              className="block aspect-[4/3] w-full overflow-hidden rounded-lg bg-slate-200"
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
          </li>
        ))}
      </ul>
      {cursor ? (
        <Button variant="secondary" onClick={() => void loadMore()} disabled={loading} className="self-center">
          {loading ? t('loading') : t('loadMore')}
        </Button>
      ) : null}
      {openIndex !== null && photos[openIndex] ? (
        <Lightbox
          photo={photos[openIndex]}
          timezone={timezone}
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
  onClose,
  onPrev,
  onNext,
}: {
  photo: PublicPhoto;
  timezone: string;
  onClose: () => void;
  onPrev: (() => void) | undefined;
  onNext: (() => void) | undefined;
}) {
  const t = useTranslations('gallery');

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev?.();
      if (e.key === 'ArrowRight') onNext?.();
    },
    [onClose, onPrev, onNext],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  const nav = 'absolute top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-2xl text-white disabled:opacity-0';

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-sm text-white">
        <span>{photo.capturedAt ? formatTime(photo.capturedAt, timezone) : ''}</span>
        <button type="button" onClick={onClose} className="min-h-11 px-2 text-base">
          {t('close')} ✕
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-2 pb-4" onClick={(e) => e.stopPropagation()}>
        <img src={photo.previewUrl} alt="" className="max-h-full max-w-full object-contain" />
        <button type="button" className={`${nav} left-2`} onClick={onPrev} disabled={!onPrev} aria-label={t('prev')}>
          ‹
        </button>
        <button type="button" className={`${nav} right-2`} onClick={onNext} disabled={!onNext} aria-label={t('next')}>
          ›
        </button>
      </div>
    </div>
  );
}
