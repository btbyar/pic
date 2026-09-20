import Link from 'next/link';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

const buttonStyles = {
  // Цагаан товч: ногоон нь зөвхөн "олдлоо/сонгогдлоо" гэсэн дохиод үлдэнэ
  primary: 'bg-ink text-surface hover:bg-white disabled:bg-surface-3 disabled:text-ink-faint',
  dark: 'bg-surface-3 text-ink hover:bg-line disabled:text-ink-faint',
  secondary: 'border border-line-strong bg-surface-2 text-ink hover:bg-surface-3 disabled:text-ink-faint',
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

export function ButtonLink({
  href,
  variant = 'primary',
  className = '',
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${base} ${buttonStyles[variant]} ${className}`}>
      {children}
    </Link>
  );
}

const fieldBase =
  'w-full rounded-xl border bg-surface-2 px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-faint focus:border-brand-600 focus:ring-2 focus:ring-brand-600/25';

export function Input({ invalid, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`${fieldBase} ${invalid ? 'border-red-400' : 'border-line-strong'} ${className}`}
      {...props}
    />
  );
}

export function Textarea({ invalid, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea aria-invalid={invalid || undefined} className={`${fieldBase} ${invalid ? 'border-red-400' : 'border-line-strong'}`} {...props} />;
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
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm text-red-300">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-surface-2 p-5 ${className}`}>{children}</div>;
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'info' | 'success'; children: ReactNode }) {
  const styles = {
    error: 'border-red-400/40 bg-red-500/10 text-red-200',
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
