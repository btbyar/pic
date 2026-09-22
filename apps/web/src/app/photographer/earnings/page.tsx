import { getTranslations } from 'next-intl/server';
import { CountUp } from '@/components/count-up';
import { WalletIcon } from '@/components/icons';
import { Badge, EmptyState, PageHeader, Stat } from '@/components/ui';
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
  // Хүлээгдэж буй: сар нь хаагдсан, гэхдээ хараахан шилжүүлээгүй
  const awaiting = closed.reduce((sum, m) => sum + (m.payout?.status === 'PAID' ? 0 : m.payable), 0);
  const paidTotal = data.months.reduce((sum, m) => sum + (m.payout?.status === 'PAID' ? m.payout.netAmount : 0), 0);

  // Сүүлийн 6 сар, хуучнаас шинэ рүү. Утга нь доорх жагсаалттай ижил (шилжүүлсэн эсвэл шилжүүлэх дүн)
  const amountOf = (m: Earnings['months'][number]) => (m.payout?.status === 'PAID' ? m.payout.netAmount : m.payable);
  const chart = [...data.months].sort((a, b) => a.period.localeCompare(b.period)).slice(-6);
  const chartMax = Math.max(1, ...chart.map(amountOf));

  return (
    <>
      <PageHeader
        kicker={data.revenueSharePct !== null ? t('share', { pct: data.revenueSharePct }) : t('kicker')}
        title={t('title')}
        intro={<p>{t('intro')}</p>}
      />

      {/* Данс байхгүй бол орлого авах боломжгүй — хамгийн дээр */}
      {!data.account ? <PayoutAccountForm account={data.account} /> : null}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={t('summary.awaiting')} accent={awaiting > 0} className="col-span-2 sm:col-span-1">
          <CountUp value={awaiting} /> ₮
        </Stat>
        <Stat label={t('summary.thisMonth')}>
          <CountUp value={current?.payable ?? 0} /> ₮
        </Stat>
        <Stat label={t('summary.paidTotal')}>
          <CountUp value={paidTotal} /> ₮
        </Stat>
      </dl>

      {chart.length >= 2 ? (
        <section className="panel flex flex-col gap-6 p-5 sm:p-7">
          <h2 className="kicker">{t('chartTitle')}</h2>
          {/* Дэлгэц уншигчид доорх жагсаалт ижил мэдээллийг өгнө */}
          <div className="relative flex h-60 items-end gap-3 sm:gap-6" aria-hidden>
            <div className="pointer-events-none absolute inset-x-0 bottom-7 top-6 flex flex-col justify-between">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="border-t border-dashed border-line" />
              ))}
            </div>
            {chart.map((m, i) => {
              const isCurrent = m.period === data.currentPeriod;
              const value = amountOf(m);
              return (
                <div key={m.period} className="relative flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className={`font-mono text-[10px] tabular-nums ${isCurrent ? 'text-gold' : 'text-mist'}`}>{value ? formatMnt(value) : ''}</span>
                  <span
                    className={`w-full max-w-16 origin-bottom animate-rise rounded-t-md stagger ${
                      isCurrent ? 'bg-linear-to-t from-gold-deep to-gold shadow-[0_0_40px_-8px_rgba(232,180,90,0.7)]' : 'bg-night-4'
                    }`}
                    style={{ height: `${Math.max(3, (value / chartMax) * 100) * 0.72}%`, '--i': i } as React.CSSProperties}
                  />
                  <span className={`font-mono text-[11px] tabular-nums ${isCurrent ? 'text-ivory' : 'text-dim'}`}>{m.period}</span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {data.account ? <PayoutAccountForm account={data.account} /> : null}

      {data.months.length === 0 ? (
        <EmptyState icon={<WalletIcon size={28} />} title={t('empty')} body={t('emptyBody')} />
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="kicker">{t('monthsTitle')}</h2>
          <ul className="flex flex-col gap-2">
            {data.months.map((m, i) => (
              <li
                key={m.period}
                style={{ '--i': Math.min(i, 10) } as React.CSSProperties}
                className="panel flex animate-rise flex-col overflow-hidden stagger sm:flex-row sm:items-stretch"
              >
                {/* Тасалбарын хэлтэрхий: зүүн талд сар */}
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-dashed border-line-strong/50 px-5 py-3 sm:w-36 sm:flex-col sm:items-start sm:justify-center sm:border-b-0 sm:border-r">
                  <span className="font-mono text-sm tabular-nums text-ivory">{m.period}</span>
                  {m.payout?.status === 'PAID' ? (
                    <Badge tone="green">{t('paid', { date: formatDate(m.payout.paidAt!) })}</Badge>
                  ) : m.period === data.currentPeriod ? (
                    <Badge>{t('current')}</Badge>
                  ) : m.net < 0 ? (
                    <Badge tone="red">{t('deficit')}</Badge>
                  ) : m.payable > 0 ? (
                    <Badge tone="amber">{t('pending')}</Badge>
                  ) : null}
                </div>
                <div className="flex flex-1 flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-mist">
                    <span>{t('sales', { amount: formatMnt(m.gross) })}</span>
                    {m.refunded ? <span className="text-ember">{t('refunds', { amount: formatMnt(m.refunded) })}</span> : null}
                    {m.carriedIn ? <span className="text-ember">{t('carried', { amount: formatMnt(-m.carriedIn) })}</span> : null}
                  </span>
                  <span className="font-display text-3xl font-semibold leading-none tabular-nums">{formatMnt(amountOf(m))}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
