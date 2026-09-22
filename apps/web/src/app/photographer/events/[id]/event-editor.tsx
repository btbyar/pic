'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { BackLink } from '@/components/back-link';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EventForm } from '@/components/event-form';
import { ClockIcon, ExternalLinkIcon, ImagesIcon, LinkIcon, QrIcon, UploadIcon, UsersIcon, XIcon } from '@/components/icons';
import { Alert, Button, ButtonLink, Card, Field, Input } from '@/components/ui';
import { VisibilityBadge } from '@/components/visibility-badge';
import { takeAccessLink } from '@/lib/access-link';
import { api, type ApiError, useErrorMessage } from '@/lib/api-client';
import { formatDate, formatEventRange } from '@/lib/datetime';
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

      {/* Эвэнтийн дэлгэц: нүүр зураг, нэр, төлөв, гол үйлдэл */}
      <header className="panel relative isolate flex min-h-64 animate-rise flex-col justify-end overflow-hidden">
        {event.coverUrl ? (
          <img src={event.coverUrl} alt="" className="absolute inset-0 -z-20 h-full w-full animate-kenburns object-cover opacity-55" />
        ) : (
          <div aria-hidden className="absolute -right-10 -top-24 -z-20 size-96 animate-drift rounded-full bg-gold/10 blur-3xl" />
        )}
        <div aria-hidden className="scrim absolute inset-0 -z-10" />
        <div className="flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <VisibilityBadge visibility={event.visibility} />
              <span className="font-mono text-[11px] text-mist">{formatEventRange(event.startsAt, event.endsAt, event.timezone)}</span>
            </div>
            <h1 className="break-words font-display text-[clamp(2.25rem,5vw,3.75rem)] font-semibold leading-[0.92] tracking-[-0.03em]">{event.title}</h1>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mist">
              <span className="inline-flex items-center gap-1.5">
                <ImagesIcon size={15} className="text-gold" />
                {t('common.photos', { count: event.photoCount })}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon size={15} className="text-gold" />
                {t('eventEditor.retention', { date: formatDate(event.expiresAt, event.timezone), days: event.retentionDays })}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <ButtonLink href={`/photographer/events/${event.id}/upload`} className="gap-2">
              <UploadIcon size={18} />
              {t('photographer.uploadPhotos')}
            </ButtonLink>
            {event.visibility !== 'HIDDEN' || event.isOwner ? (
              <Link href={`/events/${event.slug}`} target="_blank" className="glass inline-flex min-h-12 items-center gap-2 rounded-[10px] px-4 text-sm font-semibold transition hover:bg-white/10">
                {t('photographer.viewPublic')}
                <ExternalLinkIcon size={15} />
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="animate-rise stagger [--i:2]">
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
        </Card>

        <div className="flex animate-rise flex-col gap-4 stagger [--i:3] lg:sticky lg:top-8">
          <Tool icon={<QrIcon size={18} />} title={t('eventEditor.poster')}>
            <p className="text-sm text-mist">{t('eventEditor.posterBody')}</p>
            <ButtonLink href={`/photographer/events/${event.id}/poster`} variant="secondary" className="gap-2">
              <QrIcon size={16} />
              {t('poster.open')}
            </ButtonLink>
          </Tool>

          {event.isOwner && event.visibility === 'UNLISTED' ? (
            <AccessLinkCard eventId={event.id} link={accessLink} onRotated={setAccessLink} />
          ) : null}
          <PhotographersCard event={event} onChange={apply} />
          <ClockOffsetCard event={event} onChange={apply} />
          {event.isOwner ? <DeleteCard eventId={event.id} title={event.title} /> : null}
        </div>
      </div>
    </>
  );
}

