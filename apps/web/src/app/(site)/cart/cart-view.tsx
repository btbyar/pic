'use client';

import { CheckIcon, QrIcon, XIcon } from '@/components/icons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert, Button, ButtonLink, Card, Field, Input } from '@/components/ui';
import { api, useErrorMessage } from '@/lib/api-client';
import { type CartEvent, clearCartEvent, removeFromCart, useCart } from '@/lib/cart';
import { formatMnt } from '@/lib/datetime';
import { orderHref, saveOrder } from '@/lib/my-orders';
import type { CreatedOrder, OrderQuote } from '@/lib/types';

export function CartView() {
  const t = useTranslations('cart');
  const cart = useCart();
  const events = Object.values(cart).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Link href="/my/orders" className="inline-flex min-h-11 items-center text-sm text-ink-soft underline underline-offset-4">
          {t('myOrders')}
        </Link>
      </header>
      {events.length === 0 ? (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-ink">{t('empty')}</p>
          <ButtonLink href="/photographers">{t('browse')}</ButtonLink>
        </Card>
      ) : (
        <>
          {events.length > 1 ? <Alert kind="info">{t('perEvent')}</Alert> : null}
          {events.map((event) => (
            <CartEventCard key={event.slug} event={event} />
          ))}
        </>
      )}
    </main>
  );
}

function CartEventCard({ event }: { event: CartEvent }) {
  const t = useTranslations('cart');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const photoKey = event.photos.map((p) => p.id).join(',');
  const eventQuery = event.accessToken ? `?t=${encodeURIComponent(event.accessToken)}` : '';

  useEffect(() => {
    let cancelled = false;
    const photoIds = photoKey.split(',').filter(Boolean);
    if (photoIds.length === 0) return;
    void api<OrderQuote>(`/events/${event.slug}/orders/quote`, {
      method: 'POST',
      body: { photoIds, searchSessionId: event.searchSessionId, t: event.accessToken },
    }).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        // Эвэнт устсан/нуугдсан бол сагсанд үлдээх утгагүй
        if (res.error.code === 'event_not_found') {
          clearCartEvent(event.slug);
          return;
        }
        setError(errorMessage(res.error));
        return;
      }
      if (res.data.unavailable.length) {
        removeFromCart(event.slug, res.data.unavailable);
        setNotice(t('removedUnavailable', { count: res.data.unavailable.length }));
      }
      setQuote(res.data);
      setError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [photoKey, event.slug, event.searchSessionId, event.accessToken, errorMessage, t]);

  async function checkout(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email') ?? '').trim();
    setBusy(true);
    setError(null);
    const res = await api<CreatedOrder>(`/events/${event.slug}/orders`, {
      method: 'POST',
      body: {
        photoIds: event.photos.map((p) => p.id),
        searchSessionId: event.searchSessionId,
        t: event.accessToken,
        ...(email ? { email } : {}),
      },
    });
    if (!res.ok) {
      setBusy(false);
      if (res.error.code === 'photos_unavailable' && res.error.photoIds) {
        removeFromCart(event.slug, res.error.photoIds);
        setNotice(t('removedUnavailable', { count: res.error.photoIds.length }));
        return;
      }
      setError(errorMessage(res.error));
      return;
    }
    saveOrder({
      id: res.data.id,
      token: res.data.accessToken,
      eventTitle: event.title,
      total: res.data.total,
      createdAt: new Date().toISOString(),
    });
    clearCartEvent(event.slug);
    router.push(orderHref(res.data.id, res.data.accessToken));
  }

  const price = quote?.price;
  const blocker = price?.bundleBlocker;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{event.title}</h2>
        <Link href={`/events/${event.slug}${eventQuery}`} className="text-sm text-ink-soft underline underline-offset-4">
          {t('addMore')}
        </Link>
      </div>

      {notice ? <Alert kind="info">{notice}</Alert> : null}

      <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {event.photos.map((photo) => (
          <li key={photo.id} className="relative">
            <img src={photo.thumbUrl} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-lg bg-surface-3 object-cover" />
            <button
              type="button"
              onClick={() => removeFromCart(event.slug, [photo.id])}
              aria-label={t('remove')}
              className="absolute right-1 top-1 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-surface/80 text-ink backdrop-blur"
            >
              <XIcon size={18} />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1 border-t border-line pt-4">
        <div className="flex justify-between text-sm text-ink-soft">
          <span>{t('lineItems', { count: event.photos.length, price: formatMnt(event.pricePerPhoto) })}</span>
          {price ? (
            <span className={price.bundleApplied ? 'line-through' : ''}>{formatMnt(price.subtotal)}</span>
          ) : null}
        </div>
        {price?.bundleApplied ? (
          <div className="flex justify-between text-sm font-medium text-ink">
            <span>{t('bundleApplied')}</span>
            <span>−{formatMnt(price.subtotal - price.total)}</span>
          </div>
        ) : null}
        <div className="flex justify-between text-lg font-bold">
          <span>{t('total')}</span>
          <span className="tabular-nums">{price ? formatMnt(price.total) : '…'}</span>
        </div>
        {price?.bundleApplied ? (
          <p className="mt-1 inline-flex items-center gap-2 self-start rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
            <CheckIcon size={16} strokeWidth={2.5} />
            {t('saved', { price: formatMnt(price.subtotal - price.total) })}
          </p>
        ) : null}
        {blocker === 'no_search' && event.bundlePrice !== null ? (
          <p className="text-sm text-ink-soft">
            {t('bundleHint', { price: formatMnt(event.bundlePrice) })}{' '}
            <Link href={`/events/${event.slug}/find${eventQuery}`} className="font-medium underline underline-offset-4">
              {t('findMine')}
            </Link>
          </p>
        ) : null}
        {blocker === 'search_expired' ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-amber-800">{t('bundleExpired')}</p>
            <ButtonLink href={`/events/${event.slug}/find${eventQuery}`} variant="secondary" className="min-h-11">
              {t('searchAgain')}
            </ButtonLink>
          </div>
        ) : null}
        {blocker === 'not_matched' ? <p className="text-sm text-amber-700">{t('bundleNotMatched')}</p> : null}
      </div>

      {error ? <Alert>{error}</Alert> : null}

      <form onSubmit={(e) => void checkout(e)} className="flex flex-col gap-3">
        <Field label={t('email')} hint={t('emailHint')} htmlFor={`email-${event.slug}`}>
          <Input id={`email-${event.slug}`} name="email" type="email" autoComplete="email" inputMode="email" />
        </Field>
        <Button type="submit" disabled={busy || !price} className="min-h-14 w-full gap-2">
          {!busy && price?.total !== 0 ? <QrIcon size={20} /> : null}
          {busy ? t('creating') : price?.total === 0 ? t('getFree') : t('pay', { price: price ? formatMnt(price.total) : '' })}
        </Button>
        <p className="text-xs text-ink-soft">{t('terms')}</p>
      </form>
    </Card>
  );
}
