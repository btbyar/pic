'use client';

import type { RemovalResolution } from '@pic/shared';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button, Field, Input } from '@/components/ui';
import { api, useErrorMessage } from '@/lib/api-client';

/** Шийдвэр: нуух (эргүүлж болно), бүрмөсөн устгах (TOTP дахин асууна), татгалзах */
export function RemovalActions({ id, hasPhoto, askTotp }: { id: string; hasPhoto: boolean; askTotp: boolean }) {
  const t = useTranslations('admin.removals');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [action, setAction] = useState<RemovalResolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData) {
    if (!action) return;
    const note = String(form.get('note') ?? '').trim();
    const totpCode = String(form.get('totpCode') ?? '').trim();
    setBusy(true);
    setError(null);
    const res = await api(`/admin/removal-requests/${id}/resolve`, {
      method: 'POST',
      body: { action, ...(note ? { note } : {}), ...(totpCode ? { totpCode } : {}) },
    });
    setBusy(false);
    if (!res.ok) return setError(errorMessage(res.error));
    setAction(null);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {hasPhoto ? (
          <>
            <Button onClick={() => setAction('hide')}>{t('hide')}</Button>
            <Button variant="secondary" className="text-ember" onClick={() => setAction('delete')}>
              {t('delete')}
            </Button>
          </>
        ) : null}
        <Button variant="ghost" onClick={() => setAction('reject')}>
          {t('reject')}
        </Button>
      </div>
      <ConfirmDialog
        open={action !== null}
        title={action ? t(action) : ''}
        body={action ? t(`confirm_${action}`) : null}
        confirmLabel={action ? t(action) : ''}
        tone={action === 'hide' ? 'primary' : 'danger'}
        totp={action === 'delete' && askTotp}
        busy={busy}
        error={error}
        onConfirm={(form) => void submit(form)}
        onClose={() => {
          setAction(null);
          setError(null);
        }}
      >
        <Field label={action === 'reject' ? t('noteRequired') : t('note')} htmlFor={`note-${id}`}>
          <Input id={`note-${id}`} name="note" maxLength={500} required={action === 'reject'} />
        </Field>
      </ConfirmDialog>
    </>
  );
}
