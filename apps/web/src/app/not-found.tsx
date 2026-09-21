import { SearchIcon } from '@/components/icons';
import { ButtonLink } from '@/components/ui';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('notFound');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 text-ink-soft">
        <SearchIcon size={32} />
      </span>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-ink-soft">{t('body')}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <ButtonLink href="/photographers">{t('photographers')}</ButtonLink>
        <ButtonLink href="/" variant="secondary">
          {t('home')}
        </ButtonLink>
      </div>
    </main>
  );
}
