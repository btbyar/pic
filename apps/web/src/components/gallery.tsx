'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api } from '@/lib/api-client';
import type { CartEventInfo } from '@/lib/cart';
import type { PublicPhotoPage } from '@/lib/types';
import { ImagesIcon } from './icons';
import { PhotoGrid } from './photo-grid';
import { Alert, Button, EmptyState } from './ui';

/** Эвэнтийн бүх зураг, авсан цагаар — 60-аар ачаална */
export function Gallery({
  slug,
  accessToken,
  timezone,
  initial,
  cartEvent,
}: {
  slug: string;
  accessToken: string | undefined;
  timezone: string;
  initial: PublicPhotoPage;
  cartEvent: CartEventInfo;
}) {
  const t = useTranslations('gallery');
  const te = useTranslations('errors');
  const [photos, setPhotos] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    setFailed(false);
    const params = new URLSearchParams({ cursor });
    if (accessToken) params.set('t', accessToken);
    const res = await api<PublicPhotoPage>(`/events/${slug}/photos?${params}`);
    if (res.ok) {
      setPhotos((prev) => [...prev, ...res.data.items]);
      setCursor(res.data.nextCursor);
    } else setFailed(true);
    setLoading(false);
  }

  if (photos.length === 0) return <EmptyState icon={<ImagesIcon size={28} />} title={t('empty')} />;

  return (
    <div className="flex flex-col gap-8">
      <PhotoGrid photos={photos} timezone={timezone} cart={{ event: cartEvent }} />
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton aspect-[4/3] rounded-[14px]" />
          ))}
        </div>
      ) : null}
      {failed ? <Alert>{te('network')}</Alert> : null}
      {cursor ? (
        <Button variant="secondary" size="lg" onClick={() => void loadMore()} busy={loading} className="self-center">
          {loading ? t('loading') : t('loadMore')}
        </Button>
      ) : null}
    </div>
  );
}
