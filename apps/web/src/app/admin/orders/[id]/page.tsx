import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BackLink } from '@/components/back-link';
import { Perforation, Ticket } from '@/components/ticket';
import { Badge, PageHeader } from '@/components/ui';
import { getMe, serverApi } from '@/lib/api-server';
import { formatDate, formatMnt } from '@/lib/datetime';
import { ORDER_TONE } from '@/lib/order-status';
import type { AdminOrderDetail } from '@/lib/types';
import { RefundForm } from './refund-form';

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const t = await getTranslations('admin.orders');
  const to = await getTranslations('order');
  const [{ data: order }, me] = await Promise.all([serverApi<AdminOrderDetail>(`/admin/orders/${id}`), getMe()]);
  if (!order) notFound();
  const refundable = order.status === 'PAID' || order.status === 'PARTIALLY_REFUNDED';

  const facts = [
    { label: t('created'), value: formatDate(order.createdAt) },
    { label: t('paid'), value: order.paidAt ? formatDate(order.paidAt) : '—' },
    { label: t('email'), value: order.contactEmail ?? '—' },
  ];

  return (
    <>
      <BackLink href="/admin/orders">{t('title')}</BackLink>
      <PageHeader kicker={t('kicker')} title={order.eventTitle} action={<Badge tone={ORDER_TONE[order.status]}>{to(`status.${order.status}`)}</Badge>} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <section className="flex flex-col gap-3">
            <h2 className="kicker">{t('itemsTitle')}</h2>
            {refundable ? (
              <RefundForm orderId={order.id} items={order.items} askTotp={Boolean(me?.mfa.enabled)} />
            ) : (
              <ul className="flex flex-col overflow-hidden rounded-[14px] ring-1 ring-inset ring-line">
                {order.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3 border-b border-line bg-night-2 px-4 py-3 text-sm last:border-0">
                    <span className="min-w-0 truncate">
                      <span className="font-mono text-xs">{i.filename}</span> <span className="text-mist">· {i.photographer}</span>
                    </span>
                    <span className="tabular-nums">{formatMnt(i.price)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="kicker">{t('paymentsTitle')}</h2>
            <ul className="flex flex-col overflow-hidden rounded-[14px] ring-1 ring-inset ring-line">
              {order.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-night-2 px-4 py-3 text-sm last:border-0">
                  <span className="flex flex-col gap-0.5">
                    <span className="font-semibold">
                      {p.provider} · {p.status}
                    </span>
                    <span className="font-mono text-[11px] text-dim">
                      {formatDate(p.createdAt)} · {p.providerPaymentId ?? p.providerInvoiceId}
                    </span>
                  </span>
                  <span className="tabular-nums">{formatMnt(p.amount)}</span>
                </li>
              ))}
            </ul>
          </section>

          {order.refunds.length ? (
            <section className="flex flex-col gap-3">
              <h2 className="kicker">{t('refundsTitle')}</h2>
              <ul className="flex flex-col gap-2">
                {order.refunds.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1.5 rounded-[14px] border-l-2 border-ember/70 bg-night-2 px-4 py-3 text-sm">
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-display text-2xl font-semibold tabular-nums text-ember">−{formatMnt(r.amount)}</span>
                      <span className="font-mono text-[11px] text-dim">
                        {formatDate(r.createdAt)} · {r.createdBy}
                      </span>
                    </span>
                    <span>{r.reason}</span>
                    {r.providerRef ? (
                      <span className="text-mist">
                        {t('providerRef')}: <span className="font-mono">{r.providerRef}</span>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {/* Захиалгын тасалбар */}
        <Ticket glow className="lg:sticky lg:top-8">
          <div className="flex flex-col gap-2 px-6 pt-6">
            <span className="kicker">{t('total')}</span>
            <span className="font-display text-5xl font-semibold leading-none tabular-nums">{formatMnt(order.totalAmount)}</span>
          </div>
          <Perforation />
          <dl className="flex flex-col gap-3 px-6 pb-6 text-sm">
            {facts.map((f) => (
              <div key={f.label} className="flex justify-between gap-3">
                <dt className="text-mist">{f.label}</dt>
                <dd className="truncate text-right">{f.value}</dd>
              </div>
            ))}
            <div className="flex flex-col gap-1 border-t border-line pt-3">
              <dt className="text-mist">{t('id')}</dt>
              <dd className="break-all font-mono text-[11px] text-dim">{order.id}</dd>
            </div>
          </dl>
        </Ticket>
      </div>
    </>
  );
}
