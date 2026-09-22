'use client';

import { REMOVAL_REASONS, type RemovalReason } from '@pic/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { api, useErrorMessage } from '@/lib/api-client';
import { Alert, Button, Field, Input, Textarea } from './ui';

/** Зураг бүр дээрх "Устгуулах хүсэлт" — нэвтрэлтгүй */
export function RemovalDialog({ photoId, onClose }: { photoId: string; onClose: () => void }) {
  const t = useTranslations('removal');
  const errorMessage = useErrorMessage();
  const [reason, setReason] = useState<RemovalReason>('ME_IN_PHOTO');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await api(`/photos/${photoId}/removal-requests`, {
      method: 'POST',
      body: {
        reason,
        message: String(form.get('message') ?? '').trim() || undefined,
        contact: String(form.get('contact') ?? '').trim() || undefined,
      },
    });
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(errorMessage(res.error));
  }

  return (
    <div
      className="fixed inset-0 z-60 flex animate-fade items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="removal-title"
        className="panel flex max-h-[90dvh] w-full max-w-md animate-rise flex-col gap-5 overflow-y-auto rounded-b-none p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-ivory sm:rounded-b-[1.25rem] sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="removal-title" className="font-display text-3xl font-semibold leading-tight">
          {t('title')}
        </h2>
        {done ? (
          <>
            <Alert kind="success">{t('sent')}</Alert>
            <Button onClick={onClose}>{t('close')}</Button>
          </>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <p className="text-sm leading-relaxed text-mist">{t('intro')}</p>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">{t('reason')}</legend>
              {REMOVAL_REASONS.map((r) => (
                <label key={r} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-4 ring-1 ring-inset ring-line transition has-[:checked]:bg-gold/[0.07] has-[:checked]:ring-gold/60">
                  <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="size-4 accent-gold" />
                  <span className="text-sm">{t(`reasons.${r}`)}</span>
                </label>
              ))}
            </fieldset>
            <Field label={t('message')} htmlFor="removal-message">
              <Textarea id="removal-message" name="message" rows={3} maxLength={1000} />
            </Field>
            <Field label={t('contact')} hint={t('contactHint')} htmlFor="removal-contact">
              <Input id="removal-contact" name="contact" maxLength={200} autoComplete="email" />
            </Field>
            {error ? <Alert>{error}</Alert> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={onClose}>
                {t('cancel')}
              </Button>
              <Button type="submit" busy={busy}>
                {busy ? t('sending') : t('send')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
