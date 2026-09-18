'use client';

import { ExternalLinkIcon } from '@/components/icons';
import { BackLink } from '@/components/back-link';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { EventForm } from '@/components/event-form';
import { Alert, Button, ButtonLink, Card, Field, Input } from '@/components/ui';
import { VisibilityBadge } from '@/components/visibility-badge';
import { takeAccessLink } from '@/lib/access-link';
import { api, type ApiError, useErrorMessage } from '@/lib/api-client';
import { formatDate } from '@/lib/datetime';
import type { MyEventDetail } from '@/lib/types';

export function EventEditor({ event: initial }: { event: MyEventDetail }) {
  const t = useTranslations();
  const router = useRouter();
  const [event, setEvent] = useState(initial);
  const [accessLink, setAccessLink] = useState<string | null>(null);

  useEffect(() => {
    const link = takeAccessLink(initial.id);
    if (link) setAccessLink(link);
  }, [initial.id]);

  const apply = (updated: MyEventDetail) => {
    setEvent(updated);
    if (updated.accessLink) setAccessLink(updated.accessLink);
    router.refresh();
  };

  return (
    <>
      <BackLink href="/photographer/events">{t('photographer.myEvents')}</BackLink>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{event.title}</h1>
          <VisibilityBadge visibility={event.visibility} />
        </div>
        {event.visibility !== 'HIDDEN' || event.isOwner ? (
          <Link href={`/events/${event.slug}`} className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4" target="_blank">
            {t('photographer.viewPublic')}
            <ExternalLinkIcon size={14} />
          </Link>
        ) : null}
      </div>

      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('photographer.photos')}</h2>
          <p className="text-sm text-stone-600">{t('common.photos', { count: event.photoCount })}</p>
        </div>
        <ButtonLink href={`/photographer/events/${event.id}/upload`}>{t('photographer.uploadPhotos')}</ButtonLink>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t('eventEditor.details')}</h2>
        <EventForm
          key={event.id}
          initial={event}
          disabled={!event.isOwner}
          submitLabel={t('common.save')}
          busyLabel={t('common.saving')}
          onSubmit={async (values) => {
            const res = await api<MyEventDetail>(`/photographer/events/${event.id}`, { method: 'PATCH', body: values });
            if (!res.ok) return res.error;
            apply(res.data);
            return null;
          }}
        />
        <p className="text-sm text-stone-500">
          {t('eventEditor.retention', { date: formatDate(event.expiresAt, event.timezone), days: event.retentionDays })}
        </p>
      </Card>

      {event.isOwner && event.visibility === 'UNLISTED' ? (
        <AccessLinkCard eventId={event.id} link={accessLink} onRotated={setAccessLink} />
      ) : null}

      <PhotographersCard event={event} onChange={apply} />
      <ClockOffsetCard event={event} onChange={apply} />
      {event.isOwner ? <DeleteCard eventId={event.id} /> : null}
    </>
  );
}

function AccessLinkCard({ eventId, link, onRotated }: { eventId: string; link: string | null; onRotated: (l: string) => void }) {
  const t = useTranslations();
  const errorMessage = useErrorMessage();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('eventEditor.accessLink')}</h2>
      {error ? <Alert>{errorMessage(error)}</Alert> : null}
      {link ? (
        <>
          <Alert kind="info">{t('eventEditor.accessLinkNew')}</Alert>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={link} className="font-mono text-sm" onFocus={(e) => e.currentTarget.select()} />
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              }}
            >
              {copied ? t('common.copied') : t('common.copy')}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-stone-600">{t('eventEditor.accessLinkHidden')}</p>
      )}
      <Button
        variant="secondary"
        className="self-start"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await api<{ accessLink: string }>(`/photographer/events/${eventId}/access-link`, { method: 'POST' });
          setBusy(false);
          if (!res.ok) return setError(res.error);
          setCopied(false);
          onRotated(res.data.accessLink);
        }}
      >
        {t('eventEditor.rotateLink')}
      </Button>
    </Card>
  );
}

