'use client';

import type { UserStatus } from '@pic/shared';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, type ApiError, useErrorMessage } from '@/lib/api-client';

type Action = 'approve' | 'reject' | 'suspend' | 'reinstate';

const ACTIONS: Record<UserStatus, Action[]> = {
  PENDING: ['approve', 'reject'],
  REJECTED: ['approve'],
  APPROVED: ['suspend'],
  SUSPENDED: ['reinstate'],
};
const NEEDS_REASON = new Set<Action>(['reject', 'suspend']);

export function PhotographerActions({ id, name, status }: { id: string; name: string; status: UserStatus }) {
  const t = useTranslations('admin');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: Action, reason?: string) {
    setBusy(true);
    setError(null);
    const res = await api(`/admin/photographers/${id}/${action}`, {
      method: 'POST',
      ...(reason ? { body: { reason } } : {}),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setPending(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      {error && !pending ? <Alert>{errorMessage(error)}</Alert> : null}
      <div className="flex gap-2">
        {ACTIONS[status].map((action) => (
          <Button
            key={action}
            variant={NEEDS_REASON.has(action) ? 'secondary' : 'primary'}
            className={NEEDS_REASON.has(action) ? 'text-ember' : ''}
            busy={busy && !pending}
            onClick={() => (NEEDS_REASON.has(action) ? setPending(action) : void run(action))}
          >
            {t(action)}
          </Button>
        ))}
      </div>
      <ConfirmDialog
        open={pending !== null}
        title={pending ? `${t(pending)}: ${name}` : ''}
        confirmLabel={pending ? t(pending) : ''}
        tone="danger"
        busy={busy}
        error={error ? errorMessage(error) : null}
        onConfirm={(form) => pending && void run(pending, String(form.get('reason') ?? ''))}
        onClose={() => {
          setPending(null);
          setError(null);
        }}
      >
        <Field label={t('reason')} hint={t('reasonHint')} htmlFor={`reason-${id}`}>
          <Input id={`reason-${id}`} name="reason" required minLength={3} maxLength={500} autoFocus />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
