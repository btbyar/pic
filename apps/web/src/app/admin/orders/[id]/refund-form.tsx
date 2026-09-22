'use client';

import { refundAmount } from '@pic/shared';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CheckIcon } from '@/components/icons';
import { Button, Field, Input } from '@/components/ui';
import { api, useErrorMessage } from '@/lib/api-client';
import { formatMnt } from '@/lib/datetime';
import type { AdminOrderDetail } from '@/lib/types';

/** Буцаах зургуудаа сонгоод шалтгаан бичнэ. Мөнгийг банкаар гараар буцааж, гүйлгээний дугаарыг тэмдэглэнэ. */
export function RefundForm({ orderId, items, askTotp }: { orderId: string; items: AdminOrderDetail['items']; askTotp: boolean }) {
  const t = useTranslations('admin.orders');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amount = refundAmount(items.filter((i) => selected.has(i.id)));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function submit(form: FormData) {
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
    if (!res.ok) return setError(errorMessage(res.error));
    setOpen(false);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col overflow-hidden rounded-[14px] ring-1 ring-inset ring-line">
        {items.map((i) => {
          const checked = selected.has(i.id);
          return (
            <li key={i.id} className="border-b border-line last:border-0">
              <label
                className={`flex min-h-13 items-center justify-between gap-3 px-4 py-3 text-sm transition has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-gold ${
                  i.refunded ? 'cursor-not-allowed bg-night-2 text-dim line-through' : checked ? 'cursor-pointer bg-ember/10' : 'cursor-pointer bg-night-2 hover:bg-night-3'
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <input type="checkbox" className="peer sr-only" disabled={i.refunded} checked={checked} onChange={() => toggle(i.id)} />
                  <span
                    aria-hidden
                    className="flex size-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ring-line-strong text-transparent transition peer-checked:bg-ember peer-checked:text-night peer-checked:ring-ember"
                  >
                    <CheckIcon size={14} strokeWidth={3} />
                  </span>
                  <span className="min-w-0 truncate">
                    <span className="font-mono text-xs">{i.filename}</span> <span className="text-mist">· {i.photographer}</span>
                    {i.pricing === 'BUNDLE' ? <span className="text-gold"> · {t('bundle')}</span> : null}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatMnt(i.price)}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {selected.size ? (
        <div className="flex animate-rise flex-wrap items-center justify-between gap-3 rounded-[14px] bg-ember/10 px-4 py-3 ring-1 ring-inset ring-ember/35">
          <span className="text-sm font-semibold">{t('refundConfirm', { count: selected.size, amount: formatMnt(amount) })}</span>
          <Button variant="danger" onClick={() => setOpen(true)}>
            {t('refundButton', { amount: formatMnt(amount) })}
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={open}
        title={t('refundButton', { amount: formatMnt(amount) })}
        body={t('refundManual')}
        confirmLabel={t('refundButton', { amount: formatMnt(amount) })}
        tone="danger"
        totp={askTotp}
        busy={busy}
        error={error}
        onConfirm={(form) => void submit(form)}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
      >
        <Field label={t('refundReason')} htmlFor="refund-reason">
          <Input id="refund-reason" name="reason" required minLength={3} maxLength={500} />
        </Field>
        <Field label={t('providerRef')} htmlFor="refund-ref">
          <Input id="refund-ref" name="providerRef" maxLength={100} className="font-mono" />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
