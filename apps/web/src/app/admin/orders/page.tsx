import { ORDER_STATUSES, type OrderStatus } from '@pic/shared';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SearchIcon, TicketIcon } from '@/components/icons';
import { Badge, Button, EmptyState, FilterTabs, Input, PageHeader } from '@/components/ui';
import { serverApi } from '@/lib/api-server';
import { formatDate, formatMnt } from '@/lib/datetime';
import { ORDER_TONE } from '@/lib/order-status';
import type { AdminOrderRow } from '@/lib/types';

const TABS: (OrderStatus | undefined)[] = [undefined, 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'PENDING', 'EXPIRED'];

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
      <PageHeader kicker={t('orders.kicker')} title={t('orders.title')} />
      <form className="flex gap-2" action="/admin/orders" role="search">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <div className="relative flex-1">
          <SearchIcon size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-dim" />
          <Input name="q" type="search" defaultValue={q ?? ''} placeholder={t('orders.search')} aria-label={t('orders.search')} className="pl-11" />
        </div>
        <Button type="submit" variant="secondary">
          {t('orders.searchButton')}
        </Button>
      </form>
      <FilterTabs label={t('orders.title')} items={TABS.map((s) => ({ href: tab(s), label: s ? to(`status.${s}`) : t('orders.all'), active: s === status }))} />

      {orders.length === 0 ? (
        <EmptyState icon={<TicketIcon size={28} />} title={t('orders.empty')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((o, i) => (
            <li key={o.id} style={{ '--i': Math.min(i, 10) } as React.CSSProperties} className="animate-rise stagger">
              {/* Тасалбарын хэлтэрхий: зүүн талд дүн, баруун талд эвэнт */}
              <Link href={`/admin/orders/${o.id}`} className="panel group flex flex-col overflow-hidden transition duration-300 hover:bg-night-3 sm:flex-row sm:items-stretch">
                <span className="flex shrink-0 items-center justify-between gap-2 border-b border-dashed border-line-strong/50 px-5 py-3 sm:w-44 sm:flex-col sm:items-start sm:justify-center sm:border-b-0 sm:border-r">
                  <span className="font-mono text-[11px] text-dim">{formatDate(o.createdAt)}</span>
                  <span className="font-display text-2xl font-semibold leading-none tabular-nums">{formatMnt(o.totalAmount)}</span>
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-semibold group-hover:text-gold">{o.eventTitleSnap}</span>
                    <span className="truncate text-sm text-mist">
                      {t('orders.items', { count: o.itemCount })}
                      {o.contactEmail ? ` · ${o.contactEmail}` : ''}
                    </span>
                  </span>
                  <Badge tone={ORDER_TONE[o.status]}>{to(`status.${o.status}`)}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
