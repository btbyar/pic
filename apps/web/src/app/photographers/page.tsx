import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Avatar } from '@/components/avatar';
import { serverApi } from '@/lib/api-server';
import type { PhotographerCard } from '@/lib/types';

export default async function PhotographersPage() {
  const t = await getTranslations('photographers');
  const { data } = await serverApi<PhotographerCard[]>('/photographers');
  const photographers = data ?? [];

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8">
      <Link href="/" className="text-sm text-slate-600 underline-offset-4 hover:underline">
        ← {t('home')}
      </Link>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      {photographers.length === 0 ? (
        <p className="py-16 text-center text-slate-500">{t('empty')}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photographers.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/photographers/${p.slug}`}
                className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-400"
              >
                <Avatar url={p.avatarUrl} name={p.displayName} />
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold">{p.displayName}</span>
                  {p.city ? <span className="text-sm text-slate-600">{p.city}</span> : null}
                  <span className="text-sm text-slate-500">{t('events', { count: p.eventCount })}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
