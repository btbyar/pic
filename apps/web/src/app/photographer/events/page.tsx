import { ArrowRightIcon } from '@/components/icons';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Alert, ButtonLink } from '@/components/ui';
import { VisibilityBadge } from '@/components/visibility-badge';
import { serverApi } from '@/lib/api-server';
import { formatEventRange } from '@/lib/datetime';
import type { MyEvent, MyProfile } from '@/lib/types';

export default async function MyEventsPage() {
  const t = await getTranslations();
  const [{ data }, { data: profile }] = await Promise.all([
    serverApi<MyEvent[]>('/photographer/events'),
    serverApi<MyProfile>('/photographer/profile'),
  ]);
  const events = data ?? [];

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('photographer.myEvents')}</h1>
        <ButtonLink href="/photographer/events/new">+ {t('photographer.newEvent')}</ButtonLink>
      </div>

      {profile && !profile.slugSaved ? (
        <Alert kind="info">
          {t('photographer.publishProfileHint')}{' '}
          <Link href="/photographer/profile" className="inline-flex items-center gap-1 font-medium underline underline-offset-4">
            {t('photographer.publishProfile')}
            <ArrowRightIcon size={14} />
          </Link>
        </Alert>
      ) : null}

      {events.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 py-16 text-center text-stone-500">
          {t('photographer.noEvents')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                href={`/photographer/events/${e.id}`}
                className="flex flex-col gap-1 rounded-2xl border border-stone-200 bg-white p-4 transition hover:border-stone-400 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">{e.title}</span>
                  <span className="text-sm text-stone-600">{formatEventRange(e.startsAt, e.endsAt, e.timezone)}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-stone-600">
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
