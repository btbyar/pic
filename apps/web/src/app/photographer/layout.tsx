import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { PlusIcon } from '@/components/icons';
import { Alert } from '@/components/ui';
import { getMe } from '@/lib/api-server';
import { homeFor } from '@/lib/routes';

export default async function PhotographerLayout({ children }: { children: ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/login');
  if (me.role !== 'PHOTOGRAPHER' || (me.mfa.required && !me.mfa.passed)) redirect(homeFor(me));

  const t = await getTranslations();
  const approved = me.status === 'APPROVED';
  return (
    <AppShell
      area={t('photographer.area')}
      name={me.displayName}
      nav={
        approved
          ? [
              { href: '/photographer/events', label: t('photographer.myEvents') },
              { href: '/photographer/earnings', label: t('photographer.earnings') },
              { href: '/photographer/profile', label: t('photographer.profile') },
            ]
          : []
      }
      {...(approved
        ? {
            action: (
              <Link
                href="/photographer/events/new"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-on-brand transition hover:bg-brand-700"
              >
                <PlusIcon size={16} />
                {t('photographer.newEvent')}
              </Link>
            ),
          }
        : {})}
    >
      {me.status === 'PENDING' ? (
        <Alert kind="info">
          <p className="font-medium">{t('auth.pendingTitle')}</p>
          <p>{t('auth.pendingBody')}</p>
        </Alert>
      ) : (
        children
      )}
    </AppShell>
  );
}