function PhotographersCard({ event, onChange }: { event: MyEventDetail; onChange: (e: MyEventDetail) => void }) {
  const t = useTranslations();
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    const res = await api<MyEventDetail>(`/photographer/events/${event.id}/photographers`, {
      method: 'POST',
      body: { email: new FormData(form).get('email') },
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    form.reset();
    onChange(res.data);
  }

  async function remove(userId: string) {
    setError(null);
    const res = await api<MyEventDetail>(`/photographer/events/${event.id}/photographers/${userId}`, { method: 'DELETE' });
    if (!res.ok) return setError(res.error);
    onChange(res.data);
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('eventEditor.photographers')}</h2>
      {error ? <Alert>{errorMessage(error)}</Alert> : null}
      <ul className="flex flex-col divide-y divide-stone-100">
        {event.photographers.map((p) => (
          <li key={p.userId} className="flex items-center justify-between gap-3 py-2">
            <span className="flex flex-col">
              <span className="font-medium">{p.displayName}</span>
              {p.email ? <span className="text-sm text-stone-500">{p.email}</span> : null}
            </span>
            {p.isOwner ? (
              <span className="text-sm text-stone-500">{t('photographer.owner')}</span>
            ) : event.isOwner ? (
              <ConfirmButton label={t('eventEditor.remove')} onConfirm={() => remove(p.userId)} />
            ) : null}
          </li>
        ))}
      </ul>
      {event.isOwner ? (
        <form onSubmit={invite} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label={t('eventEditor.inviteEmail')} htmlFor="inviteEmail">
              <Input id="inviteEmail" name="email" type="email" required inputMode="email" />
            </Field>
          </div>
          <Button type="submit" variant="secondary" disabled={busy}>
            {t('eventEditor.invite')}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}

function ClockOffsetCard({ event, onChange }: { event: MyEventDetail; onChange: (e: MyEventDetail) => void }) {
  const t = useTranslations();
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const value = Number(new FormData(e.currentTarget).get('clockOffsetSec'));
    const res = await api<MyEventDetail>(`/photographer/events/${event.id}/clock-offset`, {
      method: 'PUT',
      body: { clockOffsetSec: value },
    });
    if (!res.ok) return setError(res.error);
    setSaved(true);
    onChange(res.data);
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('eventEditor.clockOffset')}</h2>
      {error ? <Alert>{errorMessage(error)}</Alert> : null}
      {saved ? <Alert kind="success">{t('common.saved')}</Alert> : null}
      <form onSubmit={save} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label={t('eventEditor.seconds')} htmlFor="clockOffsetSec" hint={t('eventEditor.clockOffsetHint')}>
            <Input
              id="clockOffsetSec"
              name="clockOffsetSec"
              type="number"
              inputMode="numeric"
              step={1}
              min={-86400}
              max={86400}
              defaultValue={event.myClockOffsetSec}
            />
          </Field>
        </div>
        <Button type="submit" variant="secondary">
          {t('common.save')}
        </Button>
      </form>
    </Card>
  );
}

function DeleteCard({ eventId }: { eventId: string }) {
  const t = useTranslations();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);

  return (
    <Card className="flex flex-col gap-3 border-red-200">
      <h2 className="text-lg font-semibold text-red-700">{t('eventEditor.dangerZone')}</h2>
      <p className="text-sm text-stone-600">{t('eventEditor.deleteBody')}</p>
      {error ? <Alert>{errorMessage(error)}</Alert> : null}
      <ConfirmButton
        label={t('eventEditor.delete')}
        onConfirm={async () => {
          const res = await api(`/photographer/events/${eventId}`, { method: 'DELETE' });
          if (!res.ok) return setError(res.error);
          router.push('/photographer/events');
          router.refresh();
        }}
      />
    </Card>
  );
}

/** Устгах үйлдлийг хоёр алхамтай болгоно (browser confirm() ашиглахгүй) */
function ConfirmButton({ label, onConfirm }: { label: string; onConfirm: () => Promise<unknown> }) {
  const t = useTranslations('common');
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!armed) {
    return (
      <Button variant="secondary" className="self-start text-red-700" onClick={() => setArmed(true)}>
        {label}
      </Button>
    );
  }
  return (
    <div className="flex gap-2">
      <Button
        variant="danger"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onConfirm();
          setBusy(false);
          setArmed(false);
        }}
      >
        {t('confirm')}
      </Button>
      <Button variant="secondary" onClick={() => setArmed(false)}>
        {t('cancel')}
      </Button>
    </div>
  );
}
