'use client';

import { BackLink } from '@/components/back-link';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { useCallback, useEffect, useState } from 'react';
import { CheckIcon, ChevronDownIcon, ClockIcon, DownloadIcon, LinkIcon, QrIcon } from '@/components/icons';
import { Perforation, Ticket } from '@/components/ticket';
import { Alert, Badge, Button, ButtonLink, EmptyState, Kicker, Spinner } from '@/components/ui';
import { api, useErrorMessage } from '@/lib/api-client';
import { formatDate, formatMnt } from '@/lib/datetime';
import { findSavedOrder, orderHref, saveOrder } from '@/lib/my-orders';
import type { OrderView } from '@/lib/types';

const POLL_MS = 3_000;

/** Токен: URL-ийн #t= (имэйл/хуулсан холбоос) эсвэл энэ төхөөрөмжид хадгалсан захиалга */
function tokenFor(id: string): string | null {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('t');
  return fromHash || findSavedOrder(id)?.token || null;
}

export function OrderDetail({ id }: { id: string }) {
  const t = useTranslations('order');
  const errorMessage = useErrorMessage();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setToken(tokenFor(id)), [id]);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await api<OrderView>(`/orders/${id}`, { headers: { 'x-order-token': token } });
    if (!res.ok) {
      setError(errorMessage(res.error));
      return;
    }
    setError(null);
    setOrder(res.data);
    saveOrder({ id, token, eventTitle: res.data.eventTitle, total: res.data.totalAmount, createdAt: res.data.createdAt });
  }, [id, token, errorMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  // Төлбөр хүлээж байхад 3 секунд тутам шалгана (QPay callback ирэхгүй тохиолдолд ч)
  const pending = order?.status === 'PENDING';
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pending, load]);

  if (token === undefined) return null;

  return (
    <main className="relative mx-auto flex max-w-6xl flex-col gap-10 px-5 pt-28">
      <div aria-hidden className="pointer-events-none absolute -top-10 right-0 -z-10 h-[28rem] w-[40rem] animate-drift rounded-full bg-gold/[0.08] blur-[120px]" />
      <BackLink href="/my/orders">{t('myOrders')}</BackLink>
      {!token ? <Alert>{t('noToken')}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
      {order && token ? <OrderBody order={order} token={token} onChange={load} /> : token && !error ? <OrderSkeleton /> : null}
    </main>
  );
}

function OrderSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="skeleton h-4 w-32 rounded" />
      <div className="skeleton h-16 w-3/4 rounded-xl" />
      <div className="skeleton h-80 rounded-[1.25rem]" />
    </div>
  );
}

function OrderBody({ order, token, onChange }: { order: OrderView; token: string; onChange: () => Promise<void> }) {
  const t = useTranslations('order');
  return (
    <>
      <header className="flex flex-col gap-4">
        <Kicker className="animate-rise">{t('kicker', { id: order.id.slice(0, 8).toUpperCase() })}</Kicker>
        <h1 className="animate-rise font-display text-[clamp(2.5rem,6vw,5rem)] font-semibold leading-[0.92] tracking-[-0.03em] stagger [--i:1]">
          {order.eventTitle}
        </h1>
        <p className="animate-rise text-lg text-mist stagger [--i:2]">
          {t('summary', { count: order.items.length, total: formatMnt(order.totalAmount) })}
          {order.bundleApplied ? ` · ${t('bundle')}` : ''}
        </p>
      </header>

      {order.status === 'PENDING' ? <PaymentCard order={order} token={token} onChange={onChange} /> : null}
      {order.status === 'EXPIRED' ? (
        <EmptyState
          icon={<ClockIcon size={28} />}
          title={t('expiredTitle')}
          body={t('expired')}
          action={
            <ButtonLink href="/photographers" variant="secondary">
              {t('backToEvents')}
            </ButtonLink>
          }
        />
      ) : null}
      {order.status === 'FAILED' ? <Alert>{t('failed')}</Alert> : null}
      {order.status === 'REFUNDED' ? <Alert kind="info">{t('refunded')}</Alert> : null}
      {order.status === 'PAID' || order.status === 'PARTIALLY_REFUNDED' ? <Downloads order={order} token={token} /> : null}
    </>
  );
}


