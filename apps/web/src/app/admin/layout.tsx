import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppHeader } from '@/components/app-header';
import { getMe } from '@/lib/api-server';
import { homeFor } from '@/lib/routes';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/login');
  // 2FA шаардлагатай бөгөөд энэ session-д баталгаажуулаагүй бол /mfa руу чиглүүлнэ
  if (me.role !== 'ADMIN' || (me.mfa.required && !me.mfa.passed)) redirect(homeFor(me));

  const t = await getTranslations('admin');
  return (
    <div className="min-h-dvh bg-slate-50">
      <AppHeader
        area={t('area')}
        name={me.displayName}
        nav={
          <Link href="/admin/photographers" className="text-sm font-medium">
            {t('photographers')}
          </Link>
        }
      />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">{children}</main>
    </div>
  );
}
