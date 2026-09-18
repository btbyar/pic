'use client';

import { refundAmount } from '@pic/shared';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alert, Button, Input } from '@/components/ui';
import { api, type ApiError, useErrorMessage } from '@/lib/api-client';
import { formatMnt } from '@/lib/datetime';
import type { AdminOrderDetail } from '@/lib/types';

/** Буцаах зургуудаа сонгоод шалтгаан бичнэ. Мөнгийг банкаар гараар буцааж, гүйлгээний дугаарыг тэмдэглэнэ. */
export function RefundForm({ orderId, items, askTotp }: { orderId: string; items: AdminOrderDetail['items']; askTotp: boolean }) {
  const t = useTranslations('admin.orders');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const amount = refundAmount(items.filter((i) => selected.has(i.id)));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const providerRef = String(form.get('providerRef') ?? '').trim();
    const totpCode = String(form.get('totpCode') ?? '').trim();
    setBusy(true);
    setError(null);
    const res = await api(`/admin/orders/${orderId}/refunds`, {
      method: 'POST',
      body: {
        itemIds: [...selected],
        reason: String(form.get('reason') ?? ''),
        ...(providerRef ? { providerRef } : {}),
        ...(totpCode ? { totpCode } : {}),
      },
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1">
        {items.map((i) => (
          <li key={i.id}>
            <label className={`flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm ${i.refunded ? 'text-stone-400 line-through' : ''}`}>
              <span className="flex items-center gap-3">
                <input type="checkbox" className="h-5 w-5" disabled={i.refunded} checked={selected.has(i.id)} onChange={() => toggle(i.id)} />
                {i.filename} · {i.photographer}
                {i.pricing === 'BUNDLE' ? ` · ${t('bundle')}` : ''}
              </span>
              <span className="tabular-nums">{formatMnt(i.price)}</span>
            </label>
          </li>
        ))}
      </ul>
      {selected.size ? (
        <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-medium">{t('refundConfirm', { count: selected.size, amount: formatMnt(amount) })}</p>
          <p className="text-xs text-stone-600">{t('refundManual')}</p>
          {error ? <Alert>{errorMessage(error)}</Alert> : null}
          <Input name="reason" required minLength={3} maxLength={500} placeholder={t('refundReason')} aria-label={t('refundReason')} />
          <Input name="providerRef" maxLength={100} placeholder={t('providerRef')} aria-label={t('providerRef')} />
          {askTotp ? (
            <Input name="totpCode" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required placeholder={t('totp')} aria-label={t('totp')} />
          ) : null}
          <Button type="submit" variant="danger" disabled={busy} className="self-start">
            {t('refundButton', { amount: formatMnt(amount) })}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
