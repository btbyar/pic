'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, type ApiError, fieldErrors, useErrorMessage } from '@/lib/api-client';

export default function RegisterPage() {
  const t = useTranslations('auth');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const invalid = fieldErrors(error);
  const fieldError = (name: string) => (invalid.has(name) ? te('invalid_field') : undefined);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const phone = String(form.get('phone') ?? '').trim();
    setBusy(true);
    setError(null);
    const res = await api('/auth/register', {
      method: 'POST',
      body: {
        email: form.get('email'),
        password: form.get('password'),
        displayName: form.get('displayName'),
        ...(phone ? { phone } : {}),
      },
    });
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    router.replace('/photographer');
    router.refresh();
  }

  return (
    <AuthShell title={t('registerTitle')} intro={t('registerIntro')}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error ? <Alert>{errorMessage(error)}</Alert> : null}
        <Field label={t('displayName')} htmlFor="displayName" error={fieldError('displayName')}>
          <Input id="displayName" name="displayName" autoComplete="name" required minLength={2} invalid={invalid.has('displayName')} />
        </Field>
        <Field label={t('email')} htmlFor="email" error={fieldError('email')}>
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required invalid={invalid.has('email')} />
        </Field>
        <Field label={`${t('phone')} (${tc('optional')})`} htmlFor="phone" error={fieldError('phone')}>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" invalid={invalid.has('phone')} />
        </Field>
        <Field label={t('password')} htmlFor="password" hint={t('passwordHint')} error={fieldError('password')}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            invalid={invalid.has('password')}
          />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? t('registering') : t('register')}
        </Button>
      </form>
      <p className="text-sm text-ink-soft">
        {t('haveAccount')}{' '}
        <Link href="/login" className="font-medium text-ink underline underline-offset-4">
          {t('login')}
        </Link>
      </p>
    </AuthShell>
  );
}
