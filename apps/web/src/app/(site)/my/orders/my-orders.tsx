'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { TicketIcon } from '@/components/icons';
import { Badge, ButtonLink, EmptyState, Kicker } from '@/components/ui';
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
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-5 pt-32">
      <header className="flex flex-col gap-4">
        <Kicker className="animate-rise">{t('kicker')}</Kicker>
        <h1 className="animate-rise font-display text-[clamp(3rem,8vw,6rem)] font-semibold leading-[0.88] tracking-[-0.035em] stagger [--i:1]">
          {t('title')}
        </h1>
        <p className="max-w-xl animate-rise text-mist stagger [--i:2]">{t('intro')}</p>
      </header>

      {orders.length === 0 ? (
        <EmptyState icon={<TicketIcon size={28} />} title={t('empty')} action={<ButtonLink href="/photographers">{t('browse')}</ButtonLink>} />
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order, i) => {
            const status = statuses[order.id];
            return (
              <li key={order.id} className="animate-rise stagger" style={{ '--i': Math.min(i, 10) + 3 } as React.CSSProperties}>
                {/* Тасалбарын хэлтэрхий: зүүн талд огноо, баруун талд үйлдэл */}
                <div className="panel group relative flex flex-col overflow-hidden transition duration-300 hover:bg-night-3 sm:flex-row sm:items-stretch">
                  <div className="flex shrink-0 flex-row items-center justify-between gap-2 border-b border-dashed border-line-strong/50 px-5 py-4 sm:w-40 sm:flex-col sm:items-start sm:justify-center sm:border-b-0 sm:border-r">
                    <span className="kicker">{formatDate(order.createdAt)}</span>
                    <span className="font-display text-3xl font-semibold leading-none tabular-nums">{formatMnt(order.total)}</span>
                  </div>
                  <div className="flex flex-1 flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-2">
                      <Link
                        href={orderHref(order.id, order.token)}
                        className="truncate font-display text-2xl font-semibold leading-tight after:absolute after:inset-0 hover:text-gold"
                      >
                        {order.eventTitle}
                      </Link>
                      {status && status !== 'gone' ? (
                        <span>
                          <Badge tone={STATUS_TONE[status]}>{to(`status.${status}`)}</Badge>
                        </span>
                      ) : !status ? (
                        <span className="skeleton h-5 w-24 rounded-full" />
                      ) : null}
                    </div>
                    <div className="relative z-10 flex items-center gap-3">
                      {status === 'gone' ? (
                        <button type="button" className="min-h-11 cursor-pointer text-sm text-mist underline underline-offset-4 hover:text-ivory" onClick={() => forgetOrder(order.id)}>
                          {t('forget')}
                        </button>
                      ) : (
                        <ButtonLink href={orderHref(order.id, order.token)} variant={status === 'PENDING' ? 'primary' : 'secondary'}>
                          {status === 'PENDING' ? t('pay') : t('open')}
                        </ButtonLink>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
