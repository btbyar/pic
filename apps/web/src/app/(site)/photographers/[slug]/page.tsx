import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Avatar } from '@/components/avatar';
import { EventCard } from '@/components/event-card';
import { ExpandableText } from '@/components/expandable-text';
import { CameraIcon, ImagesIcon, PinIcon } from '@/components/icons';
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

  const chip = 'inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1 text-sm text-ink-soft';
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-8 pt-4 sm:pt-6">
      <header className="flex flex-col items-center text-center">
        <div className="relative h-40 w-full overflow-hidden rounded-2xl bg-surface-2 sm:h-60">
          {banner ? <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/40 to-transparent" />
        </div>
        <div className="-mt-14 rounded-full bg-surface p-1.5 sm:-mt-16">
          <Avatar url={p.avatarUrl} name={p.displayName} size={112} />
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{p.displayName}</h1>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {p.city ? (
            <span className={chip}>
              <PinIcon size={14} />
              {p.city}
            </span>
          ) : null}
          <span className={chip}>
            <CameraIcon size={14} />
            {t('events', { count: p.events.length })}
          </span>
          <span className={chip}>
            <ImagesIcon size={14} />
            {t('photos', { count: p.photoCount })}
          </span>
        </div>
        {p.bio ? (
          <ExpandableText text={p.bio} more={t('showMore')} less={t('showLess')} className="mt-4 max-w-2xl text-ink-soft" />
        ) : null}
      </header>

      <section className="flex flex-col gap-5">
        <h2 className="text-xl font-bold">{t('eventsTitle')}</h2>
        {p.events.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line py-12 text-center text-ink-soft">{t('noEvents')}</p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {p.events.map((e) => (
              <li key={e.id}>
                <EventCard event={e} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
