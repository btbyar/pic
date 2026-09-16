import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui';

export default async function HomePage() {
  const t = await getTranslations('home');
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-5 py-12">
      <h1 className="text-3xl font-bold leading-tight">{t('title')}</h1>
      <p className="text-lg text-slate-600">{t('subtitle')}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/events">{t('browseEvents')}</ButtonLink>
        <ButtonLink href="/login" variant="secondary">
          {t('photographerLogin')}
        </ButtonLink>
      </div>
    </main>
  );
}
