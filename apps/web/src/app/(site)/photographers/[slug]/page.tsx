import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Avatar } from '@/components/avatar';
import { BackLink } from '@/components/back-link';
import { EventCard } from '@/components/event-card';
import { ExpandableText } from '@/components/expandable-text';
import { FilmIcon } from '@/components/icons';
import { EmptyState, Kicker } from '@/components/ui';
import { serverApi } from '@/lib/api-server';
import type { PhotographerPage } from '@/lib/types';

async function load(slug: string) {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  return (await serverApi<PhotographerPage>(`/photographers/${slug}`)).data;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await load((await params).slug);
  return p ? { title: `${p.displayName} — Pic`, description: p.bio ?? undefined } : {};
}

export default async function PhotographerProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await load((await params).slug);
  if (!p) notFound();
  const t = await getTranslations('photographers');
  // Баннер: хамгийн сүүлийн cover-тэй эвэнтийн том зураг
  const banner = p.events.find((e) => e.coverLargeUrl)?.coverLargeUrl ?? null;

  return (
    <main>
      {/* ——— Нэрийн хуудас: баннер дээр том нэр ——— */}
      <section className="relative isolate flex min-h-[64svh] flex-col overflow-hidden">
        {banner ? (
          <img src={banner} alt="" className="absolute inset-0 -z-20 h-full w-full animate-kenburns object-cover" />
        ) : (
          <div aria-hidden className="absolute -top-40 right-0 -z-20 h-[34rem] w-[48rem] animate-drift rounded-full bg-gold/10 blur-[120px]" />
        )}
        <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-b from-night/85 via-night/40 to-night" />

        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 pb-12 pt-28">
          <BackLink href="/photographers">{t('title')}</BackLink>
          <div className="mt-auto flex flex-col gap-6 pt-20 sm:flex-row sm:items-end sm:gap-8">
            <div className="animate-rise">
              <Avatar url={p.avatarUrl} name={p.displayName} size={120} />
            </div>
            <div className="flex flex-col gap-4">
              <Kicker className="animate-rise !text-mist">{p.city ?? t('kicker')}</Kicker>
              <h1 className="animate-rise font-display text-[clamp(3rem,8vw,7rem)] font-semibold leading-[0.88] tracking-[-0.035em] stagger [--i:1]">
                {p.displayName}
              </h1>
            </div>
          </div>
          <dl className="mt-10 flex animate-rise flex-wrap gap-x-12 gap-y-4 border-t border-white/10 pt-6 stagger [--i:2]">
            <div className="flex flex-col">
              <dd className="font-display text-4xl font-semibold leading-none tabular-nums">{p.events.length}</dd>
              <dt className="kicker mt-2">{t('eventsTitle')}</dt>
            </div>
            <div className="flex flex-col">
              <dd className="font-display text-4xl font-semibold leading-none tabular-nums">{p.photoCount}</dd>
              <dt className="kicker mt-2">{t('photosLabel')}</dt>
            </div>
          </dl>
        </div>
      </section>

      <div className="mx-auto flex max-w-7xl flex-col gap-16 px-5">
        {p.bio ? (
          <ExpandableText
            text={p.bio}
            more={t('showMore')}
            less={t('showLess')}
            className="max-w-3xl !items-start font-display text-2xl leading-snug text-ivory/90 sm:text-3xl"
          />
        ) : null}

        <section className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <Kicker>{t('filmography')}</Kicker>
            <h2 className="font-display text-5xl font-semibold leading-none tracking-[-0.02em]">{t('eventsTitle')}</h2>
          </div>
          {p.events.length === 0 ? (
            <EmptyState icon={<FilmIcon size={28} />} title={t('noEvents')} />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {p.events.map((e, i) => (
                <li key={e.id}>
                  <EventCard event={e} index={i} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
