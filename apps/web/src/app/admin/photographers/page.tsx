import { USER_STATUSES, type UserStatus } from '@pic/shared';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui';
import { serverApi } from '@/lib/api-server';
import { formatDate } from '@/lib/datetime';
import type { AdminPhotographer } from '@/lib/types';
import { PhotographerActions } from './photographer-actions';

export default async function AdminPhotographersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status: raw } = await searchParams;
  const status: UserStatus = USER_STATUSES.includes(raw as UserStatus) ? (raw as UserStatus) : 'PENDING';
  const t = await getTranslations('admin');
  const { data } = await serverApi<AdminPhotographer[]>(`/admin/photographers?status=${status}`);
  const photographers = data ?? [];

  return (
    <>
      <h1 className="text-2xl font-bold">{t('photographers')}</h1>
      <nav className="flex flex-wrap gap-2">
        {USER_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/photographers?status=${s}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              s === status ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white text-stone-700'
            }`}
          >
            {t(`status_${s}`)}
          </Link>
        ))}
      </nav>

      {photographers.length === 0 ? (
        <p className="py-16 text-center text-stone-500">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {photographers.map((p) => (
            <li key={p.id}>
              <Card className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold">{p.displayName}</span>
                  <span className="text-sm text-stone-600">{p.email}</span>
                  {p.phone ? <span className="text-sm text-stone-600">{p.phone}</span> : null}
                  <span className="text-sm text-stone-500">
                    {t('registeredAt')}: {formatDate(p.createdAt)}
                    {p.revenueSharePct !== null ? ` · ${t('share', { pct: p.revenueSharePct })}` : ''}
                  </span>
                  {p.rejectionReason || p.suspendReason ? (
                    <span className="text-sm text-red-700">
                      {t('reasonShown', { reason: p.suspendReason ?? p.rejectionReason ?? '' })}
                    </span>
                  ) : null}
                </div>
                <PhotographerActions id={p.id} status={p.status} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
