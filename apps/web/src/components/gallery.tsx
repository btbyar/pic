'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api } from '@/lib/api-client';
import type { PublicPhotoPage } from '@/lib/types';
import { PhotoGrid } from './photo-grid';
import { Button } from './ui';

/** Эвэнтийн бүх зураг, авсан цагаар — 60-аар ачаална */
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
      <PhotoGrid photos={photos} timezone={timezone} />
      {cursor ? (
        <Button variant="secondary" onClick={() => void loadMore()} disabled={loading} className="self-center">
          {loading ? t('loading') : t('loadMore')}
        </Button>
      ) : null}
    </>
  );
}
