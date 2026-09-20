import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { formatEventRange } from '@/lib/datetime';
import type { PublicEvent } from '@/lib/types';
import { ImagesIcon } from './icons';

/** Эвэнтийн карт: зураг гол, доор нь нэр ба нэг мөр мэдээлэл */
export async function EventCard({ event }: { event: PublicEvent }) {
  const t = await getTranslations();
  return (
    <Link href={`/events/${event.slug}`} className="group flex h-full flex-col gap-3">
      <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-surface-2">
        {event.coverUrl ? (
          <img
            src={event.coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:opacity-90"
          />
        ) : (
          <ImagesIcon size={28} className="absolute inset-0 m-auto text-ink-faint" />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="line-clamp-2 font-display font-semibold leading-snug group-hover:text-ink">{event.title}</h3>
        <p className="flex flex-wrap gap-x-4 text-sm text-ink-soft">
          <span>{formatEventRange(event.startsAt, event.endsAt, event.timezone)}</span>
          <span>{t('common.photos', { count: event.photoCount })}</span>
        </p>
      </div>
    </Link>
  );
}
