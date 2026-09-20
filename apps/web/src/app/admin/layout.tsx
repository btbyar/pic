import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { getMe } from '@/lib/api-server';
import { homeFor } from '@/lib/routes';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/login');
  // 2FA шаардлагатай бөгөөд энэ session-д баталгаажуулаагүй бол /mfa руу чиглүүлнэ
  if (me.role !== 'ADMIN' || (me.mfa.required && !me.mfa.passed)) redirect(homeFor(me));

  const t = await getTranslations('admin');
  return (
    <AppShell
      area={t('area')}
      name={me.displayName}
      nav={[
        { href: '/admin', label: t('nav_overview'), exact: true },
        { href: '/admin/removals', label: t('nav_removals') },
        { href: '/admin/photographers', label: t('photographers') },
        { href: '/admin/orders', label: t('nav_orders') },
        { href: '/admin/payouts', label: t('nav_payouts') },
      ]}
    >
      {children}
    </AppShell>
  );
}
