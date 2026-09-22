'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, type ApiError, useErrorMessage } from '@/lib/api-client';
import { homeFor } from '@/lib/routes';
import type { Me } from '@/lib/types';

interface Setup {
  secret: string;
  otpauthUri: string;
}

export default function MfaSetupPage() {
  const t = useTranslations('mfa');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const started = useRef(false);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // React StrictMode dev дээр effect хоёр удаа ажиллана — хоёр өөр secret үүсгэхгүйн тулд
    if (started.current) return;
    started.current = true;
    void (async () => {
      const res = await api<Setup>('/auth/mfa/setup', { method: 'POST' });
      if (!res.ok) {
        if (res.error.code === 'mfa_already_enabled') return router.replace('/mfa');
        if (res.error.status === 401) return router.replace('/login');
        return setError(res.error);
      }
      setSetup(res.data);
      setQr(await QRCode.toDataURL(res.data.otpauthUri, { margin: 1, width: 220 }));
    })();
  }, [router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code') ?? '').replace(/\s/g, '');
    setBusy(true);
    setError(null);
    const res = await api<{ recoveryCodes: string[] }>('/auth/mfa/enable', { method: 'POST', body: { code } });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setRecoveryCodes(res.data.recoveryCodes);
  }

  async function finish() {
    const me = await api<Me>('/auth/me');
    router.replace(me.ok ? homeFor(me.data) : '/login');
    router.refresh();
  }

  if (recoveryCodes) {
    return (
      <AuthShell title={t('recoveryTitle')} intro={t('recoveryIntro')}>
        <ol className="grid grid-cols-2 gap-2 rounded-2xl bg-night-2 p-4 font-mono text-sm">
          {recoveryCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ol>
        <Button onClick={finish}>{t('recoverySaved')}</Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('setupTitle')} intro={t('setupIntro')}>
      {error ? <Alert>{errorMessage(error)}</Alert> : null}
      {setup ? (
        <>
          <div className="flex flex-col items-center gap-3">
            {qr ? <img src={qr} alt="QR" width={220} height={220} className="rounded-xl border border-line" /> : null}
            <p className="text-center text-sm text-mist">{t('manualEntry')}</p>
            <code className="break-all rounded-lg bg-night-3 px-3 py-2 text-sm">{setup.secret}</code>
          </div>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field label={t('code')} htmlFor="code">
              <Input
                id="code"
                name="code"
                required
                inputMode="numeric"
                pattern="[0-9 ]{6,7}"
                maxLength={7}
                autoComplete="one-time-code"
                placeholder="123456"
              />
            </Field>
            <Button type="submit" size="lg" busy={busy}>
              {busy ? t('verifying') : t('enable')}
            </Button>
          </form>
        </>
      ) : null}
    </AuthShell>
  );
}
