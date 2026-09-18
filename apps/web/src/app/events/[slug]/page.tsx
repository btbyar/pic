import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CartButton } from '@/components/cart-button';
import { Gallery } from '@/components/gallery';
import { ButtonLink, Card } from '@/components/ui';
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
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 pt-8 pb-24">
      <Link href={backHref} className="text-sm text-slate-600 underline-offset-4 hover:underline">
        ← {backLabel}
      </Link>
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">{t(`categories.${event.category}`)}</p>
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{event.title}</h1>
        <p className="text-slate-600">{formatEventRange(event.startsAt, event.endsAt, event.timezone)}</p>
        {event.location ? <p className="text-slate-600">{event.location}</p> : null}
      </header>

      {event.description ? <p className="whitespace-pre-line text-slate-800">{event.description}</p> : null}

      <Card className="flex flex-col gap-1">
        <p className="font-medium">{t('events.pricePerPhoto', { price: formatMnt(event.pricePerPhoto) })}</p>
        {event.bundlePrice !== null ? (
          <p className="text-slate-700">{t('events.bundle', { price: formatMnt(event.bundlePrice) })}</p>
        ) : null}
        <p className="text-sm text-slate-500">{t('common.photos', { count: event.photoCount })}</p>
        {event.photographers?.length ? (
          <p className="text-sm text-slate-500">
            {t('events.photographers')}:{' '}
            {event.photographers.map((p, i) => (
              <span key={`${p.name}-${i}`}>
                {i > 0 ? ', ' : ''}
                {p.slug ? (
                  <Link href={`/photographers/${p.slug}`} className="underline underline-offset-4">
                    {p.name}
                  </Link>
                ) : (
                  p.name
                )}
              </span>
            ))}
          </p>
        ) : null}
      </Card>

      {event.faceSearchEnabled ? (
        <Card className="flex flex-col gap-3 border-slate-900 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('search.ctaTitle')}</h2>
            <p className="text-sm text-slate-600">{t('search.ctaBody')}</p>
          </div>
          <ButtonLink href={`/events/${slug}/find${query}`}>{t('search.cta')}</ButtonLink>
        </Card>
      ) : null}

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
      <CartButton />
    </main>
  );
}
