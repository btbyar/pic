'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button, Field, Input } from '@/components/ui';
import { api, useErrorMessage } from '@/lib/api-client';
import { formatMnt } from '@/lib/datetime';

/** Банкаар шилжүүлсний дараа гүйлгээний дугаартай нь "төлсөн" гэж тэмдэглэнэ */
export function MarkPaidForm({
  photographerId,
  name,
  amount,
  period,
  askTotp,
}: {
  photographerId: string;
  name: string;
  amount: number;
  period: string;
  askTotp: boolean;
}) {
  const t = useTranslations('admin.payouts');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData) {
    const totpCode = String(form.get('totpCode') ?? '').trim();
    setBusy(true);
    setError(null);
    const res = await api('/admin/payouts/mark-paid', {
      method: 'POST',
      body: { photographerId, period, reference: String(form.get('reference') ?? ''), ...(totpCode ? { totpCode } : {}) },
    });
    setBusy(false);
    if (!res.ok) return setError(errorMessage(res.error));
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>{t('markPaid')}</Button>
      <ConfirmDialog
        open={open}
        title={t('markPaidTitle', { name })}
        body={t('markPaidBody', { amount: formatMnt(amount), period })}
        confirmLabel={t('confirmPaid')}
        totp={askTotp}
        busy={busy}
        error={error}
        onConfirm={(form) => void submit(form)}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
      >
        <Field label={t('reference')} htmlFor={`ref-${photographerId}`}>
          <Input id={`ref-${photographerId}`} name="reference" required minLength={3} maxLength={100} className="font-mono" autoFocus />
        </Field>
      </ConfirmDialog>
    </>
  );
}
