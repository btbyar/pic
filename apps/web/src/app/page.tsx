import Link from 'next/link';
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
        <ButtonLink href="/my/orders" variant="secondary">
          {t('myOrders')}
        </ButtonLink>
      </div>
      <Link href="/login" className="self-start text-sm text-slate-600 underline underline-offset-4">
        {t('photographerLogin')}
      </Link>
    </main>
  );
}
