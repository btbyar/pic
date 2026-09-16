import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EventCard } from '@/components/event-card';
import { Button, Input } from '@/components/ui';
import { serverApi } from '@/lib/api-server';
import type { PublicEventPage } from '@/lib/types';

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ q?: string; cursor?: string }> }) {
  const { q, cursor } = await searchParams;
  const t = await getTranslations('events');

  const params = new URLSearchParams();
  if (q?.trim()) params.set('q', q.trim());
  if (cursor) params.set('cursor', cursor);
  const { data } = await serverApi<PublicEventPage>(`/events${params.size ? `?${params}` : ''}`);
  const page = data ?? { items: [], nextCursor: null };

  const nextParams = new URLSearchParams(params);
  if (page.nextCursor) nextParams.set('cursor', page.nextCursor);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">
          <Link href="/">Pic</Link> · {t('title')}
        </h1>
        <form className="flex gap-2" action="/events">
          <Input name="q" defaultValue={q ?? ''} placeholder={t('searchPlaceholder')} aria-label={t('searchPlaceholder')} />
          <Button type="submit" variant="secondary">
            {t('search')}
          </Button>
        </form>
      </div>

      {page.items.length === 0 ? (
        <p className="py-16 text-center text-slate-500">{q ? t('emptySearch', { q }) : t('empty')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {page.items.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {page.nextCursor ? (
        <Link href={`/events?${nextParams}`} className="self-center text-sm font-medium underline underline-offset-4">
          {t('loadMore')}
        </Link>
      ) : null}
    </main>
  );
}
