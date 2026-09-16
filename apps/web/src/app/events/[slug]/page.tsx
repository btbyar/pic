import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Alert, Card } from '@/components/ui';
import { serverApi } from '@/lib/api-server';
import { formatEventRange, formatMnt } from '@/lib/datetime';
import type { PublicEvent } from '@/lib/types';

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

  const t = await getTranslations();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8">
      <Link href="/events" className="text-sm text-slate-600 underline-offset-4 hover:underline">
        ← {t('events.title')}
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{event.title}</h1>
        <p className="text-slate-600">{formatEventRange(event.startsAt, event.endsAt, event.timezone)}</p>
        {event.location ? <p className="text-slate-600">{event.location}</p> : null}
      </header>

      {event.description ? <p className="whitespace-pre-line text-slate-800">{event.description}</p> : null}

      <Card className="flex flex-col gap-1">
        <p className="font-medium">{t('events.pricePerPhoto', { price: formatMnt(event.pricePerPhoto) })}</p>
        {event.bundlePrice !== null ? (
          <p className="text-slate-700">{t('events.bundle', { price: formatMnt(event.bundlePrice) })}</p>
        ) : null}
        <p className="text-sm text-slate-500">{t('common.photos', { count: event.photoCount })}</p>
        {event.photographers?.length ? (
          <p className="text-sm text-slate-500">
            {t('events.photographers')}: {event.photographers.join(', ')}
          </p>
        ) : null}
      </Card>

      <Alert kind="info">{t('events.searchSoon')}</Alert>
    </main>
  );
}
