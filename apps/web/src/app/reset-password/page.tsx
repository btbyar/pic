'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { Alert, Button, ButtonLink, Field, Input } from '@/components/ui';
import { api, type ApiError, fieldErrors, useErrorMessage } from '@/lib/api-client';

export default function ResetPasswordPage() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  // Токен #fragment-д ирнэ — сервер рүү илгээгддэггүй. Хаягийн мөрөөс шууд арилгана.
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token');
    setToken(value);
    if (value) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password'));
    if (password !== form.get('confirm')) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setBusy(true);
    setError(null);
    const res = await api('/auth/password-reset/confirm', { method: 'POST', body: { token, password } });
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error);
  }

  if (token === undefined) return null;
  const invalid = fieldErrors(error);

  return (
    <AuthShell title={t('resetTitle')}>
      {done ? (
        <>
          <Alert kind="success">{t('resetDone')}</Alert>
          <ButtonLink href="/login">{t('login')}</ButtonLink>
        </>
      ) : !token ? (
        <>
          <Alert>{t('resetNoToken')}</Alert>
          <ButtonLink href="/forgot-password" variant="secondary">
            {t('sendResetLink')}
          </ButtonLink>
        </>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          {error && !invalid.has('password') ? (
            <Alert>
              {errorMessage(error)}{' '}
              {error.code === 'reset_token_invalid' ? (
                <Link href="/forgot-password" className="font-medium underline">
                  {t('sendResetLink')}
                </Link>
              ) : null}
            </Alert>
          ) : null}
          <Field
            label={t('newPassword')}
            hint={t('passwordHint')}
            error={invalid.has('password') ? t('passwordHint') : undefined}
            htmlFor="password"
          >
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
          </Field>
          <Field label={t('confirmPassword')} error={mismatch ? t('passwordMismatch') : undefined} htmlFor="confirm">
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required invalid={mismatch} />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? tc('saving') : t('setPassword')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
