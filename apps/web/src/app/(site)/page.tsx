import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Avatar } from '@/components/avatar';
import { serverApi } from '@/lib/api-server';
import type { HomeStats, PhotographerCard } from '@/lib/types';

const number = (n: number) => new Intl.NumberFormat('en-US').format(n).replace(/,/g, ' ');

const STEPS = ['find', 'selfie', 'download'] as const;
const STEP_ICONS: Record<(typeof STEPS)[number], string> = { find: '📷', selfie: '🤳', download: '⬇️' };

export default async function HomePage() {
  const t = await getTranslations('home');
  const [{ data: stats }, { data: photographers }] = await Promise.all([
    serverApi<HomeStats>('/stats'),
    serverApi<PhotographerCard[]>('/photographers'),
  ]);
  const top = (photographers ?? []).slice(0, 6);

  return (
    <main>
      {/* Hero: гол үйлдэл — зурагчнаа хайх */}
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-12 pt-10 sm:pt-16">
          <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">{t('title')}</h1>
          <p className="max-w-xl text-lg text-slate-600">{t('subtitle')}</p>
          <form action="/photographers" className="flex max-w-xl gap-2 rounded-2xl bg-white p-2 shadow-lg shadow-brand-900/5 ring-1 ring-slate-200">
            <input
              name="q"
              type="search"
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              className="min-w-0 flex-1 rounded-xl px-3 text-base outline-none"
            />
            <button type="submit" className="min-h-11 shrink-0 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">
              {t('searchButton')}
            </button>
          </form>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link href="/photographers" className="font-medium text-brand-700 underline-offset-4 hover:underline">
              {t('allPhotographers')} →
            </Link>
            <Link href="/my/orders" className="text-slate-600 underline-offset-4 hover:underline">
              {t('myOrders')}
            </Link>
          </div>
        </div>
      </section>

      {/* Хэрхэн ажилладаг вэ */}
      <section className="mx-auto max-w-5xl px-4 py-10">
        <h2 className="mb-5 text-xl font-bold">{t('howTitle')}</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xl" aria-hidden>
                {STEP_ICONS[step]}
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-brand-700">{t('step', { n: i + 1 })}</span>
                <span className="font-semibold">{t(`steps.${step}.title`)}</span>
                <span className="text-sm text-slate-600">{t(`steps.${step}.body`)}</span>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 flex items-start gap-2 text-sm text-slate-600">
          <span aria-hidden>🔒</span>
          {t('privacy')}
        </p>
      </section>

      {top.length ? (
        <section className="mx-auto max-w-5xl px-4 py-6">
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <h2 className="text-xl font-bold">{t('photographersTitle')}</h2>
            <Link href="/photographers" className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
              {t('seeAll')} →
            </Link>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {top.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/photographers/${p.slug}`}
                  className="flex h-full flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-center transition hover:border-brand-300 hover:shadow-sm"
                >
                  <Avatar url={p.avatarUrl} name={p.displayName} size={64} />
                  <span className="font-semibold leading-tight">{p.displayName}</span>
                  <span className="text-xs text-slate-500">
                    {[p.city, t('events', { count: p.eventCount })].filter(Boolean).join(' · ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {stats && stats.photos > 0 ? (
        <section className="mx-auto max-w-5xl px-4 py-6">
          <dl className="grid grid-cols-3 gap-3 rounded-2xl bg-slate-900 px-4 py-6 text-center text-white">
            {(['events', 'photos', 'photographers'] as const).map((k) => (
              <div key={k} className="flex flex-col">
                <dt className="order-2 text-sm text-slate-300">{t(`stats.${k}`)}</dt>
                <dd className="text-2xl font-bold tabular-nums sm:text-3xl">{number(stats[k])}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </main>
  );
}
