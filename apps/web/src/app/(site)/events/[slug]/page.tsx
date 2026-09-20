import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { FocusFrame } from '@/components/focus-frame';
import { Gallery } from '@/components/gallery';
import { ButtonLink } from '@/components/ui';
import { ArrowLeftIcon, LockIcon, ScanFaceIcon } from '@/components/icons';
import { ShareEvent } from '@/components/share-event';
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
  const heroImage = event.coverLargeUrl ?? event.coverUrl;
  const meta = [formatEventRange(event.startsAt, event.endsAt, event.timezone), event.location, t('common.photos', { count: event.photoCount })].filter(
    Boolean,
  );

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-28 pt-4 sm:pb-8 sm:pt-6">
      <div className="flex flex-col gap-3">
        <Link href={backHref} className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-ink-soft hover:text-ink">
          <ArrowLeftIcon size={16} />
          {backLabel}
        </Link>

        {/* Hero: cover зураг дээр гарчиг */}
        <FocusFrame className="isolate flex min-h-64 flex-col justify-end overflow-hidden rounded-xl bg-surface-2 sm:min-h-80">
          {heroImage ? (
            <img src={heroImage} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 -z-10 bg-surface-2" />
          )}
          <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-t from-surface via-surface/75 to-surface/25" />
          <div className="flex flex-col items-start gap-2 p-5 sm:p-8">
            <h1 className="max-w-3xl text-balance text-3xl font-bold leading-tight text-ink sm:text-5xl">{event.title}</h1>
            <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink">
              {meta.map((item) => (
                <span key={item as string}>{item}</span>
              ))}
            </p>
          </div>
        </FocusFrame>
      </div>

      {/* Гол үйлдэл: селфигээр хайх. Хажууд нь үнэ — картгүй, зөвхөн зураасаар тусгаарлана. */}
      <div className="flex flex-col gap-6 border-y border-line py-8 sm:flex-row sm:items-center sm:justify-between">
        {event.faceSearchEnabled ? (
          <div className="flex flex-col items-start gap-3">
            <h2 className="font-display text-2xl font-bold">{t('search.ctaTitle')}</h2>
            <p className="max-w-md text-ink-soft">{t('search.ctaBody')}</p>
            {/* Утсан дээр доод талд наалдана: QR уншуулсан хүн гүйлгэсэн ч товч харагдана */}
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:static sm:border-0 sm:bg-transparent sm:p-0">
              <ButtonLink href={`/events/${slug}/find${query}`} className="min-h-14 w-full gap-2 text-base sm:w-auto sm:px-6">
                <ScanFaceIcon size={20} />
                {t('search.cta')}
              </ButtonLink>
            </div>
            <p className="flex items-start gap-1.5 text-sm text-ink-soft">
              <LockIcon size={16} className="mt-0.5 shrink-0" />
              {t('search.ctaPrivacy')}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-1 sm:text-right">
          <span className="text-sm text-ink-soft">{t('events.priceLabel')}</span>
          <span className="font-display text-3xl font-bold tabular-nums">{formatMnt(event.pricePerPhoto)}</span>
          {event.bundlePrice !== null ? (
            <span className="text-sm text-ink-soft">{t('events.bundle', { price: formatMnt(event.bundlePrice) })}</span>
          ) : null}
        </div>
      </div>

      {event.description ? <p className="max-w-3xl whitespace-pre-line text-ink">{event.description}</p> : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">{t('gallery.title')}</h2>
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

      <ShareEvent title={event.title} />
    </main>
  );
}
