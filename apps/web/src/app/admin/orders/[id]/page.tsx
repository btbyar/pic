import { BackLink } from '@/components/back-link';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Badge, Card } from '@/components/ui';
import { getMe, serverApi } from '@/lib/api-server';
import { formatDate, formatMnt } from '@/lib/datetime';
import type { AdminOrderDetail } from '@/lib/types';
import { ORDER_TONE } from '@/lib/order-status';
import { RefundForm } from './refund-form';

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const t = await getTranslations('admin.orders');
  const to = await getTranslations('order');
  const [{ data: order }, me] = await Promise.all([serverApi<AdminOrderDetail>(`/admin/orders/${id}`), getMe()]);
  if (!order) notFound();
  const refundable = order.status === 'PAID' || order.status === 'PARTIALLY_REFUNDED';

  return (
    <>
      <BackLink href="/admin/orders">{t('title')}</BackLink>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{order.eventTitle}</h1>
        <Badge tone={ORDER_TONE[order.status]}>{to(`status.${order.status}`)}</Badge>
      </header>
      <Card className="grid gap-2 text-sm sm:grid-cols-2">
        <span>{t('id')}: <code className="text-xs">{order.id}</code></span>
        <span>{t('total')}: <b>{formatMnt(order.totalAmount)}</b></span>
        <span>{t('created')}: {formatDate(order.createdAt)}</span>
        <span>{t('paid')}: {order.paidAt ? formatDate(order.paidAt) : '—'}</span>
        <span>{t('email')}: {order.contactEmail ?? '—'}</span>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t('itemsTitle')}</h2>
        {refundable ? (
          <RefundForm orderId={order.id} items={order.items} askTotp={Boolean(me?.mfa.enabled)} />
        ) : (
          <ul className="flex flex-col gap-1">
            {order.items.map((i) => (
              <li key={i.id} className="flex justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
                <span>{i.filename} · {i.photographer}</span>
                <span className="tabular-nums">{formatMnt(i.price)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t('paymentsTitle')}</h2>
        {order.payments.map((p) => (
          <Card key={p.id} className="flex flex-wrap justify-between gap-2 text-sm">
            <span>{p.provider} · {p.status} · {formatDate(p.createdAt)}</span>
            <span className="text-xs text-ink-soft">{p.providerPaymentId ?? p.providerInvoiceId}</span>
            <span className="tabular-nums">{formatMnt(p.amount)}</span>
          </Card>
        ))}
      </section>

      {order.refunds.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t('refundsTitle')}</h2>
          {order.refunds.map((r) => (
            <Card key={r.id} className="flex flex-col gap-1 text-sm">
              <span className="font-medium">−{formatMnt(r.amount)} · {formatDate(r.createdAt)} · {r.createdBy}</span>
              <span>{r.reason}</span>
              {r.providerRef ? <span className="text-ink-soft">{t('providerRef')}: {r.providerRef}</span> : null}
            </Card>
          ))}
        </section>
      ) : null}
    </>
  );
}
