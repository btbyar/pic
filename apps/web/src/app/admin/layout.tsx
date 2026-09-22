import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { AlertIcon, HomeIcon, TicketIcon, UsersIcon, WalletIcon } from '@/components/icons';
import { getMe, serverApi } from '@/lib/api-server';
import { homeFor } from '@/lib/routes';
import type { AdminOverview } from '@/lib/types';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/login');
  // 2FA шаардлагатай бөгөөд энэ session-д баталгаажуулаагүй бол /mfa руу чиглүүлнэ
  if (me.role !== 'ADMIN' || (me.mfa.required && !me.mfa.passed)) redirect(homeFor(me));

  const [t, { data: overview }] = await Promise.all([getTranslations('admin'), serverApi<AdminOverview>('/admin/overview')]);
  return (
    <AppShell
      area={t('area')}
      name={me.displayName}
      nav={[
        { href: '/admin', label: t('nav_overview'), exact: true, icon: <HomeIcon size={20} /> },
        { href: '/admin/removals', label: t('nav_removals'), icon: <AlertIcon size={20} />, count: overview?.newRemovals ?? 0 },
        { href: '/admin/photographers', label: t('photographers'), icon: <UsersIcon size={20} />, count: overview?.pendingPhotographers ?? 0 },
        { href: '/admin/orders', label: t('nav_orders'), icon: <TicketIcon size={20} /> },
        { href: '/admin/payouts', label: t('nav_payouts'), icon: <WalletIcon size={20} /> },
      ]}
    >
      {children}
    </AppShell>
  );
}
