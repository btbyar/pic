import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ExternalLinkIcon, ImagesIcon, PlusIcon, QrIcon, UploadIcon } from '@/components/icons';
import { Alert, ButtonLink } from '@/components/ui';
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
          <h1 className="text-3xl font-extrabold">{t('photographer.myEvents')}</h1>
          {events.length ? (
            <p className="text-sm text-ink-soft">{t('photographer.eventsSummary', { events: events.length, photos: totalPhotos })}</p>
          ) : null}
        </div>
        {/* Өргөн дэлгэцэд энэ товч зүүн цэсэнд байгаа */}
        <ButtonLink href="/photographer/events/new" className="gap-2 lg:hidden">
          <PlusIcon size={16} />
          {t('photographer.newEvent')}
        </ButtonLink>
      </div>

      {profile && !profile.slugSaved ? (
        <Alert kind="info">
          {t('photographer.publishProfileHint')}{' '}
          <Link href="/photographer/profile" className="font-medium underline underline-offset-4">
            {t('photographer.publishProfile')}
          </Link>
        </Alert>
      ) : null}

      {events.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-surface-2 px-4 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-ink-soft">
            <ImagesIcon size={28} />
          </span>
          <p className="text-ink-soft">{t('photographer.noEvents')}</p>
          <ButtonLink href="/photographer/events/new" className="gap-2">
            <PlusIcon size={16} />
            {t('photographer.newEvent')}
          </ButtonLink>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-surface-2 p-2">
          {/* Өргөн дэлгэцэд хүснэгтийн толгой */}
          <div className="hidden grid-cols-[minmax(0,1fr)_8rem_7rem_8rem_7.5rem] gap-4 px-3 py-2 text-xs font-semibold text-ink-soft lg:grid" aria-hidden>
            <span>{t('photographer.colEvent')}</span>
            <span>{t('photographer.photos')}</span>
            <span>{t('photographer.colRole')}</span>
            <span>{t('photographer.colStatus')}</span>
            <span />
          </div>
          <ul className="flex flex-col">
            {events.map((e) => (
              <li
                key={e.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-xl p-3 transition hover:bg-surface lg:grid-cols-[minmax(0,1fr)_8rem_7rem_8rem_7.5rem]"
              >
                <Link href={`/photographer/events/${e.id}`} className="flex min-w-0 items-center gap-4">
                  <span className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-3">
                    {e.coverUrl ? (
                      <img src={e.coverUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      <ImagesIcon size={20} className="absolute inset-0 m-auto text-ink-faint" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-semibold">{e.title}</span>
                    <span className="truncate text-sm text-ink-soft">
                      {formatEventRange(e.startsAt, e.endsAt, e.timezone)}
                      {e.location ? `, ${e.location}` : ''}
                    </span>
                  </span>
                </Link>
                <span className="hidden text-sm font-semibold tabular-nums lg:block">
                  {e.photoCount ? t('common.photos', { count: e.photoCount }) : <span className="text-amber-800">{t('photographer.noPhotosYet')}</span>}
                </span>
                <span className="hidden text-sm text-ink-soft lg:block">{e.isOwner ? t('photographer.owner') : t('photographer.member')}</span>
                <span className="justify-self-end lg:justify-self-start">
                  <VisibilityBadge visibility={e.visibility} />
                </span>
                <span className="col-span-2 flex justify-end gap-1 lg:col-span-1">
                  <Link
                    href={`/photographer/events/${e.id}/upload`}
                    aria-label={`${t('photographer.uploadPhotos')}: ${e.title}`}
                    title={t('photographer.uploadPhotos')}
                    className={`flex size-10 items-center justify-center rounded-full ${e.photoCount === 0 ? 'bg-brand-50 text-brand-700' : 'text-ink-soft hover:bg-surface-3 hover:text-ink'}`}
                  >
                    <UploadIcon size={18} />
                  </Link>
                  <Link
                    href={`/photographer/events/${e.id}/poster`}
                    aria-label={`${t('poster.print')}: ${e.title}`}
                    title={t('poster.print')}
                    className="flex size-10 items-center justify-center rounded-full text-ink-soft hover:bg-surface-3 hover:text-ink"
                  >
                    <QrIcon size={18} />
                  </Link>
                  {/* Нууц холбоосны токен жагсаалтад ирдэггүй — зөвхөн нийтийн эвэнтэд */}
                  {e.visibility === 'PUBLIC' ? (
                    <Link
                      href={`/events/${e.slug}`}
                      aria-label={`${t('photographer.viewPublic')}: ${e.title}`}
                      title={t('photographer.viewPublic')}
                      className="flex size-10 items-center justify-center rounded-full text-ink-soft hover:bg-surface-3 hover:text-ink"
                    >
                      <ExternalLinkIcon size={18} />
                    </Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
