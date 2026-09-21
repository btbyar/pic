import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { HomeIcon, ImagesIcon, PlusIcon, UserIcon, WalletIcon } from '@/components/icons';
import { Alert, ButtonLink } from '@/components/ui';
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
              { href: '/photographer', label: t('photographer.overview'), exact: true, icon: <HomeIcon size={20} /> },
              { href: '/photographer/events', label: t('photographer.myEvents'), icon: <ImagesIcon size={20} /> },
              { href: '/photographer/earnings', label: t('photographer.earnings'), icon: <WalletIcon size={20} /> },
              { href: '/photographer/profile', label: t('photographer.profile'), icon: <UserIcon size={20} /> },
            ]
          : []
      }
      {...(approved
        ? {
            action: (
              <ButtonLink href="/photographer/events/new" className="w-full gap-2">
                <PlusIcon size={16} />
                {t('photographer.newEvent')}
              </ButtonLink>
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