function PaymentCard({ order, token, onChange }: { order: OrderView; token: string; onChange: () => Promise<void> }) {
  const t = useTranslations('order');
  const errorMessage = useErrorMessage();
  const [qr, setQr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Цагирагийн 100% = хуудас нээгдэх үеийн үлдсэн хугацаа
  const [span] = useState(() => (order.paymentDueAt ? Math.max(1, new Date(order.paymentDueAt).getTime() - Date.now()) : 1));
  const [mockError, setMockError] = useState<string | null>(null);
  const qrText = order.payment?.qrText;

  useEffect(() => {
    if (!qrText) return;
    void QRCode.toDataURL(qrText, { margin: 1, width: 320, errorCorrectionLevel: 'M' }).then(setQr);
  }, [qrText]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const leftMs = order.paymentDueAt ? Math.max(0, new Date(order.paymentDueAt).getTime() - now) : null;

  async function mockPay() {
    const res = await api(`/orders/${order.id}/mock-pay`, { method: 'POST', headers: { 'x-order-token': token } });
    if (!res.ok) setMockError(errorMessage(res.error));
    await onChange();
  }

  if (!order.payment) return <Alert>{t('failed')}</Alert>;
  const banks = order.payment.deeplinks;

  const qrImage = qr ? (
    <img src={qr} alt={t('qrAlt')} width={240} height={240} className="animate-fade rounded-2xl bg-white p-2" />
  ) : (
    <div className="skeleton size-60 rounded-2xl" />
  );

  return (
    <section className="grid animate-rise items-start gap-6 stagger [--i:3] lg:grid-cols-[1fr_22rem]">
      <Ticket glow className="p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex flex-col gap-3">
            <span role="status">
              <Badge tone="amber">{t('waiting')}</Badge>
            </span>
            <h2 className="font-display text-5xl font-semibold leading-none tabular-nums sm:text-6xl">{formatMnt(order.totalAmount)}</h2>
            <p className="max-w-sm text-[15px] text-mist">{banks.length ? t('payHintApps') : t('payHintQr')}</p>
          </div>
          {leftMs !== null ? <Countdown fraction={leftMs / span} seconds={Math.floor(leftMs / 1000)} /> : null}
        </div>

        {banks.length ? (
          <>
            <Perforation />
            {/* Ихэнх хүн яг энэ утсаараа төлнө: банкны апп эхэнд */}
            <p className="kicker mb-4">{t('bankApps')}</p>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {banks.map((bank, i) => (
                <li key={bank.link} className="animate-rise stagger" style={{ '--i': i } as React.CSSProperties}>
                  <a
                    href={bank.link}
                    className="group flex min-h-26 flex-col items-center justify-center gap-2.5 rounded-2xl bg-night-3 p-2 text-center text-xs font-semibold ring-1 ring-inset ring-line transition duration-300 hover:-translate-y-0.5 hover:bg-night-4 hover:ring-gold/60"
                  >
                    <img src={bank.logo} alt="" width={40} height={40} className="rounded-xl transition duration-300 group-hover:scale-110" loading="lazy" />
                    <span className="line-clamp-2 leading-tight">{bank.description || bank.name}</span>
                  </a>
                </li>
              ))}
            </ul>
            {/* Утсан дээр QR эвхэгдсэн — өөр утаснаас уншуулах хүнд л хэрэгтэй */}
            <details className="group mt-4 rounded-2xl bg-night-3 ring-1 ring-inset ring-line lg:hidden">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 font-semibold [&::-webkit-details-marker]:hidden">
                <QrIcon size={22} className="text-gold" />
                <span className="flex-1">{t('otherPhone')}</span>
                <ChevronDownIcon size={20} className="text-mist transition group-open:rotate-180" />
              </summary>
              <div className="flex justify-center px-4 pb-5">{qrImage}</div>
            </details>
          </>
        ) : null}

        {order.mockPayment ? (
          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-dashed border-gold/50 bg-gold/[0.05] p-4">
            <p className="text-xs text-gold-soft">{t('mockNote')}</p>
            <Button variant="secondary" onClick={() => void mockPay()}>
              {t('mockPay')}
            </Button>
            {mockError ? <p className="text-sm text-ember">{mockError}</p> : null}
          </div>
        ) : null}
      </Ticket>

      {/* Өргөн дэлгэцэнд QR байнга харагдана — компьютерээс нээсэн хүн утсаараа уншуулна */}
      <aside className={`panel flex-col items-center gap-4 p-6 text-center ${banks.length ? 'hidden lg:flex' : 'flex'}`}>
        <p className="kicker">{t('otherPhone')}</p>
        {qrImage}
        <p className="flex items-center gap-2 text-sm text-mist">
          <Spinner className="size-3.5 text-gold" />
          {t('autoRefresh')}
        </p>
      </aside>
    </section>
  );
}

/** Төлбөрийн үлдсэн хугацааны алтан цагираг */
function Countdown({ fraction, seconds }: { fraction: number; seconds: number }) {
  const t = useTranslations('order');
  const r = 52;
  const c = 2 * Math.PI * r;
  const urgent = seconds < 60;
  return (
    <div className="relative size-32 shrink-0" role="timer" aria-label={`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} ${t('left')}`}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="4" className="stroke-night-4" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, fraction)))}
          className={`transition-[stroke-dashoffset] duration-1000 ease-linear ${urgent ? 'stroke-ember' : 'stroke-gold'}`}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
        <span className={`font-mono text-2xl font-semibold tabular-nums ${urgent ? 'text-ember' : ''}`}>
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </span>
        <span className="kicker !text-[9px]">{t('left')}</span>
      </span>
    </div>
  );
}

