import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Alert, Badge, Card } from '@/components/ui';
import { getMe, serverApi } from '@/lib/api-server';
import { formatDate, formatMnt } from '@/lib/datetime';
import type { AdminPayouts } from '@/lib/types';
import { MarkPaidForm } from './mark-paid-form';

function shift(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default async function AdminPayoutsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: raw } = await searchParams;
  const query = raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? `?period=${raw}` : '';
  const t = await getTranslations('admin.payouts');
  const [{ data }, me] = await Promise.all([serverApi<AdminPayouts>(`/admin/payouts${query}`), getMe()]);
  if (!data) return null;
  // Анх нээхэд өмнөх (хаагдсан) сарыг харуулна
  if (!raw && data.period === data.currentPeriod) {
    const prev = await serverApi<AdminPayouts>(`/admin/payouts?period=${shift(data.period, -1)}`);
    if (prev.data) Object.assign(data, prev.data);
  }
  const total = data.rows.reduce((s, r) => s + (r.payout?.status === 'PAID' ? 0 : r.payable), 0);

  return (
    <>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-sm text-ink-soft">{t('intro')}</p>
      <nav className="flex items-center gap-3">
        <Link href={`/admin/payouts?period=${shift(data.period, -1)}`} className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm">
          ‹
        </Link>
        <span className="text-lg font-semibold tabular-nums">{data.period}</span>
        {data.period < data.currentPeriod ? (
          <Link href={`/admin/payouts?period=${shift(data.period, 1)}`} className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm">
            ›
          </Link>
        ) : null}
        <span className="text-sm text-ink-soft">{t('toPay', { amount: formatMnt(total) })}</span>
      </nav>
      {!data.closed ? <Alert kind="info">{t('notClosed')}</Alert> : null}

      {data.rows.length === 0 ? (
        <p className="py-16 text-center text-ink-soft">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.rows.map((r) => (
            <li key={r.photographerId}>
              <Card className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                <div className="flex flex-col gap-1 text-sm">
                  <span className="text-base font-semibold">{r.displayName}</span>
                  <span className="text-ink-soft">
                    {t('breakdown', { gross: formatMnt(r.gross), refunded: formatMnt(r.refunded) })}
                    {r.carriedIn < 0 ? ` · ${t('carried', { amount: formatMnt(-r.carriedIn) })}` : ''}
                  </span>
                  {r.account ? (
                    <span>
                      {r.account.bankName} · <b className="tabular-nums">{r.account.accountNumber}</b> · {r.account.accountName}
                    </span>
                  ) : (
                    <span className="text-amber-300">{t('noAccount')}</span>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <span className="text-xl font-bold tabular-nums">{formatMnt(r.payout?.status === 'PAID' ? r.payout.netAmount : r.payable)}</span>
                  {r.payout?.status === 'PAID' ? (
                    <Badge tone="green">{t('paidOn', { date: formatDate(r.payout.paidAt!), ref: r.payout.reference ?? '' })}</Badge>
                  ) : r.net < 0 ? (
                    <span className="text-sm text-ink-soft">{t('carryForward', { amount: formatMnt(-r.net) })}</span>
                  ) : data.closed && r.payable > 0 ? (
                    <MarkPaidForm photographerId={r.photographerId} period={data.period} askTotp={Boolean(me?.mfa.enabled)} />
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
