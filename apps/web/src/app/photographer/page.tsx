import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CountUp } from '@/components/count-up';
import { AlertIcon, ArrowRightIcon, CheckIcon, ImagesIcon, PlusIcon, QrIcon, UploadIcon } from '@/components/icons';
import { Perforation, Ticket } from '@/components/ticket';
import { ButtonLink, EmptyState, PageHeader, Stat } from '@/components/ui';
import { VisibilityBadge } from '@/components/visibility-badge';
import { getMe, serverApi } from '@/lib/api-server';
import { formatDate, formatEventRange, formatMnt } from '@/lib/datetime';
import type { Earnings, MyEvent, MyProfile, PhotographerSales } from '@/lib/types';

/**
 * Зурагчны тойм: орлого, зураг, дараагийн хийх алхам. Өмнө нь /photographer шууд эвэнтийн жагсаалт руу
 * шилждэг байсан тул ноорог эвэнтийг нийтлэхээ мартах тохиолдол гардаг байв.
 */
export default async function PhotographerOverview() {
  const t = await getTranslations();
  const [me, { data: eventsData }, { data: earnings }, { data: profile }, { data: sales }] = await Promise.all([
    getMe(),
    serverApi<MyEvent[]>('/photographer/events'),
    serverApi<Earnings>('/photographer/earnings'),
    serverApi<MyProfile>('/photographer/profile'),
    serverApi<PhotographerSales>('/photographer/sales'),
  ]);
  const events = [...(eventsData ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const current = earnings?.months.find((m) => m.period === earnings.currentPeriod);
  const awaiting = (earnings?.months ?? [])
    .filter((m) => m.period !== earnings?.currentPeriod)
    .reduce((sum, m) => sum + (m.payout?.status === 'PAID' ? 0 : m.payable), 0);
  const totalPhotos = events.reduce((sum, e) => sum + e.photoCount, 0);

  // Хамгийн сүүлийн, дуусаагүй эвэнт: зураггүй эсвэл нуусан хэвээр
  const pending = events.find((e) => e.isOwner && (e.photoCount === 0 || e.visibility === 'HIDDEN'));

  return (
    <>
      <PageHeader
        kicker={t('overview.kicker')}
        title={t('overview.greeting', { name: me?.displayName ?? '' })}
        intro={<p>{t('overview.intro')}</p>}
      />

      {earnings && !earnings.account ? (
        <div className="flex animate-rise flex-col gap-3 rounded-[14px] bg-gold/[0.07] px-4 py-3.5 ring-1 ring-inset ring-gold/30 sm:flex-row sm:items-center">
          <AlertIcon size={20} className="shrink-0 text-gold" />
          <p className="flex-1 text-[15px] text-gold-soft">{t('earnings.accountMissing')}</p>
          <ButtonLink href="/photographer/earnings" className="min-h-11 shrink-0 self-start sm:self-auto">
            {t('overview.addAccount')}
          </ButtonLink>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={t('earnings.summary.awaiting')} accent={awaiting > 0} className="col-span-2 sm:col-span-1">
          <CountUp value={awaiting} /> ₮
        </Stat>
        <Stat label={t('earnings.summary.thisMonth')}>
          <CountUp value={current?.payable ?? 0} /> ₮
        </Stat>
        <Stat label={t('overview.totalPhotos')}>
          <CountUp value={totalPhotos} />
        </Stat>
      </dl>

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
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          {pending ? <NextStep event={pending} /> : <AllSet />}

          {sales?.recent.length ? (
            <Ticket>
              <div className="flex items-center justify-between px-5 pb-1 pt-5">
                <h2 className="kicker">{t('overview.recentSales')}</h2>
                <Link href="/photographer/earnings" className="inline-flex min-h-11 items-center text-sm font-semibold text-gold hover:text-gold-soft">
                  {t('photographer.earnings')}
                </Link>
              </div>
              <Perforation />
              <ul className="flex flex-col px-5 pb-4">
                {sales.recent.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 border-b border-line py-3 last:border-0">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-semibold">
                        {o.bundle ? t('overview.saleBundle', { count: o.photos }) : t('common.photos', { count: o.photos })}
                      </span>
                      <span className="flex gap-1.5 text-xs text-dim">
                        <span className="truncate">{o.eventTitle}</span>
                        <span className="shrink-0 font-mono">{formatDate(o.paidAt)}</span>
                      </span>
                    </span>
                    {o.refunded ? (
                      <span className="text-sm text-dim line-through">{t('overview.refunded')}</span>
                    ) : (
                      <span className="font-display text-xl font-semibold tabular-nums text-jade">+{formatMnt(o.amount)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Ticket>
          ) : (
            <RecentEvents events={events.slice(0, 4)} />
          )}
        </div>
      )}

      {profile && !profile.slugSaved ? (
        <p className="max-w-2xl text-sm text-mist">
          {t('photographer.publishProfileHint')}{' '}
          <Link href="/photographer/profile" className="font-semibold text-gold underline underline-offset-4 hover:text-gold-soft">
            {t('photographer.publishProfile')}
          </Link>
        </p>
      ) : null}
    </>
  );
}

/** Дараагийн дүр зураг: эвэнтийн нүүр зураг дэлгэц болж, дээр нь хийх алхам */
async function NextStep({ event }: { event: MyEvent }) {
  const t = await getTranslations();
  const hasPhotos = event.photoCount > 0;
  const published = event.visibility !== 'HIDDEN';
  const steps = [
    { label: t('overview.steps.info'), done: true },
    { label: t('overview.steps.photos'), done: hasPhotos },
    { label: t('overview.steps.publish'), done: published },
  ];
  const activeIndex = steps.findIndex((s) => !s.done);

  return (
    <section className="panel relative isolate flex min-h-80 animate-rise flex-col justify-end overflow-hidden stagger [--i:3]">
      {event.coverUrl ? (
        <img src={event.coverUrl} alt="" className="absolute inset-0 -z-20 h-full w-full animate-kenburns object-cover opacity-60" />
      ) : (
        <div aria-hidden className="absolute -left-10 -top-20 -z-20 size-80 animate-drift rounded-full bg-gold/15 blur-3xl" />
      )}
      <div aria-hidden className="scrim absolute inset-0 -z-10" />

      <div className="flex flex-col gap-5 p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="kicker text-gold">{t('overview.nextStep')}</span>
          <VisibilityBadge visibility={event.visibility} />
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-4xl font-semibold leading-[0.95] tracking-[-0.02em] sm:text-5xl">{event.title}</h2>
          <span className="font-mono text-xs text-mist">{formatEventRange(event.startsAt, event.endsAt, event.timezone)}</span>
        </div>

        {/* Алхмууд: timecode маягаар 01 · 02 · 03 */}
        <ol className="grid grid-cols-3 gap-2">
          {steps.map((s, i) => {
            const active = i === activeIndex;
            return (
              <li key={s.label} aria-current={active ? 'step' : undefined} className="flex flex-col gap-2">
                <span className={`h-[3px] rounded-full ${s.done ? 'bg-jade' : active ? 'bg-gold' : 'bg-white/15'}`} />
                <span className={`flex items-center gap-1.5 text-xs font-semibold sm:text-sm ${s.done || active ? 'text-ivory' : 'text-dim'}`}>
                  {s.done ? <CheckIcon size={14} strokeWidth={3} className="shrink-0 text-jade" /> : <span className="font-mono text-[11px] text-gold">0{i + 1}</span>}
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>

        <p className="max-w-lg text-[15px] text-mist">{hasPhotos ? t('overview.publishBody') : t('overview.uploadBody')}</p>

        <div className="flex flex-wrap gap-2">
          {hasPhotos ? (
            <ButtonLink href={`/photographer/events/${event.id}`} className="gap-2">
              {t('overview.openEditor')}
              <ArrowRightIcon size={16} />
            </ButtonLink>
          ) : (
            <ButtonLink href={`/photographer/events/${event.id}/upload`} className="gap-2">
              <UploadIcon size={18} />
              {t('photographer.uploadPhotos')}
            </ButtonLink>
          )}
          <ButtonLink href={`/photographer/events/${event.id}/poster`} variant="secondary" className="gap-2">
            <QrIcon size={18} />
            {t('overview.poster')}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

async function AllSet() {
  const t = await getTranslations();
  return (
    <section className="panel flex animate-rise flex-col items-start gap-4 p-5 stagger [--i:3] sm:p-7">
      <span className="flex size-12 items-center justify-center rounded-full bg-jade/15 text-jade ring-1 ring-inset ring-jade/40">
        <CheckIcon size={22} strokeWidth={2.6} />
      </span>
      <h2 className="font-display text-4xl font-semibold leading-none">{t('overview.allSetTitle')}</h2>
      <p className="max-w-md text-[15px] text-mist">{t('overview.allSetBody')}</p>
      <ButtonLink href="/photographer/events/new" variant="secondary" className="gap-2">
        <PlusIcon size={16} />
        {t('photographer.newEvent')}
      </ButtonLink>
    </section>
  );
}

async function RecentEvents({ events }: { events: MyEvent[] }) {
  const t = await getTranslations();
  return (
    <section className="panel flex flex-col gap-2 p-5">
      <div className="flex items-center justify-between">
        <h2 className="kicker">{t('overview.recent')}</h2>
        <Link href="/photographer/events" className="inline-flex min-h-11 items-center text-sm font-semibold text-gold hover:text-gold-soft">
          {t('overview.all')}
        </Link>
      </div>
      <ul className="flex flex-col">
        {events.map((e) => (
          <li key={e.id}>
            <Link href={`/photographer/events/${e.id}`} className="-mx-2 flex items-center gap-3 rounded-xl p-2 transition hover:bg-white/[0.04]">
              <span className="relative h-11 w-14 shrink-0 overflow-hidden rounded-lg bg-night-3">
                {e.coverUrl ? <img src={e.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">{e.title}</span>
                <span className="font-mono text-[11px] text-dim">{t('common.photos', { count: e.photoCount })}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
