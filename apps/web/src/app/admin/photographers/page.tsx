import { USER_STATUSES, type UserStatus } from '@pic/shared';
import { getTranslations } from 'next-intl/server';
import { Avatar } from '@/components/avatar';
import { UsersIcon } from '@/components/icons';
import { EmptyState, FilterTabs, PageHeader } from '@/components/ui';
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
      <PageHeader kicker={t('photographersKicker')} title={t('photographers')} />
      <FilterTabs
        label={t('photographers')}
        items={USER_STATUSES.map((s) => ({ href: `/admin/photographers?status=${s}`, label: t(`status_${s}`), active: s === status }))}
      />

      {photographers.length === 0 ? (
        <EmptyState icon={<UsersIcon size={28} />} title={t('empty')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {photographers.map((p, i) => (
            <li
              key={p.id}
              style={{ '--i': Math.min(i, 10) } as React.CSSProperties}
              className="panel flex animate-rise flex-col gap-4 p-4 stagger sm:flex-row sm:items-center sm:justify-between sm:p-5"
            >
              <div className="flex min-w-0 items-start gap-4">
                <Avatar url={null} name={p.displayName} size={44} />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate font-display text-2xl font-semibold leading-tight">{p.displayName}</span>
                  <span className="flex flex-wrap gap-x-3 text-sm text-mist">
                    <span className="truncate">{p.email}</span>
                    {p.phone ? <span className="font-mono text-xs leading-5">{p.phone}</span> : null}
                  </span>
                  <span className="font-mono text-[11px] text-dim">
                    {t('registeredAt')} {formatDate(p.createdAt)}
                    {p.revenueSharePct !== null ? ` · ${t('share', { pct: p.revenueSharePct })}` : ''}
                  </span>
                  {p.rejectionReason || p.suspendReason ? (
                    <span className="mt-1 border-l-2 border-ember/60 pl-3 text-sm text-[#ffc2b4]">
                      {t('reasonShown', { reason: p.suspendReason ?? p.rejectionReason ?? '' })}
                    </span>
                  ) : null}
                </div>
              </div>
              <PhotographerActions id={p.id} name={p.displayName} status={p.status} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
