import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Avatar } from '@/components/avatar';
import { Button, Input } from '@/components/ui';
import { serverApi } from '@/lib/api-server';
import type { PhotographerCard } from '@/lib/types';

/** Оролцогчийн орох цэг: зурагчнаа сонгоод профайлаас нь эвэнтээ нээнэ */
export default async function PhotographersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q: raw } = await searchParams;
  const q = raw?.trim().slice(0, 100) ?? '';
  const t = await getTranslations('photographers');
  const { data } = await serverApi<PhotographerCard[]>(`/photographers${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const photographers = data ?? [];

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-slate-600">{t('intro')}</p>
      </div>
      <form className="flex gap-2" action="/photographers">
        <Input name="q" type="search" defaultValue={q} placeholder={t('searchPlaceholder')} aria-label={t('searchPlaceholder')} />
        <Button type="submit" variant="secondary">
          {t('search')}
        </Button>
      </form>
      {photographers.length === 0 ? (
        <p className="py-16 text-center text-slate-500">{q ? t('emptySearch', { q }) : t('empty')}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photographers.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/photographers/${p.slug}`}
                className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-brand-300 hover:shadow-sm"
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
