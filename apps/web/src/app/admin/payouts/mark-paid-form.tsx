'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alert, Button, Input } from '@/components/ui';
import { api, type ApiError, useErrorMessage } from '@/lib/api-client';

/** Банкаар шилжүүлсний дараа гүйлгээний дугаартай нь "төлсөн" гэж тэмдэглэнэ */
export function MarkPaidForm({ photographerId, period, askTotp }: { photographerId: string; period: string; askTotp: boolean }) {
  const t = useTranslations('admin.payouts');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const totpCode = String(form.get('totpCode') ?? '').trim();
    setBusy(true);
    setError(null);
    const res = await api('/admin/payouts/mark-paid', {
      method: 'POST',
      body: { photographerId, period, reference: String(form.get('reference') ?? ''), ...(totpCode ? { totpCode } : {}) },
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }

  if (!open) return <Button onClick={() => setOpen(true)}>{t('markPaid')}</Button>;
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-2 sm:w-72">
      {error ? <Alert>{errorMessage(error)}</Alert> : null}
      <Input name="reference" required minLength={3} maxLength={100} placeholder={t('reference')} aria-label={t('reference')} />
      {askTotp ? (
        <Input name="totpCode" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required placeholder={t('totp')} aria-label={t('totp')} />
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {t('confirmPaid')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          ✕
        </Button>
      </div>
    </form>
  );
}
