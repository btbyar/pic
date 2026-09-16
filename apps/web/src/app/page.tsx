import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function HomePage() {
  const t = await getTranslations('home');
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-5 py-12">
      <h1 className="text-3xl font-bold leading-tight">{t('title')}</h1>
      <p className="text-lg text-slate-600">{t('subtitle')}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/events" className="rounded-xl bg-slate-900 px-5 py-3 text-center font-medium text-white">
          {t('browseEvents')}
        </Link>
        <Link href="/login" className="rounded-xl border border-slate-300 px-5 py-3 text-center font-medium">
          {t('photographerLogin')}
        </Link>
      </div>
    </main>
  );
}
