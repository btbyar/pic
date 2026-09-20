import Link from 'next/link';
import type { PhotographerCard as Card } from '@/lib/types';
import { Avatar } from './avatar';
import { CameraIcon } from './icons';

/** Зурагчны карт: сүүлийн ажлынх нь зураг, доор нь нэр */
export function PhotographerCard({ p }: { p: Card }) {
  return (
    <Link href={`/photographers/${p.slug}`} className="group flex h-full flex-col gap-3">
      {/* Зураггүй байсан ч хэмжээ нь ижил — эс тэгвээс тор эвдэрнэ */}
      <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-surface-2">
        {p.coverUrl ? (
          <img
            src={p.coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <CameraIcon size={24} className="absolute inset-0 m-auto text-ink-faint" />
        )}
      </div>
      <div className="flex items-center gap-3">
        <Avatar url={p.avatarUrl} name={p.displayName} size={40} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-display font-semibold group-hover:text-brand-700">{p.displayName}</span>
          {p.city ? <span className="truncate text-sm text-ink-soft">{p.city}</span> : null}
        </span>
      </div>
    </Link>
  );
}
