'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, type ApiError, useErrorMessage } from '@/lib/api-client';
import { homeFor } from '@/lib/routes';
import type { Me } from '@/lib/types';

export default function MfaVerifyPage() {
  const t = useTranslations('mfa');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get('value') ?? '').trim();
    setBusy(true);
    setError(null);
    const res = await api('/auth/mfa/verify', {
      method: 'POST',
      body: useRecovery ? { recoveryCode: value } : { code: value.replace(/\s/g, '') },
    });
    if (!res.ok) {
      if (res.error.status === 401 && res.error.code === 'unauthenticated') router.replace('/login');
      setError(res.error);
      setBusy(false);
      return;
    }
    const me = await api<Me>('/auth/me');
    router.replace(me.ok ? homeFor(me.data) : '/login');
    router.refresh();
  }

  return (
    <AuthShell title={t('verifyTitle')} intro={useRecovery ? undefined : t('verifyIntro')}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" key={useRecovery ? 'recovery' : 'code'}>
        {error ? <Alert>{errorMessage(error)}</Alert> : null}
        <Field label={useRecovery ? t('recoveryCode') : t('code')} htmlFor="value">
          <Input
            id="value"
            name="value"
            required
            autoFocus
            autoComplete="one-time-code"
            {...(useRecovery
              ? { placeholder: 'XXXXX-XXXXX', autoCapitalize: 'characters' }
              : { inputMode: 'numeric', pattern: '[0-9 ]{6,7}', maxLength: 7, placeholder: '123456' })}
          />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? t('verifying') : t('verify')}
        </Button>
        <button
          type="button"
          className="cursor-pointer text-sm text-stone-600 underline underline-offset-4"
          onClick={() => {
            setUseRecovery(!useRecovery);
            setError(null);
          }}
        >
          {useRecovery ? t('useCode') : t('useRecovery')}
        </button>
      </form>
    </AuthShell>
  );
}
