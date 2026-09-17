'use client';

import { CONSENT_VERSION } from '@pic/shared';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { CartButton } from '@/components/cart-button';
import { type GridCart, PhotoGrid } from '@/components/photo-grid';
import { Alert, Button, Card } from '@/components/ui';
import { api, type ApiError, useErrorMessage } from '@/lib/api-client';
import { addToCart, forgetSearchSession, useCart } from '@/lib/cart';
import { formatEventRange, formatMnt } from '@/lib/datetime';
import { captureVideoFrame, shrinkImageFile } from '@/lib/selfie';
import type { PublicEvent, SearchResults } from '@/lib/types';

type Step = 'consent' | 'capture' | 'searching' | 'results';

export function SelfieSearch({ event, accessToken }: { event: PublicEvent; accessToken: string | undefined }) {
  const t = useTranslations('search');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sessionFromUrl = searchParams.get('s');

  const [step, setStep] = useState<Step>(sessionFromUrl ? 'searching' : 'consent');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [deleted, setDeleted] = useState(false);
  const tc = useTranslations('cart');
  const cartState = useCart();

  const eventHref = `/events/${event.slug}${accessToken ? `?t=${encodeURIComponent(accessToken)}` : ''}`;

  const setSessionInUrl = useCallback(
    (sessionId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (sessionId) params.set('s', sessionId);
      else params.delete('s');
      router.replace(`${pathname}${params.size ? `?${params}` : ''}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const showError = useCallback(
    (err: ApiError) => {
      if (err.code === 'search_expired' || err.code === 'search_not_found') {
        setSessionInUrl(null);
        setResults(null);
        setStep('consent');
      }
      setError(errorMessage(err));
    },
    [errorMessage, setSessionInUrl],
  );

  // Хадгалсан хайлтыг дахин ачаалах (хуудас refresh)
  const loadResults = useCallback(
    async (sessionId: string) => {
      const params = new URLSearchParams();
      if (accessToken) params.set('t', accessToken);
      const res = await api<SearchResults>(`/events/${event.slug}/search/${sessionId}${params.size ? `?${params}` : ''}`);
      if (res.ok) {
        setResults(res.data);
        setStep('results');
        setError(null);
      } else {
        showError(res.error);
        if (res.error.code !== 'search_expired' && res.error.code !== 'search_not_found') setStep('results');
      }
    },
    [accessToken, event.slug, showError],
  );

  useEffect(() => {
    if (sessionFromUrl && !results) void loadResults(sessionFromUrl);
    // Зөвхөн анх ачаалахад
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(selfie: Blob) {
    setStep('searching');
    setError(null);
    const form = new FormData();
    form.append('selfie', selfie, 'selfie.jpg');
    form.append('consent', 'true');
    if (accessToken) form.append('t', accessToken);
    let res: Response;
    try {
      res = await fetch(`/api/events/${event.slug}/search`, { method: 'POST', body: form, credentials: 'same-origin' });
    } catch {
      setError(errorMessage({ status: 0, code: 'network' }));
      setStep('capture');
      return;
    }
    const body = (await res.json().catch(() => ({}))) as SearchResults & Partial<ApiError>;
    if (!res.ok) {
      setError(errorMessage({ status: res.status, code: body.code ?? 'unknown', ...(body.retryAfterSec ? { retryAfterSec: body.retryAfterSec } : {}) }));
      setStep('capture');
      return;
    }
    setResults(body);
    setDeleted(false);
    setStep('results');
    setSessionInUrl(body.sessionId);
  }

  async function deleteSearchData() {
    if (!results) return;
    await api(`/search-sessions/${results.sessionId}`, { method: 'DELETE' });
    forgetSearchSession(results.sessionId);
    setDeleted(true);
    setResults(null);
    setSessionInUrl(null);
    setStep('consent');
    setConsent(false);
  }

  const gridCart: GridCart | undefined = results
    ? {
        event: {
          slug: event.slug,
          title: event.title,
          pricePerPhoto: event.pricePerPhoto,
          bundlePrice: event.bundlePrice,
          accessToken,
        },
        searchSessionId: results.sessionId,
      }
    : undefined;
  const inCart = new Set(cartState[event.slug]?.photos.map((p) => p.id));
  const mineNotInCart = results?.mine.filter((p) => !inCart.has(p.id)) ?? [];
  // Багц нь зөвхөн хайлтаар олдсон зургуудад, хямд үед л утгатай
  const bundleWorthIt =
    results && event.bundlePrice !== null && results.mine.length * event.pricePerPhoto > event.bundlePrice;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 pt-8 pb-24">
      <Link href={eventHref} className="text-sm text-slate-600 underline-offset-4 hover:underline">
        ← {event.title}
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-slate-600">{formatEventRange(event.startsAt, event.endsAt, event.timezone)}</p>
      </header>

      {deleted ? <Alert kind="success">{t('deleted')}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      {step === 'consent' ? (
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{t('consent.title')}</h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-slate-700">
            {(['purpose', 'selfieNotStored', 'retention', 'anonymous', 'noSharing', 'minors'] as const).map((k) => (
              <li key={k}>{t(`consent.${k}`)}</li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">{t('consent.law', { version: CONSENT_VERSION })}</p>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
            <input type="checkbox" className="mt-1 h-5 w-5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span className="text-sm font-medium">{t('consent.agree')}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!consent} onClick={() => setStep('capture')}>
              {t('consent.continue')}
            </Button>
            <Link href={eventHref} className="inline-flex min-h-11 items-center px-2 text-sm text-slate-600 underline-offset-4 hover:underline">
              {t('browseAll')}
            </Link>
          </div>
        </Card>
      ) : null}

      {step === 'capture' || (step === 'searching' && !sessionFromUrl) ? (
        <CaptureCard busy={step === 'searching'} onSelfie={(blob) => void runSearch(blob)} onError={setError} />
      ) : null}

      {step === 'searching' && sessionFromUrl ? <Searching /> : null}

      {step === 'results' && results ? (
        <>
          {results.multipleFaces ? <Alert kind="info">{t('multipleFaces')}</Alert> : null}

          {results.mine.length ? (
            <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  {bundleWorthIt
                    ? tc('bundleOffer', { count: results.mine.length, price: formatMnt(event.bundlePrice!) })
                    : tc('allPrice', { count: results.mine.length, price: formatMnt(results.mine.length * event.pricePerPhoto) })}
                </p>
                {bundleWorthIt ? (
                  <p className="text-sm text-slate-600">
                    {tc('bundleSaves', { price: formatMnt(results.mine.length * event.pricePerPhoto - event.bundlePrice!) })}
                  </p>
                ) : null}
              </div>
              <Button
                className="shrink-0"
                disabled={mineNotInCart.length === 0}
                onClick={() => addToCart(gridCart!.event, mineNotInCart, results.sessionId)}
              >
                {mineNotInCart.length === 0 ? tc('allInCart') : tc('addAll', { count: mineNotInCart.length })}
              </Button>
            </Card>
          ) : null}

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t('mine', { count: results.mine.length })}</h2>
            {results.mine.length ? (
              <PhotoGrid photos={results.mine} timezone={event.timezone} cart={gridCart} />
            ) : (
              <Card className="flex flex-col gap-2 text-sm text-slate-700">
                <p className="font-medium">{t('noneFound')}</p>
                <ul className="list-disc pl-5">
                  <li>{t('tips.light')}</li>
                  <li>{t('tips.face')}</li>
                  <li>{t('tips.accessories')}</li>
                </ul>
              </Card>
            )}
          </section>

          {results.maybe.length ? (
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="text-lg font-semibold">{t('maybe', { count: results.maybe.length })}</h2>
                <p className="text-sm text-slate-600">{t('maybeHint')}</p>
              </div>
              <PhotoGrid photos={results.maybe} timezone={event.timezone} cart={gridCart} />
            </section>
          ) : null}

          <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">{t('privacyNote')}</p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setResults(null);
                  setSessionInUrl(null);
                  setStep('capture');
                }}
              >
                {t('again')}
              </Button>
              <Button variant="danger" onClick={() => void deleteSearchData()}>
                {t('deleteData')}
              </Button>
            </div>
          </Card>
        </>
      ) : null}
      <CartButton />
    </main>
  );
}

function Searching() {
  const t = useTranslations('search');
  return (
    <div className="flex items-center gap-3" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" aria-hidden />
      <p>{t('searching')}</p>
    </div>
  );
}

function CaptureCard({
  busy,
  onSelfie,
  onError,
}: {
  busy: boolean;
  onSelfie: (blob: Blob) => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations('search.capture');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);

  const stopCamera = useCallback(() => {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
  }, [stream]);

  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  async function openCamera() {
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      setPreview(null);
      setStream(media);
    } catch {
      onError(t('cameraDenied'));
    }
  }

  async function takePhoto() {
    if (!videoRef.current) return;
    const blob = await captureVideoFrame(videoRef.current);
    stopCamera();
    setPreview({ blob, url: URL.createObjectURL(blob) });
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const blob = await shrinkImageFile(file);
      stopCamera();
      setPreview({ blob, url: URL.createObjectURL(blob) });
    } catch {
      onError(t('unreadable'));
    }
  }

  return (
    <Card className="flex flex-col items-center gap-4 text-center">
      <p className="text-sm text-slate-600">{t('hint')}</p>

      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          // Урд камер: хэрэглэгчид толь шиг харагдуулна (хадгалах зураг нь буцаагүй)
          className="aspect-square w-full max-w-sm -scale-x-100 rounded-2xl bg-black object-cover"
        />
      ) : preview ? (
        <img src={preview.url} alt={t('previewAlt')} className="aspect-square w-full max-w-sm rounded-2xl object-cover" />
      ) : (
        <div className="flex aspect-square w-full max-w-sm items-center justify-center rounded-2xl bg-slate-100 text-6xl" aria-hidden>
          🙂
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {stream ? (
          <>
            <Button onClick={() => void takePhoto()}>{t('shoot')}</Button>
            <Button variant="secondary" onClick={stopCamera}>
              {t('cancel')}
            </Button>
          </>
        ) : preview && busy ? (
          <Searching />
        ) : preview ? (
          <>
            <Button onClick={() => onSelfie(preview.blob)}>{t('search')}</Button>
            <Button variant="secondary" onClick={() => setPreview(null)}>
              {t('retake')}
            </Button>
          </>
        ) : (
          <>
            {typeof navigator !== 'undefined' && navigator.mediaDevices ? (
              <Button onClick={() => void openCamera()}>{t('openCamera')}</Button>
            ) : null}
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium">
              {t('pickPhoto')}
              <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => void onFile(e)} />
            </label>
          </>
        )}
      </div>
    </Card>
  );
}
