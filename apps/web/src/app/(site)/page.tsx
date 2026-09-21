import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { DownloadIcon, LockIcon, ScanFaceIcon, SearchIcon } from '@/components/icons';
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
  const strip = [...new Set(all.flatMap((p) => (p.coverUrl ? [p.coverUrl] : [])))].slice(0, 5);

  return (
    <main>
      {/* Hero: зүүн талд текст, баруун талд фокусын хүрээнд орсон зураг */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:pb-20 lg:pt-16">
        <div className="flex flex-col items-start gap-6">
          <h1 className="text-balance font-display text-4xl font-extrabold leading-[1.05] sm:text-6xl">{t('title')}</h1>
          <p className="max-w-lg text-pretty text-lg text-ink-soft">{t('subtitle')}</p>

          <form action="/photographers" className="flex w-full max-w-md items-center gap-2 rounded-2xl bg-surface-2 p-2">
            <SearchIcon size={20} className="ml-2 shrink-0 text-ink-faint" />
            <input
              name="q"
              type="search"
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              className="min-h-11 min-w-0 flex-1 bg-transparent px-1 text-base text-ink outline-none placeholder:text-ink-faint"
            />
            <button
              type="submit"
              className="min-h-11 shrink-0 cursor-pointer rounded-full bg-brand-600 px-5 text-sm font-semibold text-on-brand transition hover:bg-brand-700"
            >
              {t('searchButton')}
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <Link href="/photographers" className="font-medium text-ink hover:underline">
              {t('allPhotographers')}
            </Link>
            <Link href="/register" className="text-ink-soft hover:text-ink">
              {t('imPhotographer')}
            </Link>
          </div>

          {stats && stats.photos > 0 ? (
            <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-5">
              {(['photos', 'events', 'photographers'] as const).map((k) => (
                <div key={k} className="flex items-baseline gap-2">
                  <dt className="order-2 text-sm text-ink-soft">{t(`stats.${k}`)}</dt>
                  <dd className="font-display text-2xl font-bold tabular-nums">{number(stats[k])}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        {/* Нэг зураг дээр "фокус тогтоосон" байдал — бүтээгдэхүүний гол мөч */}
        <div className="relative">
          {strip.length ? (
            <div className="overflow-hidden rounded-xl">
              <img src={strip[0]} alt="" className="aspect-4/5 w-full object-cover" />
            </div>
          ) : (
            <div className="flex aspect-4/5 items-center justify-center rounded-2xl bg-surface-2 text-ink-faint">
              <ScanFaceIcon size={64} strokeWidth={1.2} />
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="mb-8 font-display text-2xl font-bold">{t('howTitle')}</h2>
          <ol className="grid gap-x-8 gap-y-6 sm:grid-cols-3">
            {STEPS.map(({ key, Icon }) => (
              <li key={key} className="flex flex-col gap-3 border-t border-line pt-5">
                <span className="text-ink-faint">
                  <Icon size={20} />
                </span>
                <span className="font-display text-lg font-semibold">{t(`steps.${key}.title`)}</span>
                <span className="text-sm leading-relaxed text-ink-soft">{t(`steps.${key}.body`)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-8 flex max-w-2xl items-start gap-2 text-sm text-ink-soft">
            <LockIcon size={16} className="mt-0.5 shrink-0 text-ink-faint" />
            {t('privacy')}
          </p>
        </div>
      </section>

      {top.length ? (
        <section className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-2xl font-bold">{t('photographersTitle')}</h2>
              <p className="text-ink-soft">{t('photographersIntro')}</p>
            </div>
            {all.length > top.length ? (
              <Link href="/photographers" className="text-sm font-medium text-ink hover:underline">
                {t('seeAll', { count: all.length })}
              </Link>
            ) : null}
          </div>
          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {top.map((p) => (
              <li key={p.slug}>
                <PhotographerCard p={p} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
