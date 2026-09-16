import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui';
import { VisibilityBadge } from '@/components/visibility-badge';
import { serverApi } from '@/lib/api-server';
import { formatEventRange } from '@/lib/datetime';
import type { MyEvent } from '@/lib/types';

export default async function MyEventsPage() {
  const t = await getTranslations();
  const { data } = await serverApi<MyEvent[]>('/photographer/events');
  const events = data ?? [];

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('photographer.myEvents')}</h1>
        <ButtonLink href="/photographer/events/new">+ {t('photographer.newEvent')}</ButtonLink>
      </div>

      {events.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-slate-500">
          {t('photographer.noEvents')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                href={`/photographer/events/${e.id}`}
                className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-400 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">{e.title}</span>
                  <span className="text-sm text-slate-600">{formatEventRange(e.startsAt, e.endsAt, e.timezone)}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <span>{t('common.photos', { count: e.photoCount })}</span>
                  <span>{e.isOwner ? t('photographer.owner') : t('photographer.member')}</span>
                  <VisibilityBadge visibility={e.visibility} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
