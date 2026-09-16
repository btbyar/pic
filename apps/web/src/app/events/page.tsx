import { EVENT_CATEGORIES, type EventCategory } from '@pic/shared';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EventCard } from '@/components/event-card';
import { Button, Input } from '@/components/ui';
import { serverApi } from '@/lib/api-server';
import type { PublicEventPage } from '@/lib/types';

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cursor?: string; category?: string }>;
}) {
  const { q, cursor, category: rawCategory } = await searchParams;
  const category = EVENT_CATEGORIES.includes(rawCategory as EventCategory) ? (rawCategory as EventCategory) : undefined;
  const t = await getTranslations();

  const params = new URLSearchParams();
  if (q?.trim()) params.set('q', q.trim());
  if (category) params.set('category', category);
  const filterParams = new URLSearchParams(params);
  if (cursor) params.set('cursor', cursor);

  const { data } = await serverApi<PublicEventPage>(`/events${params.size ? `?${params}` : ''}`);
  const page = data ?? { items: [], nextCursor: null };

  const nextParams = new URLSearchParams(filterParams);
  if (page.nextCursor) nextParams.set('cursor', page.nextCursor);

  const categoryHref = (c?: EventCategory) => {
    const p = new URLSearchParams();
    if (q?.trim()) p.set('q', q.trim());
    if (c) p.set('category', c);
    return `/events${p.size ? `?${p}` : ''}`;
  };
  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
      active ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'
    }`;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">
          <Link href="/">Pic</Link> · {t('events.title')}
        </h1>
        <form className="flex gap-2" action="/events">
          {category ? <input type="hidden" name="category" value={category} /> : null}
          <Input
            name="q"
            defaultValue={q ?? ''}
            placeholder={t('events.searchPlaceholder')}
            aria-label={t('events.searchPlaceholder')}
          />
          <Button type="submit" variant="secondary">
            {t('events.search')}
          </Button>
        </form>
      </div>

      {/* Утсан дээр хэвтээ гүйлгэнэ */}
      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={categoryHref()} className={chip(!category)}>
          {t('categories.all')}
        </Link>
        {EVENT_CATEGORIES.map((c) => (
          <Link key={c} href={categoryHref(c)} className={chip(category === c)}>
            {t(`categories.${c}`)}
          </Link>
        ))}
      </nav>

      {page.items.length === 0 ? (
        <p className="py-16 text-center text-slate-500">{q ? t('events.emptySearch', { q }) : t('events.empty')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {page.items.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {page.nextCursor ? (
        <Link href={`/events?${nextParams}`} className="self-center text-sm font-medium underline underline-offset-4">
          {t('events.loadMore')}
        </Link>
      ) : null}
    </main>
  );
}
