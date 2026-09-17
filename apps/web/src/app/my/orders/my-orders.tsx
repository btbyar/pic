'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Badge, ButtonLink, Card } from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDate, formatMnt } from '@/lib/datetime';
import { forgetOrder, orderHref, useSavedOrders } from '@/lib/my-orders';
import type { OrderView } from '@/lib/types';

const STATUS_TONE = {
  PAID: 'green',
  PENDING: 'amber',
  EXPIRED: 'slate',
  FAILED: 'red',
  REFUNDED: 'slate',
  PARTIALLY_REFUNDED: 'green',
} as const;

export function MyOrders() {
  const t = useTranslations('myOrders');
  const to = useTranslations('order');
  const orders = useSavedOrders();
  const [statuses, setStatuses] = useState<Record<string, OrderView['status'] | 'gone'>>({});

  const key = orders.map((o) => o.id).join(',');
  useEffect(() => {
    let cancelled = false;
    // Хамгийн сүүлийн 20 захиалгын төлвийг шалгана
    for (const order of orders.slice(0, 20)) {
      void api<OrderView>(`/orders/${order.id}`, { headers: { 'x-order-token': order.token } }).then((res) => {
        if (cancelled) return;
        const status = res.ok ? res.data.status : res.error.status === 404 ? 'gone' : undefined;
        if (status) setStatuses((s) => ({ ...s, [order.id]: status }));
      });
    }
    return () => {
      cancelled = true;
    };
    // Захиалгын жагсаалт өөрчлөгдөхөд л
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-slate-600">{t('intro')}</p>
      </header>

      {orders.length === 0 ? (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-slate-700">{t('empty')}</p>
          <ButtonLink href="/events">{t('browse')}</ButtonLink>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => {
            const status = statuses[order.id];
            return (
              <li key={order.id}>
                <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1">
                    <Link href={orderHref(order.id, order.token)} className="font-semibold underline-offset-4 hover:underline">
                      {order.eventTitle}
                    </Link>
                    <p className="text-sm text-slate-600">
                      {formatDate(order.createdAt)} · {formatMnt(order.total)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {status && status !== 'gone' ? <Badge tone={STATUS_TONE[status]}>{to(`status.${status}`)}</Badge> : null}
                    {status === 'gone' ? (
                      <button type="button" className="min-h-11 text-sm text-slate-500 underline" onClick={() => forgetOrder(order.id)}>
                        {t('forget')}
                      </button>
                    ) : (
                      <ButtonLink href={orderHref(order.id, order.token)} variant="secondary">
                        {status === 'PENDING' ? t('pay') : t('open')}
                      </ButtonLink>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
