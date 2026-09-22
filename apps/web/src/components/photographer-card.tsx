import Link from 'next/link';
import type { PhotographerCard as Card } from '@/lib/types';
import { Avatar } from './avatar';
import { ArrowRightIcon } from './icons';

/** Зурагчин = киноны зурагт хуудас: босоо кадр, нэр нь зураг дээрээ */
export function PhotographerCard({ p, index = 0 }: { p: Card; index?: number }) {
  return (
    <Link
      href={`/photographers/${p.slug}`}
      className="group relative flex aspect-[3/4] animate-rise flex-col justify-end overflow-hidden rounded-[18px] bg-night-2 ring-1 ring-inset ring-white/[0.06] stagger transition duration-500 ease-cine hover:-translate-y-1 hover:ring-gold/60 focus-visible:ring-gold"
      style={{ '--i': index } as React.CSSProperties}
    >
      {p.coverUrl ? (
        <img
          src={p.coverUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition duration-[1.2s] ease-cine group-hover:scale-[1.06]"
        />
      ) : (
        // Зураггүй зурагчин: нэрийн эхний үсэг зурагт хуудасны «титр» болно
        <span aria-hidden className="absolute inset-0 flex items-center justify-center overflow-hidden">
          <span className="absolute size-48 rounded-full bg-gold/10 blur-3xl" />
          <span className="relative font-display text-[10rem] font-semibold italic leading-none text-white/[0.07] transition duration-700 group-hover:text-gold/20">
            {p.displayName.trim().charAt(0).toUpperCase()}
          </span>
        </span>
      )}
      <div aria-hidden className="scrim absolute inset-0" />
      <div className="relative flex items-end gap-3 p-4 sm:p-5">
        <Avatar url={p.avatarUrl} name={p.displayName} size={40} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {p.city ? <span className="kicker truncate !text-[10px] text-mist">{p.city}</span> : null}
          <span className="truncate font-display text-2xl font-semibold leading-tight">{p.displayName}</span>
        </span>
        <span
          aria-hidden
          className="flex size-9 shrink-0 translate-x-2 items-center justify-center rounded-full bg-gold text-gold-ink opacity-0 transition duration-500 ease-cine group-hover:translate-x-0 group-hover:opacity-100"
        >
          <ArrowRightIcon size={16} />
        </span>
      </div>
    </Link>
  );
}
