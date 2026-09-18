import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui';
import { serverApi } from '@/lib/api-server';
import { formatDate, formatMnt } from '@/lib/datetime';
import type { AdminOverview } from '@/lib/types';

export default async function AdminHome() {
  const t = await getTranslations('admin');
  const { data } = await serverApi<AdminOverview>('/admin/overview');
  if (!data) return null;

  const tiles = [
    { label: t('overview.removals'), value: data.newRemovals, href: '/admin/removals', urgent: data.newRemovals > 0 },
    {
      label: t('overview.pendingPhotographers'),
      value: data.pendingPhotographers,
      href: '/admin/photographers?status=PENDING',
      urgent: data.pendingPhotographers > 0,
    },
    { label: t('overview.monthOrders'), value: data.month.orders, href: null, urgent: false },
    { label: t('overview.monthRevenue'), value: formatMnt(data.month.revenue), href: null, urgent: false },
  ];

  return (
    <>
      <h1 className="text-2xl font-bold">{t('overview.title')}</h1>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => {
          const body = (
            <Card className={`flex h-full flex-col gap-1 ${tile.urgent ? 'border-amber-400 bg-amber-50' : ''}`}>
              <span className="text-sm text-stone-600">{tile.label}</span>
              <span className="text-2xl font-bold tabular-nums">{tile.value}</span>
            </Card>
          );
          return <li key={tile.label}>{tile.href ? <Link href={tile.href}>{body}</Link> : body}</li>;
        })}
      </ul>
      {data.failedPhotos > 0 ? <p className="text-sm text-red-700">{t('overview.failedPhotos', { count: data.failedPhotos })}</p> : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('overview.expiring')}</h2>
        <p className="text-sm text-stone-600">{t('overview.expiringHint')}</p>
        {data.expiringEvents.length === 0 ? (
          <p className="text-sm text-stone-500">{t('overview.noneExpiring')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.expiringEvents.map((e) => (
              <li key={e.id}>
                <Card className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{e.title}</span>
                  <span className="text-sm text-stone-600">
                    {t('overview.expiresOn', { date: formatDate(e.expiresAt), count: e.photoCount })}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
