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
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="removal-title"
        className="flex max-h-[90dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-2xl bg-white p-5 text-slate-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="removal-title" className="text-lg font-semibold">
          {t('title')}
        </h2>
        {done ? (
          <>
            <Alert kind="success">{t('sent')}</Alert>
            <Button onClick={onClose}>{t('close')}</Button>
          </>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <p className="text-sm text-slate-600">{t('intro')}</p>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-slate-700">{t('reason')}</legend>
              {REMOVAL_REASONS.map((r) => (
                <label key={r} className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3">
                  <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
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
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? t('sending') : t('send')}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                {t('cancel')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
