'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { formatTime } from '@/lib/datetime';
import type { PublicPhoto } from '@/lib/types';
import { RemovalDialog } from './removal-dialog';

/**
 * Зургийн grid + томоор харах цонх. Thumb-ууд lazy load, `content-visibility`-ээр дэлгэцэн гадуурх мөрүүдийг
 * browser render хийхгүй (олон зурагтай үед утсан дээр гүйлгэхэд хөнгөн).
 */
export function PhotoGrid({ photos, timezone }: { photos: PublicPhoto[]; timezone: string }) {
  const t = useTranslations('gallery');
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <>
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo, i) => (
          <li key={photo.id} style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 180px' }}>
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

  const nav = 'absolute top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-2xl text-white disabled:opacity-0';

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={onClose}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-sm text-white" onClick={(e) => e.stopPropagation()}>
        <span>{photo.capturedAt ? formatTime(photo.capturedAt, timezone) : ''}</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setReporting(true)} className="min-h-11 px-2 text-slate-300 underline-offset-4 hover:underline">
            {t('requestRemoval')}
          </button>
          <button type="button" onClick={onClose} className="min-h-11 px-2 text-base">
            {t('close')} ✕
          </button>
        </div>
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
      {reporting ? <RemovalDialog photoId={photo.id} onClose={() => setReporting(false)} /> : null}
    </div>
  );
}
