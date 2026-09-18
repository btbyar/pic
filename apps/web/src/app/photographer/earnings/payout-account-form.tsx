'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alert, Button, Card, Field, Input } from '@/components/ui';
import { api, type ApiError, fieldErrors, useErrorMessage } from '@/lib/api-client';
import type { PayoutAccount } from '@/lib/types';

export function PayoutAccountForm({ account }: { account: PayoutAccount | null }) {
  const t = useTranslations('earnings');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [editing, setEditing] = useState(account === null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const invalid = fieldErrors(error);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await api('/photographer/payout-account', {
      method: 'PUT',
      body: { bankName: form.get('bankName'), accountNumber: form.get('accountNumber'), accountName: form.get('accountName') },
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setEditing(false);
    router.refresh();
  }

  if (!editing && account) {
    return (
      <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p className="font-medium">{t('account')}</p>
          <p>
            {account.bankName} · <span className="tabular-nums">{account.accountNumber}</span> · {account.accountName}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setEditing(true)}>
          {t('change')}
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
        <p className="font-medium">{t('account')}</p>
        {!account ? <Alert kind="info">{t('accountMissing')}</Alert> : null}
        {error && !invalid.size ? <Alert>{errorMessage(error)}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('bankName')} htmlFor="bankName">
            <Input id="bankName" name="bankName" required minLength={2} maxLength={60} defaultValue={account?.bankName ?? ''} />
          </Field>
          <Field label={t('accountNumber')} htmlFor="accountNumber" error={invalid.has('accountNumber') ? t('accountNumberHint') : undefined}>
            <Input id="accountNumber" name="accountNumber" required inputMode="numeric" pattern="[0-9]{6,20}" invalid={invalid.has('accountNumber')} />
          </Field>
          <Field label={t('accountName')} htmlFor="accountName">
            <Input id="accountName" name="accountName" required minLength={2} maxLength={100} defaultValue={account?.accountName ?? ''} />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {t('save')}
          </Button>
          {account ? (
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              ✕
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
