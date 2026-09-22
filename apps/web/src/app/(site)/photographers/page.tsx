import { getTranslations } from 'next-intl/server';
import { EventCard } from '@/components/event-card';
import { SearchIcon, UsersIcon } from '@/components/icons';
import { PhotographerCard } from '@/components/photographer-card';
import { ButtonLink, EmptyState, Kicker } from '@/components/ui';
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
    <main className="relative mx-auto flex max-w-7xl flex-col gap-16 px-5 pt-32">
      <div aria-hidden className="pointer-events-none absolute -top-10 left-0 -z-10 h-[28rem] w-[44rem] animate-drift rounded-full bg-gold/[0.08] blur-[120px]" />

      <header className="grid items-end gap-8 lg:grid-cols-[1fr_28rem]">
        <div className="flex flex-col gap-5">
          <Kicker className="animate-rise">{q ? t('resultsKicker', { q }) : t('kicker')}</Kicker>
          <h1 className="animate-rise font-display text-[clamp(3rem,8vw,7rem)] font-semibold leading-[0.88] tracking-[-0.035em] stagger [--i:1]">
            {t('title')}
          </h1>
          <p className="max-w-xl animate-rise text-lg text-mist stagger [--i:2]">{t('intro')}</p>
        </div>
        <form
          action="/photographers"
          role="search"
          className="glass group flex w-full animate-rise items-center gap-2 rounded-2xl p-2 stagger transition [--i:3] focus-within:ring-2 focus-within:ring-gold"
        >
          <SearchIcon size={20} className="ml-3 shrink-0 text-mist transition group-focus-within:text-gold" />
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="min-h-12 min-w-0 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-dim"
          />
          <button
            type="submit"
            className="shine min-h-12 shrink-0 cursor-pointer rounded-xl bg-gold px-5 text-[15px] font-semibold text-gold-ink transition hover:bg-gold-soft active:scale-[0.97]"
          >
            {t('search')}
          </button>
        </form>
      </header>

      {foundEvents.length ? (
        <section className="flex flex-col gap-6">
          <h2 className="font-display text-4xl font-semibold">{t('foundEvents')}</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {foundEvents.map((e, i) => (
              <li key={e.id}>
                <EventCard event={e} index={i} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {photographers.length === 0 && foundEvents.length === 0 ? (
        <EmptyState
          icon={<UsersIcon size={28} />}
          title={q ? t('emptySearch', { q }) : t('empty')}
          action={
            q ? (
              <ButtonLink href="/photographers" variant="secondary">
                {t('clearSearch')}
              </ButtonLink>
            ) : undefined
          }
        />
      ) : photographers.length ? (
        <section className="flex flex-col gap-6">
          {foundEvents.length ? <h2 className="font-display text-4xl font-semibold">{t('title')}</h2> : null}
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {photographers.map((p, i) => (
              <li key={p.slug}>
                <PhotographerCard p={p} index={i} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
