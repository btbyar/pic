import { getTranslations } from 'next-intl/server';
import { EventCard } from '@/components/event-card';
import { SearchIcon } from '@/components/icons';
import { PhotographerCard } from '@/components/photographer-card';
import { serverApi } from '@/lib/api-server';
import type { PhotographerCard as Card, PublicEvent } from '@/lib/types';

/** Оролцогчийн орох цэг: зурагчнаа сонгоод профайлаас нь эвэнтээ нээнэ */
export default async function PhotographersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q: raw } = await searchParams;
  const q = raw?.trim().slice(0, 100) ?? '';
  const t = await getTranslations('photographers');
  // Хайхад эвэнтийн нэрээр нь ч хайна — оролцогч ихэвчлэн эвэнтийнхээ нэрийг мэддэг
  const [{ data }, events] = await Promise.all([
    serverApi<Card[]>(`/photographers${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    q.length >= 2 ? serverApi<PublicEvent[]>(`/events/search?q=${encodeURIComponent(q)}`) : Promise.resolve({ data: [] }),
  ]);
  const photographers = data ?? [];
  const foundEvents = events.data ?? [];

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('title')}</h1>
        <p className="max-w-xl text-ink-soft">{t('intro')}</p>
        <form
          action="/photographers"
          className="mt-3 flex w-full max-w-lg items-center gap-2 rounded-xl bg-surface-2 p-2 ring-1 ring-line"
        >
          <SearchIcon size={20} className="ml-2 shrink-0 text-ink-faint" />
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="min-h-11 min-w-0 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-ink-faint"
          />
          <button type="submit" className="min-h-11 shrink-0 cursor-pointer rounded-xl bg-ink px-5 text-sm font-semibold text-surface transition hover:bg-white">
            {t('search')}
          </button>
        </form>
      </div>
      {foundEvents.length ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{t('foundEvents')}</h2>
          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {foundEvents.map((e) => (
              <li key={e.id}>
                <EventCard event={e} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {photographers.length === 0 && foundEvents.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-16 text-center text-ink-soft">
          {q ? t('emptySearch', { q }) : t('empty')}
        </p>
      ) : photographers.length ? (
        <section className="flex flex-col gap-4">
          {foundEvents.length ? <h2 className="text-lg font-semibold">{t('title')}</h2> : null}
          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {photographers.map((p) => (
              <li key={p.slug}>
                <PhotographerCard p={p} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
