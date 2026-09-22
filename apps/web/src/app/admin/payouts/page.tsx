import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Avatar } from '@/components/avatar';
import { ChevronLeftIcon, ChevronRightIcon, WalletIcon } from '@/components/icons';
import { Alert, Badge, EmptyState, PageHeader } from '@/components/ui';
import { getMe, serverApi } from '@/lib/api-server';
import { formatDate, formatMnt } from '@/lib/datetime';
import type { AdminPayouts } from '@/lib/types';
import { MarkPaidForm } from './mark-paid-form';

function shift(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const stepper = 'flex size-11 items-center justify-center rounded-full text-mist ring-1 ring-inset ring-line-strong transition hover:bg-white/[0.06] hover:text-ivory';

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
      <PageHeader kicker={t('kicker')} title={t('title')} intro={<p>{t('intro')}</p>} />

      {/* Сар сонгогч + төлөх нийт дүн */}
      <div className="panel flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <nav aria-label={t('period')} className="flex items-center gap-3">
          <Link href={`/admin/payouts?period=${shift(data.period, -1)}`} aria-label={t('prev')} className={stepper}>
            <ChevronLeftIcon size={18} />
          </Link>
          <span className="min-w-24 text-center font-mono text-lg tabular-nums">{data.period}</span>
          {data.period < data.currentPeriod ? (
            <Link href={`/admin/payouts?period=${shift(data.period, 1)}`} aria-label={t('next')} className={stepper}>
              <ChevronRightIcon size={18} />
            </Link>
          ) : (
            <span className="size-11" aria-hidden />
          )}
        </nav>
        <div className="flex flex-col items-end gap-1">
          <span className="kicker">{t('toPayLabel')}</span>
          <span className={`font-display text-4xl font-semibold leading-none tabular-nums ${total ? 'text-gold' : 'text-dim'}`}>{formatMnt(total)}</span>
        </div>
      </div>
      {!data.closed ? <Alert kind="info">{t('notClosed')}</Alert> : null}

      {data.rows.length === 0 ? (
        <EmptyState icon={<WalletIcon size={28} />} title={t('empty')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.rows.map((r, i) => {
            const paid = r.payout?.status === 'PAID';
            return (
              <li
                key={r.photographerId}
                style={{ '--i': Math.min(i, 10) } as React.CSSProperties}
                className="panel flex animate-rise flex-col gap-4 p-4 stagger sm:flex-row sm:items-center sm:justify-between sm:p-5"
              >
                <div className="flex min-w-0 items-start gap-4">
                  <Avatar url={null} name={r.displayName} size={44} />
                  <div className="flex min-w-0 flex-col gap-1 text-sm">
                    <span className="font-display text-2xl font-semibold leading-tight">{r.displayName}</span>
                    <span className="text-mist">
                      {t('breakdown', { gross: formatMnt(r.gross), refunded: formatMnt(r.refunded) })}
                      {r.carriedIn < 0 ? <span className="text-ember"> · {t('carried', { amount: formatMnt(-r.carriedIn) })}</span> : null}
                    </span>
                    {r.account ? (
                      <span className="flex flex-wrap gap-x-2 text-mist">
                        <span>{r.account.bankName}</span>
                        <span className="font-mono tabular-nums tracking-[0.06em] text-ivory">{r.account.accountNumber}</span>
                        <span>{r.account.accountName}</span>
                      </span>
                    ) : (
                      <span className="text-gold">{t('noAccount')}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <span className={`font-display text-3xl font-semibold leading-none tabular-nums ${paid ? 'text-mist' : ''}`}>
                    {formatMnt(paid ? r.payout!.netAmount : r.payable)}
                  </span>
                  {paid ? (
                    <Badge tone="green">{t('paidOn', { date: formatDate(r.payout!.paidAt!), ref: r.payout!.reference ?? '' })}</Badge>
                  ) : r.net < 0 ? (
                    <span className="text-sm text-ember">{t('carryForward', { amount: formatMnt(-r.net) })}</span>
                  ) : data.closed && r.payable > 0 ? (
                    <MarkPaidForm
                      photographerId={r.photographerId}
                      name={r.displayName}
                      amount={r.payable}
                      period={data.period}
                      askTotp={Boolean(me?.mfa.enabled)}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
