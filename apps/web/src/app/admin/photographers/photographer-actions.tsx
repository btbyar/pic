'use client';

import type { UserStatus } from '@pic/shared';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alert, Button, Input } from '@/components/ui';
import { api, type ApiError, useErrorMessage } from '@/lib/api-client';

type Action = 'approve' | 'reject' | 'suspend' | 'reinstate';

const ACTIONS: Record<UserStatus, Action[]> = {
  PENDING: ['approve', 'reject'],
  REJECTED: ['approve'],
  APPROVED: ['suspend'],
  SUSPENDED: ['reinstate'],
};
const NEEDS_REASON = new Set<Action>(['reject', 'suspend']);

export function PhotographerActions({ id, status }: { id: string; status: UserStatus }) {
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

  function submitReason(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) void run(pending, String(new FormData(e.currentTarget).get('reason') ?? ''));
  }

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      {error ? <Alert>{errorMessage(error)}</Alert> : null}
      {pending ? (
        <form onSubmit={submitReason} className="flex flex-col gap-2 sm:w-72">
          <Input name="reason" required minLength={3} maxLength={500} placeholder={t('reason')} aria-label={t('reason')} autoFocus />
          <div className="flex gap-2">
            <Button type="submit" variant="danger" disabled={busy}>
              {t(pending)}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPending(null)}>
              ✕
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          {ACTIONS[status].map((action) => (
            <Button
              key={action}
              variant={NEEDS_REASON.has(action) ? 'secondary' : 'primary'}
              disabled={busy}
              onClick={() => (NEEDS_REASON.has(action) ? setPending(action) : run(action))}
            >
              {t(action)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
