import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CountUp } from '@/components/count-up';
import { AlertIcon, ArrowRightIcon, ClockIcon } from '@/components/icons';
import { Alert, PageHeader, Stat } from '@/components/ui';
import { serverApi } from '@/lib/api-server';
import { formatDate } from '@/lib/datetime';
import type { AdminOverview } from '@/lib/types';

export default async function AdminHome() {
  const t = await getTranslations('admin');
  const { data } = await serverApi<AdminOverview>('/admin/overview');
  if (!data) return null;

  // Шийдвэр хүлээж буй зүйлс эхэнд — тоо нь 0-ээс их бол алтаар тодорно
  const queues = [
    { label: t('overview.removals'), value: data.newRemovals, href: '/admin/removals' },
    { label: t('overview.pendingPhotographers'), value: data.pendingPhotographers, href: '/admin/photographers?status=PENDING' },
  ];

  return (
    <>
      <PageHeader kicker={t('overview.kicker')} title={t('overview.title')} />

      <div className="grid gap-3 sm:grid-cols-2">
        {queues.map((q, i) => (
          <Link
            key={q.href}
            href={q.href}
            style={{ '--i': i + 2 } as React.CSSProperties}
            className={`panel group relative flex animate-rise items-end justify-between gap-4 overflow-hidden p-5 stagger transition duration-300 hover:bg-night-3 sm:p-6 ${
              q.value ? 'ring-1 ring-inset ring-gold/40' : ''
            }`}
          >
            {q.value ? <div aria-hidden className="pointer-events-none absolute -left-10 -top-10 size-40 rounded-full bg-gold/15 blur-2xl" /> : null}
            <span className="relative flex flex-col gap-3">
              <span className="kicker flex items-center gap-2">
                {q.value ? <span aria-hidden className="size-1.5 animate-blink rounded-full bg-gold" /> : null}
                {q.label}
              </span>
              <span className={`font-display text-6xl font-semibold leading-none tabular-nums ${q.value ? 'text-gold' : 'text-dim'}`}>{q.value}</span>
            </span>
            <span className="relative flex size-11 items-center justify-center rounded-full ring-1 ring-inset ring-line-strong transition group-hover:bg-gold group-hover:text-gold-ink group-hover:ring-gold">
              <ArrowRightIcon size={18} />
            </span>
          </Link>
        ))}
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <Stat label={t('overview.monthOrders')} note={t('overview.since', { date: formatDate(data.month.since) })}>
          <CountUp value={data.month.orders} />
        </Stat>
        <Stat label={t('overview.monthRevenue')}>
          <CountUp value={data.month.revenue} /> ₮
        </Stat>
      </dl>

      {data.failedPhotos > 0 ? <Alert>{t('overview.failedPhotos', { count: data.failedPhotos })}</Alert> : null}

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2.5 font-display text-3xl font-semibold leading-none">
            <ClockIcon size={20} className="text-gold" />
            {t('overview.expiring')}
          </h2>
          <p className="max-w-2xl text-sm text-mist">{t('overview.expiringHint')}</p>
        </div>
        {data.expiringEvents.length === 0 ? (
          <p className="rounded-[14px] px-4 py-6 text-center text-sm text-mist ring-1 ring-inset ring-line">{t('overview.noneExpiring')}</p>
        ) : (
          <ul className="flex flex-col overflow-hidden rounded-[14px] ring-1 ring-inset ring-line">
            {data.expiringEvents.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-night-2 px-4 py-3.5 last:border-0">
                <span className="flex items-center gap-2 font-semibold">
                  <AlertIcon size={15} className="shrink-0 text-gold" />
                  {e.title}
                </span>
                <span className="font-mono text-xs text-mist">{t('overview.expiresOn', { date: formatDate(e.expiresAt), count: e.photoCount })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
