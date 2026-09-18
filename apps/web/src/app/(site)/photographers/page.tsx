import { getTranslations } from 'next-intl/server';
import { SearchIcon } from '@/components/icons';
import { PhotographerCard } from '@/components/photographer-card';
import { serverApi } from '@/lib/api-server';
import type { PhotographerCard as Card } from '@/lib/types';

/** Оролцогчийн орох цэг: зурагчнаа сонгоод профайлаас нь эвэнтээ нээнэ */
export default async function PhotographersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q: raw } = await searchParams;
  const q = raw?.trim().slice(0, 100) ?? '';
  const t = await getTranslations('photographers');
  const { data } = await serverApi<Card[]>(`/photographers${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const photographers = data ?? [];

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('title')}</h1>
        <p className="max-w-xl text-stone-600">{t('intro')}</p>
        <form
          action="/photographers"
          className="mt-3 flex w-full max-w-lg items-center gap-2 rounded-2xl bg-white p-2 shadow-lg shadow-stone-900/[0.05] ring-1 ring-stone-200"
        >
          <SearchIcon size={20} className="ml-2 shrink-0 text-stone-400" />
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-stone-400"
          />
          <button type="submit" className="min-h-11 shrink-0 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white transition hover:bg-brand-700">
            {t('search')}
          </button>
        </form>
      </div>
      {photographers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 py-16 text-center text-stone-500">
          {q ? t('emptySearch', { q }) : t('empty')}
        </p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {photographers.map((p) => (
            <li key={p.slug}>
              <PhotographerCard p={p} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
