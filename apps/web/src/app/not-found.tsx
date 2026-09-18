import { SearchIcon } from '@/components/icons';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('notFound');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
        <SearchIcon size={32} />
      </span>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-stone-600">{t('body')}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/photographers" className="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">
          {t('photographers')}
        </Link>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-xl border border-stone-300 px-5 text-sm font-medium">
          {t('home')}
        </Link>
      </div>
    </main>
  );
}
