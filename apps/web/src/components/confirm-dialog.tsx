'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useEffect, useId, useRef } from 'react';
import { LockIcon, XIcon } from './icons';
import { Alert, Button } from './ui';

/**
 * Админы эргэлт буцалтгүй үйлдлүүдийн нэгдсэн баталгаажуулалт (буцаалт, төлбөр, бүрмөсөн устгал...).
 * Native <dialog>: фокус дотроо хоригдоно, Esc хаана, хаахад өмнөх товч руу фокус буцна.
 * `totp` өгвөл 6 оронтой код заавал (сервер ч мөн шалгана).
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = 'primary',
  totp = false,
  busy = false,
  error,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  totp?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: (form: FormData) => void;
  onClose: () => void;
  /** Нэмэлт талбарууд (шалтгаан, гүйлгээний дугаар...) */
  children?: ReactNode;
}) {
  const t = useTranslations('confirmDialog');
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const totpId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onConfirm(new FormData(e.currentTarget));
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="panel m-auto w-[min(30rem,calc(100vw-2rem))] p-0 text-ivory shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)] backdrop:bg-black/70 backdrop:backdrop-blur-sm open:animate-rise"
    >
      {open ? (
        <form onSubmit={submit} className="flex flex-col gap-4 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <span
              className={`flex size-12 items-center justify-center rounded-2xl ${tone === 'danger' ? 'bg-ember/10 text-ember' : 'bg-gold/10 text-gold'}`}
              aria-hidden
            >
              <LockIcon size={24} />
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('close')}
              className="flex size-11 cursor-pointer items-center justify-center rounded-full text-mist transition hover:bg-white/[0.06] hover:text-ivory"
            >
              <XIcon size={20} />
            </button>
          </div>
          <h2 id={titleId} className="font-display text-4xl font-semibold leading-none">
            {title}
          </h2>
          {body ? <div className="text-[15px] text-mist">{body}</div> : null}
          {error ? <Alert>{error}</Alert> : null}
          {children}
          {totp ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={totpId} className="text-sm font-semibold">
                {t('totp')}
              </label>
              {/* Нэг талбар: paste, autofill (one-time-code), дэлгэц уншигчид 6 тусдаа нүднээс илүү найдвартай */}
              <input
                id={totpId}
                name="totpCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                autoFocus={!children}
                className="h-16 w-full rounded-xl bg-night-3 text-center font-mono text-2xl font-semibold tracking-[0.6em] text-gold outline-none ring-1 ring-inset ring-line-strong focus:ring-2 focus:ring-gold"
              />
              <p className="text-sm text-mist">{t('totpHint')}</p>
            </div>
          ) : null}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant={tone} disabled={busy}>
              {busy ? t('working') : confirmLabel}
            </Button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}
