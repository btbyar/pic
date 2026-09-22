import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { formatEventRange } from '@/lib/datetime';
import type { PublicEvent } from '@/lib/types';
import { ImagesIcon } from './icons';

/** Эвэнт = нэг үзэгдэл: өргөн кадр, гарчиг нь зураг дээрээ */
export async function EventCard({ event, index = 0 }: { event: PublicEvent; index?: number }) {
  const t = await getTranslations();
  return (
    <Link
      href={`/events/${event.slug}`}
      className="group relative flex aspect-[4/3] animate-rise flex-col justify-end overflow-hidden rounded-[18px] bg-night-2 ring-1 ring-inset ring-white/[0.06] stagger transition duration-500 ease-cine hover:ring-gold/60"
      style={{ '--i': index } as React.CSSProperties}
    >
      {event.coverUrl ? (
        <img
          src={event.coverUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition duration-[1.2s] ease-cine group-hover:scale-[1.06]"
        />
      ) : (
        <ImagesIcon size={32} className="absolute inset-0 m-auto text-line-strong" />
      )}
      <div aria-hidden className="scrim absolute inset-0" />
      <span className="glass absolute right-3 top-3 rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ivory">
        {t('common.photos', { count: event.photoCount })}
      </span>
      <div className="relative flex flex-col gap-1.5 p-5">
        <span className="kicker text-mist">{formatEventRange(event.startsAt, event.endsAt, event.timezone)}</span>
        <h3 className="line-clamp-2 font-display text-3xl font-semibold leading-[1.02]">{event.title}</h3>
      </div>
    </Link>
  );
}
