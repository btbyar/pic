'use client';

import { BackLink } from '@/components/back-link';
import { CONSENT_VERSION, priceOrder } from '@pic/shared';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ChangeEvent, type MouseEvent, useCallback, useEffect, useRef, useState } from 'react';
import { FocusFrame } from '@/components/focus-frame';
import { CameraIcon, CartIcon, CheckIcon, ClockIcon, ImagesIcon, LockIcon, ScanFaceIcon, SunIcon, UserIcon, XIcon } from '@/components/icons';
import { type GridCart, PhotoGrid } from '@/components/photo-grid';
import { Alert, Button, ButtonLink, Card } from '@/components/ui';
import { api, type ApiError, useErrorMessage } from '@/lib/api-client';
import { addToCart, forgetSearchSession, useCart } from '@/lib/cart';
import { formatMnt } from '@/lib/datetime';
import { captureVideoFrame, shrinkImageFile } from '@/lib/selfie';
import type { PublicEvent, SearchResults } from '@/lib/types';

/**
 * Урсгал: зөвшөөрөл → камер (бүтэн дэлгэц) → урьдчилан харах → хайлт → үр дүн.
 * "Камер нээх" нь зөвшөөрөл + камер нээх хоёрыг нэг товшилтоор хийнэ (QR-ээр ирсэн хүн энд хамгийн их унадаг).
 */
type Step = 'consent' | 'camera' | 'preview' | 'searching' | 'results';

