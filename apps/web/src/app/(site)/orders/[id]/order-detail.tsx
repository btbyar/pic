'use client';

import { BackLink } from '@/components/back-link';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { useCallback, useEffect, useState } from 'react';
import { CheckIcon, ChevronDownIcon, DownloadIcon, LinkIcon, QrIcon } from '@/components/icons';
import { Alert, Button, ButtonLink, Card } from '@/components/ui';
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
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8">
      <BackLink href="/my/orders">{t('myOrders')}</BackLink>
      {!token ? <Alert>{t('noToken')}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
      {order && token ? <OrderBody order={order} token={token} onChange={load} /> : null}
    </main>
  );
}

function OrderBody({ order, token, onChange }: { order: OrderView; token: string; onChange: () => Promise<void> }) {
  const t = useTranslations('order');
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{order.eventTitle}</h1>
        <p className="text-ink-soft">
          {t('summary', { count: order.items.length, total: formatMnt(order.totalAmount) })}
          {order.bundleApplied ? ` · ${t('bundle')}` : ''}
        </p>
      </header>

      {order.status === 'PENDING' ? <PaymentCard order={order} token={token} onChange={onChange} /> : null}
      {order.status === 'EXPIRED' ? (
        <Card className="flex flex-col items-start gap-3">
          <p className="font-medium">{t('expired')}</p>
          <ButtonLink href="/photographers" variant="secondary">
            {t('backToEvents')}
          </ButtonLink>
        </Card>
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
    <img src={qr} alt={t('qrAlt')} width={260} height={260} className="rounded-xl border border-line" />
  ) : (
    <div className="h-[260px] w-[260px] animate-pulse rounded-xl bg-surface-3" />
  );

  return (
    <section className="flex flex-col items-center gap-4 text-center">
      {leftMs !== null ? <Countdown fraction={leftMs / span} seconds={Math.floor(leftMs / 1000)} /> : null}
      <span role="status" className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
        {t('waiting')}
      </span>
      <h2 className="font-display text-3xl font-extrabold">{t('payTitle', { total: formatMnt(order.totalAmount) })}</h2>

      {banks.length ? (
        <>
          {/* Ихэнх хүн яг энэ утсаараа төлнө: банкны апп эхэнд, QR нь "өөр утаснаас" гэж эвхэгдсэн */}
          <p className="max-w-sm text-[15px] text-ink-soft">{t('payHintApps')}</p>
          <ul className="grid w-full grid-cols-3 gap-2 sm:grid-cols-4">
            {banks.map((bank) => (
              <li key={bank.link}>
                <a
                  href={bank.link}
                  className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-surface-2 p-2 text-xs font-semibold hover:bg-brand-50"
                >
                  <img src={bank.logo} alt="" width={40} height={40} className="rounded-xl" loading="lazy" />
                  <span className="line-clamp-2">{bank.description || bank.name}</span>
                </a>
              </li>
            ))}
          </ul>
          <details className="group w-full rounded-2xl bg-surface-2 text-left">
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 font-semibold [&::-webkit-details-marker]:hidden">
              <QrIcon size={22} />
              <span className="flex-1">{t('otherPhone')}</span>
              <ChevronDownIcon size={20} className="text-ink-soft transition group-open:rotate-180" />
            </summary>
            <div className="flex justify-center px-4 pb-4">{qrImage}</div>
          </details>
        </>
      ) : (
        <Card className="flex flex-col items-center gap-3">
          <p className="text-sm text-ink-soft">{t('payHintQr')}</p>
          {qrImage}
        </Card>
      )}

      {order.mockPayment ? (
        <div className="flex w-full flex-col gap-2 rounded-2xl border border-dashed border-amber-400 bg-amber-50 p-3">
          <p className="text-xs text-amber-900">{t('mockNote')}</p>
          <Button variant="secondary" onClick={() => void mockPay()}>
            {t('mockPay')}
          </Button>
          {mockError ? <p className="text-sm text-red-700">{mockError}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

/** Төлбөрийн үлдсэн хугацааны цагираг */
function Countdown({ fraction, seconds }: { fraction: number; seconds: number }) {
  const t = useTranslations('order');
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-30">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="8" className="stroke-surface-3" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, fraction)))}
          className="stroke-brand-600 transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-extrabold tabular-nums">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </span>
        <span className="text-xs text-ink-soft">{t('left')}</span>
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
      {/* Амжилтын агшин */}
      <div className="flex items-center gap-4">
        <span className="flex size-13 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white" aria-hidden>
          <CheckIcon size={28} strokeWidth={2.6} />
        </span>
        <div className="flex flex-col" role="status">
          <p className="font-display text-2xl font-extrabold">{t('paidTitle')}</p>
          <p className="text-ink-soft">{t('readyCount', { count: available.length })}</p>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {available.length > 1 ? (
        <Card className="flex flex-col gap-3">
          <Button onClick={() => void downloadAll()} disabled={downloading !== null} className="min-h-14 w-full gap-2">
            <DownloadIcon size={20} />
            {downloading ? t('downloadingAll') : t('downloadAll', { count: available.length })}
          </Button>
          {done !== null ? (
            <div className="flex flex-col gap-1.5" aria-live="polite">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-emerald-700 transition-all" style={{ width: `${(done / available.length) * 100}%` }} />
              </div>
              <p className="text-sm font-semibold text-emerald-800">{t('progress', { done, total: available.length })}</p>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card className="flex flex-wrap items-center gap-3 p-4!">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600" aria-hidden>
          <LinkIcon size={20} />
        </span>
        <div className="flex min-w-48 flex-1 flex-col">
          <p className="font-semibold">{t('keepLinkTitle')}</p>
          <p className="text-sm text-ink-soft">
            {order.downloadableUntil ? `${t('until', { date: formatDate(order.downloadableUntil) })} ` : ''}
            {order.emailOnFile ? t('keepLinkEmailed') : t('keepLink')}
          </p>
        </div>
        <Button variant="secondary" className="min-h-11 shrink-0" onClick={() => void copyLink()}>
          {copied ? t('copied') : t('copyLink')}
        </Button>
      </Card>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {order.items.map((item, i) => (
          <li key={item.id} className="relative">
            {item.thumbUrl ? (
              <img src={item.thumbUrl} alt="" loading="lazy" className="aspect-[4/5] w-full rounded-xl bg-surface-3 object-cover" />
            ) : (
              <div className="flex aspect-[4/5] w-full items-center justify-center rounded-xl bg-surface-3 p-2 text-center text-xs text-ink-soft">
                {item.refunded ? t('itemRefunded') : t('itemUnavailable')}
              </div>
            )}
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
                className="absolute bottom-2 right-2 flex size-11 cursor-pointer items-center justify-center rounded-full bg-surface-2 text-ink shadow-sm hover:bg-brand-50 disabled:cursor-wait disabled:opacity-70"
              >
                {downloading === item.id ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
                ) : (
                  <DownloadIcon size={20} />
                )}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
