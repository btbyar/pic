import { REMOVAL_STATUSES, type RemovalStatus } from '@pic/shared';
import { getTranslations } from 'next-intl/server';
import { CheckIcon, ImagesIcon } from '@/components/icons';
import { Badge, EmptyState, FilterTabs, PageHeader } from '@/components/ui';
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
      <PageHeader kicker={t('removals.kicker')} title={t('removals.title')} intro={<p>{t('removals.intro')}</p>} />
      <FilterTabs
        label={t('removals.title')}
        items={TABS.map((s) => ({ href: `/admin/removals?status=${s}`, label: t(`removals.status_${s}`), active: s === status }))}
      />

      {items.length === 0 ? (
        <EmptyState icon={<CheckIcon size={28} />} title={t('removals.empty')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((r, i) => {
            const [reasonCode] = r.reason.split(':');
            const note = r.reason.includes(':') ? r.reason.slice(r.reason.indexOf(':') + 1).trim() : null;
            return (
              <li key={r.id} style={{ '--i': Math.min(i, 10) } as React.CSSProperties} className="panel flex animate-rise flex-col gap-5 p-4 stagger sm:flex-row sm:p-5">
                <div className="sm:w-60 sm:shrink-0">
                  {r.photo?.previewUrl ? (
                    <a href={r.photo.previewUrl} target="_blank" rel="noreferrer" className="relative block overflow-hidden rounded-xl">
                      <img src={r.photo.previewUrl} alt="" className={`aspect-4/3 w-full bg-night-3 object-cover ${r.photo.hidden ? 'opacity-40 grayscale' : ''}`} />
                      {r.photo.hidden ? (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <Badge tone="red">{t('removals.hidden')}</Badge>
                        </span>
                      ) : null}
                    </a>
                  ) : (
                    <div className="flex aspect-4/3 w-full flex-col items-center justify-center gap-2 rounded-xl bg-night-3 text-sm text-dim">
                      <ImagesIcon size={22} />
                      {t('removals.photoGone')}
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={reasonCode === 'ME_IN_PHOTO' ? 'amber' : 'slate'}>{t(`removals.reason_${reasonCode}`)}</Badge>
                    <span className="font-mono text-[11px] text-dim">{formatDate(r.createdAt)}</span>
                  </div>
                  {r.photo ? <p className="font-display text-2xl font-semibold leading-tight">{r.photo.eventTitle}</p> : null}
                  {note ? <blockquote className="whitespace-pre-line border-l-2 border-gold/60 pl-3 text-[15px] text-ivory">{note}</blockquote> : null}
                  <div className="flex flex-col gap-1 text-sm text-mist">
                    {r.contact ? <p>{t('removals.contact', { contact: r.contact })}</p> : null}
                    {r.resolution ? <p>{t('removals.resolution', { resolution: r.resolution })}</p> : null}
                  </div>
                  {status === 'NEW' ? (
                    <div className="mt-auto pt-1">
                      <RemovalActions id={r.id} hasPhoto={r.photo !== null} askTotp={Boolean(me?.mfa.enabled)} />
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