export function SelfieSearch({ event, accessToken }: { event: PublicEvent; accessToken: string | undefined }) {
  const t = useTranslations('search');
  const tc = useTranslations('cart');
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
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [selfie, setSelfie] = useState<{ blob: Blob; url: string } | null>(null);
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

  // Камер, blob URL-уудыг цэвэрлэнэ
  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);
  useEffect(() => () => {
    if (selfie) URL.revokeObjectURL(selfie.url);
  }, [selfie]);

  const stopCamera = useCallback(() => {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
  }, [stream]);

  function requireConsent(): boolean {
    if (consent) return true;
    setError(t('consent.required'));
    return false;
  }

  async function openCamera() {
    if (!requireConsent()) return;
    setError(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      setStream(media);
      setStep('camera');
    } catch {
      setError(t('capture.cameraDenied'));
      setStep('consent');
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const blob = await shrinkImageFile(file);
      stopCamera();
      setSelfie({ blob, url: URL.createObjectURL(blob) });
      setError(null);
      setStep('preview');
    } catch {
      setError(t('capture.unreadable'));
    }
  }

  async function takePhoto(video: HTMLVideoElement) {
    const blob = await captureVideoFrame(video);
    stopCamera();
    setSelfie({ blob, url: URL.createObjectURL(blob) });
    setStep('preview');
  }

  async function runSearch(blob: Blob) {
    setStep('searching');
    setError(null);
    const form = new FormData();
    form.append('selfie', blob, 'selfie.jpg');
    form.append('consent', 'true');
    if (accessToken) form.append('t', accessToken);
    let res: Response;
    try {
      res = await fetch(`/api/events/${event.slug}/search`, { method: 'POST', body: form, credentials: 'same-origin' });
    } catch {
      setError(errorMessage({ status: 0, code: 'network' }));
      setStep('preview');
      return;
    }
    const body = (await res.json().catch(() => ({}))) as SearchResults & Partial<ApiError>;
    if (!res.ok) {
      setError(errorMessage({ status: res.status, code: body.code ?? 'unknown', ...(body.retryAfterSec ? { retryAfterSec: body.retryAfterSec } : {}) }));
      setStep('preview');
      return;
    }
    setResults(body);
    setDeleted(false);
    setStep('results');
    setSessionInUrl(body.sessionId);
  }

  function searchAgain() {
    setResults(null);
    setSessionInUrl(null);
    setError(null);
    // Зөвшөөрөл энэ хуудсанд аль хэдийн өгсөн бол шууд камер руу
    if (consent) void openCamera();
    else setStep('consent');
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

  const cartEvent = {
    slug: event.slug,
    title: event.title,
    pricePerPhoto: event.pricePerPhoto,
    bundlePrice: event.bundlePrice,
    accessToken,
  };
  const gridCart: GridCart | undefined = results ? { event: cartEvent, searchSessionId: results.sessionId } : undefined;
  const inCartPhotos = cartState[event.slug]?.photos ?? [];
  const inCart = new Set(inCartPhotos.map((p) => p.id));
  const mineNotInCart = results?.mine.filter((p) => !inCart.has(p.id)) ?? [];
  // Багц нь зөвхөн хайлтаар олдсон зургуудад, хямд үед л утгатай
  const bundleWorthIt =
    results && event.bundlePrice !== null && results.mine.length * event.pricePerPhoto > event.bundlePrice;

  // Наалттай мөрний дүн: сервертэй ижил дүрэм (mine ∪ maybe дотор бүх зураг байвал багц)
  const matched = new Set([...(results?.mine ?? []), ...(results?.maybe ?? [])].map((p) => p.id));
  const cartPrice = inCartPhotos.length
    ? priceOrder({
        itemCount: inCartPhotos.length,
        pricePerPhoto: event.pricePerPhoto,
        bundlePrice: event.bundlePrice,
        searchMatch:
          cartState[event.slug]?.searchSessionId === results?.sessionId && inCartPhotos.every((p) => matched.has(p.id))
            ? true
            : 'not_matched',
      })
    : null;

  const progress = step === 'consent' ? 0 : step === 'results' ? 2 : 1;

  return (
    <main className={`mx-auto flex max-w-5xl flex-col gap-5 px-4 pt-4 ${step === 'results' && cartPrice ? 'pb-32' : 'pb-10'}`}>
      <BackLink href={eventHref}>{event.title}</BackLink>

      {/* Stepper-ийн оронд нимгэн 3 хэсэгтэй явцын зураас */}
      <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={progress + 1} aria-label={t('title')}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i <= progress ? 'bg-brand-600' : 'bg-line'}`} />
        ))}
      </div>

      {deleted ? <Alert kind="success">{t('deleted')}</Alert> : null}
      {error && step !== 'camera' && step !== 'preview' ? <Alert>{error}</Alert> : null}

      {step === 'consent' ? (
        <section className="mx-auto flex w-full max-w-lg flex-col gap-5 pb-40 sm:pb-0">
          <span className="flex size-18 items-center justify-center rounded-3xl bg-brand-50 text-brand-600" aria-hidden>
            <UserIcon size={34} />
          </span>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-extrabold leading-tight">{t('consent.headline')}</h1>
            <p className="text-ink-soft">{t('consent.intro')}</p>
          </div>

          <Card className="flex flex-col gap-4">
            <ul className="flex flex-col gap-4 text-[15px] text-ink">
              {([
                ['selfieNotStored', LockIcon],
                ['retention', ClockIcon],
                ['anonymous', UserIcon],
              ] as const).map(([k, Icon]) => (
                <li key={k} className="flex gap-3">
                  <Icon size={22} className="mt-0.5 shrink-0 text-brand-600" />
                  {t(`consent.${k}`)}
                </li>
              ))}
            </ul>
            {/* Үлдсэн нөхцөл: нуугдаагүй, нэг товшилтын зайд */}
            <details className="text-sm text-ink-soft">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-brand-700">{t('consent.more')}</summary>
              <div className="flex flex-col gap-2 pt-2">
                {(['purpose', 'noSharing', 'minors'] as const).map((k) => (
                  <p key={k}>{t(`consent.${k}`)}</p>
                ))}
                <p>{t('consent.law', { version: CONSENT_VERSION })}</p>
              </div>
            </details>
          </Card>

          {/* Мөр бүхэлдээ дарагдана */}
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 bg-surface-2 p-4 transition ${consent ? 'border-brand-600' : 'border-line-strong'}`}
          >
            <input type="checkbox" className="mt-0.5 size-6 shrink-0 accent-brand-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span className="text-[15px] font-medium">{t('consent.agree')}</span>
          </label>

          <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-1 bg-surface/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:static sm:bg-transparent sm:p-0">
            {typeof navigator !== 'undefined' && navigator.mediaDevices ? (
              <Button className="min-h-14 w-full gap-2" onClick={() => void openCamera()}>
                <CameraIcon size={20} />
                {t('capture.openCamera')}
              </Button>
            ) : null}
            <FilePick label={t('consent.pickPhoto')} onFile={onFile} onBlocked={requireConsent} tone="ghost" />
          </div>
        </section>
      ) : null}

      {step === 'camera' && stream ? (
        <CameraOverlay
          stream={stream}
          error={error}
          onShoot={(video) => void takePhoto(video)}
          onClose={() => {
            stopCamera();
            setStep('consent');
          }}
          onFile={onFile}
        />
      ) : null}

      {step === 'preview' && selfie ? (
        <PreviewOverlay
          url={selfie.url}
          error={error}
          onSearch={() => void runSearch(selfie.blob)}
          onRetake={() => {
            setError(null);
            void openCamera();
          }}
          onClose={() => {
            setError(null);
            setStep('consent');
          }}
        />
      ) : null}

      {step === 'searching' ? <Searching selfieUrl={selfie?.url ?? null} photoCount={event.photoCount} /> : null}

      {step === 'results' && results ? (
        <>
          <header className="flex flex-col gap-1">
            <h1 className="text-3xl font-extrabold">{t('mine', { count: results.mine.length })}</h1>
            {results.mine.length ? <p className="text-ink-soft">{t('resultsSub')}</p> : null}
          </header>

          {results.multipleFaces ? <Alert kind="info">{t('multipleFaces')}</Alert> : null}

          {results.mine.length ? (
            <>
              {/* Багцын санал хамгийн дээр — хамгийн их хэмнэлттэй сонголт */}
              <div className="flex flex-col gap-3 rounded-3xl bg-brand-600 p-5 text-on-brand sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <p className="font-display text-xl font-bold leading-snug">
                    {bundleWorthIt
                      ? tc('bundleOffer', { count: results.mine.length, price: formatMnt(event.bundlePrice!) })
                      : tc('allPrice', { count: results.mine.length, price: formatMnt(results.mine.length * event.pricePerPhoto) })}
                  </p>
                  {bundleWorthIt ? (
                    <p className="text-sm text-brand-100">
                      {tc('bundleSaves', { price: formatMnt(results.mine.length * event.pricePerPhoto - event.bundlePrice!) })}
                    </p>
                  ) : null}
                </div>
                <Button
                  className="shrink-0 self-start bg-surface-2! text-brand-700! hover:bg-brand-50! sm:self-auto"
                  disabled={mineNotInCart.length === 0}
                  onClick={() => addToCart(cartEvent, mineNotInCart, results.sessionId)}
                >
                  {mineNotInCart.length === 0 ? (
                    <span className="inline-flex items-center gap-1.5">
                      <CheckIcon size={16} />
                      {tc('allInCart')}
                    </span>
                  ) : bundleWorthIt ? (
                    t('bundleCta')
                  ) : (
                    tc('addAll', { count: mineNotInCart.length })
                  )}
                </Button>
              </div>

              <FocusFrame lock className="p-1">
                <PhotoGrid photos={results.mine} timezone={event.timezone} cart={gridCart} />
              </FocusFrame>
            </>
          ) : (
            <NoResults onAgain={searchAgain} eventHref={eventHref} />
          )}

          {results.maybe.length ? (
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="text-lg font-bold">{t('maybe', { count: results.maybe.length })}</h2>
                <p className="text-sm text-ink-soft">{t('maybeHint')}</p>
              </div>
              <PhotoGrid photos={results.maybe} timezone={event.timezone} cart={gridCart} />
            </section>
          ) : null}

          {/* Нууцлалын үйлдлүүд — нам гүм footer */}
          <footer className="flex flex-col gap-2 border-t border-line pt-4 text-sm text-ink-soft">
            <p>{t('privacyNote')}</p>
            <div className="flex flex-wrap gap-x-5">
              {results.mine.length ? (
                <button type="button" className="min-h-11 cursor-pointer font-semibold text-brand-700" onClick={searchAgain}>
                  {t('again')}
                </button>
              ) : null}
              <button type="button" className="min-h-11 cursor-pointer font-semibold text-ink-soft underline underline-offset-4" onClick={() => void deleteSearchData()}>
                {t('deleteData')}
              </button>
            </div>
          </footer>

          {cartPrice ? (
            <div className="fixed inset-x-0 bottom-0 z-30 bg-surface-2/95 shadow-[0_-4px_24px_rgba(26,20,51,0.08)] backdrop-blur-md">
              <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
                <div className="flex flex-1 flex-col" aria-live="polite">
                  <span className="text-sm text-ink-soft">{t('selectedCount', { count: inCartPhotos.length })}</span>
                  <span className="font-display text-xl font-bold tabular-nums">
                    {formatMnt(cartPrice.total)}
                    {cartPrice.bundleApplied ? <span className="ml-2 align-middle text-xs font-semibold text-emerald-700">{tc('bundleApplied')}</span> : null}
                  </span>
                </div>
                <ButtonLink href="/cart" variant="dark" className="min-h-13 gap-2">
                  <CartIcon size={20} />
                  {t('toCart')}
                </ButtonLink>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  );
}

function FilePick({
  label,
  onFile,
  onBlocked,
  tone,
}: {
  label: string;
  onFile: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlocked?: () => boolean;
  tone: 'ghost' | 'overlay';
}) {
  const block = (e: MouseEvent<HTMLLabelElement>) => {
    if (onBlocked && !onBlocked()) e.preventDefault();
  };
  return tone === 'ghost' ? (
    <label onClick={block} className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full font-semibold text-brand-700 hover:bg-brand-50">
      <ImagesIcon size={20} />
      {label}
      <input type="file" accept="image/*" className="sr-only" onChange={onFile} />
    </label>
  ) : (
    <label className="flex size-12 cursor-pointer items-center justify-center rounded-2xl bg-white/15 text-white hover:bg-white/25" aria-label={label}>
      <ImagesIcon size={22} />
      <input type="file" accept="image/*" className="sr-only" onChange={onFile} />
    </label>
  );
}

/** Бүтэн дэлгэцийн харанхуй давхарга — зөвхөн камерын үед (цайвар UI-аас цорын ганц үл хамаарал) */
function Overlay({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const t = useTranslations('search.capture');
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-50 flex flex-col bg-[#0e0c14] text-white">
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label={t('cancel')} className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-white/15 hover:bg-white/25">
          <XIcon size={20} />
        </button>
        <span className="font-semibold">{label}</span>
        <span className="size-11" aria-hidden />
      </div>
      {children}
    </div>
  );
}

/** Зууван чиглүүлэгч + брэндийн фокус хаалт */
function FaceGuide() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <FocusFrame tone="brand" className="flex h-[min(62vh,24rem)] w-[min(72vw,17rem)] items-center justify-center [&>span]:border-brand-200 [&>span]:border-[3px]">
        <span className="block h-[88%] w-[82%] rounded-[50%] border-2 border-dashed border-white/80" />
      </FocusFrame>
    </div>
  );
}

function CameraOverlay({
  stream,
  error,
  onShoot,
  onClose,
  onFile,
}: {
  stream: MediaStream;
  error: string | null;
  onShoot: (video: HTMLVideoElement) => void;
  onClose: () => void;
  onFile: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const t = useTranslations('search.capture');
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <Overlay label={t('title')} onClose={onClose}>
      <div className="relative flex-1 overflow-hidden">
        {/* Урд камер: толь шиг харагдуулна (хадгалах зураг нь буцаагүй) */}
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />
        <FaceGuide />
        <p className="absolute inset-x-0 bottom-6 mx-auto w-fit max-w-[90%] rounded-full bg-black/50 px-4 py-2.5 text-center text-[15px] font-medium">
          {error ?? t('hint')}
        </p>
      </div>
      <div className="flex items-center justify-between px-10 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
        <FilePick label={t('pickPhoto')} onFile={onFile} tone="overlay" />
        <button
          type="button"
          autoFocus
          onClick={() => videoRef.current && onShoot(videoRef.current)}
          aria-label={t('shoot')}
          className="flex size-19 cursor-pointer items-center justify-center rounded-full border-4 border-white p-1.5 focus-visible:outline-brand-200"
        >
          <span className="size-full rounded-full bg-white transition active:scale-90" />
        </button>
        <span className="size-12" aria-hidden />
      </div>
    </Overlay>
  );
}

function PreviewOverlay({
  url,
  error,
  onSearch,
  onRetake,
  onClose,
}: {
  url: string;
  error: string | null;
  onSearch: () => void;
  onRetake: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('search.capture');
  return (
    <Overlay label={t('previewAlt')} onClose={onClose}>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-6">
        <FocusFrame className="p-3 [&>span]:border-brand-200 [&>span]:border-[3px]">
          <img src={url} alt={t('previewAlt')} className="max-h-[56vh] w-auto max-w-full rounded-3xl object-contain" />
        </FocusFrame>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        {error ? (
          <p role="alert" className="rounded-2xl bg-red-500/20 px-4 py-3 text-sm">
            {error}
          </p>
        ) : null}
        <Button autoFocus className="min-h-14 w-full" onClick={onSearch}>
          {t('search')}
        </Button>
        <button type="button" onClick={onRetake} className="min-h-12 cursor-pointer rounded-full font-semibold text-white hover:bg-white/10">
          {t('retake')}
        </button>
      </div>
    </Overlay>
  );
}

/** Spinner биш: саяны селфи + шатлалтай явц. Шатууд нь хугацаагаар урагшилна — хариу ирмэгц үр дүн рүү шилжинэ. */
function Searching({ selfieUrl, photoCount }: { selfieUrl: string | null; photoCount: number }) {
  const t = useTranslations('search');
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const a = setTimeout(() => setStage(1), 1200);
    const b = setTimeout(() => setStage(2), 4500);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  const stages = [t('stages.reading'), t('stages.matching'), t('stages.preparing')];

  return (
    <section className="mx-auto flex w-full max-w-md flex-col items-center gap-5 py-4 text-center" role="status" aria-live="polite">
      <FocusFrame className="p-5">
        <div className="relative h-64 w-52 overflow-hidden rounded-[50%] bg-surface-3">
          {selfieUrl ? (
            <img src={selfieUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-ink-faint">
              <UserIcon size={80} strokeWidth={1.5} />
            </span>
          )}
          <span aria-hidden className="scan-line absolute inset-x-0 h-0.5 bg-brand-200 shadow-[0_0_16px_4px_rgba(131,82,248,0.8)]" />
        </div>
      </FocusFrame>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">{t('searching')}</h1>
        {photoCount ? <p className="text-[15px] text-ink-soft">{t('searchingHint', { count: photoCount })}</p> : null}
      </div>
      <Card className="flex w-full flex-col gap-3.5 text-left">
        {stages.map((label, i) => {
          const state = i < stage ? 'done' : i === stage ? 'active' : 'todo';
          return (
            <div key={label} className="flex items-center gap-3">
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                  state === 'done' ? 'bg-emerald-700 text-on-brand' : state === 'active' ? 'bg-brand-600' : 'bg-surface-3'
                }`}
              >
                {state === 'done' ? <CheckIcon size={16} strokeWidth={3} /> : state === 'active' ? <span className="size-2 animate-pulse rounded-full bg-on-brand" /> : null}
              </span>
              <span className={state === 'todo' ? 'text-ink-faint' : 'font-semibold'}>{label}</span>
            </div>
          );
        })}
      </Card>
    </section>
  );
}

/** Мухардал биш: шалтгаан + дараагийн алхам */
function NoResults({ onAgain, eventHref }: { onAgain: () => void; eventHref: string }) {
  const t = useTranslations('search');
  return (
    <section className="mx-auto flex w-full max-w-md flex-col items-center gap-4 text-center">
      <FocusFrame tone="ink" className="p-4">
        <span className="flex h-32 w-28 items-center justify-center rounded-[50%] bg-surface-3 text-ink-faint" aria-hidden>
          <UserIcon size={56} strokeWidth={1.5} />
        </span>
      </FocusFrame>
      <div className="flex flex-col gap-1">
        <p className="font-display text-2xl font-extrabold">{t('noneFound')}</p>
        <p className="text-ink-soft">{t('noneBody')}</p>
      </div>
      <Card className="flex w-full flex-col gap-4 text-left">
        <p className="text-[15px] font-bold">{t('tipsTitle')}</p>
        {([
          ['light', SunIcon],
          ['face', ScanFaceIcon],
          ['accessories', UserIcon],
        ] as const).map(([k, Icon]) => (
          <div key={k} className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Icon size={18} />
            </span>
            <span className="text-[15px]">{t(`tips.${k}`)}</span>
          </div>
        ))}
      </Card>
      <div className="flex w-full flex-col gap-1">
        <Button className="min-h-14 w-full" onClick={onAgain}>
          {t('again')}
        </Button>
        <Link href={eventHref} className="inline-flex min-h-12 items-center justify-center rounded-full font-semibold text-brand-700 hover:bg-brand-50">
          {t('browseAll')}
        </Link>
      </div>
    </section>
  );
}
