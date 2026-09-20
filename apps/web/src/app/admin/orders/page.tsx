import { ORDER_STATUSES, type OrderStatus } from '@pic/shared';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Badge, Button, Card, Input } from '@/components/ui';
import { serverApi } from '@/lib/api-server';
import { formatDate, formatMnt } from '@/lib/datetime';
import { ORDER_TONE } from '@/lib/order-status';
import type { AdminOrderRow } from '@/lib/types';

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status: raw, q } = await searchParams;
  const status = ORDER_STATUSES.includes(raw as OrderStatus) ? (raw as OrderStatus) : undefined;
  const t = await getTranslations('admin');
  const to = await getTranslations('order');
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q?.trim()) params.set('q', q.trim());
  const { data } = await serverApi<{ items: AdminOrderRow[] }>(`/admin/orders${params.size ? `?${params}` : ''}`);
  const orders = data?.items ?? [];

  const tab = (s?: OrderStatus) => {
    const p = new URLSearchParams();
    if (s) p.set('status', s);
    if (q?.trim()) p.set('q', q.trim());
    return `/admin/orders${p.size ? `?${p}` : ''}`;
  };

  return (
    <>
      <h1 className="text-2xl font-bold">{t('orders.title')}</h1>
      <form className="flex gap-2" action="/admin/orders">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <Input name="q" defaultValue={q ?? ''} placeholder={t('orders.search')} aria-label={t('orders.search')} />
        <Button type="submit" variant="secondary">
          {t('orders.searchButton')}
        </Button>
      </form>
      <nav className="flex flex-wrap gap-2">
        {[undefined, 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'PENDING', 'EXPIRED'].map((s) => (
          <Link
            key={s ?? 'all'}
            href={tab(s as OrderStatus | undefined)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              s === status ? 'bg-surface-3 text-white' : 'border border-line bg-surface-2 text-ink'
            }`}
          >
            {s ? to(`status.${s}`) : t('orders.all')}
          </Link>
        ))}
      </nav>
      {orders.length === 0 ? (
        <p className="py-16 text-center text-ink-soft">{t('orders.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/orders/${o.id}`}>
                <Card className="flex flex-col gap-1  sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{o.eventTitleSnap}</span>
                    <span className="text-sm text-ink-soft">
                      {formatDate(o.createdAt)} · {t('orders.items', { count: o.itemCount })}
                      {o.contactEmail ? ` · ${o.contactEmail}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={ORDER_TONE[o.status]}>{to(`status.${o.status}`)}</Badge>
                    <span className="font-semibold tabular-nums">{formatMnt(o.totalAmount)}</span>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
