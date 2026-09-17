import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { formatEventRange, formatMnt } from '@/lib/datetime';
import type { PublicEvent } from '@/lib/types';
import { Badge } from './ui';

export async function EventCard({ event }: { event: PublicEvent }) {
  const t = await getTranslations();
  return (
    <Link
      href={`/events/${event.slug}`}
      className="flex flex-col gap-2 overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-slate-400"
    >
      <div className="relative aspect-[16/9] shrink-0 bg-slate-100">
        {event.coverUrl ? (
          <img src={event.coverUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 px-4 pb-4 pt-1">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-semibold leading-snug">{event.title}</h2>
        {event.featured ? <Badge tone="amber">{t('events.featured')}</Badge> : null}
      </div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t(`categories.${event.category}`)}</p>
      <p className="text-sm text-slate-600">{formatEventRange(event.startsAt, event.endsAt, event.timezone)}</p>
      {event.location ? <p className="text-sm text-slate-600">{event.location}</p> : null}
      <div className="mt-auto flex items-center justify-between pt-2 text-sm">
        <span className="text-slate-500">{t('common.photos', { count: event.photoCount })}</span>
        <span className="font-medium">{t('events.pricePerPhoto', { price: formatMnt(event.pricePerPhoto) })}</span>
      </div>
      </div>
    </Link>
  );
}
