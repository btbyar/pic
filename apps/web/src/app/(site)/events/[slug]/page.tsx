import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BackLink } from '@/components/back-link';
import { Gallery } from '@/components/gallery';
import { LockIcon, ScanFaceIcon } from '@/components/icons';
import { ShareEvent } from '@/components/share-event';
import { Perforation, Ticket } from '@/components/ticket';
import { ButtonLink, Kicker } from '@/components/ui';
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
  const findHref = `/events/${slug}/find${query}`;
  const credits = event.photographers?.map((p) => p.name).join(' · ');

  return (
    <main className="pb-[calc(var(--dock)+7rem)] md:pb-0">
      {/* ——— Нээлтийн кадр: cover дэлгэц дүүргэнэ ——— */}
      <section className="relative isolate flex min-h-[82svh] flex-col overflow-hidden">
        {heroImage ? (
          <img src={heroImage} alt="" className="absolute inset-0 -z-20 h-full w-full animate-kenburns object-cover" />
        ) : (
          <div aria-hidden className="absolute -top-40 left-1/3 -z-20 h-[36rem] w-[50rem] animate-drift rounded-full bg-gold/10 blur-[120px]" />
        )}
        {/* Letterbox: дээр, доор харанхуйлна */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-b from-night/80 via-night/30 to-night" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-r from-night/70 via-transparent to-transparent" />

        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 pb-10 pt-28">
          <BackLink href={backHref}>{backLabel}</BackLink>
          <div className="mt-auto grid items-end gap-10 pt-24 lg:grid-cols-[1fr_24rem]">
            <div className="flex flex-col items-start gap-5">
              <Kicker className="animate-rise !text-mist">{formatEventRange(event.startsAt, event.endsAt, event.timezone)}</Kicker>
              <h1 className="animate-rise font-display text-[clamp(2.75rem,7vw,6.5rem)] font-semibold leading-[0.9] tracking-[-0.03em] stagger [--i:1]">
                {event.title}
              </h1>
              <p className="flex animate-rise flex-wrap gap-x-6 gap-y-2 text-mist stagger [--i:2]">
                {event.location ? <span>{event.location}</span> : null}
                <span>{t('common.photos', { count: event.photoCount })}</span>
                {credits ? <span className="font-display text-lg italic text-ivory">{credits}</span> : null}
              </p>
            </div>

            {/* Тасалбар: үнэ + гол үйлдэл. Өргөн дэлгэцэнд hero дотор, утсан дээр доор нь. */}
            <div className="hidden animate-rise stagger [--i:3] lg:block">
              <PriceTicket event={event} findHref={findHref} t={t} />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-7xl flex-col gap-16 px-5">
        <div className="lg:hidden">
          <PriceTicket event={event} findHref={findHref} t={t} />
        </div>

        {event.description ? (
          <p className="max-w-3xl whitespace-pre-line font-display text-2xl leading-snug text-ivory/90 sm:text-3xl">{event.description}</p>
        ) : null}

        <section className="flex flex-col gap-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-3">
              <Kicker>{t('gallery.kicker')}</Kicker>
              <h2 className="font-display text-5xl font-semibold leading-none tracking-[-0.02em]">{t('gallery.title')}</h2>
            </div>
            <ShareEvent title={event.title} />
          </div>
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

      {/* Утсан дээр: гол үйлдэл эрхий хурууны бүсэд, доод цэсний дээр */}
      {event.faceSearchEnabled ? (
        <div className="fixed inset-x-3 bottom-[calc(var(--dock)+0.5rem)] z-30 lg:hidden">
          <div className="glass flex items-center gap-3 rounded-[20px] p-2 pl-4 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.9)]">
            <span className="flex shrink-0 flex-col">
              <span className="kicker !text-[10px]">{t('events.priceLabel')}</span>
              <span className="font-display text-2xl font-semibold leading-none tabular-nums">{formatMnt(event.pricePerPhoto)}</span>
            </span>
            <ButtonLink href={findHref} className="flex-1">
              <ScanFaceIcon size={20} />
              {t('search.cta')}
            </ButtonLink>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function PriceTicket({ event, findHref, t }: { event: PublicEvent; findHref: string; t: Awaited<ReturnType<typeof getTranslations>> }) {
  return (
    <Ticket glow className="p-6">
      <div className="flex flex-col gap-3">
        <span className="kicker">{t('events.priceLabel')}</span>
        <span className="font-display text-5xl font-semibold leading-none tabular-nums">{formatMnt(event.pricePerPhoto)}</span>
        {event.bundlePrice !== null ? (
          <span className="inline-flex items-center gap-2 self-start rounded-full bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold ring-1 ring-inset ring-gold/30">
            <span aria-hidden className="size-1.5 rounded-full bg-gold" />
            {t('events.bundle', { price: formatMnt(event.bundlePrice) })}
          </span>
        ) : null}
      </div>
      {event.faceSearchEnabled ? (
        <>
          <Perforation />
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="font-display text-2xl font-semibold leading-tight">{t('search.ctaTitle')}</p>
              <p className="text-sm text-mist">{t('search.ctaBody')}</p>
            </div>
            <ButtonLink href={findHref} size="lg" className="w-full">
              <ScanFaceIcon size={20} />
              {t('search.cta')}
            </ButtonLink>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-mist">
              <LockIcon size={14} className="mt-px shrink-0 text-gold" />
              {t('search.ctaPrivacy')}
            </p>
          </div>
        </>
      ) : null}
    </Ticket>
  );
}
