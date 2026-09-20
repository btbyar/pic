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
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <ImagesIcon size={28} className="absolute inset-0 m-auto text-ink-faint" />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="line-clamp-2 font-display font-semibold leading-snug group-hover:text-brand-700">{event.title}</h3>
        <p className="text-sm text-ink-soft">
          {formatEventRange(event.startsAt, event.endsAt, event.timezone)} · {t('common.photos', { count: event.photoCount })}
        </p>
      </div>
    </Link>
  );
}