function Downloads({ order, token }: { order: OrderView; token: string }) {
  const t = useTranslations('order');
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const available = order.items.filter((i) => i.available);

  async function download(itemId: string): Promise<boolean> {
    const res = await api<{ url: string }>(`/orders/${order.id}/items/${itemId}/download`, {
      method: 'POST',
      headers: { 'x-order-token': token },
    });
    if (!res.ok) {
      setError(errorMessage(res.error));
      return false;
    }
    // Presigned URL нь Content-Disposition: attachment — хуудаснаас гарахгүйгээр файл татагдана
    const link = document.createElement('a');
    link.href = res.data.url;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  }

  async function downloadAll() {
    setError(null);
    setDone(0);
    for (const [i, item] of available.entries()) {
      setDownloading(item.id);
      if (!(await download(item.id))) break;
      setDone(i + 1);
      // Браузер олон файлыг зэрэг татахыг хаадаг тул дараалуулна
      await new Promise((r) => setTimeout(r, 900));
    }
    setDownloading(null);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}${orderHref(order.id, token)}`);
    setCopied(true);
  }

  return (
    <>
      {/* Амжилтын агшин: алтан долгион */}
      <section className="flex animate-rise flex-col gap-8 stagger [--i:3] sm:flex-row sm:items-center">
        <span className="relative flex size-24 shrink-0 items-center justify-center" aria-hidden>
          <span className="absolute inset-0 animate-ripple rounded-full bg-gold/30" />
          <span className="absolute inset-0 animate-ripple rounded-full bg-gold/20 [animation-delay:0.8s]" />
          <span className="relative flex size-20 items-center justify-center rounded-full bg-gold text-gold-ink shadow-[0_0_60px_rgba(232,180,90,0.5)]">
            <CheckIcon size={38} strokeWidth={2.2} className="animate-pop" />
          </span>
        </span>
        <div className="flex flex-col gap-1" role="status">
          <p className="font-display text-5xl font-semibold leading-none">{t('paidTitle')}</p>
          <p className="text-lg text-mist">{t('readyCount', { count: available.length })}</p>
        </div>
      </section>

      {error ? <Alert>{error}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        {available.length > 1 ? (
          <Ticket glow className="flex flex-col justify-center gap-5 p-6">
            <Button size="lg" onClick={() => void downloadAll()} busy={downloading !== null} className="w-full">
              {downloading ? null : <DownloadIcon size={20} />}
              {downloading ? t('downloadingAll') : t('downloadAll', { count: available.length })}
            </Button>
            {done !== null ? (
              <div className="flex flex-col gap-2" aria-live="polite">
                <div className="flex gap-1" aria-hidden>
                  {available.map((item, i) => (
                    <span key={item.id} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${i < done ? 'bg-gold' : 'bg-night-4'}`} />
                  ))}
                </div>
                <p className="font-mono text-xs tracking-[0.12em] text-gold">{t('progress', { done, total: available.length })}</p>
              </div>
            ) : null}
          </Ticket>
        ) : null}

        <div className={`panel flex flex-col gap-4 p-6 ${available.length > 1 ? '' : 'lg:col-span-2'}`}>
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/25" aria-hidden>
              <LinkIcon size={18} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="font-semibold">{t('keepLinkTitle')}</p>
              <p className="text-sm leading-relaxed text-mist">
                {order.downloadableUntil ? `${t('until', { date: formatDate(order.downloadableUntil) })} ` : ''}
                {order.emailOnFile ? t('keepLinkEmailed') : t('keepLink')}
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={() => void copyLink()} className={copied ? '!text-jade !ring-jade/50' : ''}>
            {copied ? <CheckIcon size={16} className="animate-pop" /> : <LinkIcon size={16} />}
            <span aria-live="polite">{copied ? t('copied') : t('copyLink')}</span>
          </Button>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {order.items.map((item, i) => (
          <li key={item.id} className="group relative animate-rise stagger" style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
            {item.thumbUrl ? (
              <img src={item.thumbUrl} alt="" loading="lazy" className="aspect-4/5 w-full rounded-[14px] bg-night-3 object-cover" />
            ) : (
              <div className="flex aspect-4/5 w-full items-center justify-center rounded-[14px] bg-night-2 p-3 text-center text-xs text-mist ring-1 ring-inset ring-line">
                {item.refunded ? t('itemRefunded') : t('itemUnavailable')}
              </div>
            )}
            <span className="absolute left-3 top-3 font-mono text-[10px] tracking-[0.14em] text-ivory/80">#{String(i + 1).padStart(2, '0')}</span>
            {item.available ? (
              <button
                type="button"
                aria-label={t('download', { index: i + 1 })}
                disabled={downloading !== null}
                onClick={async () => {
                  setDownloading(item.id);
                  setError(null);
                  await download(item.id);
                  setDownloading(null);
                }}
                className="glass absolute bottom-2 right-2 flex size-11 cursor-pointer items-center justify-center rounded-full text-ivory transition duration-300 hover:bg-gold hover:text-gold-ink disabled:cursor-wait disabled:opacity-70"
              >
                {downloading === item.id ? <Spinner /> : <DownloadIcon size={18} />}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
