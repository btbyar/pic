'use client';

import { CartIcon, CheckIcon, QrIcon, XIcon } from '@/components/icons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type CSSProperties, type FormEvent, useEffect, useState } from 'react';
import { Perforation, Ticket } from '@/components/ticket';
import { Alert, Button, ButtonLink, EmptyState, Field, Input, Kicker } from '@/components/ui';
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
    <main className="mx-auto flex max-w-7xl flex-col gap-10 px-5 pt-32">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-4">
          <Kicker className="animate-rise">{t('kicker')}</Kicker>
          <h1 className="animate-rise font-display text-[clamp(3rem,8vw,6.5rem)] font-semibold leading-[0.88] tracking-[-0.035em] stagger [--i:1]">
            {t('title')}
          </h1>
        </div>
        <Link href="/my/orders" className="inline-flex min-h-11 items-center font-semibold text-mist transition hover:text-ivory">
          {t('myOrders')}
        </Link>
      </header>
      {events.length === 0 ? (
        <EmptyState
          icon={<CartIcon size={28} />}
          title={t('emptyTitle')}
          body={t('empty')}
          action={<ButtonLink href="/photographers">{t('browse')}</ButtonLink>}
        />
      ) : (
        <>
          {events.length > 1 ? <Alert kind="info">{t('perEvent')}</Alert> : null}
          {events.map((event, i) => (
            <CartEventCard key={event.slug} event={event} index={i} />
          ))}
        </>
      )}
    </main>
  );
}

function CartEventCard({ event, index }: { event: CartEvent; index: number }) {
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
    <section
      className="grid animate-rise items-start gap-4 stagger lg:grid-cols-[1fr_26rem] lg:gap-6"
      style={{ '--i': index + 2 } as CSSProperties}
      aria-labelledby={`cart-${event.slug}`}
    >
      {/* Зүүн: сонгосон кадрууд */}
      <div className="panel flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id={`cart-${event.slug}`} className="font-display text-3xl font-semibold leading-tight">
            {event.title}
          </h2>
          <Link
            href={`/events/${event.slug}${eventQuery}`}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-gold transition hover:text-gold-soft"
          >
            + {t('addMore')}
          </Link>
        </div>

        {notice ? <Alert kind="info">{notice}</Alert> : null}

        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
          {event.photos.map((photo, i) => (
            <li key={photo.id} className="group relative animate-fade">
              <img src={photo.thumbUrl} alt="" loading="lazy" className="aspect-4/5 w-full rounded-xl bg-night-3 object-cover" />
              <span className="absolute bottom-1.5 left-2 font-mono text-[9px] tracking-[0.14em] text-ivory/80">#{String(i + 1).padStart(2, '0')}</span>
              <button
                type="button"
                onClick={() => removeFromCart(event.slug, [photo.id])}
                aria-label={t('remove')}
                className="glass absolute right-1 top-1 flex size-11 cursor-pointer items-center justify-center rounded-full text-ivory transition hover:bg-ember hover:text-night sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
              >
                <XIcon size={16} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Баруун: тасалбар — тооцоо, төлбөр */}
      <Ticket glow className="p-6 lg:sticky lg:top-28">
        <div className="flex flex-col gap-2.5 text-sm">
          <div className="flex justify-between text-mist">
            <span>{t('lineItems', { count: event.photos.length, price: formatMnt(event.pricePerPhoto) })}</span>
            {price ? (
              <span className={`tabular-nums ${price.bundleApplied ? 'line-through decoration-ember/70' : ''}`}>{formatMnt(price.subtotal)}</span>
            ) : (
              <span className="skeleton h-4 w-16 rounded" />
            )}
          </div>
          {price?.bundleApplied ? (
            <div className="flex justify-between font-semibold text-jade">
              <span>{t('bundleApplied')}</span>
              <span className="tabular-nums">−{formatMnt(price.subtotal - price.total)}</span>
            </div>
          ) : null}
        </div>
        <div className="mt-4 flex items-end justify-between gap-3">
          <span className="kicker">{t('total')}</span>
          <span className="font-display text-5xl font-semibold leading-none tabular-nums" aria-live="polite">
            {price ? formatMnt(price.total) : <span className="skeleton inline-block h-10 w-32 rounded-lg" />}
          </span>
        </div>
        {price?.bundleApplied ? (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-jade/10 px-3 py-1.5 text-sm font-semibold text-jade ring-1 ring-inset ring-jade/30">
            <CheckIcon size={15} strokeWidth={2.5} />
            {t('saved', { price: formatMnt(price.subtotal - price.total) })}
          </p>
        ) : null}
        {blocker === 'no_search' && event.bundlePrice !== null ? (
          <p className="mt-4 text-sm leading-relaxed text-mist">
            {t('bundleHint', { price: formatMnt(event.bundlePrice) })}{' '}
            <Link href={`/events/${event.slug}/find${eventQuery}`} className="font-semibold text-gold underline underline-offset-4">
              {t('findMine')}
            </Link>
          </p>
        ) : null}
        {blocker === 'search_expired' ? (
          <div className="mt-4 flex flex-col items-start gap-2">
            <p className="text-sm text-gold-soft">{t('bundleExpired')}</p>
            <ButtonLink href={`/events/${event.slug}/find${eventQuery}`} variant="secondary">
              {t('searchAgain')}
            </ButtonLink>
          </div>
        ) : null}
        {blocker === 'not_matched' ? <p className="mt-4 text-sm text-gold-soft">{t('bundleNotMatched')}</p> : null}

        <Perforation />

        {error ? (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        ) : null}

        <form onSubmit={(e) => void checkout(e)} className="flex flex-col gap-4">
          <Field label={t('email')} hint={t('emailHint')} htmlFor={`email-${event.slug}`}>
            <Input id={`email-${event.slug}`} name="email" type="email" autoComplete="email" inputMode="email" />
          </Field>
          <Button type="submit" size="lg" busy={busy} disabled={!price} className="w-full">
            {!busy && price?.total !== 0 ? <QrIcon size={20} /> : null}
            {busy ? t('creating') : price?.total === 0 ? t('getFree') : t('pay', { price: price ? formatMnt(price.total) : '' })}
          </Button>
          <p className="text-xs leading-relaxed text-dim">{t('terms')}</p>
        </form>
      </Ticket>
    </section>
  );
}
