import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowRightIcon, ImagesIcon, PlusIcon } from '@/components/icons';
import { Alert } from '@/components/ui';
import { VisibilityBadge } from '@/components/visibility-badge';
import { serverApi } from '@/lib/api-server';
import { formatEventRange } from '@/lib/datetime';
import type { MyEvent, MyProfile } from '@/lib/types';

export default async function MyEventsPage() {
  const t = await getTranslations();
  const [{ data }, { data: profile }] = await Promise.all([
    serverApi<MyEvent[]>('/photographer/events'),
    serverApi<MyProfile>('/photographer/profile'),
  ]);
  const events = data ?? [];
  const totalPhotos = events.reduce((sum, e) => sum + e.photoCount, 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">{t('photographer.myEvents')}</h1>
          {events.length ? (
            <p className="text-sm text-ink-soft">{t('photographer.eventsSummary', { events: events.length, photos: totalPhotos })}</p>
          ) : null}
        </div>
        {/* Өргөн дэлгэцэд энэ товч зүүн цэсэнд байгаа */}
        <Link
          href="/photographer/events/new"
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-on-brand transition hover:bg-brand-700 lg:hidden"
        >
          <PlusIcon size={16} />
          {t('photographer.newEvent')}
        </Link>
      </div>

      {profile && !profile.slugSaved ? (
        <Alert kind="info">
          {t('photographer.publishProfileHint')}{' '}
          <Link href="/photographer/profile" className="inline-flex items-center gap-1 font-medium underline underline-offset-4">
            {t('photographer.publishProfile')}
            <ArrowRightIcon size={14} />
          </Link>
        </Alert>
      ) : null}

      {events.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-surface-2 px-4 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <ImagesIcon size={28} />
          </span>
          <p className="text-ink-soft">{t('photographer.noEvents')}</p>
          <Link
            href="/photographer/events/new"
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-on-brand transition hover:bg-brand-700"
          >
            <PlusIcon size={16} />
            {t('photographer.newEvent')}
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/photographer/events/${e.id}`} className="flex cursor-pointer items-center gap-4 p-3 transition hover:bg-surface-3">
                <span className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-3">
                  {e.coverUrl ? (
                    <img src={e.coverUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  ) : (
                    <ImagesIcon size={20} className="absolute inset-0 m-auto text-ink-faint" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-semibold">{e.title}</span>
                  <span className="truncate text-sm text-ink-soft">
                    {formatEventRange(e.startsAt, e.endsAt, e.timezone)}
                    {e.location ? `, ${e.location}` : ''}
                  </span>
                </span>
                <span className="hidden w-28 shrink-0 text-right text-sm tabular-nums text-ink-soft sm:block">
                  {t('common.photos', { count: e.photoCount })}
                </span>
                <span className="hidden w-24 shrink-0 text-sm text-ink-soft md:block">
                  {e.isOwner ? t('photographer.owner') : t('photographer.member')}
                </span>
                <VisibilityBadge visibility={e.visibility} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
