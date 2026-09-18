import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Gallery } from '@/components/gallery';
import { Card } from '@/components/ui';
import { serverApi } from '@/lib/api-server';
import { formatEventRange, formatMnt } from '@/lib/datetime';
import type { PublicEvent, PublicPhotoPage } from '@/lib/types';

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug } = await params;
  const { t: token } = await searchParams;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();

  const query = token ? `?t=${encodeURIComponent(token)}` : '';
  const { status, data: event } = await serverApi<PublicEvent>(`/events/${slug}${query}`);
  if (status === 404 || !event) notFound();
  const { data: photos } = await serverApi<PublicPhotoPage>(`/events/${slug}/photos${query}`);

  const t = await getTranslations();
  // Эвэнтийн нэгдсэн жагсаалт байхгүй: зурагчны профайл руу буцна
  const owner = event.photographers?.find((p) => p.slug);
  const backHref = owner ? `/photographers/${owner.slug}` : '/photographers';
  const backLabel = owner ? owner.name : t('photographers.title');
  return (
    <main className="flex flex-col gap-6 pb-8">
      {/* Cover + гарчиг */}
      <section className="relative isolate overflow-hidden bg-slate-900 text-white">
        {event.coverUrl ? (
          <img src={event.coverUrl} alt="" className="absolute inset-0 -z-10 h-full w-full scale-105 object-cover opacity-40 blur-[2px]" />
        ) : (
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-700 to-slate-900" />
        )}
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 pb-8 pt-5">
          <Link href={backHref} className="self-start text-sm text-white/80 underline-offset-4 hover:underline">
            ← {backLabel}
          </Link>
          <span className="self-start rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide backdrop-blur">
            {t(`categories.${event.category}`)}
          </span>
          <h1 className="max-w-3xl text-2xl font-bold leading-tight sm:text-4xl">{event.title}</h1>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/85">
            <span>📅 {formatEventRange(event.startsAt, event.endsAt, event.timezone)}</span>
            {event.location ? <span>📍 {event.location}</span> : null}
            <span>🖼️ {t('common.photos', { count: event.photoCount })}</span>
          </p>
          {event.photographers?.length ? (
            <p className="text-sm text-white/85">
              📷{' '}
              {event.photographers.map((p, i) => (
                <span key={`${p.name}-${i}`}>
                  {i > 0 ? ', ' : ''}
                  {p.slug ? (
                    <Link href={`/photographers/${p.slug}`} className="font-medium text-white underline underline-offset-4">
                      {p.name}
                    </Link>
                  ) : (
                    p.name
                  )}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4">
        {/* Гол үйлдэл: селфигээр хайх + үнэ */}
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          {event.faceSearchEnabled ? (
            <Link
              href={`/events/${slug}/find${query}`}
              className="group flex items-center gap-4 rounded-2xl bg-brand-600 p-5 text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-700"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 text-2xl" aria-hidden>
                🤳
              </span>
              <span className="flex flex-1 flex-col">
                <span className="text-lg font-semibold">{t('search.cta')}</span>
                <span className="text-sm text-white/85">{t('search.ctaBody')}</span>
              </span>
              <span className="text-2xl transition group-hover:translate-x-1" aria-hidden>
                →
              </span>
            </Link>
          ) : null}
          <Card className="flex flex-col justify-center gap-1 sm:min-w-56">
            <span className="text-sm text-slate-500">{t('events.priceLabel')}</span>
            <span className="text-xl font-bold">{formatMnt(event.pricePerPhoto)}</span>
            {event.bundlePrice !== null ? (
              <span className="text-sm text-emerald-700">{t('events.bundle', { price: formatMnt(event.bundlePrice) })}</span>
            ) : null}
          </Card>
        </div>

        {event.description ? <p className="whitespace-pre-line text-slate-700">{event.description}</p> : null}

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('gallery.title')}</h2>
          <Gallery
            slug={slug}
            accessToken={token}
            timezone={event.timezone}
            initial={photos ?? { items: [], nextCursor: null }}
            cartEvent={{
              slug,
              title: event.title,
              pricePerPhoto: event.pricePerPhoto,
              bundlePrice: event.bundlePrice,
              accessToken: token,
            }}
          />
        </section>
      </div>
    </main>
  );
}
