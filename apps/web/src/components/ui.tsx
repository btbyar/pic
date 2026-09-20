import Link from 'next/link';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

const buttonStyles = {
  // Ногоон дээр цагаан текст уншигдахгүй (1.6:1) — хар текст 10.8:1
  primary: 'bg-brand-600 text-on-brand hover:bg-brand-700 disabled:bg-surface-3 disabled:text-ink-faint',
  dark: 'bg-surface-3 text-ink hover:bg-line disabled:text-ink-faint',
  secondary: 'border border-line bg-surface-2 text-ink hover:bg-surface-3 disabled:text-ink-faint',
  danger: 'bg-red-500 text-white hover:bg-red-400 disabled:bg-surface-3 disabled:text-ink-faint',
} as const;

type Variant = keyof typeof buttonStyles;

const base =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${base} ${buttonStyles[variant]} ${className}`} {...props} />;
}

export function ButtonLink({ href, variant = 'primary', children }: { href: string; variant?: Variant; children: ReactNode }) {
  return (
    <Link href={href} className={`${base} ${buttonStyles[variant]}`}>
      {children}
    </Link>
  );
}

const fieldBase =
  'w-full rounded-xl border px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15';

export function Input({ invalid, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={`${fieldBase} ${invalid ? 'border-red-500' : 'border-line'} ${className}`} {...props} />;
}

export function Textarea({ invalid, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={`${fieldBase} ${invalid ? 'border-red-500' : 'border-line'}`} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? <p className="text-sm text-red-600">{error}</p> : hint ? <p className="text-sm text-ink-soft">{hint}</p> : null}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl bg-surface-2 p-5 ${className}`}>{children}</section>;
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'info' | 'success'; children: ReactNode }) {
  const styles = {
    error: 'border-red-500/30 bg-red-500/10 text-red-200',
    info: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
    success: 'border-brand-600/30 bg-brand-600/10 text-brand-800',
  }[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' }) {
  const styles = {
    slate: 'bg-surface-3 text-ink-soft',
    green: 'bg-brand-600/15 text-brand-800',
    amber: 'bg-amber-400/15 text-amber-200',
    red: 'bg-red-500/15 text-red-200',
  }[tone];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
}
