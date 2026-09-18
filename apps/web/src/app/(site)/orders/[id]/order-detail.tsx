'use client';

import { BackLink } from '@/components/back-link';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { useCallback, useEffect, useState } from 'react';
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
        <p className="text-stone-600">
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

  const leftSec = order.paymentDueAt ? Math.max(0, Math.floor((new Date(order.paymentDueAt).getTime() - now) / 1000)) : null;

  async function mockPay() {
    const res = await api(`/orders/${order.id}/mock-pay`, { method: 'POST', headers: { 'x-order-token': token } });
    if (!res.ok) setMockError(errorMessage(res.error));
    await onChange();
  }

  if (!order.payment) return <Alert>{t('failed')}</Alert>;

  return (
    <Card className="flex flex-col items-center gap-4 text-center">
      <p className="text-lg font-semibold">{t('payTitle', { total: formatMnt(order.totalAmount) })}</p>
      <p className="text-sm text-stone-600">{t('payHint')}</p>
      {qr ? (
        <img src={qr} alt={t('qrAlt')} width={280} height={280} className="rounded-xl border border-stone-200" />
      ) : (
        <div className="h-[280px] w-[280px] animate-pulse rounded-xl bg-stone-100" />
      )}

      {order.payment.deeplinks.length ? (
        <div className="flex w-full flex-col gap-2">
          <p className="text-sm font-medium">{t('bankApps')}</p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {order.payment.deeplinks.map((bank) => (
              <li key={bank.link}>
                <a
                  href={bank.link}
                  className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border border-stone-200 p-2 text-xs"
                >
                  <img src={bank.logo} alt="" width={36} height={36} className="rounded-lg" loading="lazy" />
                  <span className="line-clamp-2">{bank.description || bank.name}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center gap-2 text-sm text-stone-600" role="status">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-900" aria-hidden />
        {t('waiting')}
        {leftSec !== null ? ` · ${t('timeLeft', { minutes: Math.floor(leftSec / 60), seconds: String(leftSec % 60).padStart(2, '0') })}` : ''}
      </div>

      {order.mockPayment ? (
        <div className="flex w-full flex-col gap-2 rounded-xl border border-dashed border-amber-400 bg-amber-50 p-3">
          <p className="text-xs text-amber-900">{t('mockNote')}</p>
          <Button variant="secondary" onClick={() => void mockPay()}>
            {t('mockPay')}
          </Button>
          {mockError ? <p className="text-sm text-red-700">{mockError}</p> : null}
        </div>
      ) : null}
    </Card>
  );
}

function Downloads({ order, token }: { order: OrderView; token: string }) {
  const t = useTranslations('order');
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
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
    for (const item of available) {
      setDownloading(item.id);
      if (!(await download(item.id))) break;
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
      <Alert kind="success">
        {t('paid')}
        {order.downloadableUntil ? ` ${t('until', { date: formatDate(order.downloadableUntil) })}` : ''}
      </Alert>

      <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-stone-700">{order.emailOnFile ? t('keepLinkEmailed') : t('keepLink')}</p>
        <Button variant="secondary" className="shrink-0" onClick={() => void copyLink()}>
          {copied ? t('copied') : t('copyLink')}
        </Button>
      </Card>

      {error ? <Alert>{error}</Alert> : null}

      {available.length > 1 ? (
        <Button onClick={() => void downloadAll()} disabled={downloading !== null} className="self-start">
          {downloading ? t('downloadingAll') : t('downloadAll', { count: available.length })}
        </Button>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {order.items.map((item, i) => (
          <li key={item.id} className="flex flex-col gap-2">
            {item.thumbUrl ? (
              <img src={item.thumbUrl} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-lg bg-stone-200 object-cover" />
            ) : (
              <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg bg-stone-100 p-2 text-center text-xs text-stone-500">
                {item.refunded ? t('itemRefunded') : t('itemUnavailable')}
              </div>
            )}
            <Button
              variant="secondary"
              disabled={!item.available || downloading !== null}
              onClick={async () => {
                setDownloading(item.id);
                setError(null);
                await download(item.id);
                setDownloading(null);
              }}
            >
              {downloading === item.id ? t('downloading') : t('download', { index: i + 1 })}
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}
