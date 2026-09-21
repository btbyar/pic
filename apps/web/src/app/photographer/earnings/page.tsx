import { getTranslations } from 'next-intl/server';
import { Badge, Card } from '@/components/ui';
import { serverApi } from '@/lib/api-server';
import { formatDate, formatMnt } from '@/lib/datetime';
import type { Earnings } from '@/lib/types';
import { PayoutAccountForm } from './payout-account-form';

export default async function EarningsPage() {
  const t = await getTranslations('earnings');
  const { data } = await serverApi<Earnings>('/photographer/earnings');
  if (!data) return null;

  const closed = data.months.filter((m) => m.period !== data.currentPeriod);
  const current = data.months.find((m) => m.period === data.currentPeriod);
  const summary = [
    // Хүлээгдэж буй: сар нь хаагдсан, гэхдээ хараахан шилжүүлээгүй
    { key: 'awaiting', value: closed.reduce((sum, m) => sum + (m.payout?.status === 'PAID' ? 0 : m.payable), 0) },
    { key: 'thisMonth', value: current?.payable ?? 0 },
    { key: 'paidTotal', value: data.months.reduce((sum, m) => sum + (m.payout?.status === 'PAID' ? m.payout.netAmount : 0), 0) },
  ] as const;

  // Сүүлийн 6 сар, хуучнаас шинэ рүү. Утга нь доорх жагсаалттай ижил (шилжүүлсэн эсвэл шилжүүлэх дүн)
  const amountOf = (m: Earnings['months'][number]) => (m.payout?.status === 'PAID' ? m.payout.netAmount : m.payable);
  const chart = [...data.months].sort((a, b) => a.period.localeCompare(b.period)).slice(-6);
  const chartMax = Math.max(1, ...chart.map(amountOf));

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold">{t('title')}</h1>
        <p className="text-sm text-ink-soft">
          {data.revenueSharePct !== null ? t('share', { pct: data.revenueSharePct }) : ''} {t('intro')}
        </p>
      </div>

      {/* Данс байхгүй бол орлого авах боломжгүй — хамгийн дээр */}
      {!data.account ? <PayoutAccountForm account={data.account} /> : null}

      <dl className="grid gap-3 sm:grid-cols-3">
        {summary.map(({ key, value }) => (
          <div key={key} className="flex flex-col gap-1 rounded-2xl bg-surface-2 p-4">
            <dt className="text-sm text-ink-soft">{t(`summary.${key}`)}</dt>
            <dd className="font-display text-3xl font-extrabold tabular-nums">{formatMnt(value)}</dd>
          </div>
        ))}
      </dl>

      {chart.length >= 2 ? (
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">{t('chartTitle')}</h2>
          {/* Дэлгэц уншигчид доорх жагсаалт ижил мэдээллийг өгнө */}
          <div className="flex h-56 items-end gap-3 sm:gap-5" aria-hidden>
            {chart.map((m) => {
              const current = m.period === data.currentPeriod;
              const value = amountOf(m);
              return (
                <div key={m.period} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className={`text-xs font-semibold tabular-nums ${current ? 'text-brand-700' : 'text-ink-soft'}`}>{formatMnt(value)}</span>
                  <span
                    className={`w-full max-w-14 rounded-lg ${current ? 'bg-brand-600' : 'bg-brand-100'}`}
                    style={{ height: `${Math.max(4, (value / chartMax) * 100) * 0.7}%` }}
                  />
                  <span className="text-xs tabular-nums text-ink-soft">{m.period}</span>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {data.account ? <PayoutAccountForm account={data.account} /> : null}

      {data.months.length === 0 ? (
        <p className="py-10 text-center text-ink-soft">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.months.map((m) => (
            <li key={m.period}>
              <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-0.5 text-sm">
                  <span className="text-base font-semibold tabular-nums">{m.period}</span>
                  <span className="text-ink-soft">
                    {t('sales', { amount: formatMnt(m.gross) })}
                    {m.refunded ? ` · ${t('refunds', { amount: formatMnt(m.refunded) })}` : ''}
                    {m.carriedIn ? ` · ${t('carried', { amount: formatMnt(-m.carriedIn) })}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {m.payout?.status === 'PAID' ? (
                    <Badge tone="green">{t('paid', { date: formatDate(m.payout.paidAt!) })}</Badge>
                  ) : m.period === data.currentPeriod ? (
                    <Badge>{t('current')}</Badge>
                  ) : m.net < 0 ? (
                    <Badge tone="amber">{t('deficit')}</Badge>
                  ) : m.payable > 0 ? (
                    <Badge tone="amber">{t('pending')}</Badge>
                  ) : null}
                  <span className="text-lg font-bold tabular-nums">{formatMnt(m.payout?.status === 'PAID' ? m.payout.netAmount : m.payable)}</span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