/** Баруун талын хэрэгслийн хавтан */
function Tool({ icon, title, children, tone = 'default' }: { icon: ReactNode; title: string; children: ReactNode; tone?: 'default' | 'danger' }) {
  return (
    <section className={`panel flex flex-col gap-3 p-5 ${tone === 'danger' ? 'ring-1 ring-inset ring-ember/25' : ''}`}>
      <h2 className="flex items-center gap-2.5 font-display text-2xl font-semibold leading-none">
        <span className={tone === 'danger' ? 'text-ember' : 'text-gold'}>{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function AccessLinkCard({ eventId, link, onRotated }: { eventId: string; link: string | null; onRotated: (l: string) => void }) {
  const t = useTranslations();
  const errorMessage = useErrorMessage();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  return (
    <Tool icon={<LinkIcon size={18} />} title={t('eventEditor.accessLink')}>
      {error ? <Alert>{errorMessage(error)}</Alert> : null}
      {link ? (
        <>
          <Alert kind="info">{t('eventEditor.accessLinkNew')}</Alert>
          <Input readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            }}
          >
            {copied ? t('common.copied') : t('common.copy')}
          </Button>
        </>
      ) : (
        <p className="text-sm text-mist">{t('eventEditor.accessLinkHidden')}</p>
      )}
      <Button
        variant="ghost"
        className="self-start px-0 text-gold hover:bg-transparent hover:text-gold-soft"
        busy={busy}
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
    </Tool>
  );
}

function PhotographersCard({ event, onChange }: { event: MyEventDetail; onChange: (e: MyEventDetail) => void }) {
  const t = useTranslations();
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<{ userId: string; name: string } | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

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

  async function remove() {
    if (!removing) return;
    setBusy(true);
    setRemoveError(null);
    const res = await api<MyEventDetail>(`/photographer/events/${event.id}/photographers/${removing.userId}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) return setRemoveError(errorMessage(res.error));
    setRemoving(null);
    onChange(res.data);
  }

  return (
    <Tool icon={<UsersIcon size={18} />} title={t('eventEditor.photographers')}>
      {error ? <Alert>{errorMessage(error)}</Alert> : null}
      <ul className="flex flex-col">
        {event.photographers.map((p) => (
          <li key={p.userId} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
            <Avatar url={null} name={p.displayName} size={32} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold">{p.displayName}</span>
              {p.email ? <span className="truncate text-xs text-dim">{p.email}</span> : null}
            </span>
            {p.isOwner ? (
              <span className="kicker text-gold">{t('photographer.owner')}</span>
            ) : event.isOwner ? (
              <button
                type="button"
                onClick={() => setRemoving({ userId: p.userId, name: p.displayName })}
                aria-label={`${t('eventEditor.remove')}: ${p.displayName}`}
                className="flex size-11 cursor-pointer items-center justify-center rounded-full text-mist transition hover:bg-ember/10 hover:text-ember"
              >
                <XIcon size={18} />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {event.isOwner ? (
        <form onSubmit={invite} className="flex flex-col gap-2">
          <Field label={t('eventEditor.inviteEmail')} htmlFor="inviteEmail">
            <Input id="inviteEmail" name="email" type="email" required inputMode="email" />
          </Field>
          <Button type="submit" variant="secondary" busy={busy && !removing}>
            {t('eventEditor.invite')}
          </Button>
        </form>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={t('eventEditor.removeTitle', { name: removing?.name ?? '' })}
        body={t('eventEditor.removeBody')}
        confirmLabel={t('eventEditor.remove')}
        tone="danger"
        busy={busy}
        error={removeError}
        onConfirm={() => void remove()}
        onClose={() => {
          setRemoving(null);
          setRemoveError(null);
        }}
      />
    </Tool>
  );
}

function ClockOffsetCard({ event, onChange }: { event: MyEventDetail; onChange: (e: MyEventDetail) => void }) {
  const t = useTranslations();
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    const value = Number(new FormData(e.currentTarget).get('clockOffsetSec'));
    const res = await api<MyEventDetail>(`/photographer/events/${event.id}/clock-offset`, {
      method: 'PUT',
      body: { clockOffsetSec: value },
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setSaved(true);
    onChange(res.data);
  }

  return (
    <Tool icon={<ClockIcon size={18} />} title={t('eventEditor.clockOffset')}>
      {error ? <Alert>{errorMessage(error)}</Alert> : null}
      {saved ? <Alert kind="success">{t('common.saved')}</Alert> : null}
      <form onSubmit={save} className="flex flex-col gap-2">
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
            className="font-mono tabular-nums"
          />
        </Field>
        <Button type="submit" variant="secondary" busy={busy}>
          {t('common.save')}
        </Button>
      </form>
    </Tool>
  );
}

function DeleteCard({ eventId, title }: { eventId: string; title: string }) {
  const t = useTranslations();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await api(`/photographer/events/${eventId}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) return setError(errorMessage(res.error));
    router.push('/photographer/events');
    router.refresh();
  }

  return (
    <Tool icon={<XIcon size={18} />} title={t('eventEditor.dangerZone')} tone="danger">
      <p className="text-sm text-mist">{t('eventEditor.deleteBody')}</p>
      <Button variant="secondary" className="text-ember" onClick={() => setOpen(true)}>
        {t('eventEditor.delete')}
      </Button>
      <ConfirmDialog
        open={open}
        title={t('eventEditor.deleteTitle', { title })}
        body={t('eventEditor.deleteBody')}
        confirmLabel={t('eventEditor.delete')}
        tone="danger"
        busy={busy}
        error={error}
        onConfirm={() => void remove()}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
      />
    </Tool>
  );
}
