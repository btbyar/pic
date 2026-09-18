import { REMOVAL_STATUSES, type RemovalStatus } from '@pic/shared';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Badge, Card } from '@/components/ui';
import { getMe, serverApi } from '@/lib/api-server';
import { formatDate } from '@/lib/datetime';
import type { AdminRemovalPage } from '@/lib/types';
import { RemovalActions } from './removal-actions';

const TABS: RemovalStatus[] = ['NEW', 'RESOLVED', 'REJECTED'];

export default async function AdminRemovalsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status: raw } = await searchParams;
  const status: RemovalStatus = REMOVAL_STATUSES.includes(raw as RemovalStatus) ? (raw as RemovalStatus) : 'NEW';
  const t = await getTranslations('admin');
  const [{ data }, me] = await Promise.all([serverApi<AdminRemovalPage>(`/admin/removal-requests?status=${status}`), getMe()]);
  const items = data?.items ?? [];

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t('removals.title')}</h1>
        <p className="text-sm text-slate-600">{t('removals.intro')}</p>
      </div>
      <nav className="flex flex-wrap gap-2">
        {TABS.map((s) => (
          <Link
            key={s}
            href={`/admin/removals?status=${s}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              s === status ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'
            }`}
          >
            {t(`removals.status_${s}`)}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="py-16 text-center text-slate-500">{t('removals.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((r) => (
            <li key={r.id}>
              <Card className="flex flex-col gap-4 sm:flex-row">
                <div className="sm:w-56 sm:shrink-0">
                  {r.photo?.previewUrl ? (
                    <a href={r.photo.previewUrl} target="_blank" rel="noreferrer">
                      <img src={r.photo.previewUrl} alt="" className="aspect-[4/3] w-full rounded-lg bg-slate-200 object-cover" />
                    </a>
                  ) : (
                    <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500">
                      {t('removals.photoGone')}
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={r.reason.startsWith('ME_IN_PHOTO') ? 'amber' : 'slate'}>
                      {t(`removals.reason_${r.reason.split(':')[0]}`)}
                    </Badge>
                    {r.photo?.hidden ? <Badge tone="red">{t('removals.hidden')}</Badge> : null}
                    <span className="text-sm text-slate-500">{formatDate(r.createdAt)}</span>
                  </div>
                  {r.reason.includes(':') ? <p className="whitespace-pre-line text-sm">{r.reason.slice(r.reason.indexOf(':') + 1).trim()}</p> : null}
                  {r.photo ? <p className="text-sm text-slate-600">{t('removals.event', { title: r.photo.eventTitle })}</p> : null}
                  {r.contact ? <p className="text-sm text-slate-600">{t('removals.contact', { contact: r.contact })}</p> : null}
                  {r.resolution ? <p className="text-sm text-slate-600">{t('removals.resolution', { resolution: r.resolution })}</p> : null}
                  {status === 'NEW' ? <RemovalActions id={r.id} hasPhoto={r.photo !== null} askTotp={Boolean(me?.mfa.enabled)} /> : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
