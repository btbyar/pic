import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { CSSProperties } from 'react';
import { CountUp } from '@/components/count-up';
import { ArrowRightIcon, DownloadIcon, LockIcon, ScanFaceIcon, SearchIcon } from '@/components/icons';
import { PhotographerCard } from '@/components/photographer-card';
import { ButtonLink, Kicker } from '@/components/ui';
import { serverApi } from '@/lib/api-server';
import type { HomeStats, PhotographerCard as Card } from '@/lib/types';

const STEPS = [
  { key: 'find', Icon: SearchIcon },
  { key: 'selfie', Icon: ScanFaceIcon },
  { key: 'download', Icon: DownloadIcon },
] as const;

export default async function HomePage() {
  const t = await getTranslations('home');
  const [{ data: stats }, { data: photographers }] = await Promise.all([
    serverApi<HomeStats>('/stats'),
    serverApi<Card[]>('/photographers'),
  ]);
  const all = photographers ?? [];
  const cast = all.slice(0, 8);
  const covers = [...new Set(all.flatMap((p) => (p.coverUrl ? [p.coverUrl] : [])))].slice(0, 12);

  return (
    <main>
      {/* ——— Нээлтийн кадр ——— */}
      <section className="relative isolate flex min-h-[100svh] flex-col justify-end overflow-hidden">
        <ReelWall covers={covers} />
        <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[38rem] w-[60rem] -translate-x-1/2 animate-drift rounded-full bg-gold/[0.13] blur-[120px]" />

        <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 pb-[calc(var(--dock)+3.5rem)] pt-36 md:pb-20 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="flex max-w-4xl flex-col items-start gap-7">
            <Kicker className="animate-rise">{t('kicker')}</Kicker>
            <h1 className="animate-rise font-display text-[clamp(3.25rem,9vw,8rem)] font-semibold leading-[0.88] tracking-[-0.035em] stagger [--i:1]">
              {t.rich('title', { em: (chunks) => <em className="font-medium text-gold">{chunks}</em> })}
            </h1>
            <p className="max-w-xl animate-rise text-lg leading-relaxed text-mist stagger [--i:2] sm:text-xl">{t('subtitle')}</p>

            {/* Хайлтын «команд мөр» */}
            <form
              action="/photographers"
              className="glass group flex w-full max-w-xl animate-rise items-center gap-2 rounded-2xl p-2 stagger transition duration-300 [--i:3] focus-within:ring-2 focus-within:ring-gold"
            >
              <SearchIcon size={20} className="ml-3 shrink-0 text-mist transition group-focus-within:text-gold" />
              <input
                name="q"
                type="search"
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchPlaceholder')}
                className="min-h-12 min-w-0 flex-1 bg-transparent px-1 text-base text-ivory outline-none placeholder:text-dim"
              />
              <button
                type="submit"
                className="shine inline-flex min-h-12 shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-gold px-5 text-[15px] font-semibold text-gold-ink transition hover:bg-gold-soft active:scale-[0.97]"
              >
                {t('searchButton')}
                <ArrowRightIcon size={16} className="hidden sm:block" />
              </button>
            </form>

            <div className="flex animate-rise flex-wrap items-center gap-x-6 gap-y-2 stagger [--i:4]">
              <Link href="/photographers" className="group inline-flex min-h-11 items-center gap-2 font-semibold text-ivory">
                {t('allPhotographers')}
                <ArrowRightIcon size={16} className="text-gold transition group-hover:translate-x-1" />
              </Link>
              <Link href="/register" className="inline-flex min-h-11 items-center text-mist transition hover:text-ivory">
                {t('imPhotographer')}
              </Link>
            </div>
          </div>

          {stats && stats.photos > 0 ? (
            <dl className="flex animate-rise gap-8 stagger [--i:5] lg:flex-col lg:gap-6 lg:border-l lg:border-line lg:pl-8">
              {(['photos', 'events', 'photographers'] as const).map((k) => (
                <div key={k} className="flex flex-col">
                  <dd className="font-display text-4xl font-semibold leading-none sm:text-5xl">
                    <CountUp value={stats[k]} />
                  </dd>
                  <dt className="kicker mt-2">{t(`stats.${k}`)}</dt>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </section>

      {/* ——— Гурван үзэгдэл ——— */}
      <section className="relative mx-auto max-w-7xl px-5 py-24 sm:py-32">
        <div aria-hidden className="sprockets mb-16" />
        <div className="flex flex-col gap-4">
          <Kicker>{t('howKicker')}</Kicker>
          <h2 className="max-w-2xl font-display text-5xl font-semibold leading-[0.95] tracking-[-0.02em] sm:text-6xl">{t('howTitle')}</h2>
        </div>
        <ol className="mt-14 grid gap-px overflow-hidden rounded-3xl bg-line sm:grid-cols-3">
          {STEPS.map(({ key, Icon }, i) => (
            <li key={key} className="group relative flex flex-col gap-5 bg-night p-7 transition duration-500 hover:bg-night-2 sm:p-9">
              <span aria-hidden className="numeral-outline font-display text-8xl font-semibold leading-none transition duration-500 group-hover:[-webkit-text-stroke-color:var(--color-gold)]">
                0{i + 1}
              </span>
              <span className="flex size-12 items-center justify-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/25">
                <Icon size={22} />
              </span>
              <span className="font-display text-3xl font-semibold leading-tight">{t(`steps.${key}.title`)}</span>
              <span className="leading-relaxed text-mist">{t(`steps.${key}.body`)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-8 inline-flex items-start gap-3 rounded-2xl bg-night-2 px-5 py-4 text-sm leading-relaxed text-mist ring-1 ring-inset ring-line">
          <LockIcon size={18} className="mt-px shrink-0 text-gold" />
          {t('privacy')}
        </p>
      </section>

      {/* ——— Жүжигчид: зурагчид ——— */}
      {cast.length ? (
        <section className="py-10">
          <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-5">
            <div className="flex flex-col gap-4">
              <Kicker>{t('castKicker')}</Kicker>
              <h2 className="font-display text-5xl font-semibold leading-[0.95] tracking-[-0.02em] sm:text-6xl">{t('photographersTitle')}</h2>
              <p className="max-w-md text-mist">{t('photographersIntro')}</p>
            </div>
            <Link href="/photographers" className="group inline-flex min-h-11 items-center gap-2 font-semibold">
              {t('seeAll', { count: all.length })}
              <ArrowRightIcon size={16} className="text-gold transition group-hover:translate-x-1" />
            </Link>
          </div>
          {/* Утсан дээр хажуу тийш гүйлгэнэ, өргөн дэлгэцэнд тор */}
          <ul className="mx-auto mt-12 flex max-w-7xl snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-5 px-5 pb-4 [scrollbar-width:none] lg:grid lg:grid-cols-4 lg:overflow-visible">
            {cast.map((p, i) => (
              <li key={p.slug} className="w-[72%] shrink-0 snap-start sm:w-[42%] lg:w-auto">
                <PhotographerCard p={p} index={i} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ——— Зурагчдад ——— */}
      <section className="mx-auto max-w-7xl px-5 pt-24">
        <div className="relative isolate overflow-hidden rounded-[28px] bg-night-2 px-7 py-14 ring-1 ring-inset ring-line sm:px-14 sm:py-20">
          <div aria-hidden className="absolute -right-24 -top-24 -z-10 size-96 rounded-full bg-gold/15 blur-3xl" />
          <div aria-hidden className="absolute -bottom-32 right-24 -z-10 size-72 rounded-full border border-gold/20" />
          <div className="flex max-w-2xl flex-col items-start gap-6">
            <Kicker>{t('ctaKicker')}</Kicker>
            <h2 className="font-display text-5xl font-semibold leading-[0.95] tracking-[-0.02em] sm:text-6xl">{t('ctaTitle')}</h2>
            <p className="text-lg leading-relaxed text-mist">{t('ctaBody')}</p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/register" size="lg">
                {t('ctaRegister')}
              </ButtonLink>
              <ButtonLink href="/login" variant="secondary" size="lg">
                {t('ctaLogin')}
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

/** Ард нь удаан гүйх зургийн багана — эвэнтүүдийн хальс. Зураггүй бол зөвхөн гэрлийн туяа. */
function ReelWall({ covers }: { covers: string[] }) {
  if (covers.length === 0) {
    return (
      <div aria-hidden className="absolute inset-0 -z-20">
        <div className="absolute left-[12%] top-0 h-full w-40 rotate-12 bg-linear-to-b from-gold/10 to-transparent blur-2xl" />
        <div className="absolute right-[18%] top-0 h-full w-56 -rotate-12 bg-linear-to-b from-gold/[0.07] to-transparent blur-2xl" />
      </div>
    );
  }
  const columns = [0, 1, 2, 3, 4].map((c) => {
    const list = covers.map((_, i) => covers[(i + c * 2) % covers.length]!);
    return [...list, ...list];
  });
  return (
    <div
      aria-hidden
      className="absolute inset-0 -z-20 grid grid-cols-3 gap-3 px-3 opacity-35 [mask-image:radial-gradient(ellipse_at_70%_30%,#000_10%,transparent_75%)] sm:grid-cols-4 lg:grid-cols-5"
    >
      {columns.map((list, c) => (
        <div key={c} className={`overflow-hidden ${c > 2 ? 'hidden sm:block' : ''} ${c > 3 ? 'sm:hidden lg:block' : ''}`}>
          <div
            className="flex animate-reel flex-col gap-3"
            style={{ animationDuration: `${70 + c * 14}s`, animationDirection: c % 2 ? 'reverse' : 'normal' } as CSSProperties}
          >
            {list.map((src, i) => (
              <img key={i} src={src} alt="" loading="lazy" decoding="async" className="aspect-[3/4] w-full rounded-xl object-cover grayscale-[35%]" />
            ))}
          </div>
        </div>
      ))}
      <div className="absolute inset-0 bg-linear-to-t from-night via-night/70 to-night/80" />
    </div>
  );
}
