import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { formatEventRange, formatMnt } from '@/lib/datetime';
import type { PublicEvent } from '@/lib/types';
import { CalendarIcon, ImagesIcon, PinIcon, ScanFaceIcon } from './icons';

/** Профайл дээрх эвэнтийн карт: cover, товч мэдээлэл, доор нь гол үйлдлийн товч */
export async function EventCard({ event }: { event: PublicEvent }) {
  const t = await getTranslations();
  return (
    <Link
      href={`/events/${event.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm shadow-stone-900/[0.03] transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg hover:shadow-stone-900/[0.06]"
    >
      <div className="relative aspect-[16/10] shrink-0 overflow-hidden bg-linear-to-br from-brand-100 via-brand-50 to-stone-100">
        {event.coverUrl ? (
          <img
            src={event.coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <ImagesIcon size={36} className="absolute inset-0 m-auto text-brand-300" />
        )}
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-stone-700 backdrop-blur">
          {t(`categories.${event.category}`)}
        </span>
        {event.featured ? (
          <span className="absolute right-3 top-3 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white">
            {t('events.featured')}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="line-clamp-2 font-semibold leading-snug text-stone-900">{event.title}</h3>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
          <span className="flex items-center gap-1">
            <ImagesIcon size={14} />
            {t('common.photos', { count: event.photoCount })}
          </span>
          <span className="flex items-center gap-1">
            <CalendarIcon size={14} />
            {formatEventRange(event.startsAt, event.endsAt, event.timezone)}
          </span>
          {event.location ? (
            <span className="flex items-center gap-1">
              <PinIcon size={14} />
              {event.location}
            </span>
          ) : null}
        </div>
        <div className="mt-auto flex flex-col gap-2 pt-1">
          <span className="text-sm text-stone-600">{t('events.pricePerPhoto', { price: formatMnt(event.pricePerPhoto) })}</span>
          <span className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 text-sm font-semibold text-white transition group-hover:bg-brand-700">
            {event.faceSearchEnabled ? <ScanFaceIcon size={16} /> : <ImagesIcon size={16} />}
            {event.faceSearchEnabled ? t('events.findCta') : t('events.browseCta')}
          </span>
        </div>
      </div>
    </Link>
  );
}
