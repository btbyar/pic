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

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-stone-600">
          {data.revenueSharePct !== null ? t('share', { pct: data.revenueSharePct }) : ''} {t('intro')}
        </p>
      </div>

      <PayoutAccountForm account={data.account} />

      {data.months.length === 0 ? (
        <p className="py-10 text-center text-stone-500">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.months.map((m) => (
            <li key={m.period}>
              <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-0.5 text-sm">
                  <span className="text-base font-semibold tabular-nums">{m.period}</span>
                  <span className="text-stone-600">
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
