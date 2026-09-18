import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppHeader } from '@/components/app-header';
import { Alert } from '@/components/ui';
import { getMe } from '@/lib/api-server';
import { homeFor } from '@/lib/routes';

export default async function PhotographerLayout({ children }: { children: ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/login');
  if (me.role !== 'PHOTOGRAPHER' || (me.mfa.required && !me.mfa.passed)) redirect(homeFor(me));

  const t = await getTranslations();
  return (
    <div className="min-h-dvh bg-slate-50">
      <AppHeader
        area={t('photographer.area')}
        name={me.displayName}
        nav={
          me.status === 'APPROVED' ? (
            <nav className="flex gap-4 text-sm font-medium">
              <Link href="/photographer/events">{t('photographer.myEvents')}</Link>
              <Link href="/photographer/earnings">{t('photographer.earnings')}</Link>
            </nav>
          ) : null
        }
      />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
        {me.status === 'PENDING' ? (
          <Alert kind="info">
            <p className="font-medium">{t('auth.pendingTitle')}</p>
            <p>{t('auth.pendingBody')}</p>
          </Alert>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
