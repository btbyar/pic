'use client';

import type { RemovalResolution } from '@pic/shared';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alert, Button, Input } from '@/components/ui';
import { api, type ApiError, useErrorMessage } from '@/lib/api-client';

/** Шийдвэр: нуух (эргүүлж болно), бүрмөсөн устгах (TOTP дахин асууна), татгалзах */
export function RemovalActions({ id, hasPhoto, askTotp }: { id: string; hasPhoto: boolean; askTotp: boolean }) {
  const t = useTranslations('admin.removals');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [action, setAction] = useState<RemovalResolution | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!action) return;
    const form = new FormData(e.currentTarget);
    const note = String(form.get('note') ?? '').trim();
    const totpCode = String(form.get('totpCode') ?? '').trim();
    setBusy(true);
    setError(null);
    const res = await api(`/admin/removal-requests/${id}/resolve`, {
      method: 'POST',
      body: { action, ...(note ? { note } : {}), ...(totpCode ? { totpCode } : {}) },
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setAction(null);
    router.refresh();
  }

  if (!action) {
    return (
      <div className="flex flex-wrap gap-2">
        {hasPhoto ? (
          <>
            <Button onClick={() => setAction('hide')}>{t('hide')}</Button>
            <Button variant="danger" onClick={() => setAction('delete')}>
              {t('delete')}
            </Button>
          </>
        ) : null}
        <Button variant="secondary" onClick={() => setAction('reject')}>
          {t('reject')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
      <p className="text-sm font-medium">{t(`confirm_${action}`)}</p>
      {error ? <Alert>{errorMessage(error)}</Alert> : null}
      <Input name="note" maxLength={500} required={action === 'reject'} placeholder={t(action === 'reject' ? 'noteRequired' : 'note')} aria-label={t('note')} />
      {action === 'delete' && askTotp ? (
        <Input
          name="totpCode"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          placeholder={t('totp')}
          aria-label={t('totp')}
        />
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant={action === 'delete' ? 'danger' : 'primary'} disabled={busy}>
          {t(action)}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setAction(null)}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
