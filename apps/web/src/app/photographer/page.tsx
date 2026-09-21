import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AlertIcon, CheckIcon, ImagesIcon, PlusIcon, QrIcon, UploadIcon } from '@/components/icons';
import { ButtonLink, Card } from '@/components/ui';
import { VisibilityBadge } from '@/components/visibility-badge';
import { getMe, serverApi } from '@/lib/api-server';
import { formatEventRange, formatMnt } from '@/lib/datetime';
import type { Earnings, MyEvent, MyProfile } from '@/lib/types';

/**
 * Зурагчны тойм: орлого, зураг, дараагийн хийх алхам. Өмнө нь /photographer шууд эвэнтийн жагсаалт руу
 * шилждэг байсан тул ноорог эвэнтийг нийтлэхээ мартах тохиолдол гардаг байв.
 */
export default async function PhotographerOverview() {
  const t = await getTranslations();
  const [me, { data: eventsData }, { data: earnings }, { data: profile }] = await Promise.all([
    getMe(),
    serverApi<MyEvent[]>('/photographer/events'),
    serverApi<Earnings>('/photographer/earnings'),
    serverApi<MyProfile>('/photographer/profile'),
  ]);
  const events = [...(eventsData ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const current = earnings?.months.find((m) => m.period === earnings.currentPeriod);
  const awaiting = (earnings?.months ?? [])
    .filter((m) => m.period !== earnings?.currentPeriod)
    .reduce((sum, m) => sum + (m.payout?.status === 'PAID' ? 0 : m.payable), 0);
  const totalPhotos = events.reduce((sum, e) => sum + e.photoCount, 0);

  // Хамгийн сүүлийн, дуусаагүй эвэнт: зураггүй эсвэл нуусан хэвээр
  const pending = events.find((e) => e.isOwner && (e.photoCount === 0 || e.visibility === 'HIDDEN'));

  const stats = [
    { label: t('earnings.summary.thisMonth'), value: formatMnt(current?.payable ?? 0) },
    { label: t('earnings.summary.awaiting'), value: formatMnt(awaiting) },
    { label: t('overview.totalPhotos'), value: totalPhotos.toLocaleString('mn-MN') },
  ];

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold">{t('overview.greeting', { name: me?.displayName ?? '' })}</h1>
        <p className="text-ink-soft">{t('overview.intro')}</p>
      </div>

      {earnings && !earnings.account ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-amber-50 px-4 py-3 sm:flex-row sm:items-center">
          <AlertIcon size={20} className="shrink-0 text-amber-800" />
          <p className="flex-1 text-[15px] font-medium text-amber-900">{t('earnings.accountMissing')}</p>
          <ButtonLink href="/photographer/earnings" variant="dark" className="min-h-10 shrink-0 self-start text-sm sm:self-auto">
            {t('overview.addAccount')}
          </ButtonLink>
        </div>
      ) : null}

      <dl className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1 rounded-2xl bg-surface-2 p-5">
            <dt className="text-sm text-ink-soft">{s.label}</dt>
            <dd className="font-display text-3xl font-extrabold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      {events.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <ImagesIcon size={28} />
          </span>
          <p className="text-ink-soft">{t('photographer.noEvents')}</p>
          <ButtonLink href="/photographer/events/new" className="gap-2">
            <PlusIcon size={16} />
            {t('photographer.newEvent')}
          </ButtonLink>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
          {pending ? <NextStep event={pending} /> : <AllSet />}

          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{t('overview.recent')}</h2>
              <Link href="/photographer/events" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700">
                {t('overview.all')}
              </Link>
            </div>
            <ul className="flex flex-col gap-1">
              {events.slice(0, 4).map((e) => (
                <li key={e.id}>
                  <Link href={`/photographer/events/${e.id}`} className="-mx-2 flex items-center gap-3 rounded-xl p-2 hover:bg-surface-3">
                    <span className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-surface-3">
                      {e.coverUrl ? <img src={e.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold">{e.title}</span>
                      <span className="text-xs text-ink-soft">{t('common.photos', { count: e.photoCount })}</span>
                    </span>
                    <VisibilityBadge visibility={e.visibility} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {profile && !profile.slugSaved ? (
        <p className="text-sm text-ink-soft">
          {t('photographer.publishProfileHint')}{' '}
          <Link href="/photographer/profile" className="font-semibold text-brand-700 underline underline-offset-4">
            {t('photographer.publishProfile')}
          </Link>
        </p>
      ) : null}
    </>
  );
}

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
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-600">{t('overview.nextStep')}</span>
          <h2 className="font-display text-xl font-bold">{event.title}</h2>
          <span className="text-sm text-ink-soft">{formatEventRange(event.startsAt, event.endsAt, event.timezone)}</span>
        </div>
        <VisibilityBadge visibility={event.visibility} />
      </div>

      <ol className="flex flex-wrap gap-2">
        {steps.map((s, i) => {
          const active = i === activeIndex;
          return (
            <li
              key={s.label}
              aria-current={active ? 'step' : undefined}
              className={`flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm font-semibold ${active ? 'bg-brand-50 text-brand-700' : 'bg-surface text-ink'} ${!s.done && !active ? 'text-ink-soft' : ''}`}
            >
              <span
                className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                  s.done ? 'bg-emerald-700 text-white' : active ? 'bg-brand-600 text-on-brand' : 'bg-surface-3 text-ink-soft'
                }`}
              >
                {s.done ? <CheckIcon size={14} strokeWidth={3} /> : i + 1}
              </span>
              {s.label}
            </li>
          );
        })}
      </ol>

      <p className="text-[15px] text-ink-soft">{hasPhotos ? t('overview.publishBody') : t('overview.uploadBody')}</p>

      <div className="flex flex-wrap gap-2">
        {hasPhotos ? (
          <ButtonLink href={`/photographer/events/${event.id}`}>{t('overview.openEditor')}</ButtonLink>
        ) : (
          <ButtonLink href={`/photographer/events/${event.id}/upload`} className="gap-2">
            <UploadIcon size={18} />
            {t('photographer.uploadPhotos')}
          </ButtonLink>
        )}
        <ButtonLink href={`/photographer/events/${event.id}/poster`} variant="secondary" className="gap-2">
          <QrIcon size={18} />
          {t('poster.print')}
        </ButtonLink>
      </div>
    </Card>
  );
}

async function AllSet() {
  const t = await getTranslations();
  return (
    <Card className="flex flex-col items-start gap-3">
      <span className="flex size-10 items-center justify-center rounded-full bg-emerald-700 text-white">
        <CheckIcon size={20} strokeWidth={2.6} />
      </span>
      <h2 className="font-display text-xl font-bold">{t('overview.allSetTitle')}</h2>
      <p className="text-[15px] text-ink-soft">{t('overview.allSetBody')}</p>
      <ButtonLink href="/photographer/events/new" variant="secondary" className="gap-2">
        <PlusIcon size={16} />
        {t('photographer.newEvent')}
      </ButtonLink>
    </Card>
  );
}
