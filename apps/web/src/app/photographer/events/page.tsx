import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ExternalLinkIcon, ImagesIcon, PlusIcon, QrIcon, UploadIcon } from '@/components/icons';
import { Alert, ButtonLink, EmptyState, PageHeader } from '@/components/ui';
import { VisibilityBadge } from '@/components/visibility-badge';
import { serverApi } from '@/lib/api-server';
import { formatEventRange, formatMnt } from '@/lib/datetime';
import type { MyEvent, MyProfile, PhotographerSales } from '@/lib/types';

const COLS = 'lg:grid-cols-[minmax(0,1fr)_7rem_8rem_6rem_8.5rem_8rem]';
const iconAction = 'flex size-11 items-center justify-center rounded-full transition';

export default async function MyEventsPage() {
  const t = await getTranslations();
  const [{ data }, { data: profile }, { data: sales }] = await Promise.all([
    serverApi<MyEvent[]>('/photographer/events'),
    serverApi<MyProfile>('/photographer/profile'),
    serverApi<PhotographerSales>('/photographer/sales'),
  ]);
  const salesByEvent = new Map(sales?.byEvent.map((s) => [s.eventId, s.amount]));
  const events = data ?? [];
  const totalPhotos = events.reduce((sum, e) => sum + e.photoCount, 0);

  return (
    <>
      <PageHeader
        kicker={t('photographer.eventsKicker')}
        title={t('photographer.myEvents')}
        intro={events.length ? <p className="font-mono text-xs uppercase tracking-[0.14em]">{t('photographer.eventsSummary', { events: events.length, photos: totalPhotos })}</p> : undefined}
      />

      {profile && !profile.slugSaved ? (
        <Alert kind="info">
          {t('photographer.publishProfileHint')}{' '}
          <Link href="/photographer/profile" className="font-semibold underline underline-offset-4">
            {t('photographer.publishProfile')}
          </Link>
        </Alert>
      ) : null}

      {events.length === 0 ? (
        <EmptyState
          icon={<ImagesIcon size={28} />}
          title={t('photographer.noEvents')}
          body={t('overview.firstEventBody')}
          action={
            <ButtonLink href="/photographer/events/new" className="gap-2">
              <PlusIcon size={16} />
              {t('photographer.newEvent')}
            </ButtonLink>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {/* Өргөн дэлгэцэд хүснэгтийн толгой */}
          <div className={`kicker hidden gap-4 px-4 lg:grid ${COLS}`} aria-hidden>
            <span>{t('photographer.colEvent')}</span>
            <span>{t('photographer.photos')}</span>
            <span>{t('photographer.colSales')}</span>
            <span>{t('photographer.colRole')}</span>
            <span>{t('photographer.colStatus')}</span>
            <span />
          </div>
          <ul className="flex flex-col gap-2">
            {events.map((e, i) => {
              const sold = salesByEvent.get(e.id);
              return (
                <li
                  key={e.id}
                  style={{ '--i': Math.min(i, 10) } as React.CSSProperties}
                  className={`panel group relative grid animate-rise grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 p-3 transition duration-300 stagger hover:bg-night-3 ${COLS}`}
                >
                  <Link href={`/photographer/events/${e.id}`} className="flex min-w-0 items-center gap-4 after:absolute after:inset-0 after:rounded-[1.25rem]">
                    <span className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-night-3 ring-1 ring-inset ring-white/5">
                      {e.coverUrl ? (
                        <img src={e.coverUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-700 ease-cine group-hover:scale-110" />
                      ) : (
                        <ImagesIcon size={20} className="absolute inset-0 m-auto text-dim" />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="truncate font-display text-xl font-semibold leading-tight group-hover:text-gold">{e.title}</span>
                      <span className="truncate font-mono text-[11px] text-dim">
                        {formatEventRange(e.startsAt, e.endsAt, e.timezone)}
                        {e.location ? ` · ${e.location}` : ''}
                      </span>
                    </span>
                  </Link>
                  <span className="hidden text-sm font-semibold tabular-nums lg:block">
                    {e.photoCount ? t('common.photos', { count: e.photoCount }) : <span className="text-gold">{t('photographer.noPhotosYet')}</span>}
                  </span>
                  <span className="hidden font-display text-lg font-semibold tabular-nums lg:block">
                    {sold ? formatMnt(sold) : <span className="font-sans text-sm font-normal text-dim">—</span>}
                  </span>
                  <span className="hidden text-sm text-mist lg:block">{e.isOwner ? t('photographer.owner') : t('photographer.member')}</span>
                  <span className="justify-self-end lg:justify-self-start">
                    <VisibilityBadge visibility={e.visibility} />
                  </span>
                  {/* Мөр бүхэлдээ холбоос тул үйлдлүүд дээр нь (z-10) */}
                  <span className="relative z-10 col-span-2 flex items-center justify-between gap-1 border-t border-line pt-2 lg:col-span-1 lg:justify-end lg:border-0 lg:pt-0">
                    <span className="font-mono text-[11px] text-dim lg:hidden">
                      {t('common.photos', { count: e.photoCount })}
                      {sold ? ` · ${formatMnt(sold)}` : ''}
                    </span>
                    <span className="flex gap-1">
                      <Link
                        href={`/photographer/events/${e.id}/upload`}
                        aria-label={`${t('photographer.uploadPhotos')}: ${e.title}`}
                        title={t('photographer.uploadPhotos')}
                        className={`${iconAction} ${e.photoCount === 0 ? 'text-gold ring-1 ring-inset ring-gold/60 hover:bg-gold hover:text-gold-ink' : 'text-mist hover:bg-white/[0.06] hover:text-ivory'}`}
                      >
                        <UploadIcon size={18} />
                      </Link>
                      <Link
                        href={`/photographer/events/${e.id}/poster`}
                        aria-label={`${t('poster.print')}: ${e.title}`}
                        title={t('poster.print')}
                        className={`${iconAction} text-mist hover:bg-white/[0.06] hover:text-ivory`}
                      >
                        <QrIcon size={18} />
                      </Link>
                      {/* Нууц холбоосны токен жагсаалтад ирдэггүй — зөвхөн нийтийн эвэнтэд */}
                      {e.visibility === 'PUBLIC' ? (
                        <Link
                          href={`/events/${e.slug}`}
                          aria-label={`${t('photographer.viewPublic')}: ${e.title}`}
                          title={t('photographer.viewPublic')}
                          className={`${iconAction} text-mist hover:bg-white/[0.06] hover:text-ivory`}
                        >
                          <ExternalLinkIcon size={18} />
                        </Link>
                      ) : (
                        <span className="size-11" aria-hidden />
                      )}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
