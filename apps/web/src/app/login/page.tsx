'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, type ApiError, useErrorMessage } from '@/lib/api-client';
import { homeFor } from '@/lib/routes';
import type { Me } from '@/lib/types';

export default function LoginPage() {
  const t = useTranslations('auth');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const login = await api('/auth/login', {
      method: 'POST',
      body: { email: form.get('email'), password: form.get('password') },
    });
    if (!login.ok) {
      setError(login.error);
      setBusy(false);
      return;
    }
    const me = await api<Me>('/auth/me');
    router.replace(me.ok ? homeFor(me.data) : '/login');
    router.refresh();
  }

  return (
    <AuthShell title={t('loginTitle')}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error ? <Alert>{errorMessage(error)}</Alert> : null}
        <Field label={t('email')} htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
        </Field>
        <Field label={t('password')} htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? t('loggingIn') : t('login')}
        </Button>
      </form>
      <p className="text-sm text-slate-600">
        {t('noAccount')}{' '}
        <Link href="/register" className="font-medium text-slate-900 underline underline-offset-4">
          {t('register')}
        </Link>
      </p>
    </AuthShell>
  );
}
