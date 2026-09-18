import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui';
import { serverApi } from '@/lib/api-server';
import type { HomeStats } from '@/lib/types';

const number = (n: number) => new Intl.NumberFormat('en-US').format(n).replace(/,/g, ' ');

export default async function HomePage() {
  const t = await getTranslations('home');
  const { data: stats } = await serverApi<HomeStats>('/stats');
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-5 py-12">
      <h1 className="text-3xl font-bold leading-tight">{t('title')}</h1>
      <p className="text-lg text-slate-600">{t('subtitle')}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/photographers">{t('browsePhotographers')}</ButtonLink>
        <ButtonLink href="/my/orders" variant="secondary">
          {t('myOrders')}
        </ButtonLink>
      </div>
      {stats && stats.photos > 0 ? (
        <dl className="grid grid-cols-3 gap-3 border-y border-slate-200 py-4 text-center">
          {(['events', 'photos', 'photographers'] as const).map((k) => (
            <div key={k} className="flex flex-col">
              <dt className="order-2 text-sm text-slate-600">{t(`stats.${k}`)}</dt>
              <dd className="text-2xl font-bold tabular-nums">{number(stats[k])}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
        <Link href="/login" className="underline underline-offset-4">
          {t('photographerLogin')}
        </Link>
      </div>
    </main>
  );
}
