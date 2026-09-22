'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { LockIcon, WalletIcon } from '@/components/icons';
import { Alert, Button, Card, Field, Input } from '@/components/ui';
import { api, type ApiError, fieldErrors, useErrorMessage } from '@/lib/api-client';
import type { PayoutAccount } from '@/lib/types';

export function PayoutAccountForm({ account }: { account: PayoutAccount | null }) {
  const t = useTranslations('earnings');
  const tc = useTranslations('common');
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
      <section className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-night-3 text-gold ring-1 ring-line">
            <WalletIcon size={22} />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="kicker">
              {t('account')} · {account.bankName}
            </span>
            <span className="font-mono text-lg tabular-nums tracking-[0.08em]">{account.accountNumber}</span>
            <span className="truncate text-sm text-mist">{account.accountName}</span>
          </div>
        </div>
        <Button variant="secondary" onClick={() => setEditing(true)} className="self-start sm:self-auto">
          {t('change')}
        </Button>
      </section>
    );
  }

  return (
    <Card className={account ? '' : 'ring-1 ring-inset ring-gold/30'}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-3xl font-semibold leading-none">{t('account')}</h2>
          <p className="flex items-center gap-2 text-sm text-mist">
            <LockIcon size={14} className="shrink-0 text-gold" />
            {t('accountMissing')}
          </p>
        </div>
        {error && !invalid.size ? <Alert>{errorMessage(error)}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('bankName')} htmlFor="bankName">
            <Input id="bankName" name="bankName" required minLength={2} maxLength={60} defaultValue={account?.bankName ?? ''} />
          </Field>
          <Field label={t('accountNumber')} htmlFor="accountNumber" error={invalid.has('accountNumber') ? t('accountNumberHint') : undefined}>
            <Input
              id="accountNumber"
              name="accountNumber"
              required
              inputMode="numeric"
              pattern="[0-9]{6,20}"
              invalid={invalid.has('accountNumber')}
              className="font-mono tabular-nums tracking-[0.08em]"
            />
          </Field>
          <Field label={t('accountName')} htmlFor="accountName">
            <Input id="accountName" name="accountName" required minLength={2} maxLength={100} defaultValue={account?.accountName ?? ''} />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button type="submit" busy={busy}>
            {t('save')}
          </Button>
          {account ? (
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              {tc('cancel')}
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
