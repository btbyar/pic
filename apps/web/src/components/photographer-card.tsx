import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { PhotographerCard as Card } from '@/lib/types';
import { Avatar } from './avatar';
import { ArrowRightIcon, PinIcon } from './icons';

/** Зурагчны карт: сүүлийн эвэнтийн cover баннер + дээр нь давхарласан avatar */
export async function PhotographerCard({ p }: { p: Card }) {
  const t = await getTranslations('photographers');
  return (
    <Link
      href={`/photographers/${p.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm shadow-stone-900/[0.03] transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg hover:shadow-stone-900/[0.06]"
    >
      <div className="relative h-24 shrink-0 bg-linear-to-br from-brand-100 via-brand-50 to-stone-100">
        {p.coverUrl ? (
          <img
            src={p.coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : null}
      </div>
      <div className="relative flex flex-1 flex-col gap-1 px-5 pb-5">
        <div className="-mt-9 mb-2 self-start rounded-full bg-white p-1 shadow-sm">
          <Avatar url={p.avatarUrl} name={p.displayName} size={64} />
        </div>
        <h3 className="font-semibold leading-snug text-stone-900">{p.displayName}</h3>
        {p.city ? (
          <p className="flex items-center gap-1.5 text-sm text-stone-500">
            <PinIcon size={14} className="shrink-0" />
            {p.city}
          </p>
        ) : null}
        {p.bio ? <p className="mt-2 line-clamp-2 text-sm text-stone-600">{p.bio}</p> : null}
        <div className="mt-auto flex items-center justify-between pt-4 text-sm">
          <span className="rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-700">{t('events', { count: p.eventCount })}</span>
          <span className="flex items-center gap-1 font-medium text-stone-500 transition group-hover:text-brand-700">
            {t('viewGallery')}
            <ArrowRightIcon size={14} className="transition group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
