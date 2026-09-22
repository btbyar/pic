'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { AlertIcon } from '@/components/icons';
import { Button, ButtonLink, EmptyState } from '@/components/ui';

/** Сервер эсвэл сүлжээний алдаа: мухардал биш — дахин оролдох товчтой */
export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errorPage');
  useEffect(() => console.error(error), [error]);
  return (
    <main className="mx-auto max-w-3xl px-5 pt-36">
      <EmptyState
        icon={<AlertIcon size={28} />}
        title={t('title')}
        body={t('body')}
        action={
          <>
            <Button onClick={reset}>{t('retry')}</Button>
            <ButtonLink href="/" variant="secondary">
              {t('home')}
            </ButtonLink>
          </>
        }
      />
    </main>
  );
}
