import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Avatar } from '@/components/avatar';
import { EventCard } from '@/components/event-card';
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

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <Link href="/photographers" className="text-sm text-slate-600 underline-offset-4 hover:underline">
        ← {t('title')}
      </Link>
      <header className="flex items-center gap-4">
        <Avatar url={p.avatarUrl} name={p.displayName} size={96} />
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">{p.displayName}</h1>
          <p className="text-slate-600">
            {[p.city, t('events', { count: p.events.length }), t('photos', { count: p.photoCount })].filter(Boolean).join(' · ')}
          </p>
        </div>
      </header>
      {p.bio ? <p className="max-w-2xl whitespace-pre-line text-slate-800">{p.bio}</p> : null}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('eventsTitle')}</h2>
        {p.events.length === 0 ? (
          <p className="text-slate-500">{t('noEvents')}</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
