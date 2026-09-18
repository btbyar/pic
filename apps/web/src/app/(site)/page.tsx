import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ApertureIcon, ArrowRightIcon, CameraIcon, DownloadIcon, LockIcon, ScanFaceIcon, SearchIcon } from '@/components/icons';
import { PhotographerCard } from '@/components/photographer-card';
import { serverApi } from '@/lib/api-server';
import type { HomeStats, PhotographerCard as Card } from '@/lib/types';

const number = (n: number) => new Intl.NumberFormat('en-US').format(n).replace(/,/g, ' ');

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
  const top = all.slice(0, 6);
  // Hero-гийн ард зурагчдын сүүлийн эвэнтүүдийн зургаар коллаж
  const collage = [...new Set(all.flatMap((p) => (p.coverUrl ? [p.coverUrl] : [])))].slice(0, 8);

  return (
    <main>
      <section className="relative isolate overflow-hidden">
        {/* 4+ ялгаатай зураг байвал коллаж, цөөн бол нэг зургийг бүдгэрүүлж дэвсгэр болгоно (давтагдсан хавтан муухай) */}
        {collage.length >= 4 ? (
          <div aria-hidden className="absolute inset-0 -z-10 grid grid-cols-2 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <img key={i} src={collage[i % collage.length]} alt="" className="h-full min-h-40 w-full object-cover" />
            ))}
          </div>
        ) : collage.length ? (
          <img aria-hidden src={collage[0]} alt="" className="absolute inset-0 -z-10 h-full w-full scale-110 object-cover blur-md" />
        ) : null}
        {/* Зураг дээр текст уншигдахуйц: дээрээс ил, доошоо цаас өнгөрүү уусна */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-b from-paper/80 via-paper/88 to-paper" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,var(--color-paper)_20%,transparent_75%)]" />

        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-4 pb-16 pt-14 text-center sm:pb-20 sm:pt-20">
          <img src="/icon.svg" alt="" width={64} height={64} className="rounded-2xl shadow-lg shadow-brand-600/30" />
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-700">{t('eyebrow')}</p>
          <h1 className="text-balance text-4xl font-bold leading-[1.1] tracking-tight text-stone-900 sm:text-6xl">{t('title')}</h1>
          <p className="max-w-xl text-pretty text-lg text-stone-600">{t('subtitle')}</p>

          <form
            action="/photographers"
            className="mt-2 flex w-full max-w-lg items-center gap-2 rounded-2xl bg-white p-2 shadow-xl shadow-stone-900/[0.07] ring-1 ring-stone-200"
          >
            <SearchIcon size={20} className="ml-2 shrink-0 text-stone-400" />
            <input
              name="q"
              type="search"
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-stone-400"
            />
            <button type="submit" className="min-h-11 shrink-0 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white transition hover:bg-brand-700">
              {t('searchButton')}
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/photographers"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-stone-900 px-5 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              <CameraIcon size={16} />
              {t('allPhotographers')}
            </Link>
            <Link
              href="/register"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white/80 px-5 text-sm font-semibold text-stone-800 backdrop-blur transition hover:bg-white"
            >
              <ApertureIcon size={16} />
              {t('imPhotographer')}
            </Link>
          </div>
        </div>
      </section>

      {top.length ? (
        <section className="mx-auto max-w-6xl px-4 py-12">
          <div className="mb-8 flex flex-col items-center gap-2 text-center">
            <h2 className="text-3xl font-bold tracking-tight">{t('photographersTitle')}</h2>
            <p className="text-stone-600">{t('photographersIntro')}</p>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {top.map((p) => (
              <li key={p.slug}>
                <PhotographerCard p={p} />
              </li>
            ))}
          </ul>
          {all.length > top.length ? (
            <div className="mt-8 flex justify-center">
              <Link
                href="/photographers"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-800 transition hover:border-brand-300 hover:text-brand-700"
              >
                {t('seeAll', { count: all.length })}
                <ArrowRightIcon size={16} />
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="mb-8 text-center text-xs font-semibold uppercase tracking-[0.25em] text-stone-500">{t('howTitle')}</h2>
        <ol className="grid gap-5 sm:grid-cols-3">
          {STEPS.map(({ key, Icon }, i) => (
            <li key={key} className="relative flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-6">
              <span className="absolute right-5 top-4 text-4xl font-bold tabular-nums text-stone-100" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <Icon size={22} />
              </span>
              <span className="text-lg font-semibold">{t(`steps.${key}.title`)}</span>
              <span className="text-sm leading-relaxed text-stone-600">{t(`steps.${key}.body`)}</span>
            </li>
          ))}
        </ol>
        <p className="mx-auto mt-6 flex max-w-2xl items-start justify-center gap-2 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
          <LockIcon size={16} className="mt-0.5 shrink-0 text-brand-700" />
          {t('privacy')}
        </p>
      </section>

      {stats && stats.photos > 0 ? (
        <section className="mx-auto max-w-6xl px-4 py-6">
          <dl className="grid grid-cols-3 divide-x divide-stone-200 rounded-2xl border border-stone-200 bg-white py-6 text-center">
            {(['events', 'photos', 'photographers'] as const).map((k) => (
              <div key={k} className="flex flex-col gap-1 px-2">
                <dt className="order-2 text-sm text-stone-500">{t(`stats.${k}`)}</dt>
                <dd className="font-display text-2xl font-bold tabular-nums text-stone-900 sm:text-4xl">{number(stats[k])}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </main>
  );
}
