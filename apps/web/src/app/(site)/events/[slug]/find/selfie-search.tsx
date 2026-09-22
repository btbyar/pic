'use client';

import { BackLink } from '@/components/back-link';
import { CONSENT_VERSION, priceOrder } from '@pic/shared';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ChangeEvent, type MouseEvent, useCallback, useEffect, useRef, useState } from 'react';
import { CameraIcon, CartIcon, CheckIcon, ClockIcon, ImagesIcon, LockIcon, ScanFaceIcon, SunIcon, UserIcon, XIcon } from '@/components/icons';
import { type GridCart, PhotoGrid } from '@/components/photo-grid';
import { Ticket } from '@/components/ticket';
import { Alert, Button, ButtonLink, Kicker, Spinner, buttonClass } from '@/components/ui';
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
  const stepLabels = [t('steps.consent'), t('steps.selfie'), t('steps.results')];
  // Сервер дээр navigator байхгүй — hydration зөрөхгүйн тулд mount болсны дараа шалгана
  const [canUseCamera, setCanUseCamera] = useState(false);
  useEffect(() => setCanUseCamera(!!navigator.mediaDevices), []);

  return (
    <main className={`relative mx-auto flex max-w-6xl flex-col gap-8 px-5 pt-28 ${step === 'results' && cartPrice ? 'pb-36' : 'pb-16'}`}>
      <div aria-hidden className="pointer-events-none absolute -top-20 right-0 -z-10 h-[30rem] w-[40rem] animate-drift rounded-full bg-gold/[0.08] blur-[120px]" />

      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <BackLink href={eventHref}>{event.title}</BackLink>
        {/* Гурван үзэгдэл: алтан шугам урагшилна */}
        <ol className="flex items-center gap-3" aria-label={t('title')}>
          {stepLabels.map((label, i) => (
            <li key={label} className="flex items-center gap-3" aria-current={i === progress ? 'step' : undefined}>
              <span className={`font-mono text-[10px] uppercase tracking-[0.16em] transition ${i <= progress ? 'text-ivory' : 'text-dim'}`}>
                <span className={i <= progress ? 'text-gold' : ''}>0{i + 1}</span> {label}
              </span>
              {i < 2 ? (
                <span aria-hidden className="relative h-px w-8 overflow-hidden bg-line sm:w-12">
                  <span className={`absolute inset-y-0 left-0 bg-gold transition-all duration-700 ease-cine ${i < progress ? 'w-full' : 'w-0'}`} />
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      {deleted ? <Alert kind="success">{t('deleted')}</Alert> : null}
      {error && step !== 'camera' && step !== 'preview' ? <Alert>{error}</Alert> : null}

      {step === 'consent' ? (
        <section className="grid items-start gap-12 pb-44 sm:pb-0 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-5">
              <Kicker className="animate-rise">{t('consent.title')}</Kicker>
              <h1 className="animate-rise font-display text-[clamp(2.75rem,6vw,5rem)] font-semibold leading-[0.92] tracking-[-0.03em] stagger [--i:1]">
                {t('consent.headline')}
              </h1>
              <p className="max-w-lg animate-rise text-lg text-mist stagger [--i:2]">{t('consent.intro')}</p>
            </div>

            <ul className="flex flex-col border-y border-line">
              {([
                ['selfieNotStored', LockIcon],
                ['retention', ClockIcon],
                ['anonymous', UserIcon],
              ] as const).map(([k, Icon], i) => (
                <li
                  key={k}
                  className="flex animate-rise gap-4 border-b border-line py-5 stagger last:border-b-0"
                  style={{ '--i': i + 3 } as React.CSSProperties}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/25">
                    <Icon size={18} />
                  </span>
                  <span className="pt-2 text-[15px] leading-relaxed">{t(`consent.${k}`)}</span>
                </li>
              ))}
            </ul>

            {/* Үлдсэн нөхцөл: нуугдаагүй, нэг товшилтын зайд */}
            <details className="group -mt-4 text-sm text-mist">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-gold [&::-webkit-details-marker]:hidden">
                <span className="transition group-open:rotate-45">+</span>
                {t('consent.more')}
              </summary>
              <div className="flex animate-fade flex-col gap-2 pt-2 leading-relaxed">
                {(['purpose', 'noSharing', 'minors'] as const).map((k) => (
                  <p key={k}>{t(`consent.${k}`)}</p>
                ))}
                <p>{t('consent.law', { version: CONSENT_VERSION })}</p>
              </div>
            </details>

            {/* Мөр бүхэлдээ дарагдана; сонгогдоход алтаар гэрэлтэнэ */}
            <label
              className={`group flex cursor-pointer items-start gap-4 rounded-2xl p-5 ring-1 ring-inset transition duration-300 ${
                consent ? 'bg-gold/[0.07] ring-gold/70' : 'bg-night-2 ring-line-strong hover:ring-mist'
              }`}
            >
              <input type="checkbox" className="peer sr-only" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span
                aria-hidden
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md ring-1 ring-inset transition duration-300 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold ${
                  consent ? 'bg-gold text-gold-ink ring-gold' : 'ring-line-strong'
                }`}
              >
                {consent ? <CheckIcon size={16} strokeWidth={2.6} className="animate-pop" /> : null}
              </span>
              <span className="text-[15px] font-medium leading-relaxed">{t('consent.agree')}</span>
            </label>

            <div className="glass fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 rounded-t-[24px] border-x-0 border-b-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:static sm:flex-row sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
              {canUseCamera ? (
                <Button size="lg" className="w-full sm:w-auto" onClick={() => void openCamera()}>
                  <CameraIcon size={20} />
                  {t('capture.openCamera')}
                </Button>
              ) : null}
              <FilePick label={t('consent.pickPhoto')} onFile={onFile} onBlocked={requireConsent} tone="ghost" />
            </div>
          </div>

          <Viewfinder />
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
          <header className="flex flex-col gap-4">
            <Kicker className="animate-rise">{t('steps.results')}</Kicker>
            <h1 className="animate-rise font-display text-[clamp(2.75rem,6vw,5rem)] font-semibold leading-[0.92] tracking-[-0.03em] stagger [--i:1]">
              {t('mine', { count: results.mine.length })}
            </h1>
            {results.mine.length ? <p className="animate-rise text-lg text-mist stagger [--i:2]">{t('resultsSub')}</p> : null}
          </header>

          {results.multipleFaces ? <Alert kind="info">{t('multipleFaces')}</Alert> : null}

          {results.mine.length ? (
            <>
              {/* Багцын санал хамгийн дээр — хамгийн их хэмнэлттэй сонголт */}
              <Ticket glow className="flex animate-rise flex-col gap-5 p-6 stagger [--i:3] sm:flex-row sm:items-center sm:justify-between sm:p-8">
                <div className="flex flex-col gap-2">
                  <p className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
                    {bundleWorthIt
                      ? tc('bundleOffer', { count: results.mine.length, price: formatMnt(event.bundlePrice!) })
                      : tc('allPrice', { count: results.mine.length, price: formatMnt(results.mine.length * event.pricePerPhoto) })}
                  </p>
                  {bundleWorthIt ? (
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-gold">
                      <span aria-hidden className="size-1.5 rounded-full bg-gold" />
                      {tc('bundleSaves', { price: formatMnt(results.mine.length * event.pricePerPhoto - event.bundlePrice!) })}
                    </p>
                  ) : null}
                </div>
                <Button
                  size="lg"
                  variant={mineNotInCart.length === 0 ? 'secondary' : 'primary'}
                  className="shrink-0"
                  disabled={mineNotInCart.length === 0}
                  onClick={() => addToCart(cartEvent, mineNotInCart, results.sessionId)}
                >
                  {mineNotInCart.length === 0 ? (
                    <>
                      <CheckIcon size={18} className="text-jade" />
                      {tc('allInCart')}
                    </>
                  ) : bundleWorthIt ? (
                    t('bundleCta')
                  ) : (
                    tc('addAll', { count: mineNotInCart.length })
                  )}
                </Button>
              </Ticket>

              <PhotoGrid photos={results.mine} timezone={event.timezone} cart={gridCart} />
            </>
          ) : (
            <NoResults onAgain={searchAgain} eventHref={eventHref} />
          )}

          {results.maybe.length ? (
            <section className="flex flex-col gap-5 border-t border-line pt-10">
              <div className="flex flex-col gap-2">
                <h2 className="font-display text-3xl font-semibold">{t('maybe', { count: results.maybe.length })}</h2>
                <p className="text-sm text-mist">{t('maybeHint')}</p>
              </div>
              <PhotoGrid photos={results.maybe} timezone={event.timezone} cart={gridCart} />
            </section>
          ) : null}

          {/* Нууцлалын үйлдлүүд — нам гүм footer */}
          <footer className="flex flex-col gap-3 rounded-2xl bg-night-2 p-5 text-sm text-mist ring-1 ring-inset ring-line sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2.5 leading-relaxed">
              <LockIcon size={16} className="mt-0.5 shrink-0 text-gold" />
              {t('privacyNote')}
            </p>
            <div className="flex shrink-0 flex-wrap gap-x-5">
              {results.mine.length ? (
                <button type="button" className="min-h-11 cursor-pointer font-semibold text-gold transition hover:text-gold-soft" onClick={searchAgain}>
                  {t('again')}
                </button>
              ) : null}
              <button
                type="button"
                className="min-h-11 cursor-pointer font-semibold text-mist underline decoration-line-strong underline-offset-4 transition hover:text-ivory"
                onClick={() => void deleteSearchData()}
              >
                {t('deleteData')}
              </button>
            </div>
          </footer>

          {cartPrice ? (
            <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto max-w-3xl animate-rise">
              <div className="glass flex items-center gap-3 rounded-[22px] p-2 pl-5 shadow-[0_24px_70px_-10px_rgba(0,0,0,0.95)]">
                <div className="flex flex-1 flex-col" aria-live="polite">
                  <span className="kicker !text-[10px]">{t('selectedCount', { count: inCartPhotos.length })}</span>
                  <span className="flex items-center gap-2 font-display text-2xl font-semibold leading-none tabular-nums">
                    <span key={cartPrice.total} className="animate-fade">
                      {formatMnt(cartPrice.total)}
                    </span>
                    {cartPrice.bundleApplied ? (
                      <span className="rounded-full bg-jade/15 px-2 py-0.5 font-sans text-[11px] font-bold text-jade">{tc('bundleApplied')}</span>
                    ) : null}
                  </span>
                </div>
                <ButtonLink href="/cart" variant="dark" className="min-h-13">
                  <CartIcon size={18} />
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
    <label onClick={block} className={buttonClass('secondary', 'lg', 'w-full has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold sm:w-auto')}>
      <ImagesIcon size={20} />
      {label}
      <input type="file" accept="image/*" className="sr-only" onChange={onFile} />
    </label>
  ) : (
    <label
      className="glass flex size-13 cursor-pointer items-center justify-center rounded-full text-ivory transition hover:bg-white/20 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold"
      aria-label={label}
    >
      <ImagesIcon size={22} />
      <input type="file" accept="image/*" className="sr-only" onChange={onFile} />
    </label>
  );
}

/** Зөвшөөрлийн хажуудах чимэг: камерын харагч — дүрэм, REC, тор */
function Viewfinder() {
  return (
    <div aria-hidden className="relative hidden aspect-[4/5] animate-rise overflow-hidden rounded-[28px] bg-night-2 ring-1 ring-inset ring-line stagger [--i:4] lg:block">
      <div className="absolute left-1/3 top-0 h-full w-px bg-white/[0.05]" />
      <div className="absolute left-2/3 top-0 h-full w-px bg-white/[0.05]" />
      <div className="absolute left-0 top-1/3 h-px w-full bg-white/[0.05]" />
      <div className="absolute left-0 top-2/3 h-px w-full bg-white/[0.05]" />
      <div className="absolute left-6 top-6 flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-ivory">
        <span className="size-2 animate-blink rounded-full bg-ember" />
        REC
      </div>
      <div className="absolute right-6 top-6 font-mono text-[11px] tracking-[0.16em] text-mist">00:00:12:07</div>
      <div className="absolute bottom-6 left-6 font-mono text-[11px] tracking-[0.16em] text-mist">ISO 400 · f/2.8</div>
      <div className="absolute bottom-6 right-6 font-mono text-[11px] tracking-[0.16em] text-gold">4K</div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative flex h-[62%] w-[52%] items-center justify-center">
          <span className="absolute inset-0 animate-iris rounded-[50%] border border-dashed border-gold/60 [animation-duration:24s]" />
          <span className="absolute inset-3 rounded-[50%] border border-white/10" />
          <UserIcon size={96} strokeWidth={0.8} className="text-line-strong" />
        </div>
      </div>
      <div className="absolute -bottom-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-gold/15 blur-3xl" />
    </div>
  );
}

/** Бүтэн дэлгэцийн харанхуй давхарга */
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
    <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-50 flex animate-fade flex-col bg-black text-ivory">
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('cancel')}
          className="glass flex size-11 cursor-pointer items-center justify-center rounded-full transition hover:bg-white/20"
        >
          <XIcon size={20} />
        </button>
        <span className="font-mono text-[11px] uppercase tracking-[0.18em]">{label}</span>
        <span className="size-11" aria-hidden />
      </div>
      {children}
    </div>
  );
}

/** Камерын timecode: мм:сс:кадр — бичлэг явж байгаа мэдрэмж */
function useTimecode() {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const timer = setInterval(() => setMs(performance.now() - start), 80);
    return () => clearInterval(timer);
  }, []);
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}:${pad(Math.floor((ms % 1000) / 40))}`;
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
  const timecode = useTimecode();
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <Overlay label={t('title')} onClose={onClose}>
      <div className="relative mx-2 flex-1 overflow-hidden rounded-[24px] sm:mx-4">
        {/* Урд камер: толь шиг харагдуулна (хадгалах зураг нь буцаагүй) */}
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/3 top-0 h-full w-px bg-white/15" />
          <div className="absolute left-2/3 top-0 h-full w-px bg-white/15" />
          <div className="absolute left-0 top-1/3 h-px w-full bg-white/15" />
          <div className="absolute left-0 top-2/3 h-px w-full bg-white/15" />
          <div className="absolute left-4 top-4 flex items-center gap-2 font-mono text-[11px] tracking-[0.16em]">
            <span className="size-2 animate-blink rounded-full bg-ember" />
            REC
          </div>
          <div className="absolute right-4 top-4 font-mono text-[11px] tabular-nums tracking-[0.16em]">{timecode}</div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="relative block h-[min(58vh,24rem)] w-[min(66vw,17rem)]">
              <span className="absolute inset-0 rounded-[50%] border-2 border-dashed border-white/85" />
              <span className="absolute -inset-3 animate-iris rounded-[50%] border-t-2 border-gold [animation-duration:6s]" />
            </span>
          </div>
        </div>
        <p className="glass absolute inset-x-0 bottom-5 mx-auto w-fit max-w-[90%] rounded-full px-5 py-2.5 text-center text-[15px] font-medium">
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
          className="group flex size-20 cursor-pointer items-center justify-center rounded-full border-[3px] border-ivory p-1.5 focus-visible:outline-gold"
        >
          <span className="size-full rounded-full bg-ivory transition duration-200 group-hover:bg-gold group-active:scale-85" />
        </button>
        <span className="size-13" aria-hidden />
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
        <div aria-hidden className="absolute size-80 rounded-full bg-gold/20 blur-3xl" />
        <img
          src={url}
          alt={t('previewAlt')}
          className="relative max-h-[56vh] w-auto max-w-full animate-rise rounded-[28px] object-contain ring-1 ring-gold/50 ring-offset-8 ring-offset-black"
        />
      </div>
      <div className="mx-auto flex w-full max-w-md flex-col gap-2 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        {error ? (
          <p role="alert" className="rounded-2xl bg-ember/15 px-4 py-3 text-sm text-[#ffc2b4] ring-1 ring-inset ring-ember/35">
            {error}
          </p>
        ) : null}
        <Button size="lg" autoFocus className="w-full" onClick={onSearch}>
          <ScanFaceIcon size={20} />
          {t('search')}
        </Button>
        <Button variant="ghost" size="lg" onClick={onRetake}>
          {t('retake')}
        </Button>
      </div>
    </Overlay>
  );
}

/** Spinner биш: селфи нь «iris» цагирагт, шатлалтай явц. Хариу ирмэгц үр дүн рүү шилжинэ. */
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
    <section className="mx-auto flex w-full max-w-2xl flex-col items-center gap-10 py-6 text-center" role="status" aria-live="polite">
      <div className="relative flex size-72 items-center justify-center" aria-hidden>
        <span className="absolute inset-0 animate-ripple rounded-full border border-gold/40" />
        <span className="absolute inset-0 animate-ripple rounded-full border border-gold/30 [animation-delay:1.2s]" />
        <span className="absolute inset-2 animate-iris rounded-full border-2 border-transparent border-r-gold border-t-gold" />
        <span className="absolute inset-6 animate-iris rounded-full border border-dashed border-white/20 [animation-direction:reverse] [animation-duration:9s]" />
        <div className="relative size-52 overflow-hidden rounded-full bg-night-3">
          {selfieUrl ? (
            <img src={selfieUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-line-strong">
              <UserIcon size={80} strokeWidth={1} />
            </span>
          )}
          <span className="absolute inset-0 bg-linear-to-t from-gold/25 to-transparent" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">{t('searching')}</h1>
        {photoCount ? <p className="text-mist">{t('searchingHint', { count: photoCount })}</p> : null}
      </div>
      <ol className="grid w-full gap-px overflow-hidden rounded-2xl bg-line text-left sm:grid-cols-3">
        {stages.map((label, i) => {
          const state = i < stage ? 'done' : i === stage ? 'active' : 'todo';
          return (
            <li key={label} className="flex items-center gap-3 bg-night-2 px-4 py-4">
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full transition duration-500 ${
                  state === 'done' ? 'bg-jade text-night' : state === 'active' ? 'text-gold' : 'text-dim ring-1 ring-inset ring-line-strong'
                }`}
              >
                {state === 'done' ? (
                  <CheckIcon size={15} strokeWidth={3} className="animate-pop" />
                ) : state === 'active' ? (
                  <Spinner className="size-5" />
                ) : (
                  <span className="font-mono text-[10px]">{i + 1}</span>
                )}
              </span>
              <span className={`text-sm ${state === 'todo' ? 'text-dim' : 'font-semibold'}`}>{label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Мухардал биш: шалтгаан + дараагийн алхам */
function NoResults({ onAgain, eventHref }: { onAgain: () => void; eventHref: string }) {
  const t = useTranslations('search');
  return (
    <section className="grid animate-rise items-start gap-8 rounded-3xl bg-night-2 p-6 ring-1 ring-inset ring-line sm:p-10 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <span className="flex size-16 items-center justify-center rounded-full bg-night-3 text-mist ring-1 ring-line" aria-hidden>
          <UserIcon size={30} strokeWidth={1.4} />
        </span>
        <p className="font-display text-4xl font-semibold leading-tight">{t('noneFound')}</p>
        <p className="text-mist">{t('noneBody')}</p>
        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <Button size="lg" onClick={onAgain}>
            {t('again')}
          </Button>
          <ButtonLink href={eventHref} variant="secondary" size="lg">
            {t('browseAll')}
          </ButtonLink>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <p className="kicker mb-3">{t('tipsTitle')}</p>
        {([
          ['light', SunIcon],
          ['face', ScanFaceIcon],
          ['accessories', UserIcon],
        ] as const).map(([k, Icon]) => (
          <div key={k} className="flex items-center gap-4 border-b border-line py-4 last:border-b-0">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/25">
              <Icon size={18} />
            </span>
            <span className="text-[15px] leading-relaxed">{t(`tips.${k}`)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
