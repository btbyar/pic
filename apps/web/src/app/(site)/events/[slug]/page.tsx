import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Gallery } from '@/components/gallery';
import { ArrowLeftIcon, ArrowRightIcon, CalendarIcon, CameraIcon, ImagesIcon, LockIcon, PinIcon, ScanFaceIcon, TagIcon } from '@/components/icons';
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
  const heroImage = event.coverPreviewUrl ?? event.coverUrl;
  const chip = 'inline-flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1 text-sm text-white backdrop-blur-md';

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-8 pt-4 sm:pt-6">
      <div className="flex flex-col gap-3">
        <Link href={backHref} className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-stone-600 hover:text-brand-700">
          <ArrowLeftIcon size={16} />
          {backLabel}
        </Link>

        {/* Hero: cover зураг дээр гарчиг */}
        <section className="relative isolate flex min-h-64 flex-col justify-end overflow-hidden rounded-3xl bg-stone-900 sm:min-h-80">
          {heroImage ? (
            <img src={heroImage} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 -z-10 bg-linear-to-br from-brand-700 via-brand-900 to-stone-900" />
          )}
          <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-t from-black/75 via-black/25 to-transparent" />
          <div className="flex flex-col items-start gap-3 p-5 sm:p-8">
            <div className="flex flex-wrap gap-2">
              {event.photographers?.map((p, i) =>
                p.slug ? (
                  <Link key={`${p.name}-${i}`} href={`/photographers/${p.slug}`} className={`${chip} font-medium hover:bg-black/50`}>
                    <CameraIcon size={14} />
                    {p.name}
                  </Link>
                ) : (
                  <span key={`${p.name}-${i}`} className={chip}>
                    <CameraIcon size={14} />
                    {p.name}
                  </span>
                ),
              )}
              <span className={chip}>{t(`categories.${event.category}`)}</span>
            </div>
            <h1 className="max-w-3xl text-balance text-3xl font-bold leading-tight text-white drop-shadow-sm sm:text-5xl">{event.title}</h1>
            <div className="flex flex-wrap gap-2">
              <span className={chip}>
                <CalendarIcon size={14} />
                {formatEventRange(event.startsAt, event.endsAt, event.timezone)}
              </span>
              {event.location ? (
                <span className={chip}>
                  <PinIcon size={14} />
                  {event.location}
                </span>
              ) : null}
              <span className={chip}>
                <ImagesIcon size={14} />
                {t('common.photos', { count: event.photoCount })}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Гол үйлдэл: селфигээр хайх */}
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        {event.faceSearchEnabled ? (
          <section className="flex flex-col items-center gap-3 rounded-3xl border border-brand-100 bg-linear-to-b from-brand-50 to-white px-5 py-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
              <ScanFaceIcon size={28} />
            </span>
            <h2 className="text-xl font-bold">{t('search.ctaTitle')}</h2>
            <p className="max-w-md text-stone-600">{t('search.ctaBody')}</p>
            <Link
              href={`/events/${slug}/find${query}`}
              className="group mt-2 inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-600 px-6 text-base font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700"
            >
              <ScanFaceIcon size={20} />
              {t('search.cta')}
              <ArrowRightIcon size={18} className="transition group-hover:translate-x-0.5" />
            </Link>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-500">
              <LockIcon size={12} />
              {t('search.ctaPrivacy')}
            </p>
          </section>
        ) : null}

        <section className={`flex flex-col gap-4 rounded-3xl border border-stone-200 bg-white p-6 ${event.faceSearchEnabled ? '' : 'lg:col-span-2'}`}>
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
            <TagIcon size={16} />
            {t('events.priceLabel')}
          </h2>
          <p className="text-3xl font-bold tabular-nums">{formatMnt(event.pricePerPhoto)}</p>
          {event.bundlePrice !== null ? (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{t('events.bundle', { price: formatMnt(event.bundlePrice) })}</p>
          ) : null}
          <ol className="mt-auto flex flex-col gap-2 border-t border-stone-100 pt-4 text-sm text-stone-600">
            {(['selfie', 'pick', 'download'] as const).map((k, i) => (
              <li key={k} className="flex gap-3">
                <span className="font-semibold tabular-nums text-brand-700">{String(i + 1).padStart(2, '0')}</span>
                {t(`events.how.${k}`)}
              </li>
            ))}
          </ol>
        </section>
      </div>

      {event.description ? <p className="max-w-3xl whitespace-pre-line text-stone-700">{event.description}</p> : null}

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
    </main>
  );
}
