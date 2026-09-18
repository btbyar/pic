'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, type ApiError, useErrorMessage } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<ApiError | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api('/auth/password-reset', {
      method: 'POST',
      body: { email: new FormData(e.currentTarget).get('email') },
    });
    setBusy(false);
    if (res.ok) setSent(true);
    else setError(res.error);
  }

  return (
    <AuthShell title={t('forgotTitle')} intro={sent ? undefined : t('forgotIntro')}>
      {sent ? (
        <Alert kind="success">{t('forgotSent')}</Alert>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          {error ? <Alert>{errorMessage(error)}</Alert> : null}
          <Field label={t('email')} htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? t('sending') : t('sendResetLink')}
          </Button>
        </form>
      )}
      <Link href="/login" className="text-sm font-medium text-stone-900 underline underline-offset-4">
        {t('backToLogin')}
      </Link>
    </AuthShell>
  );
}
